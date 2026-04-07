# MLI — Admin Panel (Domain Database) — Design Spec

**Date** : 2026-04-07
**Status** : Approved
**Depends on** : Phase 1-3 (auth, workspaces, frontend)

---

## 1. Objectif

Ajouter un panneau d'administration avec une base de domaines unique et dédupliquée. L'admin peut voir tous les sites scannés dans tous les workspaces, les catégoriser via Mistral à la demande, gérer leur statut éditorial et leur brand safety.

---

## 2. Schéma de données

### Table `domains`

| Colonne              | Type       | Contraintes                          |
|----------------------|------------|--------------------------------------|
| `id`                 | TEXT (UUID)| PRIMARY KEY                          |
| `domain`             | TEXT       | UNIQUE NOT NULL                      |
| `editorial_status`   | TEXT       | NOT NULL DEFAULT 'pending' — enum: pending, validated, blacklisted |
| `brand_safety`       | TEXT       | NULLABLE — enum: safe, moderate, unsafe |
| `brand_safety_source`| TEXT       | NULLABLE — enum: mistral, manual     |
| `category_iab`       | TEXT       | NULLABLE                             |
| `category_source`    | TEXT       | NULLABLE — enum: mistral, manual     |
| `notes`              | TEXT       | NULLABLE                             |
| `tags_json`          | TEXT (JSON)| DEFAULT '[]'                         |
| `last_score`         | REAL       | NULLABLE                             |
| `last_score_trend`   | TEXT       | NULLABLE — enum: up, down, stable    |
| `last_health`        | TEXT       | NULLABLE — enum: ok, dead            |
| `last_ads_txt`       | INTEGER    | NULLABLE — 0 or 1                    |
| `last_ad_count`      | INTEGER    | NULLABLE                             |
| `last_load_time_ms`  | INTEGER    | NULLABLE                             |
| `last_trackers`      | INTEGER    | NULLABLE                             |
| `last_adtech_json`   | TEXT (JSON)| NULLABLE — {gpt: true, prebid: false, ...} |
| `last_country`       | TEXT       | NULLABLE                             |
| `last_lang`          | TEXT       | NULLABLE                             |
| `last_tld`           | TEXT       | NULLABLE                             |
| `last_audit_id`      | TEXT       | FK → audits.id NULLABLE              |
| `last_audit_date`    | TEXT       | NULLABLE                             |
| `audit_count`        | INTEGER    | NOT NULL DEFAULT 0                   |
| `created_at`         | TEXT (ISO) | NOT NULL                             |
| `updated_at`         | TEXT (ISO) | NOT NULL                             |

### Population automatique

Après chaque audit terminé, un upsert sur `domains` :
- Si le domaine existe → met à jour les champs `last_*`, incrémente `audit_count`, calcule `last_score_trend` (compare avec le score précédent)
- Si le domaine n'existe pas → INSERT avec `editorial_status = 'pending'`

Le trend est calculé :
- `last_score` précédent > nouveau score → `down`
- `last_score` précédent < nouveau score → `up`
- Égal ou premier audit → `stable`

---

## 3. API Routes

Toutes les routes `/api/admin/*` nécessitent `role = admin`.

### Liste paginée

```
GET /api/admin/domains?page=1&per_page=50&sort=domain&order=asc&search=&status=&brand_safety=&health=&category=
```

Réponse :
```json
{
  "domains": [...],
  "total": 1234,
  "page": 1,
  "per_page": 50,
  "pages": 25
}
```

### Update individuel

```
PATCH /api/admin/domains/:id
Body: { editorial_status?, brand_safety?, brand_safety_source?, category_iab?, category_source?, notes?, tags_json? }
```

### Suppression

```
DELETE /api/admin/domains/:id
```

### Catégorisation Mistral (batch)

```
POST /api/admin/domains/categorize
Body: { domain_ids: string[] }
```

Appelle Mistral pour chaque domaine. Met à jour `category_iab`, `category_source = 'mistral'`, `brand_safety`, `brand_safety_source = 'mistral'` en DB.

Réponse streamed (SSE) ou synchrone selon le nombre :
- ≤ 5 domaines : synchrone, réponse directe
- \> 5 domaines : retourne immédiatement `{ job_id }`, l'admin poll le status

Pour le proto : toujours synchrone (pas de job queue). Le frontend affiche un spinner.

```json
{
  "results": [
    { "domain_id": "...", "domain": "lemonde.fr", "category_iab": "News", "brand_safety": "safe", "confidence": 0.95 },
    ...
  ],
  "processed": 10,
  "errors": 0
}
```

### Actions de masse

```
POST /api/admin/domains/bulk
Body: { domain_ids: string[], action: "set_status" | "add_tag" | "delete", value?: string }
```

- `set_status` + `value = "validated"` → met à jour `editorial_status`
- `add_tag` + `value = "premium"` → ajoute au `tags_json`
- `delete` → supprime les domaines

---

## 4. Frontend

### Route

`/admin/domains` — accessible uniquement si `user.role === 'admin'`.

### Sidebar

Ajouter un séparateur + lien "Admin" dans la sidebar, visible uniquement pour les admins :
```
──────────────
◉ Dashboard
◉ Nouvel Audit
◉ Whitelists
◉ Activite
◉ Parametres
──────────────
★ Admin         ← nouveau, visible si admin
──────────────
```

### Layout de la page

