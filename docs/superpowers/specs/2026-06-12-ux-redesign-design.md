# Design — Refonte UX MLI : pool de sites → whitelists thématiques → audit

Date : 2026-06-12
Périmètre : `frontend/` (gros) + `backend/` (modéré). Aucun changement détection/scoring.

## Contexte & problème

L'app actuelle empile : 2 dashboards redondants (`/sites` global + dashboard
workspace), une couche multi-workspace (switcher, invites, membres, activité,
admin), 7 entrées de menu, et une page d'audit avec 5 toggles de modules. Pour
un outil interne mono-équipe dont le job est « scanner une liste de sites →
score d'encombrement », c'est trop. L'utilisateur veut : **uploader des sites,
créer des whitelists thématiques à la volée, auditer à la demande**.

## Objectifs

1. Supprimer la notion de workspace de l'UX.
2. Recentrer l'app sur l'objet **Whitelist thématique** (Approche B).
3. Flux : **upload → catégoriser (IA) → créer whitelists par thème → auditer un
   thème → résultats + export** (« thématiser puis auditer »).
4. Sortie : tableau trié + détail/captures, et export Excel/CSV.

## Non-objectifs

- Toucher à la détection/scoring du worker (déjà refaite, voir
  `2026-06-11-detection-spa-video.md`).
