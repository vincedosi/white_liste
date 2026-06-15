# Refonte UX — Phase 1 (Backend : données + API dé-workspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note environnement :** `git` absent du PATH → étapes "Commit" optionnelles. Commandes Python via **PowerShell** (`python -m pytest`). Endpoints vérifiés contre le backend local (uvicorn port 8020) avec le token de `admin@dentsu.com`.

**Goal:** Fournir l'API à plat (sans workspace) dont les écrans Sites/Whitelists auront besoin : import de sites, catégorisation qui écrit la catégorie, whitelists thématiques, et audit lié à une whitelist.

**Architecture:** On garde un unique workspace « Default » résolu en singleton côté serveur (`get_default_workspace_id`), évitant toute migration destructive. On ajoute `audits.whitelist_id`, des routes plates `/api/whitelists/*`, et des ajouts au router `/api/sites` (import, edit catégorie). La logique pure (nettoyage/dédup de domaines) est isolée et testée.

**Tech Stack:** FastAPI, aiosqlite, pytest.

---

## File Structure

- **Create** `backend/services/site_utils.py` — helpers purs : `clean_domain`, `dedup_domains`.
- **Create** `backend/test_site_utils.py` — tests pytest des helpers purs.
- **Modify** `backend/db.py` — `get_default_workspace_id()` + migration `audits.whitelist_id`.
- **Create** `backend/routers/whitelists_flat.py` — routes plates `/api/whitelists/*`.
- **Modify** `backend/routers/sites.py` — `POST /import`, `PATCH /{domain}`.
- **Modify** `backend/routers/audit.py` — accepter `whitelist_id`, l'écrire sur l'audit.
- **Modify** `backend/main.py` — enregistrer `whitelists_flat`, appeler la migration au startup.

---

## Task 1 : Helpers purs de domaines (clean + dedup)

**Files:**
- Create: `backend/services/site_utils.py`
- Create: `backend/test_site_utils.py`

- [ ] **Step 1 : Écrire les tests** — `backend/test_site_utils.py`

```python
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from services.site_utils import clean_domain, dedup_domains


def test_clean_strips_scheme_www_space_and_lowercases():
    assert clean_domain("  HTTPS://WWW.Lemonde.FR/  ") == "lemonde.fr"

def test_clean_strips_path():
    assert clean_domain("cdiscount.com/le-sport") == "cdiscount.com/le-sport"

def test_clean_empty_returns_empty():
    assert clean_domain("   ") == ""

def test_dedup_preserves_order_and_drops_blanks():
    raw = ["www.A.fr", "a.fr", "  ", "b.fr", "B.FR"]
    assert dedup_domains(raw) == ["a.fr", "b.fr"]
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run (PowerShell, depuis `backend`) : `python -m pytest test_site_utils.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.site_utils'`.

- [ ] **Step 3 : Créer le module** — `backend/services/site_utils.py`

```python
"""Pure helpers for site/domain normalisation — no DB, no Playwright."""
from __future__ import annotations


def clean_domain(raw: str) -> str:
    """Normalise a domain entry: strip spaces, scheme, leading www., trailing
    slash; lowercase. Keeps any path (some entries target a sub-section)."""
    d = (raw or "").strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    if d.startswith("www."):
        d = d[4:]
    d = d.rstrip("/")
    return d


def dedup_domains(domains) -> list[str]:
    """Clean each entry, drop blanks, dedup while preserving first-seen order."""
    seen = set()
    out = []
    for raw in domains:
        d = clean_domain(raw)
        if not d or d in seen:
            continue
        seen.add(d)
        out.append(d)
    return out
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run : `python -m pytest test_site_utils.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5 : (Optionnel) Commit**

```bash
git add backend/services/site_utils.py backend/test_site_utils.py
git commit -m "feat(sites): pure domain clean/dedup helpers"
```

---

## Task 2 : Workspace Default singleton + migration `whitelist_id`

**Files:**
- Modify: `backend/db.py` (ajout de deux fonctions, après `backfill_domains_from_audits`)

- [ ] **Step 1 : Ajouter `get_default_workspace_id()` et `migrate_add_whitelist_id()`** à la fin de `backend/db.py`

