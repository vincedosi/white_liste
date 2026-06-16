# Moteur de re-scan multi-scénarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand le 1er passage d'audit trouve 0 pub visible mais détecte de l'ad-tech, re-scanner automatiquement avec des scénarios navigateur escaladés (FR patient headless, puis headful) et garder le résultat qui fait apparaître le plus de pubs visibles.

**Architecture:** Logique de décision pure (suspect ? meilleur résultat ?) dans `detection_helpers.py` (testable sans navigateur). Les leviers (locale/UA, scroll lent, attentes longues, headful) paramètrent `_new_context` et `full_audit`. Un contrôleur de retry dans `main()` du worker orchestre les passes sur les sites suspects uniquement, lance le navigateur headful paresseusement, et promeut les captures du gagnant.

**Tech Stack:** Python 3.13 + Playwright (sync, subprocess). Tests des fonctions pures en script Python autonome.

**Spec de référence :** `docs/superpowers/specs/2026-06-15-multi-scenario-ad-rescan-design.md`

---

## Contexte codebase (à connaître avant de commencer)

Fichier worker : `backend/services/pw_worker.py` (~2070 lignes). Lancer les commandes Python **depuis `C:\MLI\mli_crawler\backend`** (le worker importe `from detection_helpers import ...`, `from config import ...` en chemins plats). Plateforme Windows ; `python` sur le PATH.

- `main()` (l.2004) lit `{mode, domains, output_dir, headless}` sur stdin. Lance `browser = pw.chromium.launch(headless=..., args=["--disable-blink-features=AutomationControlled"])`, puis pour chaque domaine : `context = _new_context(browser)` → `page = context.new_page()` → dispatch selon `mode` (`full`/`attention`/`screenshot`).
- `_new_context(browser)` (l.1977) : viewport 1280×800, UA Chrome Windows fixe, masque `navigator.webdriver`, timeouts 20 s. Pas de locale.
- `full_audit(page, domain, output_dir)` (l.1493) : pipeline complet + `analyze_ads_multi_layer(page, highlight=True)` (l.1585) + captures `{safe_name}_viewport.png`/`{safe_name}_full.png` (l.1695-1724). Retourne un dict contenant `dom_ad_count` (l.1754), `adtech` (avec `scripts_detected`), `network_stats` (avec `ad_requests`), `details` (avec `ad_surface_pct` et `suspect_blocked`), `viewport_path`, `fullpage_path`.
- `scroll_full_page(page)` (l.559) : scroll rapide (pas 1200 px, pause 60 ms, cap 12 pas).
- `_wait_for_ads(page, max_ms=3000, check_interval=500)` (l.1457) : attente adaptative des iframes pub.
- `detection_helpers.py` : module pur (`from __future__ import annotations`, `import math`), déjà l'hôte de `dedup_nested_ads`, `is_content_sufficient`, `combine_scores`, etc.

**Confirmé par diagnostic** : `result["details"]` contient bien la clé `ad_surface_pct` (ex. bebasket : 5.0).

---

## File Structure

| Fichier | Responsabilité |
|---------|----------------|
| `backend/services/detection_helpers.py` (modif) | + `is_suspect_false_negative`, `visible_ad_score`, `pick_best` (décision pure). |
| `backend/test_rescan.py` (create) | Tests des 3 fonctions pures. |
| `backend/services/pw_worker.py` (modif) | `scroll_full_page(slow)`, `_new_context(scenario)`, `full_audit(scenario)` + chemins suffixés + `scenario_used`, constantes `SCENARIO_*`, `_promote_screenshots`, contrôleur de retry dans `main()`. |

---

## Task 1: Décision pure — suspect & meilleur résultat

**Files:**
- Modify: `backend/services/detection_helpers.py`
- Test: `backend/test_rescan.py`

- [ ] **Step 1: Write the failing test**

Créer `backend/test_rescan.py` :

