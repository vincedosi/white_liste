# Spec — Moteur de re-scan multi-scénarios (confirmation « vraiment pas de pub ? »)

**Date** : 2026-06-15
**Branche** : `nextjs-migration`
**Statut** : approuvé, prêt pour le plan d'implémentation

## 1. Problème

Sur ~90 % des sites média il devrait y avoir de la pub. Un scan qui conclut
« 0 pub visible » alors que l'ad-tech est présente est presque toujours un
**faux-négatif**, pas une vérité.

Cas réel observé — **bebasket.fr** :
- `ad_count` affiché = 160, **mais** `score = 0`, **ATF 0 % pub**, emplacement
  leaderboard blanc/vide, **aucune pub encadrée** sur la capture.
- Ad-tech bien présente : prebid détecté, ads.txt à 309 sellers.
- Cause racine : les vraies créas **n'ont pas rendu** en headless (slots vides,
  taille < 5 px). `analyze_ads_multi_layer` (qui exige largeur≥5 ET hauteur≥5 ET
  visible) n'a quasi rien à encadrer → 0 cadre + 0 % surface.
- Le « 160 » trompeur vient de `effective_ad_count = max(len(ads_DOM),
  network_visual/3)` (`pw_worker.py:1656-1658`) : c'est l'**estimation réseau**
  (enchères/pixels), pas des éléments DOM visibles.

## 2. Objectif

Quand le 1er passage (headless rapide) trouve **0 pub visible MAIS détecte de
l'ad-tech**, re-scanner automatiquement le site avec des **scénarios navigateur
plus agressifs** et **garder le meilleur résultat** (celui qui fait apparaître le
plus de pubs visibles). Transformer les faux « 0 pub » en détections confirmées,
ou en un « vraiment pas de pub » assumé + flag de vérification manuelle.

## 3. Contexte codebase (réutilisé / modifié)

Fichier worker : `backend/services/pw_worker.py` (~2070 lignes).

- `main()` (ligne 2004) lit un JSON sur stdin : `{mode, domains, output_dir,
  headless}`. `headless` est **déjà paramétrable** (`request.get("headless",
  True)`). Lance **un** navigateur (`pw.chromium.launch(headless=...,
  args=["--disable-blink-features=AutomationControlled"])`), puis pour chaque
  domaine : `context = _new_context(browser)` → `page = context.new_page()` →
  `full_audit(page, domain, output_dir)` (mode `full`).
- `_new_context(browser)` (ligne 1977) : viewport 1280×800, UA Chrome Windows
  fixe, masque `navigator.webdriver`. **Pas de `locale`/`timezone`**. Le faux
  consentement injecté a été retiré (le mock `__tcfapi` masquait le bandeau mais
  bloquait le rendu des créas) ; `dismiss_cookie_banner()` clique le vrai CMP.
- `full_audit(page, domain, output_dir)` (ligne 1493) : navigation + CMP +
  scroll + attentes + `analyze_ads_multi_layer(page, highlight=True)` (ligne
  1585, surligne en rouge) + score + clutter + **bannière MLI + captures**
  (lignes 1660-1720, écrit `{safe_name}_viewport.png` et `{safe_name}_full.png`).
  Retourne un dict avec notamment : `ad_count` (= effective), `dom_ad_count`
  (ligne 1754, = `len(ads)` visibles), `score`/`clutter_score`,
  `clutter_detail` (surfaces ATF/MID/DEEP), `adtech` (`scripts_detected`),
  `network_stats` (`ad_requests`, `ad_visual_requests`), `details`
  (`ad_surface_pct`, `suspect_blocked`), `viewport_path`, `fullpage_path`.
- `scroll_full_page(page)` (ligne 559) : scroll rapide existant.
- `_wait_for_ads(page, max_ms, check_interval)` (ligne 1457) : attente adaptative.
- Helpers purs testés : `backend/services/detection_helpers.py` (déjà utilisé
  pour `is_content_sufficient`, `combine_scores`, `video_penalty`, etc.).
- Pont : `backend/services/pw_bridge.py` → `full_audit_subprocess(domains,
  output_dir)` spawn le worker en subprocess (mode `full`, `headless=True` par
  défaut). **Aucun changement requis** côté bridge (le retry est interne worker).

## 4. Décisions de design (validées)

| Sujet | Décision |
|-------|----------|
| Déclencheur | Ad-tech présent **et** 0 pub **visible** (`dom_ad_count == 0` + surface ≈ 0). |
| Scénarios | Les 4 leviers, empilés en 2 passes escaladées (S1 « FR patient » headless, S2 « headful agressif »). |
| Budget | Lancer tous les scénarios sur un site suspect, **garder le meilleur** (max pubs visibles). |
| Emplacement | Tout dans le worker (`pw_worker.py`), où vit le navigateur. |

