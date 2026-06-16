# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin panel with a deduplicated domain database, editorial workflow, brand safety management, and on-demand Mistral categorization.

**Architecture:** New `domains` table in SQLite populated via upsert after each audit. Admin-only API routes with pagination/filtering. React frontend with sortable table, bulk actions, and detail modal. Command dark theme.

**Tech Stack:** Python/FastAPI/aiosqlite (backend), Next.js/TypeScript/Tailwind (frontend)

**Spec:** `docs/superpowers/specs/2026-04-07-admin-panel-design.md`

---

### Task 1: Add `domains` table to SQLite schema

**Files:**
- Modify: `backend/db.py`

- [ ] **Step 1: Add domains table to init_db()**

In `backend/db.py`, inside the `init_db()` function's `executescript`, add this table BEFORE the `_migrations` table:

```sql
CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY,
    domain TEXT UNIQUE NOT NULL,
    editorial_status TEXT NOT NULL DEFAULT 'pending',
    brand_safety TEXT,
    brand_safety_source TEXT,
    category_iab TEXT,
    category_source TEXT,
    notes TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    last_score REAL,
    last_score_trend TEXT,
    last_health TEXT,
    last_ads_txt INTEGER,
    last_ad_count INTEGER,
    last_load_time_ms INTEGER,
    last_trackers INTEGER,
    last_adtech_json TEXT,
    last_country TEXT,
    last_lang TEXT,
    last_tld TEXT,
    last_audit_id TEXT,
    last_audit_date TEXT,
    audit_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Add upsert_domain() function**

Append this function to `backend/db.py`:

```python
async def upsert_domain(domain_name: str, audit_data: dict) -> None:
    """Insert or update a domain in the global domains table after an audit.
    audit_data keys: score, health, ads_txt, ad_count, load_time_ms, trackers,
    adtech, country, lang, tld, audit_id, audit_date, category, brand_safety."""
    db = await get_db()
    existing = await fetch_one("SELECT id, last_score FROM domains WHERE domain = ?", (domain_name,))

    new_score = audit_data.get("score")
    if existing:
        # Calculate trend
        old_score = existing["last_score"]
        if old_score is None or new_score is None:
            trend = "stable"
        elif new_score > old_score:
            trend = "up"
        elif new_score < old_score:
            trend = "down"
        else:
            trend = "stable"

        await db.execute(
            """UPDATE domains SET
                last_score = ?, last_score_trend = ?, last_health = ?,
                last_ads_txt = ?, last_ad_count = ?, last_load_time_ms = ?,
                last_trackers = ?, last_adtech_json = ?,
                last_country = ?, last_lang = ?, last_tld = ?,
                last_audit_id = ?, last_audit_date = ?,
                audit_count = audit_count + 1, updated_at = ?
            WHERE id = ?""",
            (
                new_score, trend, audit_data.get("health"),
                audit_data.get("ads_txt"), audit_data.get("ad_count"),
                audit_data.get("load_time_ms"), audit_data.get("trackers"),
                json.dumps(audit_data.get("adtech")) if audit_data.get("adtech") else None,
                audit_data.get("country"), audit_data.get("lang"), audit_data.get("tld"),
                audit_data.get("audit_id"), audit_data.get("audit_date"),
                _now(), existing["id"],
            ),
        )
    else:
        import json as json_mod
        await db.execute(
            """INSERT INTO domains
            (id, domain, editorial_status, last_score, last_score_trend, last_health,
             last_ads_txt, last_ad_count, last_load_time_ms, last_trackers, last_adtech_json,
             last_country, last_lang, last_tld, last_audit_id, last_audit_date,
             audit_count, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, 'stable', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
            (
                _uuid(), domain_name, new_score, audit_data.get("health"),
                audit_data.get("ads_txt"), audit_data.get("ad_count"),
                audit_data.get("load_time_ms"), audit_data.get("trackers"),
                json_mod.dumps(audit_data.get("adtech")) if audit_data.get("adtech") else None,
                audit_data.get("country"), audit_data.get("lang"), audit_data.get("tld"),
                audit_data.get("audit_id"), audit_data.get("audit_date"),
                _now(), _now(),
            ),
        )
    await db.commit()
```

- [ ] **Step 3: Add `import json` at top of db.py if not already there**

- [ ] **Step 4: Test**

```bash
cd C:/MLI/mli_crawler/backend && rm -f data/mli.db && python -c "
import asyncio
from db import init_db, upsert_domain, fetch_one, fetch_all
from auth import seed_users
async def test():
    await init_db()
    await seed_users()
    await upsert_domain('test.com', {'score': 7.5, 'health': 'ok', 'ad_count': 3, 'audit_id': 'a1', 'audit_date': '2026-04-07'})
    d = await fetch_one('SELECT * FROM domains WHERE domain = ?', ('test.com',))
    print(f'Domain: {d[\"domain\"]}, score: {d[\"last_score\"]}, trend: {d[\"last_score_trend\"]}, count: {d[\"audit_count\"]}')
    assert d['last_score'] == 7.5
    assert d['audit_count'] == 1
    # Update same domain
    await upsert_domain('test.com', {'score': 5.0, 'health': 'ok', 'ad_count': 8, 'audit_id': 'a2', 'audit_date': '2026-04-08'})
    d2 = await fetch_one('SELECT * FROM domains WHERE domain = ?', ('test.com',))
    print(f'After update: score: {d2[\"last_score\"]}, trend: {d2[\"last_score_trend\"]}, count: {d2[\"audit_count\"]}')
    assert d2['last_score'] == 5.0
    assert d2['last_score_trend'] == 'down'
    assert d2['audit_count'] == 2
    print('OK')
asyncio.run(test())
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/db.py && git commit -m "feat: add domains table + upsert_domain function"
```

---

### Task 2: Hook upsert_domain into audit pipeline

**Files:**
- Modify: `backend/routers/audit.py`

- [ ] **Step 1: Add upsert call after audit saves**

Read `backend/routers/audit.py`. Find the section where `_save_report()` is called (near the end of the audit pipeline, after all steps complete). After the report is saved (both JSON file and DB insert), add a loop that upserts each domain result into the `domains` table:

```python
# After _save_report and DB insert, upsert domains
from db import upsert_domain
for site_result in results_list:
    try:
        domain_name = site_result.get("domain", "")
        if not domain_name:
            continue
        health = site_result.get("health", {})
        attention = site_result.get("attention", {})
        geo = site_result.get("geo", {})
        ads_txt = site_result.get("ads_txt", {})
        adtech = site_result.get("adtech", {})
        trackers = site_result.get("trackers", {})

        await upsert_domain(domain_name, {
            "score": attention.get("clutter_score") or attention.get("score"),
            "health": health.get("status", "ok"),
            "ads_txt": 1 if ads_txt.get("has_ads_txt") else 0,
            "ad_count": attention.get("ad_count", 0),
            "load_time_ms": site_result.get("load_time_ms"),
            "trackers": trackers.get("total", 0) if isinstance(trackers, dict) else 0,
            "adtech": adtech,
            "country": geo.get("server_country"),
            "lang": geo.get("content_lang"),
            "tld": geo.get("tld"),
            "audit_id": audit_id,
            "audit_date": _now(),
        })
    except Exception as e:
        print(f"[MLI] upsert_domain error for {domain_name}: {e}")
```

This code must be inside the async event_generator, after the audit completes but before the `complete` event is sent.

- [ ] **Step 2: Test by running a quick server check**

```bash
cd C:/MLI/mli_crawler/backend && python -c "from routers.audit import router; print('audit router imports OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/audit.py && git commit -m "feat: upsert domains into global table after each audit"
```

---

### Task 3: Admin API router

**Files:**
- Create: `backend/routers/admin.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Create admin router**

Create `backend/routers/admin.py`:

```python
"""
MLI — Admin routes: domain database CRUD + Mistral categorization.
All routes require admin role.
"""
from __future__ import annotations

import json
import math
import os

from fastapi import APIRouter, Depends, HTTPException, Body, Query

from auth import get_current_user
from db import fetch_one, fetch_all, execute, get_db, _uuid, _now

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")


@router.get("/domains")
async def list_domains(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort: str = Query("domain"),
    order: str = Query("asc"),
    search: str = Query(""),
    status: str = Query(""),
    brand_safety: str = Query(""),
    health: str = Query(""),
    category: str = Query(""),
    user: dict = Depends(get_current_user),
):
    _require_admin(user)

    allowed_sorts = {"domain", "last_score", "editorial_status", "brand_safety", "category_iab", "last_health", "last_audit_date", "audit_count"}
    sort_col = sort if sort in allowed_sorts else "domain"
    sort_order = "DESC" if order.lower() == "desc" else "ASC"

    conditions = []
    params: list = []

    if search:
        conditions.append("domain LIKE ?")
        params.append(f"%{search}%")
    if status:
        conditions.append("editorial_status = ?")
        params.append(status)
    if brand_safety:
        conditions.append("brand_safety = ?")
        params.append(brand_safety)
    if health:
        conditions.append("last_health = ?")
        params.append(health)
    if category:
        conditions.append("category_iab = ?")
        params.append(category)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Count
    count_row = await fetch_one(f"SELECT COUNT(*) as total FROM domains {where}", tuple(params))
    total = count_row["total"] if count_row else 0
    pages = max(1, math.ceil(total / per_page))

    # Fetch page
    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"SELECT * FROM domains {where} ORDER BY {sort_col} {sort_order} LIMIT ? OFFSET ?",
        tuple(params) + (per_page, offset),
    )

    # Parse tags_json for each row
    for r in rows:
        r["tags"] = json.loads(r.get("tags_json") or "[]")
        r["adtech"] = json.loads(r.get("last_adtech_json") or "{}")

    return {"domains": rows, "total": total, "page": page, "per_page": per_page, "pages": pages}


@router.patch("/domains/{domain_id}")
async def update_domain(domain_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    _require_admin(user)
    d = await fetch_one("SELECT * FROM domains WHERE id = ?", (domain_id,))
    if not d:
        raise HTTPException(404, "Domain not found")

    allowed = {"editorial_status", "brand_safety", "brand_safety_source", "category_iab", "category_source", "notes", "tags_json"}
    updates = []
    params = []
    for key in allowed:
        if key in body:
            updates.append(f"{key} = ?")
            params.append(body[key] if not isinstance(body[key], (list, dict)) else json.dumps(body[key]))

    if not updates:
        raise HTTPException(400, "Nothing to update")

    updates.append("updated_at = ?")
    params.append(_now())
    params.append(domain_id)

    await execute(f"UPDATE domains SET {', '.join(updates)} WHERE id = ?", tuple(params))
    return await fetch_one("SELECT * FROM domains WHERE id = ?", (domain_id,))


@router.delete("/domains/{domain_id}")
async def delete_domain(domain_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    d = await fetch_one("SELECT * FROM domains WHERE id = ?", (domain_id,))
    if not d:
        raise HTTPException(404, "Domain not found")
    await execute("DELETE FROM domains WHERE id = ?", (domain_id,))
    return {"status": "deleted"}


@router.post("/domains/categorize")
async def categorize_domains(body: dict = Body(...), user: dict = Depends(get_current_user)):
    _require_admin(user)
    domain_ids = body.get("domain_ids", [])
    if not domain_ids:
        raise HTTPException(400, "domain_ids required")

    mistral_key = os.environ.get("MISTRAL_API_KEY") or body.get("mistral_key")
    if not mistral_key:
        raise HTTPException(400, "MISTRAL_API_KEY not set and no mistral_key provided")
    os.environ["MISTRAL_API_KEY"] = mistral_key

    from services.categorizer import categorize_single

    results = []
    errors = 0
    for did in domain_ids:
        d = await fetch_one("SELECT * FROM domains WHERE id = ?", (did,))
        if not d:
            errors += 1
            continue
        try:
            cat_result = categorize_single(d["domain"])
            category = cat_result.get("category", "Autre")
            bs = cat_result.get("brand_safety", "safe")
            bs_reason = cat_result.get("brand_safety_reason", "")
            confidence = cat_result.get("confidence", 0.0)

            # Update domain
            notes_update = d.get("notes") or ""
            if bs_reason:
                notes_update = f"[Mistral] {bs_reason}\n{notes_update}".strip()

            await execute(
                """UPDATE domains SET category_iab = ?, category_source = 'mistral',
                   brand_safety = ?, brand_safety_source = 'mistral',
                   notes = ?, updated_at = ? WHERE id = ?""",
                (category, bs, notes_update, _now(), did),
            )

            results.append({
                "domain_id": did,
                "domain": d["domain"],
                "category_iab": category,
                "brand_safety": bs,
                "confidence": confidence,
            })
        except Exception as e:
            errors += 1
            results.append({"domain_id": did, "domain": d["domain"], "error": str(e)})

    return {"results": results, "processed": len(results), "errors": errors}


@router.post("/domains/bulk")
async def bulk_action(body: dict = Body(...), user: dict = Depends(get_current_user)):
    _require_admin(user)
    domain_ids = body.get("domain_ids", [])
    action = body.get("action")
    value = body.get("value", "")

    if not domain_ids or not action:
        raise HTTPException(400, "domain_ids and action required")

    if action == "set_status":
        if value not in ("pending", "validated", "blacklisted"):
            raise HTTPException(400, "Invalid status value")
        placeholders = ",".join("?" * len(domain_ids))
        await execute(
            f"UPDATE domains SET editorial_status = ?, updated_at = ? WHERE id IN ({placeholders})",
            (value, _now()) + tuple(domain_ids),
        )

    elif action == "add_tag":
        if not value:
            raise HTTPException(400, "tag value required")
        for did in domain_ids:
            d = await fetch_one("SELECT tags_json FROM domains WHERE id = ?", (did,))
            if d:
                tags = json.loads(d["tags_json"] or "[]")
                if value not in tags:
                    tags.append(value)
                await execute(
                    "UPDATE domains SET tags_json = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(tags), _now(), did),
                )

    elif action == "delete":
        placeholders = ",".join("?" * len(domain_ids))
        await execute(f"DELETE FROM domains WHERE id IN ({placeholders})", tuple(domain_ids))

    else:
        raise HTTPException(400, f"Unknown action: {action}")

    return {"status": "ok", "affected": len(domain_ids)}
```

- [ ] **Step 2: Create categorize_single helper**

Check if `backend/services/categorizer.py` has a `categorize_single(domain)` function. If not, add one that calls Mistral for a single domain with the enriched prompt (brand safety + category):

```python
def categorize_single(domain: str) -> dict:
    """Categorize a single domain via Mistral with brand safety."""
    # Uses the existing Mistral client setup
    # Returns: {"category": "News", "brand_safety": "safe", "brand_safety_reason": "...", "confidence": 0.95}
```

Read the existing categorizer.py to understand its structure and add this function following the same patterns.

- [ ] **Step 3: Register admin router in main.py**

Add to `backend/main.py`:
```python
from routers.admin import router as admin_router
app.include_router(admin_router)
```

- [ ] **Step 4: Test**

```bash
cd C:/MLI/mli_crawler/backend && python -c "from routers.admin import router; print('admin router imports OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/routers/admin.py backend/main.py && git commit -m "feat: add admin domain CRUD + categorize + bulk action API"
```

---

### Task 4: Frontend types + API for admin

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add types to types.ts**

Append to `frontend/lib/types.ts`:

```typescript
/* ---- Admin types ------------------------------------------------ */

export interface DomainEntry {
  id: string;
  domain: string;
  editorial_status: 'pending' | 'validated' | 'blacklisted';
  brand_safety: 'safe' | 'moderate' | 'unsafe' | null;
  brand_safety_source: 'mistral' | 'manual' | null;
  category_iab: string | null;
  category_source: 'mistral' | 'manual' | null;
  notes: string | null;
  tags: string[];
  tags_json: string;
  last_score: number | null;
  last_score_trend: 'up' | 'down' | 'stable' | null;
  last_health: 'ok' | 'dead' | null;
  last_ads_txt: number | null;
  last_ad_count: number | null;
  last_load_time_ms: number | null;
  last_trackers: number | null;
  adtech: Record<string, boolean>;
  last_adtech_json: string | null;
  last_country: string | null;
  last_lang: string | null;
  last_tld: string | null;
  last_audit_id: string | null;
  last_audit_date: string | null;
  audit_count: number;
  created_at: string;
  updated_at: string;
}

export interface DomainListResponse {
  domains: DomainEntry[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface CategorizeResult {
  domain_id: string;
  domain: string;
  category_iab?: string;
  brand_safety?: string;
  confidence?: number;
  error?: string;
}
```

- [ ] **Step 2: Add API functions to api.ts**

Append to `frontend/lib/api.ts`:

```typescript
/* ── Admin ── */

export async function getAdminDomains(params: {
  page?: number; per_page?: number; sort?: string; order?: string;
  search?: string; status?: string; brand_safety?: string; health?: string; category?: string;
} = {}): Promise<DomainListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
  const res = await fetchWithAuth(`${API_BASE}/admin/domains?${qs}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function updateDomain(id: string, data: Record<string, unknown>): Promise<DomainEntry> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function deleteDomain(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function categorizeDomains(domainIds: string[], mistralKey?: string): Promise<{ results: CategorizeResult[]; processed: number; errors: number }> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/categorize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain_ids: domainIds, ...(mistralKey ? { mistral_key: mistralKey } : {}) }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function bulkDomainAction(domainIds: string[], action: string, value?: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain_ids: domainIds, action, value }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}
```

Add `DomainEntry, DomainListResponse, CategorizeResult` to the import line at the top of api.ts.

- [ ] **Step 3: Verify + commit**

```bash
cd C:/MLI/mli_crawler/frontend && npx tsc --noEmit --pretty 2>&1 | head -10
git add frontend/lib/types.ts frontend/lib/api.ts && git commit -m "feat: add admin domain types + API functions"
```

---

### Task 5: Admin page — DomainTable component

**Files:**
- Create: `frontend/app/admin/domains/page.tsx`

- [ ] **Step 1: Create the admin domains page**

This is a single large page component that includes the table, filters, bulk actions, and column picker all inline. Command dark theme.

The page should have:
- Header: "ADMIN · DOMAIN DATABASE" + column picker button
- Search bar (debounced input)
- Filter row: dropdowns for status, brand_safety, health
- Select-all checkbox + bulk action bar (when items selected)
- Table with sortable columns, brand safety color coding, score trend arrows
- Pagination at bottom
- Row menu (··· button) with inline actions
- Click domain name to show detail (can be a simple expand or separate modal page)

Use `getAdminDomains()`, `updateDomain()`, `deleteDomain()`, `categorizeDomains()`, `bulkDomainAction()` from api.ts.

Brand safety styling per spec:
- safe: `text-secondary` (#00fc40), left border green
- moderate: `text-warning` (#F59E0B), left border orange  
- unsafe: `text-danger` (#ff716c), left border red, bg `rgba(255,113,108,0.05)`

Editorial status styling:
- pending: `text-on-surface-variant` "EN ATTENTE"
- validated: `text-secondary` "VALIDÉ"
- blacklisted: `text-danger` "BLACKLISTÉ"

Score trend:
- up: `text-secondary` "▲"
- down: `text-danger` "▼"
- stable: `text-on-surface-variant` "─"

This is a large component (~400-500 lines). Write it as a single file for the proto — it can be split later.

- [ ] **Step 2: Verify + commit**

```bash
cd C:/MLI/mli_crawler/frontend && npx tsc --noEmit --pretty 2>&1 | head -10
git add frontend/app/admin/ && git commit -m "feat: add admin domain database page"
```

---

### Task 6: Add Admin link to Sidebar

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add admin nav item**

Read `frontend/components/layout/Sidebar.tsx`. After the workspace nav items and their closing divider, add a conditional admin section:

```typescript
{/* Admin section — only for admin users */}
{user.role === 'admin' && (
  <>
    <div className="mx-5 h-px bg-white/[0.04]" />
    <div className="px-3 py-3">
      <Link
        href="/admin/domains"
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-extralight tracking-wide',
          'transition-all duration-150',
          pathname.startsWith('/admin')
            ? 'bg-white/[0.04] text-on-surface border-l-2 border-warning'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.02]',
        )}
      >
        <Shield size={15} className={pathname.startsWith('/admin') ? 'text-warning' : 'text-on-surface-variant'} />
        <span>Admin</span>
      </Link>
    </div>
  </>
)}
```

Add `Shield` to the lucide-react import at the top.

- [ ] **Step 2: Verify + commit**

```bash
cd C:/MLI/mli_crawler/frontend && npx tsc --noEmit --pretty 2>&1 | head -5
git add frontend/components/layout/Sidebar.tsx && git commit -m "feat: add Admin link in sidebar for admin users"
```

---

### Summary

After completing all 6 tasks:
- `domains` table populated after each audit via upsert
- Admin API with pagination, filtering, sorting, CRUD, Mistral categorization, bulk actions
- Full admin page with sortable table, brand safety colors, editorial workflow, bulk actions
- Admin link in sidebar (visible only for admin role)

**Next:** Geo map improvements + Home dashboard (separate specs).