```python
"""Tests des helpers de décision du re-scan multi-scénarios.
Fonctions pures — aucun navigateur. Lancer depuis backend/ :
    python test_rescan.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))            # backend/
sys.path.insert(0, str(Path(__file__).parent / "services"))  # backend/services/

from detection_helpers import is_suspect_false_negative, visible_ad_score, pick_best


def test_is_suspect_false_negative():
    # ad-tech (scripts) + 0 pub visible -> suspect
    assert is_suspect_false_negative(["PREBID"], 0, 0, 0.0) is True
    # ad-tech (requêtes réseau) + 0 pub visible -> suspect
    assert is_suspect_false_negative([], 5, 0, 0.0) is True
    # pubs visibles -> pas suspect
    assert is_suspect_false_negative(["PREBID"], 5, 8, 12.0) is False
    # surface non nulle -> pas suspect (une créa a rendu)
    assert is_suspect_false_negative(["PREBID"], 5, 0, 3.0) is False
    # aucun signal ad-tech -> pas un faux-négatif (site vraiment sans pub)
    assert is_suspect_false_negative([], 0, 0, 0.0) is False
    # None-safe
    assert is_suspect_false_negative(None, None, None, None) is False
    print("OK test_is_suspect_false_negative")


def test_pick_best_and_score():
    base = {"scenario_used": "base", "dom_ad_count": 0, "details": {"ad_surface_pct": 0}}
    s1 = {"scenario_used": "fr_patient", "dom_ad_count": 0, "details": {"ad_surface_pct": 0}}
    s2 = {"scenario_used": "headful", "dom_ad_count": 7, "details": {"ad_surface_pct": 12}}
    assert pick_best([base, s1, s2]) is s2
    # départage par surface à dom_ad_count égal
    a = {"dom_ad_count": 3, "details": {"ad_surface_pct": 4}}
    b = {"dom_ad_count": 3, "details": {"ad_surface_pct": 9}}
    assert pick_best([a, b]) is b
    assert visible_ad_score(s2) == (7, 12)
    print("OK test_pick_best_and_score")


if __name__ == "__main__":
    test_is_suspect_false_negative()
    test_pick_best_and_score()
    print("ALL OK (rescan)")
```

- [ ] **Step 2: Run test to verify it fails**

Run (depuis `backend/`) : `python test_rescan.py`
Expected: FAIL — `ImportError: cannot import name 'is_suspect_false_negative'`

- [ ] **Step 3: Write minimal implementation**

Ajouter à la fin de `backend/services/detection_helpers.py` :

```python
def is_suspect_false_negative(scripts_detected, network_ad_requests,
                              dom_ad_count, ad_surface_pct) -> bool:
    """Vrai si des signaux ad-tech existent (scripts détectés OU requêtes pub
    réseau) MAIS aucune pub VISIBLE (0 élément DOM encadré et surface ≈ 0 %).
    C'est le faux-négatif typique du headless (créas non rendues)."""
    has_adtech = bool(scripts_detected) or (network_ad_requests or 0) > 0
    no_visible = (dom_ad_count or 0) == 0 and (ad_surface_pct or 0) < 0.5
    return has_adtech and no_visible


def visible_ad_score(result: dict) -> tuple:
    """Clé de tri d'un résultat de scénario : plus de pubs visibles d'abord,
    puis plus de surface pub."""
    details = result.get("details") or {}
    return (result.get("dom_ad_count", 0) or 0, details.get("ad_surface_pct", 0) or 0)


def pick_best(results: list) -> dict:
    """Retourne le résultat avec le plus de pubs visibles (départage : surface)."""
    return max(results, key=visible_ad_score)
```

- [ ] **Step 4: Run test to verify it passes**

Run (depuis `backend/`) : `python test_rescan.py`
Expected: PASS — affiche `ALL OK (rescan)`

- [ ] **Step 5: Commit**

```bash
git add backend/services/detection_helpers.py backend/test_rescan.py
git commit -m "feat(rescan): décision pure suspect faux-négatif + pick_best"
```

---

## Task 2: Scroll lent paramétrable + contexte par scénario

**Files:**
- Modify: `backend/services/pw_worker.py`

- [ ] **Step 1: Paramétrer `scroll_full_page` avec un mode lent**

Dans `backend/services/pw_worker.py`, remplacer la signature et le corps de `scroll_full_page` (l.559) :

```python
def scroll_full_page(page):
```
par :
```python
def scroll_full_page(page, slow: bool = False):
```

Puis, dans le corps, remplacer le bloc :
```python
    pos = 0
    steps = 0
    while pos < height and steps < 12:
        pos += 1200
```
par :
```python
    step_px = 600 if slow else 1200
    pause_ms = 300 if slow else 60
    max_steps = 20 if slow else 12
    pos = 0
    steps = 0
    while pos < height and steps < max_steps:
        pos += step_px
```

Et remplacer la pause fixe :
```python
        page.wait_for_timeout(60)
```
par :
```python
        page.wait_for_timeout(pause_ms)
```

(Le mode par défaut `slow=False` reproduit exactement le comportement actuel : pas 1200, pause 60, cap 12.)

- [ ] **Step 2: Paramétrer `_new_context` avec un scénario**

Remplacer toute la fonction `_new_context` (l.1977) par :

