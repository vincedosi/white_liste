# MLI — Workspaces, Auth & Persistence — Design Spec

**Date** : 2026-04-06
**Status** : Draft → Review
**Auteur** : Claude + User
**Migration cible** : Supabase (PostgreSQL + Auth + Realtime)

---

## 1. Objectif

Transformer MLI d'un outil mono-utilisateur à stockage fichier en une plateforme multi-utilisateurs avec :
- **Authentification** : JWT seed (proto), migration Supabase Auth prévue
- **Workspaces** : espaces isolés par client (annonceur) avec accès multi-users
- **Persistance** : SQLite pour le proto, schéma 1:1 avec PostgreSQL
- **Export/Import** : unitaire (1 audit) + workspace complet (backup/migration)

---

## 2. Schéma de données (SQLite)

### 2.1 — `users`

| Colonne         | Type       | Contraintes                |
|-----------------|------------|----------------------------|
| `id`            | TEXT (UUID)| PRIMARY KEY                |
| `email`         | TEXT       | UNIQUE NOT NULL            |
| `password_hash` | TEXT       | NOT NULL (bcrypt)          |
| `name`          | TEXT       | NOT NULL                   |
| `role`          | TEXT       | NOT NULL DEFAULT 'user' — enum: admin, user |
| `created_at`    | TEXT (ISO) | NOT NULL DEFAULT now       |

Seed au boot depuis `backend/seed.json` :
```json
[
  { "email": "admin@dentsu.com", "password": "admin123", "name": "Admin Dentsu", "role": "admin" },
  { "email": "trader@dentsu.com", "password": "trader123", "name": "Trader Demo", "role": "user" }
]
```
Les passwords sont hashés (bcrypt) au premier lancement. Le fichier seed n'est lu qu'une fois (flag `_seed_done` en DB).

### 2.2 — `workspaces`

| Colonne           | Type       | Contraintes                |
|-------------------|------------|----------------------------|
| `id`              | TEXT (UUID)| PRIMARY KEY                |
| `name`            | TEXT       | NOT NULL                   |
| `slug`            | TEXT       | UNIQUE NOT NULL            |
| `logo_path`       | TEXT       | NULLABLE                   |
| `config_json`     | TEXT (JSON)| DEFAULT '{}' — modules, seuils, clé Mistral chiffrée |
| `onboarding_done` | INTEGER    | DEFAULT 0 (boolean)        |
| `created_by`      | TEXT       | FK → users.id              |
| `created_at`      | TEXT (ISO) | NOT NULL                   |

`config_json` structure :
```json
{
  "modules": { "attention": true, "ads_txt": true, "geo": true, "categorization": false, "screenshots": true },
  "mfa_threshold": 4.0,
  "mistral_key_encrypted": null
}
```

### 2.3 — `workspace_members`

| Colonne        | Type       | Contraintes                     |
|----------------|------------|---------------------------------|
| `workspace_id` | TEXT       | FK → workspaces.id, PK (composite) |
| `user_id`      | TEXT       | FK → users.id, PK (composite)  |
| `role`         | TEXT       | NOT NULL — enum: owner, editor, viewer, client |
| `joined_at`    | TEXT (ISO) | NOT NULL                        |

Rôles :
- **owner** : tout (delete workspace, gérer membres, lancer/supprimer audits, config)
- **editor** : lancer audits, créer whitelists, exporter, tags
- **viewer** : lecture seule, exporter
- **client** : lecture seule de CE workspace uniquement, pas de navigation inter-workspaces

### 2.4 — `audits`

| Colonne        | Type       | Contraintes                |
|----------------|------------|----------------------------|
| `id`           | TEXT (UUID)| PRIMARY KEY                |
| `workspace_id` | TEXT       | FK → workspaces.id NOT NULL|
| `launched_by`  | TEXT       | FK → users.id NOT NULL     |
| `client_label` | TEXT       | NOT NULL (hérité de workspace.name par défaut) |
| `status`       | TEXT       | NOT NULL — enum: running, completed, failed |
| `domain_count` | INTEGER    | NOT NULL DEFAULT 0         |
| `stats_json`   | TEXT (JSON)| NULLABLE — stats agrégées  |
| `results_json` | TEXT (JSON)| NULLABLE — tableau SiteAudit[] |
| `log_json`     | TEXT (JSON)| NULLABLE — journal d'exécution |
| `created_at`   | TEXT (ISO) | NOT NULL                   |
| `completed_at` | TEXT (ISO) | NULLABLE                   |