```
┌──────────────────────────────────────────────────────┐
│ ADMIN · DOMAIN DATABASE                    [Colonnes]│
├──────────────────────────────────────────────────────┤
│ [🔍 Rechercher...]                                   │
│ Filtres: [Statut ▾] [Brand Safety ▾] [Health ▾]     │
│ Sélection: □ Tout  │ 3 sélectionnés: [Catégoriser] [Statut ▾] [Supprimer] │
├──────────────────────────────────────────────────────┤
│ □ │ Domaine      │ Brand Safety │ Statut   │ Cat.   │ Score │ ... │
│───┼──────────────┼──────────────┼──────────┼────────┼───────┼─────│
│ □ │ lemonde.fr   │ 🟢 SAFE     │ VALIDÉ   │ News   │ 8.2 ▲│ ... │
│ □ │ spam-mfa.com │ 🔴 UNSAFE   │ BLACKL.  │ MFA    │ 1.3 ▼│ ... │
│ □ │ lequipe.fr   │ 🟡 MODERATE │ EN ATT.  │ Sport  │ 6.1 ─│ ... │
├──────────────────────────────────────────────────────┤
│ Page 1/25  │ ◄ ► │  1234 domaines                   │
└──────────────────────────────────────────────────────┘
```

### Colonnes

**Par défaut (visibles)** :
1. Checkbox (sélection)
2. Domaine (lien, ouvre le modal détail)
3. Brand Safety — badge coloré proéminent :
   - `safe` : texte vert `#00fc40`, bordure gauche verte
   - `moderate` : texte warning `#F59E0B`, bordure gauche orange
   - `unsafe` : texte danger `#ff716c`, bordure gauche rouge, fond rouge subtil `rgba(255,113,108,0.05)`
4. Statut éditorial — badge :
   - `pending` : texte gris "EN ATTENTE"
   - `validated` : texte vert "VALIDÉ"
   - `blacklisted` : texte rouge "BLACKLISTÉ"
5. Catégorie IAB
6. Score d'attention + tendance (▲ vert / ▼ rouge / ─ gris)
7. Health (OK vert / DEAD rouge)
8. Pays + Langue
9. Dernier audit (date relative : "il y a 2j")

**Masquées (menu "Colonnes")** :
10. Nb pubs
11. ads.txt (oui/non)
12. Ad-tech stack (badges GPT, Prebid, etc.)
13. Trackers (nombre)
14. Temps chargement (ms)
15. TLD
16. Nb audits
17. Notes
18. Tags
19. Source catégorisation (mistral/manual)

### Menu contextuel par ligne

Clic sur `···` ou clic droit :
- Catégoriser (Mistral) → spinner inline, résultat direct
- Modifier catégorie → dropdown inline
- Modifier brand safety → dropdown inline
- Changer statut → dropdown inline
- Ajouter note → input inline
- Ajouter tag → input inline
- Voir détail → modal (screenshot + historique scores + infos complètes)
- Supprimer → confirmation

### Barre d'actions de masse

Apparaît quand ≥ 1 site est sélectionné :
```
3 sélectionnés: [🤖 Catégoriser] [📋 Statut ▾] [🏷 Tag] [🗑 Supprimer]
```

- "Catégoriser" : appelle `/api/admin/domains/categorize`, progress counter "3/10 traités...", résultats mis à jour en temps réel dans la table
- "Statut" : dropdown (pending/validated/blacklisted), appliqué en masse
- "Tag" : input pour ajouter un tag à tous les sélectionnés
- "Supprimer" : confirmation "Supprimer 3 domaines ?"

### Modal détail

Quand on clique sur un domaine :
- **En-tête** : domaine + gros badge Brand Safety
- **Métriques** : score, pubs, health, chargement, trackers
- **Catégorie** : IAB + source (mistral/manual) + confiance
- **Ad-tech** : badges des technologies détectées
- **Geo** : pays, ville, langue, TLD
- **Historique** : mini tableau des 5 derniers audits avec score + date
- **Screenshot** : viewport (si disponible)
- **Notes** : champ éditable
- **Tags** : éditable

---

## 5. Catégorisation Mistral

### Prompt enrichi

Le prompt Mistral pour la catégorisation admin est enrichi par rapport au scan :
```
Analyse le site web {domain} et retourne :
1. La catégorie IAB la plus pertinente
2. Le niveau de brand safety : safe, moderate, unsafe
3. Une explication courte du brand safety

Retourne en JSON : { "category": "...", "brand_safety": "safe|moderate|unsafe", "brand_safety_reason": "...", "confidence": 0.0-1.0 }
```

Le `brand_safety_reason` est stocké dans `notes` (concaténé) pour que l'admin puisse comprendre le raisonnement.

### Pas pendant le scan

La catégorisation n'est plus lancée automatiquement pendant l'audit (module `categorization` désactivé par défaut). L'admin la lance manuellement depuis le panel admin quand il veut, sur les sites qu'il veut.

---

## 6. Fichiers à créer/modifier

### Backend

```
backend/
├── routers/admin.py          → CRUD domaines + catégorisation batch
├── db.py                     → ajouter table domains + upsert_domain()
└── routers/audit.py          → appeler upsert_domain() après chaque audit
```

### Frontend

```
frontend/
├── app/admin/domains/page.tsx       → page principale
├── components/admin/DomainTable.tsx  → table avec tri/filtres/pagination
├── components/admin/DomainRow.tsx    → ligne avec menu contextuel
├── components/admin/DomainModal.tsx  → modal détail
├── components/admin/BulkActions.tsx  → barre d'actions de masse
├── components/admin/ColumnPicker.tsx → sélecteur de colonnes
└── components/layout/Sidebar.tsx    → ajouter lien Admin
```

---

## 7. Hors scope

- Job queue pour catégorisation async (proto = synchrone)
- Export des domaines en CSV (peut être ajouté facilement plus tard)
- Historique des modifications d'un domaine (audit trail)
- Auto-catégorisation au scan (désactivée, manuelle uniquement)