```python
def _new_context(browser, scenario: dict | None = None):
    """Crée un contexte navigateur ISOLÉ (un par domaine). `scenario` optionnel
    applique locale / timezone / Accept-Language / UA pour les passes de retry.
    Sans `scenario` → comportement de base inchangé."""
    sc = scenario or {}
    ua = sc.get("user_agent") or (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
    ctx_kwargs = {"viewport": {"width": 1280, "height": 800}, "user_agent": ua}
    if sc.get("locale"):
        ctx_kwargs["locale"] = sc["locale"]
    if sc.get("timezone_id"):
        ctx_kwargs["timezone_id"] = sc["timezone_id"]
    if sc.get("accept_language"):
        ctx_kwargs["extra_http_headers"] = {"Accept-Language": sc["accept_language"]}
    context = browser.new_context(**ctx_kwargs)
    # Anti-détection : masque navigator.webdriver (signal #1 des anti-bots).
    context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
    )
    context.set_default_timeout(20_000)
    context.set_default_navigation_timeout(20_000)
    return context
```

- [ ] **Step 3: Vérifier que le fichier parse**

Run (depuis `backend/`) : `python -m py_compile services/pw_worker.py`
Expected: exit 0 (aucune sortie)

- [ ] **Step 4: Commit**

```bash
git add backend/services/pw_worker.py
git commit -m "feat(rescan): scroll lent + contexte paramétrés par scénario"
```

---

## Task 3: `full_audit` paramétré par scénario (scroll, attentes, captures suffixées)

**Files:**
- Modify: `backend/services/pw_worker.py`

- [ ] **Step 1: Étendre la signature de `full_audit`**

Remplacer la signature (l.1493) :
```python
def full_audit(page, domain: str, output_dir: str) -> dict:
```
par :
```python
def full_audit(page, domain: str, output_dir: str, scenario: dict | None = None) -> dict:
```

- [ ] **Step 2: Utiliser le scénario pour le scroll et les attentes**

Juste après la ligne `url = f"https://{domain}"` (début du corps de `full_audit`), ajouter :

```python
    sc = scenario or {}
    ad_wait_ms = sc.get("ad_wait_ms", 3000)
    slow_scroll = bool(sc.get("slow_scroll"))
    scenario_name = sc.get("name", "base")
```

Dans `full_audit`, remplacer l'appel de scroll :
```python
        scroll_full_page(page)
```
par :
```python
        scroll_full_page(page, slow=slow_scroll)
```

Remplacer les **deux** attentes d'enchères de `full_audit` (l.1565 et l.1576), qui sont :
```python
        ad_wait = _wait_for_ads(page, max_ms=3000, check_interval=500)
```
et
```python
        auction_wait = _wait_for_ads(page, max_ms=3000, check_interval=500)
```
respectivement par :
```python
        ad_wait = _wait_for_ads(page, max_ms=ad_wait_ms, check_interval=500)
```
et
```python
        auction_wait = _wait_for_ads(page, max_ms=ad_wait_ms, check_interval=500)
```

- [ ] **Step 3: Suffixer les chemins de capture par scénario**

Dans la section captures, remplacer :
```python
        safe_name = domain.replace(".", "_").replace("/", "_")
```
par :
```python
        safe_name = domain.replace(".", "_").replace("/", "_")
        shot_suffix = "" if scenario_name == "base" else f"__{scenario_name}"
```

Remplacer la ligne du viewport :
```python
        viewport_path = os.path.join(output_dir, f"{safe_name}_viewport.png")
```
par :
```python
        viewport_path = os.path.join(output_dir, f"{safe_name}{shot_suffix}_viewport.png")
```

Remplacer la ligne du fullpage :
```python
        fullpage_path = os.path.join(output_dir, f"{safe_name}_full.png")
```
par :
```python
        fullpage_path = os.path.join(output_dir, f"{safe_name}{shot_suffix}_full.png")
```

- [ ] **Step 4: Exposer `scenario_used` dans le dict de retour (succès)**

Dans le `return { ... }` de succès de `full_audit`, ajouter la clé juste avant `"error": None,` :
```python
            "scenario_used": scenario_name,
            "error": None,
```

- [ ] **Step 5: Exposer `scenario_used` dans le dict de retour (exception)**

Dans le `except Exception as e:` de `full_audit`, le dict de secours se termine par `"error": str(e)[:200],`. Ajouter juste avant :
```python
            "scenario_used": (scenario or {}).get("name", "base"),
            "error": str(e)[:200],
```

- [ ] **Step 6: Vérifier que le fichier parse**