```python
async def get_default_workspace_id() -> str:
    """Return the id of the single hidden 'Default' workspace, creating it (and
    attaching the first user as owner) if needed. Lets the API drop workspace
    scoping without a destructive schema migration."""
    row = await fetch_one("SELECT id FROM workspaces WHERE slug = 'default'", ())
    if row:
        return row["id"]
    owner = await fetch_one("SELECT id FROM users WHERE role = 'admin' LIMIT 1", ())
    if not owner:
        owner = await fetch_one("SELECT id FROM users LIMIT 1", ())
    owner_id = owner["id"] if owner else _uuid()
    ws_id = _uuid()
    now = _now()
    await execute(
        "INSERT INTO workspaces (id, name, slug, config_json, onboarding_done, created_by, created_at) "
        "VALUES (?, ?, 'default', '{}', 1, ?, ?)",
        (ws_id, "Default", owner_id, now),
    )
    if owner:
        await execute(
            "INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
            (ws_id, owner_id, now),
        )
    return ws_id


async def migrate_add_whitelist_id() -> None:
    """Add audits.whitelist_id (nullable) once. Links an audit to its theme."""
    db = await get_db()
    already = await fetch_one("SELECT key FROM _migrations WHERE key = ?", ("audits_whitelist_id",))
    if already:
        return
    cursor = await db.execute("PRAGMA table_info(audits)")
    cols = [r["name"] for r in await cursor.fetchall()]
    if "whitelist_id" not in cols:
        await db.execute("ALTER TABLE audits ADD COLUMN whitelist_id TEXT")
    await db.execute("INSERT INTO _migrations (key, done_at) VALUES (?, ?)", ("audits_whitelist_id", _now()))
    await db.commit()
```

- [ ] **Step 2 : Appeler la migration au startup** — dans `backend/main.py`, fonction `startup()`, après `await init_db()` ajouter :

```python
    from db import migrate_add_whitelist_id
    await migrate_add_whitelist_id()
```

- [ ] **Step 3 : Vérifier — redémarrer le backend et contrôler la colonne**

Run (PowerShell) — relancer le backend puis :
```
python -c "import sqlite3; c=sqlite3.connect(r'C:\MLI\mli_crawler\backend\data\mli.db'); print([r[1] for r in c.execute('PRAGMA table_info(audits)')])"
```
Expected: la liste contient `whitelist_id`.

- [ ] **Step 4 : (Optionnel) Commit**

```bash
git add backend/db.py backend/main.py
git commit -m "feat(db): default-workspace singleton + audits.whitelist_id migration"
```

---

## Task 3 : Routes plates `/api/whitelists`

**Files:**
- Create: `backend/routers/whitelists_flat.py`
- Modify: `backend/main.py` (enregistrer le router)

- [ ] **Step 1 : Créer le router** — `backend/routers/whitelists_flat.py`

```python
"""MLI — Flat whitelists API (no workspace in the URL). Uses the single hidden
Default workspace under the hood."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Body

from auth import get_current_user
from db import (
    fetch_one, fetch_all, execute, _uuid, _now, get_default_workspace_id,
)

router = APIRouter(prefix="/api/whitelists", tags=["whitelists"])


def _hydrate(row: dict) -> dict:
    row["domains"] = json.loads(row.get("domains_json", "[]") or "[]")
    return row


@router.get("")
async def list_whitelists(user: dict = Depends(get_current_user)):
    ws = await get_default_workspace_id()
    rows = await fetch_all(
        "SELECT * FROM workspace_whitelists WHERE workspace_id = ? ORDER BY created_at DESC",
        (ws,),
    )
    out = []
    for r in rows:
        r = _hydrate(r)
        latest = await fetch_one(
            "SELECT id, stats_json, created_at, status FROM audits "
            "WHERE whitelist_id = ? ORDER BY created_at DESC LIMIT 1",
            (r["id"],),
        )
        r["latest_audit"] = (
            {**latest, "stats": json.loads(latest.get("stats_json") or "{}")} if latest else None
        )
        out.append(r)
    return {"whitelists": out}


@router.post("")
async def create_whitelist(body: dict = Body(...), user: dict = Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    domains = body.get("domains", [])
    if not name:
        raise HTTPException(400, "name required")
    ws = await get_default_workspace_id()
    wl_id = _uuid()
    now = _now()
    await execute(
        "INSERT INTO workspace_whitelists (id, workspace_id, name, domains_json, created_by, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (wl_id, ws, name, json.dumps(domains), user["id"], now, now),
    )
    return _hydrate(await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (wl_id,)))


@router.get("/{whitelist_id}")
async def get_whitelist(whitelist_id: str, user: dict = Depends(get_current_user)):
    wl = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (whitelist_id,))
    if not wl:
        raise HTTPException(404, "Whitelist not found")
    wl = _hydrate(wl)
    latest = await fetch_one(
        "SELECT * FROM audits WHERE whitelist_id = ? ORDER BY created_at DESC LIMIT 1",
        (whitelist_id,),
    )
    if latest:
        latest["stats"] = json.loads(latest.get("stats_json") or "{}")
        latest["results"] = json.loads(latest.get("results_json") or "[]")
    wl["latest_audit"] = latest
    return wl


@router.patch("/{whitelist_id}")
async def update_whitelist(whitelist_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    wl = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (whitelist_id,))
    if not wl:
        raise HTTPException(404, "Whitelist not found")
    name = (body.get("name") or wl["name"]).strip()
    domains = body.get("domains")
    domains_json = json.dumps(domains) if domains is not None else wl["domains_json"]
    await execute(
        "UPDATE workspace_whitelists SET name = ?, domains_json = ?, updated_at = ? WHERE id = ?",
        (name, domains_json, _now(), whitelist_id),
    )
    return _hydrate(await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (whitelist_id,)))


@router.delete("/{whitelist_id}")
async def delete_whitelist(whitelist_id: str, user: dict = Depends(get_current_user)):
    await execute("DELETE FROM workspace_whitelists WHERE id = ?", (whitelist_id,))
    return {"status": "deleted"}
```

