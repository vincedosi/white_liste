# Liste des sites — refonte UX (V1) — Design

**Date:** 2026-06-15
**Statut:** Validé (brainstorming)
**Périmètre:** Liste/table principale des sites uniquement. **Ne pas toucher la vue détail** (modale screenshots + zones pub).
**Source:** `doc/PROMPT_LISTE_SITES_UX.md` (spec d'origine), ajustée à la réalité des données.

---

## 1. Contexte et objectif

Transformer la table des sites en **« rolodex de sites »** : chaque ligne = un site web avec son
snapshot le plus récent, son statut visuel dominant (% aire pub), sa tendance grossière, et sa
fraîcheur. La métrique héros est le **% d'aire publicitaire** de la page.

Cette V1 livre la refonte avec les **données réellement persistées aujourd'hui**. Les features qui
exigent un historique par site (sparkline multi-points, deltas numériques « 12 → 15 ») sont
**reportées en V2** (nécessitent une table d'historique + backfill).

### Contraintes (de la spec d'origine)
- Ne pas casser la logique métier (scan, calculs de score).
- **MAX 150 lignes par fichier.**
- Sentence case dans les libellés UI.
- Tailwind + composants du design system existant.
- TypeScript strict.
- Tout en français.

---

## 2. Décisions de cadrage (V1)

| Sujet | Décision V1 | Reporté en V2 |
|-------|-------------|---------------|
| Historique par site | Aucun (modèle overwrite actuel conservé) | Table `domain_analyses` + backfill |
| Métrique héros | **% aire pub réel** (`last_ad_surface_pct`, +1 colonne) | — |
| Tendance | Flèche grossière up/down/stable (`last_score_trend`, déjà persistée) | Sparkline multi-points |
| Deltas numériques | Aucun | Delta par métrique (score, nb pub, santé) |
| Taille page / « Pages lourdes » | **Supprimés** (donnée absente) | Capture du poids page (optionnel) |

---

## 3. Modèle de données et backend

État actuel : la table `domains` (cf. `backend/db.py`) stocke **un seul snapshot par site**
(modèle overwrite). Les métriques riches par scan (dont `page_profile.total_ad_surface_pct`) sont
calculées par le crawler puis **jetées** — seul `last_score` (0–10) survit. `last_score_trend`
(`'up'|'down'|'stable'`) est calculé au moment de l'upsert vs le scan précédent.

### 3.1 Nouvelle colonne
- Ajouter `last_ad_surface_pct REAL` (nullable) à la table `domains`.
- Migration **additive** : `ALTER TABLE domains ADD COLUMN last_ad_surface_pct REAL`, gardée par
  un check d'existence dans `init_db()` (même pattern forward-only que le schéma existant).

### 3.2 Écriture sur chaque scan
- Dans `upsert_domain()` (`backend/db.py`), renseigner `last_ad_surface_pct` à partir de
  `page_profile.total_ad_surface_pct` de l'audit (déjà calculé par `pw_worker.py`, aujourd'hui
  ignoré). S'applique aussi au endpoint `rescan`.

### 3.3 Backfill best-effort (one-shot)
- Script/passe unique parcourant `audits.results_json` : pour chaque domaine, prendre l'audit le
  plus récent et y lire `total_ad_surface_pct` **s'il est présent** dans le JSON stocké.
- **Dépendance à vérifier au planning** : confirmer que `total_ad_surface_pct` survit bien dans
  `results_json` (modèle `SiteAudit` / `model_dump`). Si absent : backfill ignoré, la colonne se
  remplit uniquement « en avant » (forward-fill) au fil des rescans.
- Les lignes restées `null` → l'UI affiche « — » (barre muette, pas de pill) jusqu'au prochain scan.

### 3.4 API `getSites` (`backend/routers/sites.py` + `frontend/lib/api.ts`)
- Ajouter `last_ad_surface_pct` aux colonnes de tri autorisées.
- **Tri par défaut** = `last_ad_surface_pct DESC, nulls last` (les plus problématiques en haut).
- Nouveaux paramètres de filtre :
  - `ad_pct_min` / `ad_pct_max` → chip « Problématiques » (`ad_pct_min=50`).
  - `stale_days` → chip « À ré-analyser » : `last_audit_date` plus ancien que N jours (ou null).
    N par défaut dans `config.py` (ex. `STALE_DAYS = 14`).

### 3.5 API `getSiteStats` (`/api/sites/stats`)
Trois agrégats ajoutés (une ligne SQL chacun) :
- `avg_ad_surface_pct` → KPI « % pub moyen » (fallback dérivé de `avg_score` si la colonne est
  encore trop creuse).
- `problematic` (count `last_ad_surface_pct ≥ 50`) → KPI « Problématiques » + compteur du chip
  « Problématiques ». Cohérent avec le seuil du badge et du filtre `ad_pct_min=50`.
- `stale` (count `last_audit_date` > `STALE_DAYS`) → compteur du chip « À ré-analyser ».

### 3.6 Type partagé
- `frontend/lib/types.ts` : ajouter `last_ad_surface_pct: number | null` à `SiteEntry`, et les trois
  champs ci-dessus (`avg_ad_surface_pct`, `problematic`, `stale`) à `SiteStats`.

**Hors périmètre backend V1 :** aucune table d'historique, aucune capture de poids page, aucun
delta numérique multi-scan.

---

## 4. Architecture frontend (décomposition)

`frontend/app/sites/page.tsx` passe de **742 → ~120 lignes** (orchestrateur fin). Toutes les
nouvelles unités < 150 lignes.

```
app/sites/page.tsx                 ~120  orchestrateur : état (filtres, tri, page, sélection,
                                         mistralKey), assemble les sous-composants
hooks/useSitesList.ts              ~70   fetch getSites keyé sur {page,sort,filters} ;
                                         retourne {sites,total,pages,loading,reload}

components/sites/
  SitesKpis.tsx        ~70   4 KpiCard (existant) alimentés par getSiteStats
  SiteFilters.tsx      ~90   FilterChips + champ recherche + reset ; état remonté à la page
  SitesTable.tsx       ~110  <table>, <thead> triable, map des lignes, états empty/loading
  SiteRow.tsx          ~120  une ligne : cellule site, AdAreaBar, nb pub, santé, MAJ, kebab, checkbox
  AdAreaBar.tsx        ~80   HÉROS : barre + % + flèche tendance + Pill statut
  SiteKebabMenu.tsx    ~90   menu ••• : rescan / valider / ouvrir / détail / retirer
  BulkActionsBar.tsx   ~70   barre sticky si sélection > 0 : rescan / catégoriser / retirer
  SiteDetailModal.tsx  (extrait verbatim de page.tsx — NON modifié)
  CategorizeModal.tsx  (extrait verbatim de page.tsx — NON modifié)

components/ui/  (atomes partagés, réutilisables au-delà de /sites)
  Pill.tsx             ~30   pill de statut (calme/vigilance/tension), palette désaturée
  Delta.tsx            ~25   ▲/▼ + valeur, coloré (utilisé par AdAreaBar ; deltas numériques en V2)
  FilterChip.tsx       ~30   chip toggle actif/inactif
```

### Décisions structurantes
- **Vue détail** (`SiteDetailModal`) et **modale de catégorisation** (`CategorizeModal`) :
  **extraites telles quelles** de `page.tsx` vers leurs propres fichiers — déplacées, pas modifiées.
  Le clic sur une ligne ouvre toujours la **modale** (pas une route `/sites/[id]`).
- **`Pill` vs `Badge` existant** : `Badge` reste pour santé/ads.txt ; `Pill` est le nouveau statut
  (calme/vigilance/tension) en palette désaturée. Séparés pour ne pas surcharger l'union de variantes
  de `Badge`.
- **`SearchInput`** de la spec → simple `<input>` stylé intégré à `SiteFilters` (pas de fichier dédié).
  **`KebabMenu`** → `SiteKebabMenu` (actions spécifiques aux sites).

---

## 5. Comportement UI

### 5.1 Colonnes (V1)

| Col | Contenu | Donnée |
|-----|---------|--------|
| ☐ | Checkbox de sélection | client |
| **Site** | Favicon 16px + nom (gras) + domaine tronqué dessous | `domain` |
| **% Aire pub** *(héros)* | `AdAreaBar` : barre + `%` + flèche tendance + `Pill` statut | `last_ad_surface_pct`, `last_score_trend` |
| **Pubs** | nb éléments pub | `last_ad_count` |
| **Santé** | `Badge` santé | `last_health` |
| **MAJ** | « il y a 3 j » + ⓘ tooltip date exacte | `last_audit_date` |
| ••• | `SiteKebabMenu` | — |

Supprimées vs spec : **Taille page** (pas de donnée), **Tendance/sparkline** (V2). La tendance est
intégrée dans la cellule héros sous forme de flèche up/down/stable. **Santé** conservée (donnée
présente et utile).

### 5.2 `AdAreaBar` (héros)
- Barre pleine largeur, largeur de remplissage = `%`.
- Couleur (palette désaturée) : `< 30 → #5C8B70 (sauge)` · `< 50 → #C28230 (ambre)` ·
  `≥ 50 → #B44848 (terracotta)`.
- `%` + flèche tendance superposés ; `Pill` statut dessous :
  `< 30 → ✓ Acceptable (calme)` · `< 50 → ⚠ Élevé (vigilance)` · `≥ 50 → 🔴 Problématique (tension)`.
- `last_ad_surface_pct === null` → barre muette « — », pas de pill (donnée non encore backfillée/scannée).

### 5.3 Filtres (`SiteFilters`) — tous server-backed
- Chips : **Tous** · **🔴 Problématiques** (`ad_pct_min=50`) · **À ré-analyser** (`stale_days=14`) ·
  champ recherche (domaine/URL).
- Supprimé : **Pages lourdes**.
- Compteurs live depuis `getSiteStats` : Tous (`total`), Problématiques (count `ad_pct≥50`),
  À ré-analyser (`stale`).

### 5.4 KPI header (`SitesKpis`) — 4 `KpiCard` depuis `getSiteStats`
- **Sites suivis** (`total`)
- **% pub moyen** (`avg_ad_surface_pct`, fallback dérivé de `avg_score`)
- **Problématiques** (count `ad_pct ≥ 50`, `variant=tension`)
- **ads.txt OK** (`ads_txt_ok / total` en %)

Remplace le « Analyses cette semaine » de la spec (pas de donnée) par « ads.txt OK » (backed).

### 5.5 Barre d'actions bulk (`BulkActionsBar`)
- Sticky en bas quand sélection > 0.
- Actions : **Ré-analyser** (boucle sur `rescan`), **Catégoriser** (flux Mistral existant sur la
  sélection), **Retirer** (avec confirmation).
- « Exporter » reporté (pas d'endpoint).

### 5.6 Menu kebab (`SiteKebabMenu`)
- Ré-analyser maintenant · Valider un score (flux `validate`) · Ouvrir le site (nouvel onglet) ·
  Voir le détail (= ouvre la modale) · ─── · Retirer (rouge, confirmation).

### 5.7 États edge
- **Empty** (aucun site) : illustration + CTA « Analyser un site ».
- **0 résultat sous filtre** : message + lien « Réinitialiser les filtres ».
- **Loading** : 5–8 lignes squelettes (`animate-pulse`), pas de spinner central.
- **Ré-analyse en cours** : ligne à opacité 0.5 + icône ⟳ animée à la place de la date MAJ.

### 5.8 Densité (spec §11)
- Hauteur de ligne ~64px (nom + domaine sur 2 lignes).
- `px-3 py-3`, bordure horizontale discrète entre lignes, pas de bordures verticales.
- `<thead>` sticky au scroll.

---

## 6. Flux de données

```
page.tsx
  ├─ useSitesList({page, sort, filters}) ──GET /api/sites────────► sites[], total, pages
  ├─ getSiteStats() ───────────────────────GET /api/sites/stats──► KPIs + compteurs chips
  └─ getSiteCountries() ───────────────────GET /api/sites/countries (filtre pays, déjà présent)

Actions :
  rescan   POST /api/sites/{domain}/rescan     (ligne + bulk)
  validate POST /api/sites/{domain}/validate   (kebab)
  categorize  (flux Mistral existant)          (bulk + modale)
```

Le tri par défaut (`last_ad_surface_pct DESC`) et les filtres sont **server-side** via `getSites`.
Après une action (rescan/validate/categorize), `reload()` du hook rafraîchit la liste.

---

## 7. Hors périmètre (V2+)
- Table d'historique `domain_analyses` + backfill + endpoint `/api/sites/{domain}/analyses`.
- Sparkline multi-points par site.
- Deltas numériques par métrique (score, nb pub, santé, temps).
- Capture/persistance du poids de page + colonne/filtre associés.
- Export de la sélection.

---

## 8. Plan de validation
- `npm run typecheck` + `npm run build` (frontend).
- Tests backend sur la migration additive et l'écriture de `last_ad_surface_pct`.
- Smoke test navigateur : tri par défaut, chips de filtre, sélection bulk, kebab, états edge.
- Vérifier qu'aucune ligne `null %` ne casse l'affichage (barre « — »).