Run (depuis `backend/`) : `python -m py_compile services/pw_worker.py`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add backend/services/pw_worker.py
git commit -m "feat(rescan): full_audit paramétré (scroll/attentes/captures par scénario)"
```

---

## Task 4: Contrôleur de retry + navigateur headful + promotion des captures

**Files:**
- Modify: `backend/services/pw_worker.py`

- [ ] **Step 1: Définir les constantes de scénario + le promoteur de captures**

Ajouter, juste avant `def main():` (l.2004), le bloc suivant :

```python
SCENARIO_FR_PATIENT = {
    "name": "fr_patient",
    "locale": "fr-FR",
    "timezone_id": "Europe/Paris",
    "accept_language": "fr-FR,fr;q=0.9",
    "slow_scroll": True,
    "ad_wait_ms": 6000,
}
# Mêmes réglages contexte/page ; la différence = navigateur lancé headless=False.
SCENARIO_HEADFUL = {**SCENARIO_FR_PATIENT, "name": "headful"}


def _promote_screenshots(best: dict, domain: str, output_dir: str) -> None:
    """Promeut les captures du scénario gagnant vers le nom canonique
    `{safe}_viewport.png` / `{safe}_full.png`, puis supprime les fichiers
    suffixés des scénarios. Met à jour les chemins du dict `best`."""
    import shutil
    import glob as _glob

    safe = domain.replace(".", "_").replace("/", "_")
    name = best.get("scenario_used", "base")
    if name != "base":
        for suffix, key in (("_viewport.png", "viewport_path"), ("_full.png", "fullpage_path")):
            src = os.path.join(output_dir, f"{safe}__{name}{suffix}")
            dst = os.path.join(output_dir, f"{safe}{suffix}")
            if os.path.exists(src):
                try:
                    shutil.copyfile(src, dst)
                    best[key] = dst
                except OSError:
                    pass
    # Nettoyage de tous les fichiers suffixés (`{safe}__<scenario>...`).
    for f in _glob.glob(os.path.join(output_dir, f"{safe}__*")):
        try:
            os.remove(f)
        except OSError:
            pass
```

- [ ] **Step 2: Importer les helpers de décision dans `main`**

Au tout début de `def main():` (juste après `raw = sys.stdin.read()`), ajouter :
```python
    from detection_helpers import is_suspect_false_negative, pick_best
```

- [ ] **Step 3: Initialiser le navigateur headful paresseux**

Dans `main()`, juste après la ligne `browser = pw.chromium.launch(...)` (la fermeture `)` de `launch`, l.2023), ajouter :
```python
        headful_browser = None  # lancé paresseusement au 1er site suspect
```

- [ ] **Step 4: Remplacer le dispatch `mode == "full"` par le contrôleur de retry**

Dans la boucle par domaine, remplacer EXACTEMENT :
```python
                if mode == "full":
                    results[domain] = full_audit(page, domain, output_dir)
```
par :
```python
                if mode == "full":
                    base = full_audit(page, domain, output_dir)
                    base["retry_count"] = 0
                    # .get() défensif : _load_error_result n'a pas toutes les clés.
                    suspect = is_suspect_false_negative(
                        (base.get("adtech") or {}).get("scripts_detected"),
                        (base.get("network_stats") or {}).get("ad_requests"),
                        base.get("dom_ad_count"),
                        (base.get("details") or {}).get("ad_surface_pct"),
                    )
                    if suspect:
                        _log(f"    [retry] Suspect faux-négatif (adtech présent, 0 pub visible) — escalade")
                        candidates = [base]
                        # S1 — FR patient, même navigateur headless
                        try:
                            c1 = _new_context(browser, SCENARIO_FR_PATIENT)
                            p1 = c1.new_page()
                            candidates.append(full_audit(p1, domain, output_dir, SCENARIO_FR_PATIENT))
                            c1.close()
                        except Exception as e:
                            _log(f"    [retry] S1 (fr_patient) echec: {str(e)[:80]}")
                        # S2 — headful (navigateur visible lancé une seule fois)
                        try:
                            if headful_browser is None:
                                _log(f"    [retry] Lancement navigateur visible (headful)...")
                                headful_browser = pw.chromium.launch(
                                    headless=False,
                                    args=["--disable-blink-features=AutomationControlled"],
                                )
                            c2 = _new_context(headful_browser, SCENARIO_HEADFUL)
                            p2 = c2.new_page()
                            candidates.append(full_audit(p2, domain, output_dir, SCENARIO_HEADFUL))
                            c2.close()
                        except Exception as e:
                            _log(f"    [retry] S2 (headful) echec: {str(e)[:80]}")
                        counts = " | ".join(f"{c.get('scenario_used')}:{c.get('dom_ad_count')}" for c in candidates)
                        best = pick_best(candidates)
                        best["retry_count"] = len(candidates) - 1
                        _promote_screenshots(best, domain, output_dir)
                        _log(f"    [retry] {counts} -> gagnant: {best.get('scenario_used')} ({best.get('dom_ad_count')} pubs visibles)")
                        results[domain] = best
                    else:
                        results[domain] = base