- [ ] **Step 2 : Enregistrer le router** — dans `backend/main.py`, à côté des autres `include_router`, ajouter :

```python
from routers.whitelists_flat import router as whitelists_flat_router
...
app.include_router(whitelists_flat_router)
```

- [ ] **Step 3 : Vérifier en live** — relancer le backend, puis (PowerShell) :

```
$t = (Invoke-RestMethod -Method Post 'http://127.0.0.1:8020/api/auth/login' -ContentType 'application/json' -Body '{"email":"admin@dentsu.com","password":"admin"}').token
$h = @{ Authorization = "Bearer $t" }
$wl = Invoke-RestMethod -Method Post 'http://127.0.0.1:8020/api/whitelists' -Headers $h -ContentType 'application/json' -Body '{"name":"TestSport","domains":["lequipe.fr","rmcsport.fr"]}'
$wl.id
(Invoke-RestMethod 'http://127.0.0.1:8020/api/whitelists' -Headers $h).whitelists.Count
```
Expected: un id GUID, et un compteur ≥ 1. (Si le mot de passe diffère, lire `backend/seed.json` pour les identifiants.)

- [ ] **Step 4 : (Optionnel) Commit**

```bash
git add backend/routers/whitelists_flat.py backend/main.py
git commit -m "feat(api): flat /api/whitelists routes over default workspace"
```

---

## Task 4 : Import de sites + édition de catégorie

**Files:**
- Modify: `backend/routers/sites.py` (ajouter deux routes au router existant)

- [ ] **Step 1 : Ajouter les imports en tête de `backend/routers/sites.py`**

```python
from fastapi import Body
from db import execute, _uuid, _now
from services.site_utils import dedup_domains
```

- [ ] **Step 2 : Ajouter la route d'import** à la fin de `backend/routers/sites.py`

```python
@router.post("/import")
async def import_sites(body: dict = Body(...), user: dict = Depends(get_current_user)):
    """Bulk-add domains to the pool. Body: {"domains": ["a.fr", ...]}.
    Cleans + dedups; inserts new domains (no score yet); ignores existing."""
    cleaned = dedup_domains(body.get("domains", []))
    added, existed = 0, 0
    now = _now()
    for d in cleaned:
        row = await fetch_one("SELECT id FROM domains WHERE domain = ?", (d,))
        if row:
            existed += 1
            continue
        await execute(
            "INSERT INTO domains (id, domain, editorial_status, tags_json, audit_count, created_at, updated_at) "
            "VALUES (?, ?, 'pending', '[]', 0, ?, ?)",
            (_uuid(), d, now, now),
        )
        added += 1
    return {"added": added, "existed": existed, "total_received": len(cleaned)}
```

- [ ] **Step 3 : Ajouter la route d'édition de catégorie** à la fin de `backend/routers/sites.py`

