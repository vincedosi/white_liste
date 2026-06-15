# Liste des sites — refonte UX V1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre la liste des sites en « rolodex » centré sur le % d'aire pub réel, en décomposant `page.tsx` (742 lignes) en composants < 150 lignes, sans table d'historique (V1).

**Architecture:** Backend — une colonne additive `last_ad_surface_pct` sur `domains`, alimentée à chaque scan depuis `page_profile.total_ad_surface_pct` (propagée via `attention.details`), + backfill best-effort + 3 params `getSites` + 3 agrégats `/stats`. Frontend — atomes (`Pill`, `TrendArrow`, `FilterChip`), composants `components/sites/*`, hook `useSitesList`, et un `page.tsx` orchestrateur fin. La vue détail (`SiteDetailModal`) est extraite verbatim, non modifiée.

**Tech Stack:** Python 3.13 / FastAPI / aiosqlite (backend) · Next.js 14 / React 18 / TypeScript / Tailwind (frontend). Backend testé en pytest + scripts asyncio (pattern existant). Frontend vérifié par `npx tsc --noEmit` + `npm run build` (pas de test-runner JS dans ce repo).

**Spec:** `docs/superpowers/specs/2026-06-15-sites-list-ux-v1-design.md`

---

## File Structure

**Backend (modifié) :**
- `backend/config.py` — ajoute `STALE_DAYS`.
- `backend/db.py` — `_ensure_domain_columns()` (migration additive), écriture de `last_ad_surface_pct` dans `upsert_domain`, nouvelle `backfill_ad_surface_pct()`.
- `backend/services/pw_bridge.py` — injecte `ad_surface_pct` dans `attention.details`.
- `backend/routers/audit.py` — propage `ad_surface_pct` à `upsert_domain`.
- `backend/routers/sites.py` — params `ad_pct_min/max`, `stale_days`, tri autorisé, 3 agrégats stats, `ad_surface_pct` dans rescan.
- `backend/main.py` — appelle `backfill_ad_surface_pct()` au démarrage (à côté des migrations existantes).
- `backend/test_sites_v1.py` — **créé** : tests DB (script asyncio).

**Frontend (créé sauf mention) :**
- `frontend/lib/types.ts` — *modifié* : `SiteEntry.last_ad_surface_pct`, champs `SiteStats`.
- `frontend/lib/api.ts` — *modifié* : params `getSites`.
- `frontend/components/ui/Pill.tsx`
- `frontend/components/ui/TrendArrow.tsx`
- `frontend/components/ui/FilterChip.tsx`
- `frontend/components/sites/SiteDetailModal.tsx` — *extrait verbatim* de `page.tsx`.
- `frontend/components/sites/CategorizeModal.tsx` — *extrait verbatim* de `page.tsx`.
- `frontend/components/sites/AdAreaBar.tsx`
- `frontend/components/sites/SiteKebabMenu.tsx`
- `frontend/components/sites/SitesKpis.tsx`
- `frontend/components/sites/SiteFilters.tsx`
- `frontend/components/sites/SiteRow.tsx`
- `frontend/components/sites/SitesTable.tsx`
- `frontend/components/sites/BulkActionsBar.tsx`
- `frontend/hooks/useSitesList.ts`
- `frontend/app/sites/page.tsx` — *réécrit* (orchestrateur fin).

---

## Locked interfaces (à respecter dans toutes les tâches)

```typescript
// types.ts additions
interface SiteEntry { /* … */ last_ad_surface_pct: number | null; }
interface SiteStats { /* … */ avg_ad_surface_pct: number | null; problematic: number; stale: number; }

// atoms
Pill({ variant: 'calme' | 'vigilance' | 'tension', children })
TrendArrow({ trend: 'up' | 'down' | 'stable' | null })   // remplace le "Delta" de la spec en V1 (delta numérique → V2)
FilterChip({ active: boolean, count?: number, onClick: () => void, children })

// sites components
AdAreaBar({ pct: number | null, trend: 'up'|'down'|'stable'|null })
SiteKebabMenu({ onRescan, onValidate, onOpenSite, onOpenDetail, onRemove })
SitesKpis({ stats: SiteStats | null })
SiteFilters({ filter: FilterKey, onFilter, search: string, onSearch, counts })   // FilterKey = 'all'|'problematic'|'stale'
SiteRow({ site, selected, onToggle, onOpen, onRescan, onValidate, onRemove })
SitesTable({ sites, loading, sortCol, sortOrder, onSort, selectedIds, onToggle, onToggleAll, onOpen, rowAction })
BulkActionsBar({ count, onRescan, onCategorize, onRemove, onClear })
useSitesList({ page, sortCol, sortOrder, filter, search }) => { sites, total, pages, loading, reload }
```

---

# PHASE A — Backend : donnée % aire pub + API

### Task A1 : `STALE_DAYS` config + migration additive de colonne

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/db.py` (dans `init_db`, juste après le `CREATE TABLE ... _migrations` + `await db.commit()` ligne ~152)
- Test: `backend/test_sites_v1.py` (create)

- [ ] **Step 1 : Écrire le test (script asyncio, DB temporaire)**

Create `backend/test_sites_v1.py`:

```python
import asyncio, sys
sys.path.insert(0, '.')
import db as db_mod
from pathlib import Path

db_mod.DB_PATH = Path('data/test_sites_v1.db')
db_mod._db = None

from db import init_db, get_db


async def test_column_added():
    # repart d'une base vierge
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    dbc = await get_db()
    cur = await dbc.execute("PRAGMA table_info(domains)")
    cols = [r[1] for r in await cur.fetchall()]
    assert "last_ad_surface_pct" in cols, cols
    print("OK test_column_added")


if __name__ == "__main__":
    asyncio.run(test_column_added())
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `cd backend && python test_sites_v1.py`
Expected: `AssertionError` (colonne absente).

- [ ] **Step 3 : Ajouter `STALE_DAYS` à `config.py`**

Add to `backend/config.py` (près des autres seuils) :

```python
# Âge (jours) au-delà duquel un site est "à ré-analyser"
STALE_DAYS = 14
```

- [ ] **Step 4 : Ajouter la migration additive dans `db.py`**

Dans `backend/db.py`, ajouter cette fonction au-dessus de `close_db` :