```

- [ ] **Step 5: Fermer le navigateur headful en fin de batch**

Dans `main()`, après la fin de la boucle `for i, domain in enumerate(domains):` (et avant que le `with sync_playwright()` ne se termine), ajouter :
```python
        if headful_browser is not None:
            try:
                headful_browser.close()
            except Exception:
                pass
```

(Repère : ce bloc se place au même niveau d'indentation que la boucle `for`, juste après elle.)

- [ ] **Step 6: Vérifier que le fichier parse**

Run (depuis `backend/`) : `python -m py_compile services/pw_worker.py`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add backend/services/pw_worker.py
git commit -m "feat(rescan): contrôleur de retry + headful + promotion captures"
```

---

## Task 5: Vérification d'intégration (manuelle)

**Files:** aucun (vérification comportementale)

- [ ] **Step 1: Re-scan d'un site suspect — bebasket.fr**

Le retry vit dans le worker, appelé via `full_audit_subprocess`. Lancer depuis `backend/` :

Le dossier de captures servi par l'app est à la **racine du repo** (`audit.py` utilise un chemin absolu `repo/output/screenshots`). Depuis `backend/`, on le cible via `../output/screenshots` :

```bash
python -c "
from services.pw_bridge import full_audit_subprocess
res = full_audit_subprocess(['bebasket.fr'], '../output/screenshots')
ar = res[0].get('bebasket.fr')
print('dom_ad_count :', getattr(ar, 'dom_ad_count', 'n/a'))
print('score        :', ar.score, ' ad_count:', ar.ad_count)
"
```

Observer dans les logs (stderr) la séquence `[retry] Suspect faux-négatif ... escalade`, puis `[retry] base:0 | fr_patient:N | headful:M -> gagnant: ...`.

Expected: le scénario `headful` (ou `fr_patient`) remonte des pubs visibles (`dom_ad_count > 0`) ; la capture canonique `../output/screenshots/bebasket_fr_viewport.png` montre des **cadres rouges** et le bandeau affiche une surface ATF > 0 %. Aucun fichier `bebasket_fr__*` ne subsiste (promotion + nettoyage OK) :

```bash
ls ../output/screenshots/ | grep bebasket
```
Expected: uniquement `bebasket_fr_viewport.png` et `bebasket_fr_full.png` (pas de `bebasket_fr__fr_patient_*` ni `bebasket_fr__headful_*`).

- [ ] **Step 2: Vérifier visuellement la capture**

Ouvrir `C:\MLI\mli_crawler\output\screenshots\bebasket_fr_viewport.png` (ou via l'UI `/sites` → détail du site). Confirmer la présence de pubs encadrées en rouge.

- [ ] **Step 3: Re-scan d'un site sans ad-tech — example.com (pas de retry)**

```bash
python -c "
from services.pw_bridge import full_audit_subprocess
res = full_audit_subprocess(['example.com'], '../output/screenshots')
ar = res[0].get('example.com')
print('OK example.com ad_count:', ar.ad_count)
"
```

Expected: **aucune** ligne `[retry]` dans les logs (pas d'ad-tech → pas de faux-négatif → 0 surcoût). Le scan reste rapide.

- [ ] **Step 4: Commit (le cas échéant)**

Aucun changement de code attendu à cette tâche. Si un ajustement a été nécessaire, le committer avec un message décrivant le fix.

---

## Notes d'implémentation

- **Aucune modif de `pw_bridge.py` / `audit.py`** : le retry est interne au worker ; `scenario_used`/`retry_count` transitent dans le dict de résultat (exposés pour usage futur, pas encore persistés en base).
- **Headful** nécessite un display — OK en local Windows. Sur serveur headless il faudrait xvfb (hors scope).
- **Coût** : seuls les sites *suspects* (ad-tech + 0 pub visible) déclenchent les 2 passes supplémentaires (~+30 s) ; les sites normaux ne paient rien.
- **Promotion des captures** : la passe `base` écrit déjà le nom canonique ; si `base` gagne, `_promote_screenshots` ne fait que nettoyer d'éventuels fichiers suffixés. Si un scénario gagne, sa capture suffixée est copiée vers le nom canonique avant nettoyage.