## 5. Scénarios

Un levier isolé ne suffit pas si le vrai blocage est le headless → on **empile**.

- **Passe 0 — base (inchangée)** : headless rapide. S'exécute pour tous les sites.
- **Retry S1 — « FR patient »** (toujours headless) :
  - contexte : `locale='fr-FR'`, `timezone_id='Europe/Paris'`, header
    `Accept-Language: fr-FR,fr;q=0.9` (UA inchangé).
  - flux : scroll lent par paliers avec dwell ; attentes enchères allongées
    (`_wait_for_ads` max 6000 au lieu de 3000, +1 cycle).
- **Retry S2 — « headful agressif »** :
  - navigateur **`headless=False`** (lancé paresseusement, réutilisé sur le batch).
  - contexte FR (idem S1) + flux lent/patient (idem S1).

Pour un site suspect : exécuter S1 puis S2, comparer `{base, S1, S2}`, **garder le
meilleur**. Coût : ~+30 s **uniquement sur les sites suspects**. Les sites
normaux (pub trouvée au 1er passage) ne paient rien.

## 6. Architecture

### 6.1 Paramétrer les leviers (changements signature)

- `_new_context(browser, scenario: dict | None = None)` : si `scenario` fourni,
  applique `locale`, `timezone_id`, `extra_http_headers` (Accept-Language),
  override UA optionnel. Sans `scenario` → comportement actuel **identique**
  (passe 0 inchangée).
- `full_audit(page, domain, output_dir, scenario: dict | None = None)` :
  `scenario` contrôle le style de scroll (`slow`/dwell) et les durées d'attente.
  `scenario=None` → comportement actuel identique.

Définition d'un `scenario` (dict) :
```python
{
    "name": "fr_patient" | "headful",
    "locale": "fr-FR",
    "timezone_id": "Europe/Paris",
    "accept_language": "fr-FR,fr;q=0.9",
    "slow_scroll": True,
    "ad_wait_ms": 6000,
}
```
La passe 0 correspond conceptuellement à `{"name": "base"}` (aucun override).

### 6.2 Logique pure (dans `detection_helpers.py`, testable sans navigateur)

```python
def is_suspect_false_negative(scripts_detected, network_ad_requests,
                              dom_ad_count, ad_surface_pct) -> bool:
    """Vrai si on a des signaux ad-tech (scripts OU requêtes réseau) MAIS
    aucune pub VISIBLE (0 élément DOM encadré et surface ≈ 0)."""
    has_adtech = bool(scripts_detected) or (network_ad_requests or 0) > 0
    no_visible = (dom_ad_count or 0) == 0 and (ad_surface_pct or 0) < 0.5
    return has_adtech and no_visible


def visible_ad_score(result: dict) -> tuple:
    """Clé de tri d'un résultat de scénario : plus de pubs visibles d'abord,
    puis plus de surface."""
    return (result.get("dom_ad_count", 0) or 0,
            (result.get("details", {}) or {}).get("ad_surface_pct", 0) or 0)


def pick_best(results: list[dict]) -> dict:
    """Retourne le résultat avec le plus de pubs visibles (départage surface)."""
    return max(results, key=visible_ad_score)
```

`ad_surface_pct` est lu depuis `result["details"]["ad_surface_pct"]` (déjà
peuplé par `full_audit`).

### 6.3 Contrôleur de retry dans `main()` (mode `full` uniquement)

Pseudocode dans la boucle par domaine :
```
base = full_audit(page, domain, out)            # passe 0, contexte de base
# .get() défensif : le chemin _load_error_result ne contient pas toutes les clés.
if mode == "full" and is_suspect_false_negative(
        base.get("adtech", {}).get("scripts_detected"),
        base.get("network_stats", {}).get("ad_requests"),
        base.get("dom_ad_count"),
        base.get("details", {}).get("ad_surface_pct")):
    candidates = [base]
    # S1 — FR patient, même navigateur headless
    ctx1 = _new_context(browser, SCENARIO_FR_PATIENT); p1 = ctx1.new_page()
    candidates.append(full_audit(p1, domain, out, SCENARIO_FR_PATIENT)); ctx1.close()
    # S2 — headful (navigateur lancé paresseusement, réutilisé)
    hb = _get_headful_browser(pw)               # lance headless=False une seule fois
    ctx2 = _new_context(hb, SCENARIO_HEADFUL); p2 = ctx2.new_page()
    candidates.append(full_audit(p2, domain, out, SCENARIO_HEADFUL)); ctx2.close()
    best = pick_best(candidates)
    best["scenario_used"] = best.get("_scenario_name", "base")
    best["retry_count"] = len(candidates) - 1
    results[domain] = best
else:
    base["scenario_used"] = "base"; base["retry_count"] = 0
    results[domain] = base
```