Les screenshots restent en fichiers : `output/screenshots/{workspace_slug}/{audit_id}/`.

### 2.5 — `audit_tags`

| Colonne    | Type | Contraintes                          |
|------------|------|--------------------------------------|
| `audit_id` | TEXT | FK → audits.id, PK (composite)      |
| `tag`      | TEXT | NOT NULL, PK (composite) — ex: "mensuel", "recette", "prod" |

### 2.6 — `workspace_whitelists`

| Colonne        | Type       | Contraintes                |
|----------------|------------|----------------------------|
| `id`           | TEXT (UUID)| PRIMARY KEY                |
| `workspace_id` | TEXT       | FK → workspaces.id NOT NULL|
| `name`         | TEXT       | NOT NULL — ex: "Q1 2026"  |
| `domains_json` | TEXT (JSON)| NOT NULL — tableau de domaines |
| `created_by`   | TEXT       | FK → users.id              |
| `created_at`   | TEXT (ISO) | NOT NULL                   |
| `updated_at`   | TEXT (ISO) | NOT NULL                   |

### 2.7 — `workspace_activity`

| Colonne        | Type       | Contraintes                |
|----------------|------------|----------------------------|
| `id`           | TEXT (UUID)| PRIMARY KEY                |
| `workspace_id` | TEXT       | FK → workspaces.id NOT NULL|
| `user_id`      | TEXT       | FK → users.id NOT NULL     |
| `action`       | TEXT       | NOT NULL — voir liste ci-dessous |
| `detail_json`  | TEXT (JSON)| NULLABLE                   |
| `created_at`   | TEXT (ISO) | NOT NULL                   |

Actions : `audit_launched`, `audit_completed`, `audit_deleted`, `member_added`, `member_removed`, `member_role_changed`, `whitelist_created`, `whitelist_updated`, `whitelist_deleted`, `workspace_config_updated`, `export_done`, `import_done`.

### 2.8 — `workspace_invites`

| Colonne        | Type       | Contraintes                |
|----------------|------------|----------------------------|
| `id`           | TEXT (UUID)| PRIMARY KEY (= token)      |
| `workspace_id` | TEXT       | FK → workspaces.id NOT NULL|
| `email`        | TEXT       | NOT NULL                   |
| `role`         | TEXT       | NOT NULL — editor, viewer, client |
| `invited_by`   | TEXT       | FK → users.id              |
| `expires_at`   | TEXT (ISO) | NOT NULL (7 jours)         |
| `accepted_at`  | TEXT (ISO) | NULLABLE — null = pending  |

Pour le proto : pas d'email. L'owner copie le lien `/invite/{token}`. L'user se connecte et accepte.

---

## 3. Migration des données existantes

Au premier lancement avec la nouvelle DB :
1. Créer les tables si elles n'existent pas
2. Seed les users depuis `seed.json`
3. Créer un workspace "Default" assigné à l'admin
4. Scanner `output/history/*.json` et importer chaque audit dans le workspace Default
5. Marquer la migration comme faite (table `_migrations` avec un flag)

Les audits existants conservent leur UUID. Pas de perte de données.

---

## 4. Authentification

### 4.1 — Backend (FastAPI)

**Dépendances** : `pyjwt`, `bcrypt`, `aiosqlite`

**Middleware** :
```python
async def get_current_user(request: Request) -> User:
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = await db.get_user(payload["sub"])
    if not user:
        raise HTTPException(401)
    return user
```

**Routes** :
```
POST /api/auth/login     → { access_token, user }
GET  /api/auth/me        → { user, workspaces[] }
```

Token payload : `{ sub: user_id, email, role, exp }`. Expire 24h.

### 4.2 — Frontend (Next.js)

**`useAuth()` hook** :
- State : `user`, `token`, `loading`
- Actions : `login(email, password)`, `logout()`
- Stockage : `localStorage` (token) — acceptable pour un proto
- Auto-refresh : check `/api/auth/me` au mount

**`AuthGuard` component** :
- Wrap autour du layout principal
- Redirect vers `/login` si pas de token ou token expiré
- Passe `user` via React Context