```python
async def _ensure_domain_columns() -> None:
    """Additive, idempotent column migrations for the domains table."""
    db = await get_db()
    cur = await db.execute("PRAGMA table_info(domains)")
    existing = {r[1] for r in await cur.fetchall()}
    additions = {
        "last_ad_surface_pct": "REAL",
    }
    for col, decl in additions.items():
        if col not in existing:
            await db.execute(f"ALTER TABLE domains ADD COLUMN {col} {decl}")
    await db.commit()
```

Puis, dans `init_db()`, juste après `await db.commit()` (ligne ~152, fin du bloc `executescript`), appeler :

```python
    await _ensure_domain_columns()
```

- [ ] **Step 5 : Lancer le test, vérifier qu'il passe**

Run: `cd backend && python test_sites_v1.py`
Expected: `OK test_column_added`

- [ ] **Step 6 : Commit**

```bash
git add backend/config.py backend/db.py backend/test_sites_v1.py
git commit -m "feat(sites): colonne additive last_ad_surface_pct + STALE_DAYS"
```

---

### Task A2 : Propager `ad_surface_pct` du crawler jusqu'à `upsert_domain`

**Files:**
- Modify: `backend/services/pw_bridge.py:180` (et l'autre construction d'`AttentionResult` ~141)
- Modify: `backend/routers/audit.py:603` (dict passé à `upsert_domain`)
- Modify: `backend/db.py` `upsert_domain` (UPDATE ~318 et INSERT ~339)
- Modify: `backend/routers/sites.py` `rescan_site` (UPDATE ~287)
- Test: `backend/test_sites_v1.py`

- [ ] **Step 1 : Ajouter un test d'écriture sur upsert**

Append to `backend/test_sites_v1.py` (et appeler dans `__main__`) :

```python
async def test_upsert_writes_ad_surface_pct():
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, fetch_one
    await upsert_domain("exemple.fr", {
        "score": 5.0, "ad_count": 3, "ad_surface_pct": 62.5,
        "health": "ok", "ads_txt": 1, "audit_id": "a1",
    })
    row = await fetch_one("SELECT last_ad_surface_pct FROM domains WHERE domain = ?", ("exemple.fr",))
    assert row["last_ad_surface_pct"] == 62.5, row
    print("OK test_upsert_writes_ad_surface_pct")
```

Ajouter dans `__main__` : `asyncio.run(test_upsert_writes_ad_surface_pct())`.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd backend && python test_sites_v1.py`
Expected: échec (`KeyError`/`sqlite OperationalError` sur la colonne non écrite, ou `None != 62.5`).

- [ ] **Step 3 : `pw_bridge.py` — injecter `ad_surface_pct` dans `details`**

Dans `backend/services/pw_bridge.py`, aux **deux** constructions d'`AttentionResult` (lignes ~141 et ~180), remplacer `details=data.get("details", {})` par :

```python
            details={
                **(data.get("details") or {}),
                "ad_surface_pct": (data.get("page_profile") or {}).get("total_ad_surface_pct"),
            },
```

- [ ] **Step 4 : `audit.py` — passer la valeur à `upsert_domain`**

Dans `backend/routers/audit.py`, dans le dict de l'appel `_upsert_domain` (~603), ajouter une clé après `"suspect_blocked": …` :

```python
                    "ad_surface_pct": (_attention.get("details") or {}).get("ad_surface_pct"),