- `_get_headful_browser(pw)` : lance `pw.chromium.launch(headless=False, args=[...])`
  **une seule fois**, mémorisé pour tout le batch, fermé en fin de `main()`.
- Le retry ne concerne que `mode == "full"` (le mode qui capture). Les modes
  `attention`/`screenshot` ne changent pas.

### 6.4 Captures — promotion du gagnant

Problème : chaque appel `full_audit` écrit `{safe_name}_viewport.png` /
`_full.png`. Une passe pire écraserait une bonne capture.

Solution : `full_audit(page, domain, out, scenario)` écrit dans un chemin
**suffixé par le scénario** quand `scenario` est fourni : `{safe_name}__{name}_viewport.png`.
La passe base écrit le nom canonique. Après `pick_best`, on **promeut** (copie)
les captures du gagnant vers le nom canonique `{safe_name}_viewport.png` /
`_full.png`, et on **nettoie** les fichiers suffixés des scénarios perdants.
Les chemins renvoyés (`viewport_path`/`fullpage_path`) du résultat retenu
pointent vers le nom canonique.

### 6.5 Logs

Chaque scénario logge son nombre de pubs visibles ; le contrôleur logge le
gagnant. Exemple (streamé dans la modale de scan via SSE) :
```
[retry] Suspect faux-négatif (adtech=PREBID, 0 pub visible) — escalade scénarios
[retry] base: 0 pubs | fr_patient: 0 pubs | headful: 7 pubs
[retry] Gagnant: headful (7 pubs visibles, surface 12%)
```

## 7. Métadonnées de résultat

Le dict de résultat retenu gagne deux champs :
- `scenario_used` : `"base"` | `"fr_patient"` | `"headful"`.
- `retry_count` : nombre de scénarios supplémentaires tentés (0 si pas de retry).

Ces champs **transitent** par le worker → `pw_bridge` → `audit.py`. La
persistance en base (`domains`) et l'affichage UI sont **hors scope de cette
spec** (pourront être ajoutés ensuite) ; on les expose juste dans le résultat et
les logs.

## 8. Résultat si toujours rien

Ad-tech présent + 0 pub visible même après S2 (headful) → on conserve le flag
existant `suspect_blocked` / statut `to_review` (« à valider »). Signal honnête
« créas non rendues, vérif manuelle » plutôt qu'un faux « 160 pubs / 0 % ».

## 9. Tests

### Backend purs (`backend/test_scan_input.py` ou nouveau `test_rescan.py`)
- `is_suspect_false_negative` :
  - `(["PREBID"], 5, 0, 0)` → **True** (ad-tech + 0 visible).
  - `(["PREBID"], 5, 8, 12)` → **False** (pubs visibles).
  - `([], 0, 0, 0)` → **False** (pas d'ad-tech → pas un faux-négatif).
- `pick_best` : sur `[{dom_ad_count:0,...}, {dom_ad_count:7, details:{ad_surface_pct:12}}]`
  → retourne le second.
- `visible_ad_score` : départage deux résultats à `dom_ad_count` égal par la surface.

### Intégration manuelle (front 3001 / backend 8020)
- Re-scan **bebasket.fr** → log montre l'escalade ; le scénario headful doit
  faire apparaître des pubs (`dom_ad_count > 0`), la capture canonique montre
  des **cadres rouges**, `ad_surface_pct > 0`.
- Re-scan **example.com** (pas d'ad-tech) → **aucun retry** déclenché (vérifier
  `retry_count == 0`, pas de surcoût).

## 10. Hors scope (YAGNI)

- Passes par levier isolé (on empile en 2 profils).
- Rotation d'IP / proxy (IP corporate fixe ; on ne triche que la locale/UA).
- Headful sur serveur sans display (xvfb).
- Persistance `scenario_used`/`retry_count` en base + affichage UI (exposés dans
  le résultat/logs seulement pour l'instant).
- Correction de la géoloc IP (Cloudflare → Toronto) : noté, sujet séparé.

## 11. Fichiers touchés

| Fichier | Nature |
|---------|--------|
| `backend/services/pw_worker.py` | `_new_context(scenario)`, `full_audit(scenario)` + chemins suffixés, contrôleur de retry + `_get_headful_browser` dans `main()` |
| `backend/services/detection_helpers.py` | + `is_suspect_false_negative`, `visible_ad_score`, `pick_best` |
| `backend/test_rescan.py` (ou `test_scan_input.py`) | tests des helpers purs |