**`api.ts` modifié** :
- Fonction `fetchWithAuth(url, options)` qui ajoute `Authorization: Bearer <token>`
- Toutes les fonctions API existantes (`getAudits`, `startAudit`, etc.) passent par `fetchWithAuth`

---

## 5. API Routes

### 5.1 — Auth
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| POST | `/api/auth/login` | `{ email, password }` | `{ access_token, user }` | Public |
| GET | `/api/auth/me` | — | `{ user, workspaces[] }` | Authenticated |

### 5.2 — Workspaces
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| GET | `/api/workspaces` | — | `Workspace[]` | Authenticated (user's workspaces) |
| POST | `/api/workspaces` | `{ name, logo? }` | `Workspace` | Authenticated |
| GET | `/api/workspaces/:id` | — | `Workspace + members + stats` | Member |
| PATCH | `/api/workspaces/:id` | `{ name?, config? }` | `Workspace` | Owner, Editor |
| DELETE | `/api/workspaces/:id` | — | `204` | Owner |

### 5.3 — Members
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| POST | `/api/workspaces/:id/members` | `{ email, role }` | `Invite` | Owner |
| PATCH | `/api/workspaces/:id/members/:uid` | `{ role }` | `Member` | Owner |
| DELETE | `/api/workspaces/:id/members/:uid` | — | `204` | Owner |

### 5.4 — Invitations
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| POST | `/api/invites/:token/accept` | — | `{ workspace }` | Authenticated (email match) |

### 5.5 — Whitelists
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| GET | `/api/workspaces/:id/whitelists` | — | `Whitelist[]` | Member |
| POST | `/api/workspaces/:id/whitelists` | `{ name, domains[] }` | `Whitelist` | Owner, Editor |
| PATCH | `/api/workspaces/:wid/whitelists/:id` | `{ name?, domains? }` | `Whitelist` | Owner, Editor |
| DELETE | `/api/workspaces/:wid/whitelists/:id` | — | `204` | Owner, Editor |

### 5.6 — Audits (scopés au workspace)
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| POST | `/api/workspaces/:id/audits` | `{ domains[], modules, mistral_key? }` | SSE stream | Owner, Editor |
| GET | `/api/workspaces/:id/audits` | — | `AuditSummary[]` | Member |
| GET | `/api/workspaces/:id/audits/:aid` | — | `AuditResult` | Member |
| DELETE | `/api/workspaces/:id/audits/:aid` | — | `204` | Owner, Editor |
| GET | `/api/workspaces/:id/audits/:aid/compare/:bid` | — | `AuditDiff` | Member |

### 5.7 — Tags
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| POST | `/api/audits/:id/tags` | `{ tag }` | `{ tags[] }` | Owner, Editor |
| DELETE | `/api/audits/:id/tags/:tag` | — | `{ tags[] }` | Owner, Editor |

### 5.8 — Export / Import
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| GET | `/api/workspaces/:id/export` | — | ZIP (application/zip) | Owner, Editor |
| GET | `/api/audits/:id/export` | — | ZIP (application/zip) | Member |
| POST | `/api/workspaces/:id/import` | multipart ZIP | `{ imported_count }` | Owner |

### 5.9 — Activity
| Method | Route | Body | Response | Permission |
|--------|-------|------|----------|------------|
| GET | `/api/workspaces/:id/activity` | `?limit=50` | `Activity[]` | Member |

### 5.10 — Rétro-compatibilité
Les anciennes routes (`GET /api/audits`, `GET /api/audits/:id`) continuent de fonctionner en redirigeant vers le workspace par défaut de l'utilisateur connecté.

---

## 6. Frontend — Pages & Navigation

### 6.1 — Routes

```
/login                              → LoginPage
/workspaces                         → WorkspaceListPage
/workspaces/new                     → WorkspaceOnboarding (wizard 3 étapes)
/workspaces/:id                     → WorkspaceDashboard
/workspaces/:id/audit/new           → AuditForm (pré-rempli avec config workspace)
/workspaces/:id/audit/:aid          → AuditResultPage (existant, adapté)
/workspaces/:id/audit/:aid/compare  → AuditCompare (sélection d'un 2e audit)
/workspaces/:id/whitelists          → WhitelistsPage
/workspaces/:id/activity            → ActivityPage
/workspaces/:id/settings            → WorkspaceSettings
/invite/:token                      → InviteAcceptPage
```

### 6.2 — Sidebar

```
┌──────────────────────┐
│ MLI                  │
│ Media-List Intel.    │
├──────────────────────┤
│ [▾ L'Oréal]         │  ← WorkspaceSwitcher dropdown
├──────────────────────┤
│ ◉ Dashboard          │
│ ◉ Nouvel Audit       │
│ ◉ Whitelists         │
│ ◉ Activité           │
│ ◉ Paramètres         │
├──────────────────────┤
│ 🟢 Operationnel      │
│                      │
│ j.dupont@dentsu.com  │
│ [Déconnexion]        │
└──────────────────────┘
```

Le `WorkspaceSwitcher` affiche tous les workspaces de l'user. Changer de workspace = naviguer vers `/workspaces/:newId`.

Les users avec rôle `client` ne voient PAS le switcher — ils sont verrouillés sur leur workspace.

### 6.3 — Nouvelles pages

**LoginPage** :
- Glass card centré sur fond #080808
- Email + password + bouton gradient fluid
- Message d'erreur inline
- Pas d'inscription (proto — users seedés)

**WorkspaceListPage** :
- Grille de cards : nom, logo, nb membres, nb audits, date dernier audit
- Bouton "Nouveau workspace" → redirige vers le wizard
- Badge du rôle de l'user sur chaque card

**WorkspaceOnboarding** (wizard 3 étapes) :
1. Nom + slug + logo (drag & drop optionnel)
2. Coller la whitelist de référence initiale (optionnel, skip possible)
3. Choisir modules par défaut + seuil MFA

Chaque étape est un step indicator (comme AuditProgress). À la fin : redirect vers le dashboard du workspace.

**WorkspaceDashboard** :
- KPI row : nb audits total, score moyen, sites morts, taux MFA
- Sparklines de tendance (5 derniers audits) pour chaque KPI
- Derniers 5 audits (mini table avec status + date + bouton "Re-run")
- Whitelists de référence (aperçu)
- Activité récente (5 dernières entrées)

**AuditForm** (adaptation de page.tsx) :
- Config pré-remplie depuis `workspace.config_json`
- Dropdown pour sélectionner une whitelist sauvegardée OU coller des domaines
- Le bouton "Re-run" pré-remplit les domaines depuis un audit existant
- L'audit est sauvé dans le workspace courant

**AuditCompare** :
- Sélection de 2 audits du même workspace
- Tableau comparatif domaine par domaine : score, pubs, status, catégorie
- Badges vert/rouge pour les deltas (amélioration/dégradation)
- KPI row avec les deltas agrégés

**WhitelistsPage** :
- Liste des whitelists avec nb domaines, date création, créateur
- CRUD : créer (textarea), éditer, supprimer
- Bouton "Lancer un audit avec cette whitelist"

**ActivityPage** :
- Timeline verticale : avatar user + action + timestamp + détails
- Filtres par type d'action
- Scroll infini ou pagination

**WorkspaceSettings** :
- Onglet Config : nom, slug, logo, modules par défaut, seuil MFA, clé Mistral
- Onglet Membres : liste avec rôles, bouton modifier rôle, bouton retirer
- Onglet Invitations : liste des invitations pending + formulaire d'invitation (email + rôle)
- Onglet Danger : supprimer le workspace (confirmation)

### 6.4 — Notifications (badge sidebar)

Polling `/api/workspaces/:id/activity?since=<last_check>` toutes les 30 secondes.

Badge numérique sur "Activité" dans la sidebar si nouvelles entrées depuis le dernier clic.

Pas de push, pas de websocket. Se transpose en Supabase Realtime plus tard.

---

## 7. Export / Import

### 7.1 — Export unitaire (1 audit)

ZIP contenant :
```
audit-{id}.zip
├── manifest.json       → { audit_id, workspace, client, exported_at, version }
├── audit.json          → le blob complet (stats + results + log)
├── screenshots/        → viewport + fullpage PNGs
└── whitelist.txt       → domaines au format texte
```

### 7.2 — Export workspace

ZIP contenant :
```
workspace-{slug}.zip
├── manifest.json       → { workspace, members, config, exported_at, version }
├── config.json         → workspace config
├── whitelists/
│   ├── q1-2026.json
│   └── principale.json
├── audits/
│   ├── {audit-id-1}/
│   │   ├── audit.json
│   │   └── screenshots/
│   ├── {audit-id-2}/
│   │   ├── audit.json
│   │   └── screenshots/
│   └── ...
└── activity.json       → journal d'activité
```

### 7.3 — Import workspace

POST multipart avec le ZIP. Le serveur :
1. Valide le manifest (version, structure)
2. Crée les audits manquants (skip les doublons par UUID)
3. Crée les whitelists manquantes
4. Log l'import dans `workspace_activity`
5. Retourne `{ imported_audits: N, imported_whitelists: N, skipped: N }`

---

## 8. Stack technique

### Backend
- **Python 3.13** + **FastAPI**
- **aiosqlite** pour l'accès DB async
- **pyjwt** pour les tokens JWT (HS256)
- **bcrypt** pour le hashing des passwords
- **DB file** : `backend/data/mli.db` (gitignored)
- **Seed file** : `backend/seed.json`

### Frontend
- **Next.js 14** + **TypeScript**
- **Tailwind CSS** (thème Command)
- Pas de lib auth externe — `useAuth()` custom hook
- `localStorage` pour le token JWT

### Migration Supabase (futur)
Le schéma SQLite se transpose 1:1 :
- `aiosqlite` → `supabase-py` (ou Prisma)
- JWT custom → Supabase Auth (même format de token)
- Polling activity → Supabase Realtime
- File storage screenshots → Supabase Storage
- Les routes API ne changent pas (seule la couche DB change)

---

## 9. Fichiers backend à créer/modifier

### Nouveaux fichiers
```
backend/
├── db.py                → init SQLite, migrations, helpers CRUD
├── auth.py              → hash, verify, create_token, middleware
├── seed.json            → users initiaux
├── routers/
│   ├── auth.py          → login, me
│   ├── workspaces.py    → CRUD workspaces + members + invites
│   ├── whitelists.py    → CRUD whitelists
│   ├── activity.py      → GET activity
│   └── export.py        → export/import ZIP
└── data/
    └── .gitkeep         → dossier pour mli.db (gitignored)
```

### Fichiers modifiés
- `backend/main.py` — ajouter les nouveaux routers, init DB au startup
- `backend/routers/audit.py` — scoper au workspace, ajouter launched_by
- `backend/routers/history.py` — scoper au workspace, rétro-compat
- `backend/models.py` — ajouter User, Workspace, Member, Whitelist, Activity, Invite

### Fichiers frontend à créer
```
frontend/
├── app/
│   ├── login/page.tsx
│   ├── workspaces/page.tsx
│   ├── workspaces/new/page.tsx
│   ├── workspaces/[id]/page.tsx           → dashboard
│   ├── workspaces/[id]/audit/new/page.tsx
│   ├── workspaces/[id]/audit/[aid]/page.tsx
│   ├── workspaces/[id]/audit/[aid]/compare/page.tsx
│   ├── workspaces/[id]/whitelists/page.tsx
│   ├── workspaces/[id]/activity/page.tsx
│   ├── workspaces/[id]/settings/page.tsx
│   └── invite/[token]/page.tsx
├── components/
│   ├── auth/AuthGuard.tsx
│   ├── auth/LoginForm.tsx
│   ├── workspace/WorkspaceSwitcher.tsx
│   ├── workspace/WorkspaceCard.tsx
│   ├── workspace/OnboardingWizard.tsx
│   ├── workspace/MemberList.tsx
│   ├── workspace/InviteForm.tsx
│   ├── dashboard/SparklineKpi.tsx
│   ├── dashboard/AuditDiffTable.tsx
│   ├── audit/WhitelistSelector.tsx
│   └── activity/ActivityTimeline.tsx
├── hooks/
│   └── useAuth.ts
└── lib/
    ├── api.ts           → modifié (fetchWithAuth, nouvelles fonctions)
    └── types.ts         → modifié (User, Workspace, Member, etc.)
```

---

## 10. Hors scope (proto)

- Email d'invitation (lien copié manuellement)
- Inscription publique (users seedés uniquement)
- 2FA / OAuth
- Rate limiting
- Chiffrement de la DB
- Audit scheduling (cron)
- Notifications push / websocket
- Multi-tenant infrastructure (tout est dans une seule DB)

Ces éléments seront adressés lors de la migration Supabase.