```

- [ ] **Step 5 : `db.py` `upsert_domain` — écrire la colonne**

Dans l'UPDATE (~319) ajouter `last_ad_surface_pct = ?` dans le SET (par ex. après `last_score = ?, last_score_trend = ?,`) et la valeur correspondante `audit_data.get("ad_surface_pct")` dans le tuple (même position).

UPDATE — SET head devient :
```python
            """UPDATE domains SET
                last_score = ?, last_score_trend = ?, last_ad_surface_pct = ?, last_health = ?,
```
et le tuple commence par :
```python
                new_score, trend, audit_data.get("ad_surface_pct"), audit_data.get("health"),
```

INSERT (~340) — ajouter la colonne et un placeholder :
```python
            """INSERT INTO domains
            (id, domain, editorial_status, last_score, last_score_trend, last_ad_surface_pct, last_health,
             last_ads_txt, last_ad_count, last_load_time_ms, last_trackers, last_adtech_json,
             last_country, last_lang, last_tld, last_audit_id, last_audit_date,
             audit_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'stable', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
```
et insérer `audit_data.get("ad_surface_pct")` dans le tuple juste après `new_score,` :
```python
                _uuid(), domain_name, editorial_status, new_score, audit_data.get("ad_surface_pct"),
                audit_data.get("health"),
```

- [ ] **Step 6 : `sites.py` `rescan_site` — écrire la colonne**

Dans `backend/routers/sites.py`, dans `rescan_site`, après `ad_count = ar.ad_count if ar else None`, ajouter :
```python
    ad_surface_pct = (ar.details or {}).get("ad_surface_pct") if ar else None
```
puis dans l'UPDATE, ajouter `last_ad_surface_pct = ?` au SET (après `last_score = ?,`) et `ad_surface_pct` dans le tuple (après `score,`).

- [ ] **Step 7 : Lancer, vérifier que ça passe**

Run: `cd backend && python test_sites_v1.py`
Expected: `OK test_upsert_writes_ad_surface_pct` (et les tests précédents OK).

- [ ] **Step 8 : Commit**

```bash
git add backend/services/pw_bridge.py backend/routers/audit.py backend/routers/sites.py backend/db.py backend/test_sites_v1.py
git commit -m "feat(sites): persiste ad_surface_pct (scan + rescan)"
```

---

### Task A3 : Backfill best-effort `last_ad_surface_pct` depuis les audits

**Files:**
- Modify: `backend/db.py` (nouvelle `backfill_ad_surface_pct`)
- Modify: `backend/main.py` (appel au démarrage)
- Test: `backend/test_sites_v1.py`

- [ ] **Step 1 : Test du backfill**

Append to `backend/test_sites_v1.py` :

```python
async def test_backfill_sets_pct_when_present():
    import json
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, fetch_one, get_db, backfill_ad_surface_pct
    # domaine sans pct (simule une donnée ancienne)
    await upsert_domain("ancien.fr", {"score": 4.0, "audit_id": "old1"})
    dbc = await get_db()
    # audit contenant le pct pour ce domaine
    results = json.dumps([{"domain": "ancien.fr",
                           "attention": {"details": {"ad_surface_pct": 41.0}}}])
    await dbc.execute(
        "INSERT INTO audits (id, workspace_id, status, results_json, created_at) "
        "VALUES ('au1', 'w1', 'completed', ?, '2026-01-01T00:00:00')", (results,))
    await dbc.commit()
    await backfill_ad_surface_pct()
    row = await fetch_one("SELECT last_ad_surface_pct FROM domains WHERE domain = ?", ("ancien.fr",))
    assert row["last_ad_surface_pct"] == 41.0, row
    print("OK test_backfill_sets_pct_when_present")
```

Ajouter `asyncio.run(test_backfill_sets_pct_when_present())` dans `__main__`.

> Note: la table `audits` peut avoir des colonnes NOT NULL supplémentaires. Si l'INSERT échoue, adapter les colonnes minimales à partir du schéma `audits` réel dans `db.py` (garder `id, results_json, created_at`).

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd backend && python test_sites_v1.py`
Expected: échec (`backfill_ad_surface_pct` n'existe pas → `ImportError`).

- [ ] **Step 3 : Implémenter `backfill_ad_surface_pct` dans `db.py`**

```python
async def backfill_ad_surface_pct() -> None:
    """One-time best-effort backfill of domains.last_ad_surface_pct from stored
    audit results_json. Reads the ad surface % from each site entry when present;
    later audits overwrite earlier ones, so the latest value wins. Domains whose
    audits never carried the value keep NULL (filled forward on next rescan)."""
    import json as json_mod
    db = await get_db()
    already = await fetch_one("SELECT key FROM _migrations WHERE key = ?", ("backfill_ad_pct_v1",))
    if already:
        return
    audits = await fetch_all(
        "SELECT results_json FROM audits WHERE results_json IS NOT NULL ORDER BY created_at ASC"
    )
    for audit_row in audits:
        try:
            results = json_mod.loads(audit_row["results_json"])
        except Exception:
            continue
        if not isinstance(results, list):
            continue
        for site in results:
            if not isinstance(site, dict):
                continue
            domain_name = site.get("domain", "")
            if not domain_name:
                continue
            att = site.get("attention") if isinstance(site.get("attention"), dict) else {}
            details = att.get("details") if isinstance(att.get("details"), dict) else {}
            profile = att.get("page_profile") if isinstance(att.get("page_profile"), dict) else {}
            pct = details.get("ad_surface_pct")
            if pct is None:
                pct = profile.get("total_ad_surface_pct")
            if pct is None:
                continue
            await db.execute(
                "UPDATE domains SET last_ad_surface_pct = ? WHERE domain = ? AND last_ad_surface_pct IS NULL",
                (pct, domain_name),
            )
    await db.execute(
        "INSERT INTO _migrations (key, done_at) VALUES (?, ?)", ("backfill_ad_pct_v1", _now())
    )
    await db.commit()
```

- [ ] **Step 4 : Appeler au démarrage dans `main.py`**

Dans `backend/main.py`, là où `migrate_json_audits()` / `backfill_domains_from_audits()` sont déjà appelés au startup, ajouter à la suite :

```python
    from db import backfill_ad_surface_pct
    await backfill_ad_surface_pct()
```

(Si l'appel se fait via un `@app.on_event("startup")` existant, l'ajouter dans ce handler, après les migrations existantes.)

- [ ] **Step 5 : Lancer, vérifier que ça passe**

Run: `cd backend && python test_sites_v1.py`
Expected: `OK test_backfill_sets_pct_when_present`

- [ ] **Step 6 : Commit**

```bash
git add backend/db.py backend/main.py backend/test_sites_v1.py
git commit -m "feat(sites): backfill best-effort de last_ad_surface_pct"
```

---

### Task A4 : `list_sites` — tri + filtres `ad_pct_min/max`, `stale_days`

**Files:**
- Modify: `backend/routers/sites.py` (`_ALLOWED_SORTS` ~23, signature `list_sites` ~57, conditions ~89)
- Test: `backend/test_sites_v1.py`

- [ ] **Step 1 : Test des filtres**

Append to `backend/test_sites_v1.py` :

```python
async def test_list_filters_pct_and_stale():
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, get_db
    from routers.sites import list_sites
    await upsert_domain("calme.fr", {"score": 9.0, "ad_surface_pct": 10.0, "audit_id": "x"})
    await upsert_domain("probleme.fr", {"score": 2.0, "ad_surface_pct": 70.0, "audit_id": "x"})
    # rendre "calme.fr" périmé
    dbc = await get_db()
    await dbc.execute("UPDATE domains SET last_audit_date = '2000-01-01T00:00:00' WHERE domain='calme.fr'")
    await dbc.commit()

    res = await list_sites(ad_pct_min=50.0, user={"id": "u"})
    names = {s["domain"] for s in res["sites"]}
    assert names == {"probleme.fr"}, names

    res2 = await list_sites(stale_days=14, user={"id": "u"})
    names2 = {s["domain"] for s in res2["sites"]}
    assert "calme.fr" in names2 and "probleme.fr" not in names2, names2
    print("OK test_list_filters_pct_and_stale")
```

Ajouter dans `__main__`.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd backend && python test_sites_v1.py`
Expected: `TypeError` (params inconnus de `list_sites`).

- [ ] **Step 3 : Étendre `_ALLOWED_SORTS`**

Dans `backend/routers/sites.py`, ajouter `"last_ad_surface_pct",` à l'ensemble `_ALLOWED_SORTS`.

- [ ] **Step 4 : Ajouter les params et les conditions**

Dans la signature de `list_sites`, ajouter avant `user: dict = Depends(...)` :

```python
    ad_pct_min: float | None = Query(None),
    ad_pct_max: float | None = Query(None),
    stale_days: int | None = Query(None),
```

Dans le bloc de conditions (après le `category` ~97), ajouter :

```python
    if ad_pct_min is not None:
        conditions.append("last_ad_surface_pct >= ?")
        params.append(ad_pct_min)
    if ad_pct_max is not None:
        conditions.append("last_ad_surface_pct <= ?")
        params.append(ad_pct_max)
    if stale_days is not None:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).isoformat()
        conditions.append("(last_audit_date IS NULL OR last_audit_date < ?)")
        params.append(cutoff)
```

- [ ] **Step 5 : Lancer, vérifier que ça passe**

Run: `cd backend && python test_sites_v1.py`
Expected: `OK test_list_filters_pct_and_stale`

- [ ] **Step 6 : Commit**

```bash
git add backend/routers/sites.py backend/test_sites_v1.py
git commit -m "feat(sites): filtres ad_pct_min/max + stale_days + tri ad_surface_pct"
```

---

### Task A5 : `/stats` — `avg_ad_surface_pct`, `problematic`, `stale`

**Files:**
- Modify: `backend/routers/sites.py` `sites_stats` (~126), dict de retour (~234)
- Test: `backend/test_sites_v1.py`

- [ ] **Step 1 : Test des agrégats**

Append to `backend/test_sites_v1.py` :

```python
async def test_stats_aggregates():
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, get_db
    from routers.sites import sites_stats
    await upsert_domain("a.fr", {"score": 9.0, "ad_surface_pct": 20.0, "audit_id": "x"})
    await upsert_domain("b.fr", {"score": 2.0, "ad_surface_pct": 60.0, "audit_id": "x"})
    dbc = await get_db()
    await dbc.execute("UPDATE domains SET last_audit_date='2000-01-01T00:00:00' WHERE domain='a.fr'")
    await dbc.commit()
    s = await sites_stats(user={"id": "u"})
    assert s["problematic"] == 1, s
    assert s["stale"] >= 1, s
    assert s["avg_ad_surface_pct"] is not None and 39.0 < s["avg_ad_surface_pct"] < 41.0, s
    print("OK test_stats_aggregates")
```

Ajouter dans `__main__`.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd backend && python test_sites_v1.py`
Expected: `KeyError: 'problematic'`.

- [ ] **Step 3 : Calculer les agrégats dans `sites_stats`**

Dans `backend/routers/sites.py` `sites_stats`, après le calcul de `avg_score` (~170), ajouter :

```python
    avg_pct_row = await fetch_one(
        "SELECT AVG(last_ad_surface_pct) as v FROM domains WHERE last_ad_surface_pct IS NOT NULL", ()
    )
    avg_ad_surface_pct = avg_pct_row["v"] if avg_pct_row else None

    problematic_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_ad_surface_pct >= 50.0", ()
    )
    problematic = problematic_row["n"] if problematic_row else 0

    from datetime import datetime, timedelta, timezone
    from config import STALE_DAYS
    cutoff = (datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)).isoformat()
    stale_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_audit_date IS NULL OR last_audit_date < ?",
        (cutoff,),
    )
    stale = stale_row["n"] if stale_row else 0
```

- [ ] **Step 4 : Ajouter au dict de retour**

Dans le `return { … }` (~234), ajouter :

```python
        "avg_ad_surface_pct": round(avg_ad_surface_pct, 2) if avg_ad_surface_pct is not None else None,
        "problematic": problematic,
        "stale": stale,
```

- [ ] **Step 5 : Lancer, vérifier que ça passe**

Run: `cd backend && python test_sites_v1.py`
Expected: `OK test_stats_aggregates`

- [ ] **Step 6 : Commit**

```bash
git add backend/routers/sites.py backend/test_sites_v1.py
git commit -m "feat(sites): stats avg_ad_surface_pct + problematic + stale"
```

---

### Task A6 : Types + client API frontend

**Files:**
- Modify: `frontend/lib/types.ts` (`SiteEntry` ~306, `SiteStats`)
- Modify: `frontend/lib/api.ts` (`getSites` ~290)

- [ ] **Step 1 : Ajouter les champs aux types**

Dans `frontend/lib/types.ts`, dans `interface SiteEntry`, ajouter après `last_score`/`last_score_trend` :
```typescript
  last_ad_surface_pct: number | null;
```
Dans `interface SiteStats` (repérer via `avg_score`), ajouter :
```typescript
  avg_ad_surface_pct: number | null;
  problematic: number;
  stale: number;
```

- [ ] **Step 2 : Étendre les params `getSites`**

Dans `frontend/lib/api.ts`, dans la signature `getSites(params: { … })`, ajouter :
```typescript
  ad_pct_min?: number;
  ad_pct_max?: number;
  stale_days?: number;
```
Vérifier que la construction de la query string sérialise bien tout `params` (boucle `Object.entries`). Si les params sont listés manuellement, ajouter ces trois clés au `URLSearchParams`.

- [ ] **Step 3 : Vérifier le typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4 : Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat(sites): types + params API (ad_surface_pct, filtres)"
```

---

# PHASE B — Frontend : atomes UI

### Task B1 : `Pill`

**Files:** Create `frontend/components/ui/Pill.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
const STYLES: Record<'calme' | 'vigilance' | 'tension', string> = {
  calme: 'bg-[#5C8B70]/15 text-[#5C8B70]',
  vigilance: 'bg-[#C28230]/15 text-[#C28230]',
  tension: 'bg-[#B44848]/15 text-[#B44848]',
};

export function Pill({
  variant,
  children,
}: {
  variant: 'calme' | 'vigilance' | 'tension';
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-[10px] font-medium ${STYLES[variant]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/ui/Pill.tsx
git commit -m "feat(ui): composant Pill (statut)"
```

---

### Task B2 : `TrendArrow`

**Files:** Create `frontend/components/ui/TrendArrow.tsx`

- [ ] **Step 1 : Implémenter** (remplace le `Delta` de la spec en V1 ; tendance catégorielle, pas de valeur numérique)

```tsx
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export function TrendArrow({ trend }: { trend: 'up' | 'down' | 'stable' | null }) {
  if (!trend || trend === 'stable') {
    return <Minus className="w-3 h-3 text-on-surface-variant/40" aria-label="stable" />;
  }
  // score "up" = plus propre (mieux) → vert ; "down" = plus de pub → rouge
  if (trend === 'up') {
    return <ArrowUp className="w-3 h-3 text-success" aria-label="en amélioration" />;
  }
  return <ArrowDown className="w-3 h-3 text-danger" aria-label="en dégradation" />;
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/ui/TrendArrow.tsx
git commit -m "feat(ui): composant TrendArrow"
```

---

### Task B3 : `FilterChip`

**Files:** Create `frontend/components/ui/FilterChip.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
export function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-label text-[11px] transition-colors border ${
        active
          ? 'bg-accent/10 border-accent/40 text-accent'
          : 'border-outline/30 text-on-surface-variant hover:text-on-surface hover:border-outline/60'
      }`}
    >
      {children}
      {count != null && <span className="num opacity-60">({count.toLocaleString('fr-FR')})</span>}
    </button>
  );
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/ui/FilterChip.tsx
git commit -m "feat(ui): composant FilterChip"
```

---

# PHASE C — Frontend : composants liste + orchestrateur

### Task C1 : Extraire `SiteDetailModal` et `CategorizeModal` (verbatim)

**Files:**
- Create: `frontend/components/sites/SiteDetailModal.tsx`
- Create: `frontend/components/sites/CategorizeModal.tsx`
- Modify: `frontend/app/sites/page.tsx` (imports)

> But : sortir la vue détail (modale screenshots) et la modale de catégorisation de `page.tsx` **sans changer leur comportement**. Cela réduit `page.tsx` et isole le code « ne pas toucher ».

- [ ] **Step 1 : Déplacer `SiteDetailModal`**

Dans `frontend/app/sites/page.tsx`, repérer la fonction `function SiteDetailModal({ … }) { … }` et la helper `domainToScreenshotFile`. Couper l'ensemble (fonction + helper) et les coller dans `frontend/components/sites/SiteDetailModal.tsx`. En tête du nouveau fichier :

```tsx
'use client';
import { useState, useMemo } from 'react';
import type { SiteEntry } from '@/lib/types';
// + tout import lucide / UI utilisé par la modale (Badge, etc.) — repris de page.tsx
```

Exporter : `export function SiteDetailModal(...)`. Ne modifier aucune ligne de logique.

- [ ] **Step 2 : Déplacer `CategorizeModal`**

Le JSX de la modale de catégorisation est aujourd'hui inline dans `page.tsx` (bloc `{showCatModal && ( … )}`). L'extraire en composant `CategorizeModal` :

```tsx
'use client';
import { Brain, Loader2 } from 'lucide-react';

export function CategorizeModal({
  mistralKey, onKeyChange, loading, progress, done, onClose, onRun,
}: {
  mistralKey: string; onKeyChange: (v: string) => void;
  loading: boolean; progress: string; done: boolean;
  onClose: () => void; onRun: () => void;
}) {
  // coller ici le JSX existant du bloc {showCatModal && (...)} (le contenu de la <div fixed>),
  // en remplaçant les setState locaux par les props ci-dessus.
  return ( /* … JSX repris … */ );
}
```

La logique `handleCategorize` reste dans `page.tsx` (Task C8) et est passée via `onRun`.

- [ ] **Step 3 : Importer dans `page.tsx`**

```tsx
import { SiteDetailModal } from '@/components/sites/SiteDetailModal';
import { CategorizeModal } from '@/components/sites/CategorizeModal';
```

- [ ] **Step 4 : Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (il peut rester des erreurs dans `page.tsx` qui seront résolues en C8 ; si bloquant, committer après C8). Si `tsc` est propre, committer maintenant.

- [ ] **Step 5 : Commit**

```bash
git add frontend/components/sites/SiteDetailModal.tsx frontend/components/sites/CategorizeModal.tsx frontend/app/sites/page.tsx
git commit -m "refactor(sites): extrait SiteDetailModal + CategorizeModal (verbatim)"
```

---

### Task C2 : `AdAreaBar` (héros)

**Files:** Create `frontend/components/sites/AdAreaBar.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
import { TrendArrow } from '@/components/ui/TrendArrow';
import { Pill } from '@/components/ui/Pill';

function barColor(pct: number): string {
  if (pct < 30) return '#5C8B70'; // sauge
  if (pct < 50) return '#C28230'; // ambre
  return '#B44848'; // terracotta
}

function status(pct: number): { variant: 'calme' | 'vigilance' | 'tension'; label: string } {
  if (pct < 30) return { variant: 'calme', label: '✓ Acceptable' };
  if (pct < 50) return { variant: 'vigilance', label: '⚠ Élevé' };
  return { variant: 'tension', label: '🔴 Problématique' };
}

export function AdAreaBar({
  pct,
  trend,
}: {
  pct: number | null;
  trend: 'up' | 'down' | 'stable' | null;
}) {
  if (pct == null) {
    return <div className="font-label text-xs text-on-surface-variant/40">—</div>;
  }
  const s = status(pct);
  return (
    <div className="w-full">
      <div className="relative h-7 rounded-md overflow-hidden bg-surface-high">
        <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor(pct) }} />
        <div className="absolute inset-0 flex items-center justify-between px-2.5">
          <span className="num text-[13px] font-medium text-on-surface">{Math.round(pct)}%</span>
          <TrendArrow trend={trend} />
        </div>
      </div>
      <div className="mt-1">
        <Pill variant={s.variant}>{s.label}</Pill>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/sites/AdAreaBar.tsx
git commit -m "feat(sites): AdAreaBar (colonne héros % aire pub)"
```

---

### Task C3 : `SiteKebabMenu`

**Files:** Create `frontend/components/sites/SiteKebabMenu.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

export function SiteKebabMenu({
  onRescan, onValidate, onOpenSite, onOpenDetail, onRemove,
}: {
  onRescan: () => void; onValidate: () => void; onOpenSite: () => void;
  onOpenDetail: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const item = 'block w-full text-left px-3 py-2 text-[12px] hover:bg-surface-high transition-colors';
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="p-1 rounded hover:bg-surface-high text-on-surface-variant">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-outline/30 bg-surface shadow-lg py-1">
          <button className={item} onClick={run(onRescan)}>Ré-analyser maintenant</button>
          <button className={item} onClick={run(onValidate)}>Valider un score</button>
          <button className={item} onClick={run(onOpenSite)}>Ouvrir le site</button>
          <button className={item} onClick={run(onOpenDetail)}>Voir le détail</button>
          <div className="my-1 border-t border-outline/20" />
          <button className={`${item} text-danger`} onClick={run(onRemove)}>Retirer de la liste</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/sites/SiteKebabMenu.tsx
git commit -m "feat(sites): SiteKebabMenu (actions par ligne)"
```

---

### Task C4 : `useSitesList` (hook de données)

**Files:** Create `frontend/hooks/useSitesList.ts`

- [ ] **Step 1 : Implémenter**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { getSites } from '@/lib/api';
import type { SiteEntry } from '@/lib/types';

export type FilterKey = 'all' | 'problematic' | 'stale';

const PER_PAGE = 100;

export function useSitesList({
  page, sortCol, sortOrder, filter, search,
}: {
  page: number; sortCol: string; sortOrder: 'asc' | 'desc';
  filter: FilterKey; search: string;
}) {
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setLoading(true);
    getSites({
      page,
      per_page: PER_PAGE,
      sort: sortCol,
      order: sortOrder,
      search: search || undefined,
      ad_pct_min: filter === 'problematic' ? 50 : undefined,
      stale_days: filter === 'stale' ? 14 : undefined,
    })
      .then((res) => {
        setSites(res.sites);
        setTotal(res.total);
        setPages(res.pages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, sortCol, sortOrder, filter, search, tick]);

  return { sites, total, pages, loading, reload };
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/hooks/useSitesList.ts
git commit -m "feat(sites): hook useSitesList"
```

---

### Task C5 : `SitesKpis`

**Files:** Create `frontend/components/sites/SitesKpis.tsx`

- [ ] **Step 1 : Implémenter** (réutilise le `KpiCard` existant — vérifier ses props : `label`, `value`, `color?`, `variant?`)

```tsx
import { KpiCard } from '@/components/dashboard/KpiCard';
import type { SiteStats } from '@/lib/types';

export function SitesKpis({ stats }: { stats: SiteStats | null }) {
  const pctMoyen =
    stats?.avg_ad_surface_pct != null ? `${Math.round(stats.avg_ad_surface_pct)}%` : '—';
  const adsTxtPct =
    stats && stats.total > 0 ? `${Math.round((stats.ads_txt_ok / stats.total) * 100)}%` : '—';
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard label="Sites suivis" value={stats?.total ?? '—'} />
      <KpiCard label="% pub moyen" value={pctMoyen} />
      <KpiCard label="Problématiques" value={stats?.problematic ?? '—'} />
      <KpiCard label="ads.txt OK" value={adsTxtPct} />
    </div>
  );
}
```

> Si `KpiCard` n'accepte pas exactement ces props, adapter l'appel à sa signature réelle (cf. `frontend/components/dashboard/KpiCard.tsx`). Ne pas modifier `KpiCard`.

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/sites/SitesKpis.tsx
git commit -m "feat(sites): SitesKpis (header KPI)"
```

---

### Task C6 : `SiteFilters`

**Files:** Create `frontend/components/sites/SiteFilters.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
'use client';
import { Search } from 'lucide-react';
import { FilterChip } from '@/components/ui/FilterChip';
import type { SiteStats } from '@/lib/types';
import type { FilterKey } from '@/hooks/useSitesList';

export function SiteFilters({
  filter, onFilter, search, onSearch, stats,
}: {
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  search: string; onSearch: (v: string) => void;
  stats: SiteStats | null;
}) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <FilterChip active={filter === 'all'} count={stats?.total} onClick={() => onFilter('all')}>
        Tous
      </FilterChip>
      <FilterChip active={filter === 'problematic'} count={stats?.problematic} onClick={() => onFilter('problematic')}>
        🔴 Problématiques
      </FilterChip>
      <FilterChip active={filter === 'stale'} count={stats?.stale} onClick={() => onFilter('stale')}>
        À ré-analyser
      </FilterChip>
      <div className="w-px h-5 bg-outline/30 mx-1" />
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Rechercher un site ou une URL…"
          className="w-full pl-9 pr-3 py-2 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/sites/SiteFilters.tsx
git commit -m "feat(sites): SiteFilters (chips + recherche)"
```

---

### Task C7 : `SiteRow` + `SitesTable` + `BulkActionsBar`

**Files:**
- Create: `frontend/components/sites/SiteRow.tsx`
- Create: `frontend/components/sites/SitesTable.tsx`
- Create: `frontend/components/sites/BulkActionsBar.tsx`

- [ ] **Step 1 : `SiteRow`**

```tsx
'use client';
import { Globe } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { AdAreaBar } from './AdAreaBar';
import { SiteKebabMenu } from './SiteKebabMenu';
import type { SiteEntry } from '@/lib/types';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '—';
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'il y a 1 j';
  return `il y a ${days} j`;
}

function healthVariant(h: string | null): 'ok' | 'dead' | 'flag' | 'absent' {
  if (h === 'ok') return 'ok';
  if (h === 'dead') return 'dead';
  if (h === 'redirect' || h === 'timeout') return 'flag';
  return 'absent';
}

export function SiteRow({
  site, selected, onToggle, onOpen, onRescan, onValidate, onRemove,
}: {
  site: SiteEntry; selected: boolean;
  onToggle: () => void; onOpen: () => void;
  onRescan: () => void; onValidate: () => void; onRemove: () => void;
}) {
  return (
    <tr className="border-b border-outline/20 hover:bg-surface-high cursor-pointer transition-colors" onClick={onOpen}>
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-on-surface-variant/50 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-sm text-on-surface truncate">{site.domain}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 w-[280px]">
        <AdAreaBar pct={site.last_ad_surface_pct} trend={site.last_score_trend} />
      </td>
      <td className="px-3 py-3 num text-sm text-on-surface">{site.last_ad_count ?? '—'}</td>
      <td className="px-3 py-3"><Badge variant={healthVariant(site.last_health)}>{site.last_health ?? '—'}</Badge></td>
      <td className="px-3 py-3 text-xs text-on-surface-variant" title={site.last_audit_date ?? ''}>{timeAgo(site.last_audit_date)}</td>
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <SiteKebabMenu
          onRescan={onRescan} onValidate={onValidate}
          onOpenSite={() => window.open(`https://${site.domain}`, '_blank')}
          onOpenDetail={onOpen} onRemove={onRemove}
        />
      </td>
    </tr>
  );
}
```

- [ ] **Step 2 : `SitesTable`** (en-tête triable + états loading/empty)

```tsx
'use client';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { SiteRow } from './SiteRow';
import type { SiteEntry } from '@/lib/types';

const COLS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'domain', label: 'Site', sortable: true },
  { key: 'last_ad_surface_pct', label: '% Aire pub', sortable: true },
  { key: 'last_ad_count', label: 'Pubs', sortable: true },
  { key: 'last_health', label: 'Santé', sortable: true },
  { key: 'last_audit_date', label: 'MAJ', sortable: true },
];

export function SitesTable({
  sites, loading, sortCol, sortOrder, onSort,
  selectedIds, onToggle, onToggleAll, onOpen, rowAction,
}: {
  sites: SiteEntry[]; loading: boolean;
  sortCol: string; sortOrder: 'asc' | 'desc'; onSort: (c: string) => void;
  selectedIds: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void;
  onOpen: (s: SiteEntry) => void;
  rowAction: (action: 'rescan' | 'validate' | 'remove', s: SiteEntry) => void;
}) {
  const icon = (c: string) =>
    sortCol !== c ? <ArrowUpDown className="w-3 h-3 opacity-30" />
      : sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />;

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-background z-10">
        <tr className="border-b border-outline/30">
          <th className="px-3 py-3 w-10">
            <input type="checkbox" checked={sites.length > 0 && selectedIds.size === sites.length} onChange={onToggleAll} />
          </th>
          {COLS.map((c) => (
            <th key={c.key} onClick={() => c.sortable && onSort(c.key)}
              className="px-3 py-3 text-left font-label text-[9px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight cursor-pointer hover:text-on-surface select-none">
              <span className="flex items-center gap-1">{c.label}{c.sortable && icon(c.key)}</span>
            </th>
          ))}
          <th className="px-3 py-3 w-10" />
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-outline/20">
                <td colSpan={7} className="px-3 py-4"><div className="h-6 rounded bg-surface-high animate-pulse" /></td>
              </tr>
            ))
          : sites.length === 0
          ? <tr><td colSpan={7} className="px-3 py-12 text-center text-[13px] text-on-surface-variant">Aucun site ne correspond aux filtres actuels.</td></tr>
          : sites.map((s) => (
              <SiteRow
                key={s.id} site={s}
                selected={selectedIds.has(s.id)}
                onToggle={() => onToggle(s.id)}
                onOpen={() => onOpen(s)}
                onRescan={() => rowAction('rescan', s)}
                onValidate={() => rowAction('validate', s)}
                onRemove={() => rowAction('remove', s)}
              />
            ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3 : `BulkActionsBar`**

```tsx
'use client';
import { RefreshCw, Brain, Trash2, X } from 'lucide-react';

export function BulkActionsBar({
  count, onRescan, onCategorize, onRemove, onClear,
}: {
  count: number; onRescan: () => void; onCategorize: () => void;
  onRemove: () => void; onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-outline/30 rounded-lg shadow-lg px-5 py-3 flex items-center gap-4 z-50">
      <span className="text-[13px] text-on-surface">
        <span className="num font-medium">{count}</span> site{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </span>
      <div className="w-px h-5 bg-outline/30" />
      <button onClick={onRescan} className="flex items-center gap-1.5 text-[13px] text-on-surface-variant hover:text-on-surface"><RefreshCw className="w-3.5 h-3.5" /> Ré-analyser</button>
      <button onClick={onCategorize} className="flex items-center gap-1.5 text-[13px] text-on-surface-variant hover:text-on-surface"><Brain className="w-3.5 h-3.5" /> Catégoriser</button>
      <button onClick={onRemove} className="flex items-center gap-1.5 text-[13px] text-danger hover:opacity-80"><Trash2 className="w-3.5 h-3.5" /> Retirer</button>
      <button onClick={onClear} className="text-on-surface-variant/50 hover:text-on-surface ml-2"><X className="w-4 h-4" /></button>
    </div>
  );
}
```

- [ ] **Step 4 : Typecheck + commit**

```bash
cd frontend && npx tsc --noEmit
git add frontend/components/sites/SiteRow.tsx frontend/components/sites/SitesTable.tsx frontend/components/sites/BulkActionsBar.tsx
git commit -m "feat(sites): SiteRow + SitesTable + BulkActionsBar"
```

---

### Task C8 : Réécrire `page.tsx` (orchestrateur fin) + validation finale

**Files:** Modify (rewrite) `frontend/app/sites/page.tsx`

- [ ] **Step 1 : Réécrire `page.tsx`**

Remplacer tout le contenu restant du composant `SitesPage` par l'orchestrateur ci-dessous. Conserver les imports des deux modales (Task C1). `category`/`country` filters de l'ancienne UI sont remplacés par les chips ; si besoin de conserver le filtre pays, le garder dans `SiteFilters` (hors périmètre V1, ne pas bloquer).

```tsx
'use client';
import { useState, useEffect, useMemo } from 'react';
import { getSiteStats, categorizeDomains } from '@/lib/api';
import type { SiteEntry, SiteStats } from '@/lib/types';
import { useSitesList, type FilterKey } from '@/hooks/useSitesList';
import { SitesKpis } from '@/components/sites/SitesKpis';
import { SiteFilters } from '@/components/sites/SiteFilters';
import { SitesTable } from '@/components/sites/SitesTable';
import { BulkActionsBar } from '@/components/sites/BulkActionsBar';
import { SiteDetailModal } from '@/components/sites/SiteDetailModal';
import { CategorizeModal } from '@/components/sites/CategorizeModal';

export default function SitesPage() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('last_ad_surface_pct');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<SiteEntry | null>(null);

  const [showCat, setShowCat] = useState(false);
  const [mistralKey, setMistralKey] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catProgress, setCatProgress] = useState('');
  const [catDone, setCatDone] = useState(false);

  const { sites, total, pages, loading, reload } = useSitesList({ page, sortCol, sortOrder, filter, search });

  const loadStats = () => { getSiteStats().then(setStats).catch(console.error); };
  useEffect(loadStats, []);

  const onSort = (c: string) => {
    if (c === sortCol) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(c); setSortOrder('desc'); }
    setPage(1);
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => (s.size === sites.length ? new Set() : new Set(sites.map((x) => x.id))));
  const refreshAll = () => { reload(); loadStats(); };

  const rowAction = async (action: 'rescan' | 'validate' | 'remove', s: SiteEntry) => {
    if (action === 'rescan') {
      await fetch(`/api/sites/${encodeURIComponent(s.domain)}/rescan`, { method: 'POST' }).catch(() => {});
      refreshAll();
    } else if (action === 'remove') {
      if (!confirm(`Retirer ${s.domain} de la liste ?`)) return;
      await fetch(`/api/sites/${encodeURIComponent(s.domain)}`, { method: 'DELETE' }).catch(() => {});
      refreshAll();
    } else {
      setDetail(s); // la validation se fait dans la modale détail existante
    }
  };

  const bulkRescan = async () => {
    for (const s of sites.filter((x) => selected.has(x.id))) {
      await fetch(`/api/sites/${encodeURIComponent(s.domain)}/rescan`, { method: 'POST' }).catch(() => {});
    }
    setSelected(new Set());
    refreshAll();
  };

  const runCategorize = async () => {
    if (!mistralKey.trim()) return;
    setCatLoading(true); setCatProgress(''); setCatDone(false);
    try {
      const ids = sites.filter((x) => selected.has(x.id)).map((x) => x.id);
      const target = ids.length > 0 ? ids : sites.filter((x) => !x.category_iab).map((x) => x.id);
      const res = await categorizeDomains(target, mistralKey.trim());
      setCatProgress(`Terminé ! ${res.processed} catégorisés, ${res.errors} erreurs.`);
      setCatDone(true);
      refreshAll();
    } catch (e) {
      setCatProgress(`Erreur: ${e instanceof Error ? e.message : 'Inconnue'}`);
    } finally { setCatLoading(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Inventaire des sites</p>
            <h1 className="text-xl font-medium text-on-surface mt-1">Analyse de placement publicitaire</h1>
          </div>
        </div>
        <SitesKpis stats={stats} />
      </header>

      <SiteFilters filter={filter} onFilter={(f) => { setFilter(f); setPage(1); }} search={search} onSearch={(v) => { setSearch(v); setPage(1); }} stats={stats} />

      <div className="overflow-x-auto">
        <SitesTable
          sites={sites} loading={loading}
          sortCol={sortCol} sortOrder={sortOrder} onSort={onSort}
          selectedIds={selected} onToggle={toggle} onToggleAll={toggleAll}
          onOpen={setDetail} rowAction={rowAction}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="font-label text-sm text-on-surface-variant">{total.toLocaleString('fr-FR')} sites — page {page}/{pages}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest border border-outline/30 text-on-surface-variant hover:text-on-surface disabled:opacity-30">Précédent</button>
          <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest border border-outline/30 text-on-surface-variant hover:text-on-surface disabled:opacity-30">Suivant</button>
        </div>
      </div>

      <BulkActionsBar count={selected.size} onRescan={bulkRescan} onCategorize={() => setShowCat(true)} onRemove={() => {}} onClear={() => setSelected(new Set())} />

      {detail && <SiteDetailModal site={detail} onClose={() => { setDetail(null); refreshAll(); }} />}
      {showCat && (
        <CategorizeModal
          mistralKey={mistralKey} onKeyChange={setMistralKey}
          loading={catLoading} progress={catProgress} done={catDone}
          onClose={() => setShowCat(false)} onRun={runCategorize}
        />
      )}
    </div>
  );
}
```

> Si l'endpoint `DELETE /api/sites/{domain}` n'existe pas, désactiver l'action « Retirer » (ne pas inventer d'endpoint hors spec) et le noter. La validation de score se fait via la modale détail existante (`onValidate` ouvre le détail).

- [ ] **Step 2 : Vérifier les props réelles de `KpiCard` / `Badge` / `SiteDetailModal`**

Run: `cd frontend && npx tsc --noEmit`
Corriger les éventuels écarts de props (signatures réelles des composants existants), sans modifier ces composants.
Expected: exit 0.

- [ ] **Step 3 : Build de production**

Run: `cd frontend && npm run build`
Expected: build réussi.

- [ ] **Step 4 : Vérifier la contrainte 150 lignes**

Run: `cd frontend && for f in app/sites/page.tsx components/sites/*.tsx hooks/useSitesList.ts components/ui/Pill.tsx components/ui/TrendArrow.tsx components/ui/FilterChip.tsx; do wc -l "$f"; done`
Expected: chaque fichier ≤ ~150 lignes (sauf `SiteDetailModal.tsx`, extrait verbatim — toléré). Si un fichier dépasse nettement, le noter pour découpe ultérieure.

- [ ] **Step 5 : Smoke test navigateur**

Lancer backend + `npm run dev`, ouvrir `/sites` : vérifier tri par défaut (% décroissant), chips de filtre (compteurs), recherche, sélection + barre bulk, kebab, ouverture modale détail, lignes `null %` affichant « — ».

- [ ] **Step 6 : Commit**

```bash
git add frontend/app/sites/page.tsx
git commit -m "feat(sites): orchestrateur page.tsx (liste UX V1)"
```

---

## Self-Review (effectué par l'auteur du plan)

**Couverture spec :**
- §3 backend (colonne, écriture, backfill, params, stats) → Tasks A1–A6 ✓
- §4 décomposition (atomes, composants, hook, modales extraites) → Phases B/C ✓
- §5 UI (colonnes, AdAreaBar, filtres, KPIs, bulk, kebab, états) → C2–C8 ✓
- §5.7 états edge (empty/0-résultat/loading skeleton) → SitesTable (C7) ✓ ; « ré-analyse en cours » (opacité+⟳) **non implémenté en V1** (optimisation visuelle ; à noter, non bloquant).

**Placeholders :** aucun « TODO » de code. Deux points marqués *à vérifier à l'exécution* (sourcing backfill dans `audits` schema ; endpoint `DELETE` éventuellement absent) avec consigne de repli explicite — ce ne sont pas des placeholders mais des garde-fous.

**Cohérence des types :** `last_ad_surface_pct` (number|null) et `last_score_trend` ('up'|'down'|'stable'|null) cohérents de `SiteEntry` → `AdAreaBar`/`TrendArrow`. `FilterKey` partagé entre hook, `SiteFilters`, `page.tsx`. `SiteStats.{avg_ad_surface_pct,problematic,stale}` cohérents A5→A6→C5/C6.

**Écart assumé vs spec :** le `<Delta>` de la spec devient `TrendArrow` en V1 (tendance catégorielle, pas de delta numérique — reporté V2). `SearchInput` fondu dans `SiteFilters`. « Retirer » dépend d'un endpoint DELETE à confirmer.