```python
@router.patch("/{domain}")
async def update_site_category(domain: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    """Manually set a site's IAB category (the 'adjust' of hybrid theming)."""
    row = await fetch_one("SELECT id FROM domains WHERE domain = ?", (domain,))
    if not row:
        raise HTTPException(404, "Domain not found")
    category = body.get("category_iab")
    await execute(
        "UPDATE domains SET category_iab = ?, category_source = 'manual', updated_at = ? WHERE domain = ?",
        (category, _now(), domain),
    )
    return {"domain": domain, "category_iab": category, "category_source": "manual"}
```

Note : ajouter `from fastapi import HTTPException` aux imports si absent.

- [ ] **Step 4 : Vérifier en live** — relancer le backend, puis (PowerShell, `$h` du Task 3) :

```
Invoke-RestMethod -Method Post 'http://127.0.0.1:8020/api/sites/import' -Headers $h -ContentType 'application/json' -Body '{"domains":["www.Lequipe.fr/","nouveau-site.fr"]}'
Invoke-RestMethod -Method Patch 'http://127.0.0.1:8020/api/sites/nouveau-site.fr' -Headers $h -ContentType 'application/json' -Body '{"category_iab":"Sport"}'
```
Expected: import renvoie `{added, existed, total_received}` ; patch renvoie la catégorie `Sport`.

- [ ] **Step 5 : (Optionnel) Commit**

```bash
git add backend/routers/sites.py
git commit -m "feat(api): POST /api/sites/import + PATCH /api/sites/{domain} category"
```

---

## Task 5 : Catégorisation qui écrit `category_iab` + audit lié à une whitelist