- Refondre l'auth (login simple conservé).
- Changer le langage visuel (DESIGN.md v6 « Command dark » conservé).
- Vue comparaison de thèmes, dashboards à graphes, KPIs avancés (écartés par
  l'utilisateur).

## Navigation

Barre latérale = **2 entrées** + menu user discret.

```
▸ Whitelists   (accueil, objet pivot)
▸ Sites        (pool uploadé + catégorisation)
⚙ user menu    (clé Mistral, déconnexion)
```

## Écrans

### ① Whitelists (accueil)
Grille de cartes, une par thème : nom, # sites, dernier audit (date, score moyen,
# MFA, # morts), bouton **Auditer**. En-tête : **+ Nouvelle**, recherche.
État vide → invite à aller ajouter des sites.

### ② Sites (pool + thématisation hybride)
- En-tête : compteur, **⬆ Importer CSV/XLSX**, **🤖 Catégoriser**.
- Filtre par catégorie + recherche. Compteur de sélection.
- Tableau : `☑ | Site | Catégorie IA (éditable ▾) | Statut`.
- Actions sélection : **+ Créer une whitelist depuis la sélection**, **+ Ajouter
  la sélection à une whitelist ▾**.
- La colonne Catégorie IA éditable = l'« ajustement » de l'hybride (IA pré-classe,
  l'utilisateur corrige → `category_source='manual'`).

### ③ Whitelist (page unique : sites + audit + résultats + export)
- En-tête : nom du thème, # sites, **Modifier**, **Auditer ▸**, **⬇ Export**.
- Bandeau dernier audit : date, score moyen, # MFA, # morts, % ads.txt.
- Tableau trié : `Site | Score (couleur) | Pubs | Vidéo | Pays | Statut`.
- Clic ligne → panneau détail : capture annotée + score (ATF %, pubs, vidéo,
  ads.txt, adtech, pays).
- Pendant un audit : la page affiche la **progression live SSE**, puis bascule
  sur le tableau.
- Export : Excel/CSV du dernier audit (score, catégorie, morts/erreurs flaggés).

## Modèle de données

On réutilise les tables existantes ; **décision : garder un unique workspace
« Default » caché** (résolu en singleton côté API), pour éviter une migration
destructive des FK `workspace_id`. L'UI ne montre jamais le workspace.

| Concept | Table | Changement |
|---|---|---|
| Sites (pool) | `domains` (`domain`, `category_iab`, `category_source`, `last_score`, `last_health`, `last_ad_count`, `last_country`, `tags_json`…) | aucun |
| Whitelists | `workspace_whitelists` (`name`, `domains_json`) | résolues via workspace Default |
| Audits | `audits` (`results_json`, `stats_json`, `status`) | **+ colonne `whitelist_id TEXT NULL`** (migration idempotente via `_migrations`) |

## Flux & changements API

Tous les endpoints cessent d'exiger `workspace_id` : un helper
`get_default_workspace_id()` (crée/retourne le workspace « Default ») est utilisé
côté serveur. Les routes workspace-scoppées (`/api/workspaces/...`) sont
remplacées par des routes plates :

- **Upload** `POST /api/sites/import` : body = liste de domaines (ou fichier
  CSV/XLSX parsé côté front en lignes). Nettoyage (`strip`, retrait `www.`,
  minuscule) + dédup → `upsert` dans `domains` (sans score). Retourne
  {ajoutés, déjà_présents}.
- **Catégoriser** `POST /api/sites/categorize` : body = liste de domaines (ou
  « tous les non-catégorisés »). Lance le pipeline en mode léger
  `modules={categorization:true, attention:false, ads_txt:false, geo:false,
  screenshots:false}` ; écrit `category_iab` + `category_source='ai'` sur chaque
  `domains`. SSE de progression réutilisé.
- **Lister sites** `GET /api/sites?category=&q=` : lit `domains`.
- **Éditer catégorie** `PATCH /api/sites/{domain}` : `category_iab`,
  `category_source='manual'`.
- **Créer whitelist** `POST /api/whitelists` : `{name, domains[]}` → insert
  `workspace_whitelists` (workspace Default).
- **Lister/voir whitelist** `GET /api/whitelists`, `GET /api/whitelists/{id}`
  (joint le dernier audit via `whitelist_id`).
- **Auditer une whitelist** `POST /api/whitelists/{id}/audit` → réutilise le
  pipeline SSE existant (`routers/audit.py`) avec les domaines de la whitelist ;
  l'audit créé porte `whitelist_id`. Modules par défaut : attention, ads_txt,
  geo, screenshots ON ; IA ON seulement si clé Mistral fournie.
- **Export** `GET /api/whitelists/{id}/export?format=xlsx|csv` : réutilise
  `routers/export.py` sur le dernier audit du thème.

## Frontend — réutilisation vs construction

- **Réutiliser** : `useAuditStream` (SSE), `AuditProgress`, `SiteTable`,
  `SiteModal` (panneau détail/capture), client `lib/api.ts` (adapté aux routes
  plates).
- **Construire** : nouvelle nav (Sidebar 2 entrées), écran Whitelists (cartes),
  écran Sites (upload + table + sélection→whitelist), page Whitelist (sites +
  audit + résultats + export).
- **Supprimer** : pages `workspaces/*`, `admin/*`, `activity`, invites/membres ;
  les 2 dashboards ; les 5 toggles de module (→ défauts + « Options avancées »
  repliées).

## Gestion d'erreurs
- Upload : lignes invalides ignorées avec compte ; doublons signalés.
- Catégorisation : échec Mistral (clé absente/quota) → catégorie `null`, l'UI
  affiche « non catégorisé », pas de blocage.
- Audit : `load_error`/morts → score N/A, exclus des moyennes (déjà géré
  `models.compute_stats`), affichés « mort »/« erreur » dans le tableau.
- Whitelist sans audit → bandeau « Jamais audité », bouton Auditer mis en avant.

## Implémentation par phases (le plan détaillera)
- **P1 — Données + API dé-workspace** : `get_default_workspace_id()`, migration
  `audits.whitelist_id`, routes plates `/api/sites/*` et `/api/whitelists/*`,
  catégorisation écrit `category_iab`. Tests pytest.
- **P2 — Écran Sites** : upload (CSV/XLSX/coller), table, filtre, catégoriser,
  sélection → créer/ajouter whitelist.
- **P3 — Whitelists + page thème** : cartes, page unique (sites + audit live +
  résultats + détail + export).
- **P4 — Retrait de l'ancien** : suppression pages workspace/admin/activity,
  dashboards, nav 7→2.

## Tests
- **Backend** : pytest sur `get_default_workspace_id`, import/dédup sites,
  création whitelist, migration `whitelist_id`, export.
- **Frontend** : smoke Playwright sur les 3 flux (upload→catégoriser,
  sélection→whitelist, auditer→résultats→export) contre le backend local.