**Files:**
- Modify: `backend/routers/audit.py` (écrire `category_iab` lors d'un run incluant la catégorisation ; accepter `whitelist_id`)

- [ ] **Step 1 : Accepter `whitelist_id` dans le run d'audit.** Dans `backend/routers/audit.py`, signature de `run_audit`, ajouter un query param et le propager dans l'INSERT DB. Remplacer la signature :

```python
async def run_audit(
    request: AuditRequest,
    workspace_id: str = Query(None),
    whitelist_id: str = Query(None),
    user: dict = Depends(get_current_user),
):
```

- [ ] **Step 2 : Écrire `whitelist_id` sur l'audit.** Dans le bloc d'INSERT DB de `audit.py` (`INSERT OR REPLACE INTO audits ...`), ajouter la colonne `whitelist_id`. Remplacer les colonnes/values pour inclure `whitelist_id` après `domain_count` :

```python
                await db_execute(
                    """INSERT OR REPLACE INTO audits
                    (id, workspace_id, whitelist_id, launched_by, client_label, status, domain_count,
                     stats_json, results_json, log_json, created_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        audit_id, _workspace_id, whitelist_id, _user_id,
                        report.client_name or "", "completed", report.total_sites,
                        json_mod.dumps(stats, default=str),
                        json_mod.dumps(results_list, default=str),
                        json_mod.dumps(audit_logs),
                        report.audit_date, _now(),
                    ),
                )
```

- [ ] **Step 3 : Écrire la catégorie IA dans `domains`.** Dans la boucle d'upsert des domaines de `audit.py` (`for _site_result in results_list:` → appel `_upsert_domain`), juste après cet appel, persister la catégorie quand elle existe :

```python
                _cat = _site_result.get("categorization") or {}
                _cat_name = _cat.get("category") if isinstance(_cat, dict) else None
                if _cat_name:
                    await db_execute(
                        "UPDATE domains SET category_iab = ?, category_source = 'ai', updated_at = ? WHERE domain = ?",
                        (_cat_name, _now(), _domain_name),
                    )
```

- [ ] **Step 4 : Vérifier la syntaxe**

Run (PowerShell, depuis `backend`) :
```
python -c "import ast; ast.parse(open(r'routers/audit.py',encoding='utf-8').read()); print('OK')"
```
Expected: `OK`.

- [ ] **Step 5 : Vérifier en live — un run catégorisation-seule écrit la catégorie.** Relancer le backend ; lancer un audit SSE en mode catégorisation sur 1 domaine connu et confirmer que `domains.category_iab` est rempli. (PowerShell, `$h` du Task 3 ; le endpoint SSE renvoie un flux — on se contente de vérifier la DB après ~30s.)

```
$body = '{"domains":["lemonde.fr"],"client":"cat","modules":{"attention":false,"ads_txt":false,"geo":false,"categorization":true,"screenshots":false}}'
Start-Job { Invoke-RestMethod -Method Post 'http://127.0.0.1:8020/api/audit' -Headers $using:h -ContentType 'application/json' -Body $using:body } | Out-Null
Start-Sleep 40
python -c "import sqlite3; print(sqlite3.connect(r'C:\MLI\mli_crawler\backend\data\mli.db').execute('SELECT domain, category_iab, category_source FROM domains WHERE domain=\"lemonde.fr\"').fetchone())"
```
Expected: `('lemonde.fr', '<catégorie>', 'ai')` si une clé Mistral valide est configurée ; sinon catégorie `None` (échec gracieux, non bloquant).

- [ ] **Step 6 : (Optionnel) Commit**

```bash
git add backend/routers/audit.py
git commit -m "feat(api): link audit to whitelist + persist AI category to domains"
```

---

## Task 6 : Audit déclenché par whitelist (raccourci serveur)

**Files:**
- Modify: `backend/routers/whitelists_flat.py` (ajouter une route qui renvoie les domaines + modules par défaut pour que le front lance l'audit SSE existant avec `whitelist_id`)

- [ ] **Step 1 : Ajouter une route « prepare audit »** à `backend/routers/whitelists_flat.py`

```python
@router.get("/{whitelist_id}/audit-payload")
async def whitelist_audit_payload(whitelist_id: str, user: dict = Depends(get_current_user)):
    """Return the SSE-audit request body the frontend should POST to /api/audit
    (with ?whitelist_id=...). Keeps the heavy SSE pipeline untouched."""
    wl = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (whitelist_id,))
    if not wl:
        raise HTTPException(404, "Whitelist not found")
    domains = json.loads(wl.get("domains_json", "[]") or "[]")
    return {
        "whitelist_id": whitelist_id,
        "request": {
            "domains": domains,
            "client": wl["name"],
            "modules": {
                "attention": True, "ads_txt": True, "geo": True,
                "categorization": False, "screenshots": True,
            },
        },
    }
```

- [ ] **Step 2 : Vérifier en live** (PowerShell, `$h` + un `$wl.id` du Task 3) :

```
Invoke-RestMethod "http://127.0.0.1:8020/api/whitelists/$($wl.id)/audit-payload" -Headers $h | ConvertTo-Json -Depth 5
```
Expected: un objet `{whitelist_id, request:{domains, client, modules}}` avec les domaines de la whitelist.

- [ ] **Step 3 : (Optionnel) Commit**

```bash
git add backend/routers/whitelists_flat.py
git commit -m "feat(api): whitelist audit-payload helper for the SSE pipeline"
```

---

## Self-Review (auteur du plan)

- **Couverture spec :** workspace Default singleton (Task 2) ✓ ; `audits.whitelist_id` (Task 2) ✓ ; routes plates whitelists (Task 3, 6) ✓ ; import sites (Task 4) ✓ ; édition catégorie manuelle (Task 4) ✓ ; catégorisation écrit `category_iab` (Task 5) ✓ ; audit lié à whitelist (Task 5, 6) ✓ ; export → réutilise `routers/export.py` existant (non modifié en P1, branché en P3). Liste des sites/filtre catégorie → déjà présents dans `sites.py` (vérifié).
- **Placeholders :** aucun — code complet à chaque étape.
- **Cohérence des noms :** `get_default_workspace_id`, `clean_domain`, `dedup_domains`, `whitelist_id`, `category_iab`, `category_source` — utilisés identiquement entre tâches. Le endpoint d'audit reste `/api/audit` (SSE inchangé), juste enrichi de `?whitelist_id=`.
- **Limite assumée :** les vérifs d'endpoints sont des appels live (pas de pytest async) car l'infra de test DB async est minimale ; les seuls tests unitaires pytest portent sur les helpers purs (Task 1). Identifiants login : si `admin/admin` échoue, lire `backend/seed.json`.

---

## Phases suivantes (plans séparés, après P1)
- **P2** — Écran Sites (upload CSV/XLSX/coller, table, filtre catégorie, catégoriser, sélection → créer/ajouter whitelist).
- **P3** — Whitelists + page thème (cartes, page unique sites+audit live+résultats+détail+export).
- **P4** — Retrait de l'ancien (pages workspace/admin/activity, 2 dashboards, nav 7→2).
