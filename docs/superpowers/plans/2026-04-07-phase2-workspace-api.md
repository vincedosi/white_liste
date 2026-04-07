# Phase 2 — Workspace API + Scoped Audits

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace CRUD, scope audits to workspaces, whitelists, activity logging, and export/import.

**Architecture:** New FastAPI routers for workspaces, whitelists, activity, export. Existing audit/history routers modified to require workspace scope + auth. Permission checks via helper function.

**Tech Stack:** Python 3.13, FastAPI, aiosqlite, pyjwt (Phase 1 deps)

**Spec:** `docs/superpowers/specs/2026-04-06-workspace-auth-design.md` (sections 5, 7)

**Depends on:** Phase 1 (db.py, auth.py, models.py all in place)

---

### Task 1: Permission helper + workspace access checker

**Files:**
- Create: `backend/permissions.py`

- [ ] **Step 1: Write permissions.py**

```python
"""
MLI — Permission checks for workspace access.
"""
from __future__ import annotations

from fastapi import HTTPException

from db import fetch_one


async def check_workspace_member(workspace_id: str, user_id: str) -> dict:
    """Return membership row or raise 403."""
    member = await fetch_one(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        (workspace_id, user_id),
    )
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    return member


async def check_workspace_role(workspace_id: str, user_id: str, allowed_roles: list[str]) -> dict:
    """Check membership AND role. Raise 403 if not allowed."""
    member = await check_workspace_member(workspace_id, user_id)
    if member["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail=f"Role '{member['role']}' not allowed")
    return member


async def get_workspace_or_404(workspace_id: str) -> dict:
    """Return workspace row or raise 404."""
    ws = await fetch_one("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws
```

- [ ] **Step 2: Test**

```bash
cd C:/MLI/mli_crawler/backend && python -c "from permissions import check_workspace_member, check_workspace_role, get_workspace_or_404; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/permissions.py && git commit -m "feat: add workspace permission helpers"
```

---

### Task 2: Workspace CRUD router

**Files:**
- Create: `backend/routers/workspaces.py`
- Modify: `backend/main.py` (register router)

- [ ] **Step 1: Write workspaces router**

```python
"""
MLI — Workspace CRUD + members + invites.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import fetch_one, fetch_all, execute, get_db, _uuid, _now
from permissions import check_workspace_role, get_workspace_or_404

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "workspace"


async def _log_activity(workspace_id: str, user_id: str, action: str, detail: dict | None = None):
    await execute(
        "INSERT INTO workspace_activity (id, workspace_id, user_id, action, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (_uuid(), workspace_id, user_id, action, json.dumps(detail) if detail else None, _now()),
    )


@router.get("")
async def list_workspaces(user: dict = Depends(get_current_user)):
    rows = await fetch_all(
        """
        SELECT w.*, wm.role as member_role,
            (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count,
            (SELECT COUNT(*) FROM audits WHERE workspace_id = w.id) as audit_count
        FROM workspaces w
        JOIN workspace_members wm ON w.id = wm.workspace_id
        WHERE wm.user_id = ?
        ORDER BY w.name
        """,
        (user["id"],),
    )
    return {"workspaces": rows}


@router.post("")
async def create_workspace(name: str = None, user: dict = Depends(get_current_user)):
    # Accept JSON body
    from fastapi import Request
    # Simple approach: use query or default
    if not name:
        raise HTTPException(400, "name required")
    slug = _slugify(name)
    # Ensure unique slug
    existing = await fetch_one("SELECT id FROM workspaces WHERE slug = ?", (slug,))
    suffix = 1
    base_slug = slug
    while existing:
        slug = f"{base_slug}-{suffix}"
        existing = await fetch_one("SELECT id FROM workspaces WHERE slug = ?", (slug,))
        suffix += 1

    ws_id = _uuid()
    now = _now()
    await execute(
        "INSERT INTO workspaces (id, name, slug, config_json, onboarding_done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ws_id, name, slug, "{}", 0, user["id"], now),
    )
    await execute(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
        (ws_id, user["id"], "owner", now),
    )
    await _log_activity(ws_id, user["id"], "workspace_created", {"name": name})
    ws = await fetch_one("SELECT * FROM workspaces WHERE id = ?", (ws_id,))
    return ws


@router.get("/{workspace_id}")
async def get_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    ws = await get_workspace_or_404(workspace_id)
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor", "viewer", "client"])
    members = await fetch_all(
        """
        SELECT wm.user_id, u.email, u.name, wm.role, wm.joined_at
        FROM workspace_members wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = ?
        """,
        (workspace_id,),
    )
    audit_count = await fetch_one("SELECT COUNT(*) as c FROM audits WHERE workspace_id = ?", (workspace_id,))
    ws_dict = dict(ws)
    ws_dict["members"] = members
    ws_dict["audit_count"] = audit_count["c"] if audit_count else 0
    return ws_dict


@router.patch("/{workspace_id}")
async def update_workspace(workspace_id: str, name: str = None, config_json: str = None, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    updates = []
    params = []
    if name:
        updates.append("name = ?")
        params.append(name)
    if config_json:
        updates.append("config_json = ?")
        params.append(config_json)
    if not updates:
        raise HTTPException(400, "Nothing to update")
    params.append(workspace_id)
    await execute(f"UPDATE workspaces SET {', '.join(updates)} WHERE id = ?", tuple(params))
    await _log_activity(workspace_id, user["id"], "workspace_config_updated")
    return await fetch_one("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))


@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    await execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
    return {"status": "deleted"}


# ── Members ──

@router.post("/{workspace_id}/members")
async def invite_member(workspace_id: str, email: str = None, role: str = "editor", user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    if not email:
        raise HTTPException(400, "email required")
    if role not in ("editor", "viewer", "client"):
        raise HTTPException(400, "Invalid role")
    # Create invite
    invite_id = _uuid()
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await execute(
        "INSERT INTO workspace_invites (id, workspace_id, email, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        (invite_id, workspace_id, email, role, user["id"], expires),
    )
    await _log_activity(workspace_id, user["id"], "member_invited", {"email": email, "role": role})
    return {"invite_id": invite_id, "invite_url": f"/invite/{invite_id}"}


@router.patch("/{workspace_id}/members/{member_user_id}")
async def update_member_role(workspace_id: str, member_user_id: str, role: str = None, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    if not role or role not in ("owner", "editor", "viewer", "client"):
        raise HTTPException(400, "Invalid role")
    await execute(
        "UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?",
        (role, workspace_id, member_user_id),
    )
    await _log_activity(workspace_id, user["id"], "member_role_changed", {"target": member_user_id, "role": role})
    return {"status": "updated"}


@router.delete("/{workspace_id}/members/{member_user_id}")
async def remove_member(workspace_id: str, member_user_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    if member_user_id == user["id"]:
        raise HTTPException(400, "Cannot remove yourself")
    await execute(
        "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        (workspace_id, member_user_id),
    )
    await _log_activity(workspace_id, user["id"], "member_removed", {"target": member_user_id})
    return {"status": "removed"}
```

- [ ] **Step 2: Register in main.py**

Add to `backend/main.py`:
```python
from routers.workspaces import router as workspaces_router
app.include_router(workspaces_router)
```

- [ ] **Step 3: Test**

```bash
cd C:/MLI/mli_crawler/backend && python -c "
import asyncio, httpx, uvicorn
from main import app
async def test():
    config = uvicorn.Config(app, host='127.0.0.1', port=8098, log_level='error')
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    await asyncio.sleep(2)
    async with httpx.AsyncClient(base_url='http://127.0.0.1:8098') as c:
        r = await c.post('/api/auth/login', json={'email':'admin@dentsu.com','password':'admin123'})
        token = r.json()['access_token']
        h = {'Authorization': f'Bearer {token}'}
        # List workspaces
        r = await c.get('/api/workspaces', headers=h)
        print('List:', r.status_code, len(r.json()['workspaces']), 'workspaces')
        # Create workspace
        r = await c.post('/api/workspaces?name=TestClient', headers=h)
        print('Create:', r.status_code, r.json().get('name'))
        ws_id = r.json()['id']
        # Get workspace
        r = await c.get(f'/api/workspaces/{ws_id}', headers=h)
        print('Get:', r.status_code, r.json().get('name'))
        # Delete
        r = await c.delete(f'/api/workspaces/{ws_id}', headers=h)
        print('Delete:', r.status_code)
    server.should_exit = True
    await task
    print('All OK')
asyncio.run(test())
"
```

- [ ] **Step 4: Commit**

```bash
git add backend/routers/workspaces.py backend/main.py && git commit -m "feat: add workspace CRUD + members + invites router"
```

---

### Task 3: Whitelists router

**Files:**
- Create: `backend/routers/whitelists.py`
- Modify: `backend/main.py` (register router)

- [ ] **Step 1: Write whitelists router**

```python
"""
MLI — Workspace whitelists CRUD.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import fetch_one, fetch_all, execute, _uuid, _now
from permissions import check_workspace_role

router = APIRouter(prefix="/api/workspaces/{workspace_id}/whitelists", tags=["whitelists"])


class WhitelistBody(BaseModel):
    name: str
    domains: list[str]


@router.get("")
async def list_whitelists(workspace_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor", "viewer", "client"])
    rows = await fetch_all(
        "SELECT * FROM workspace_whitelists WHERE workspace_id = ? ORDER BY created_at DESC",
        (workspace_id,),
    )
    # Parse domains_json
    for r in rows:
        r["domains"] = json.loads(r.get("domains_json", "[]"))
    return {"whitelists": rows}


@router.post("")
async def create_whitelist(workspace_id: str, body: WhitelistBody, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    wl_id = _uuid()
    now = _now()
    await execute(
        "INSERT INTO workspace_whitelists (id, workspace_id, name, domains_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (wl_id, workspace_id, body.name, json.dumps(body.domains), user["id"], now, now),
    )
    return await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (wl_id,))


@router.patch("/{whitelist_id}")
async def update_whitelist(workspace_id: str, whitelist_id: str, body: WhitelistBody, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    wl = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ? AND workspace_id = ?", (whitelist_id, workspace_id))
    if not wl:
        raise HTTPException(404, "Whitelist not found")
    await execute(
        "UPDATE workspace_whitelists SET name = ?, domains_json = ?, updated_at = ? WHERE id = ?",
        (body.name, json.dumps(body.domains), _now(), whitelist_id),
    )
    return await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (whitelist_id,))


@router.delete("/{whitelist_id}")
async def delete_whitelist(workspace_id: str, whitelist_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    await execute("DELETE FROM workspace_whitelists WHERE id = ? AND workspace_id = ?", (whitelist_id, workspace_id))
    return {"status": "deleted"}
```

- [ ] **Step 2: Register in main.py + commit**

```bash
# Add: from routers.whitelists import router as whitelists_router
# Add: app.include_router(whitelists_router)
git add backend/routers/whitelists.py backend/main.py && git commit -m "feat: add whitelists CRUD router"
```

---

### Task 4: Activity router

**Files:**
- Create: `backend/routers/activity.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write activity router**

```python
"""
MLI — Workspace activity log.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from db import fetch_all
from permissions import check_workspace_role

router = APIRouter(prefix="/api/workspaces/{workspace_id}/activity", tags=["activity"])


@router.get("")
async def get_activity(
    workspace_id: str,
    limit: int = Query(50, le=200),
    since: str | None = None,
    user: dict = Depends(get_current_user),
):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor", "viewer", "client"])

    if since:
        rows = await fetch_all(
            """
            SELECT a.*, u.name as user_name, u.email as user_email
            FROM workspace_activity a
            JOIN users u ON a.user_id = u.id
            WHERE a.workspace_id = ? AND a.created_at > ?
            ORDER BY a.created_at DESC LIMIT ?
            """,
            (workspace_id, since, limit),
        )
    else:
        rows = await fetch_all(
            """
            SELECT a.*, u.name as user_name, u.email as user_email
            FROM workspace_activity a
            JOIN users u ON a.user_id = u.id
            WHERE a.workspace_id = ?
            ORDER BY a.created_at DESC LIMIT ?
            """,
            (workspace_id, limit),
        )

    return {"activity": rows}
```

- [ ] **Step 2: Register in main.py + commit**

```bash
git add backend/routers/activity.py backend/main.py && git commit -m "feat: add workspace activity log router"
```

---

### Task 5: Scope existing audit router to workspaces

**Files:**
- Modify: `backend/routers/audit.py`
- Modify: `backend/routers/history.py`

This is the most complex task. The existing audit SSE endpoint at `POST /api/audit` needs to:
1. Accept `workspace_id` parameter
2. Require authentication (get_current_user)
3. Check editor/owner permission on the workspace
4. Save the audit to the DB (not just JSON file)
5. Log activity

The existing history router needs to:
1. Scope GET /api/audits to a workspace
2. Add auth
3. Keep backward compatibility (if no workspace_id, use user's first workspace)

- [ ] **Step 1: Read and modify audit.py**

Read `backend/routers/audit.py`. Add these changes:
- Import `get_current_user` from auth and `Depends` from fastapi
- Import `check_workspace_role` from permissions
- Import `execute, fetch_one` from db
- Add `workspace_id: str` query param to the audit endpoint
- After audit completes, save to DB via `execute(INSERT INTO audits ...)`
- Log activity

- [ ] **Step 2: Read and modify history.py**

Read `backend/routers/history.py`. Add:
- Auth dependency on all routes
- `workspace_id` query param on list endpoint
- Filter audits by workspace_id in DB query
- Keep backward compat: if no workspace_id, find user's first workspace

- [ ] **Step 3: Test end-to-end**

Start server, login, create workspace, run audit against workspace, list audits.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/audit.py backend/routers/history.py && git commit -m "feat: scope audit pipeline + history to workspaces with auth"
```

---

### Task 6: Export/Import router

**Files:**
- Create: `backend/routers/export.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write export router**

```python
"""
MLI — Export/Import for audits and workspaces.
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from auth import get_current_user
from db import fetch_one, fetch_all, execute, get_db, _uuid, _now
from permissions import check_workspace_role

router = APIRouter(tags=["export"])

SCREENSHOT_DIR = Path(__file__).parent.parent / "output" / "screenshots"


@router.get("/api/audits/{audit_id}/export")
async def export_audit(audit_id: str, user: dict = Depends(get_current_user)):
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(404, "Audit not found")
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor", "viewer", "client"])

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "audit_id": audit_id,
            "workspace_id": audit["workspace_id"],
            "client": audit["client_label"],
            "exported_at": _now(),
            "version": "1.0",
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("audit.json", json.dumps({
            "id": audit["id"],
            "client_label": audit["client_label"],
            "status": audit["status"],
            "domain_count": audit["domain_count"],
            "stats": json.loads(audit["stats_json"] or "{}"),
            "results": json.loads(audit["results_json"] or "[]"),
            "log": json.loads(audit["log_json"] or "[]"),
            "created_at": audit["created_at"],
            "completed_at": audit["completed_at"],
        }, indent=2, ensure_ascii=False))

        # Add screenshots if they exist
        ss_dir = SCREENSHOT_DIR / audit_id
        if ss_dir.exists():
            for f in ss_dir.iterdir():
                if f.is_file():
                    zf.write(f, f"screenshots/{f.name}")

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="audit-{audit_id[:8]}.zip"'},
    )


@router.get("/api/workspaces/{workspace_id}/export")
async def export_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    ws = await fetch_one("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
    if not ws:
        raise HTTPException(404)

    audits = await fetch_all("SELECT * FROM audits WHERE workspace_id = ?", (workspace_id,))
    whitelists = await fetch_all("SELECT * FROM workspace_whitelists WHERE workspace_id = ?", (workspace_id,))
    activity = await fetch_all("SELECT * FROM workspace_activity WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 500", (workspace_id,))

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "workspace": ws["name"],
            "slug": ws["slug"],
            "config": json.loads(ws["config_json"] or "{}"),
            "exported_at": _now(),
            "version": "1.0",
            "audit_count": len(audits),
            "whitelist_count": len(whitelists),
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("config.json", ws["config_json"] or "{}")

        for wl in whitelists:
            zf.writestr(f"whitelists/{wl['name']}.json", json.dumps({
                "id": wl["id"], "name": wl["name"],
                "domains": json.loads(wl["domains_json"] or "[]"),
                "created_at": wl["created_at"],
            }, indent=2))

        for a in audits:
            prefix = f"audits/{a['id']}/"
            zf.writestr(f"{prefix}audit.json", json.dumps({
                "id": a["id"], "client_label": a["client_label"],
                "status": a["status"], "domain_count": a["domain_count"],
                "stats": json.loads(a["stats_json"] or "{}"),
                "results": json.loads(a["results_json"] or "[]"),
                "log": json.loads(a["log_json"] or "[]"),
                "created_at": a["created_at"], "completed_at": a["completed_at"],
            }, indent=2, ensure_ascii=False))

        zf.writestr("activity.json", json.dumps([dict(a) for a in activity], indent=2, default=str))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="workspace-{ws[\"slug\"]}.zip"'},
    )


@router.post("/api/workspaces/{workspace_id}/import")
async def import_workspace(workspace_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])

    content = await file.read()
    buf = io.BytesIO(content)

    imported_audits = 0
    imported_whitelists = 0
    skipped = 0

    try:
        with zipfile.ZipFile(buf, "r") as zf:
            # Import audits
            for name in zf.namelist():
                if name.startswith("audits/") and name.endswith("/audit.json"):
                    data = json.loads(zf.read(name))
                    existing = await fetch_one("SELECT id FROM audits WHERE id = ?", (data["id"],))
                    if existing:
                        skipped += 1
                        continue
                    await execute(
                        """INSERT INTO audits (id, workspace_id, launched_by, client_label, status, domain_count,
                           stats_json, results_json, log_json, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                        (data["id"], workspace_id, user["id"], data.get("client_label", "Imported"),
                         data.get("status", "completed"), data.get("domain_count", 0),
                         json.dumps(data.get("stats", {})), json.dumps(data.get("results", [])),
                         json.dumps(data.get("log", [])), data.get("created_at", _now()), data.get("completed_at")),
                    )
                    imported_audits += 1

            # Import whitelists
            for name in zf.namelist():
                if name.startswith("whitelists/") and name.endswith(".json"):
                    data = json.loads(zf.read(name))
                    wl_id = data.get("id", _uuid())
                    existing = await fetch_one("SELECT id FROM workspace_whitelists WHERE id = ?", (wl_id,))
                    if existing:
                        skipped += 1
                        continue
                    now = _now()
                    await execute(
                        "INSERT INTO workspace_whitelists (id, workspace_id, name, domains_json, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                        (wl_id, workspace_id, data["name"], json.dumps(data.get("domains", [])), user["id"], now, now),
                    )
                    imported_whitelists += 1
    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid ZIP file")

    # Log activity
    from routers.workspaces import _log_activity
    await _log_activity(workspace_id, user["id"], "import_done", {
        "audits": imported_audits, "whitelists": imported_whitelists, "skipped": skipped
    })

    return {"imported_audits": imported_audits, "imported_whitelists": imported_whitelists, "skipped": skipped}
```

- [ ] **Step 2: Register in main.py + commit**

```bash
git add backend/routers/export.py backend/main.py && git commit -m "feat: add audit + workspace export/import ZIP endpoints"
```

---

### Task 7: Invite accept + tags endpoints

**Files:**
- Create: `backend/routers/invites.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write invites router**

```python
"""
MLI — Invite acceptance + audit tags.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from db import fetch_one, fetch_all, execute, _uuid, _now
from permissions import check_workspace_role

router = APIRouter(tags=["invites"])


@router.post("/api/invites/{token}/accept")
async def accept_invite(token: str, user: dict = Depends(get_current_user)):
    invite = await fetch_one("SELECT * FROM workspace_invites WHERE id = ?", (token,))
    if not invite:
        raise HTTPException(404, "Invite not found")
    if invite["accepted_at"]:
        raise HTTPException(400, "Already accepted")
    if invite["email"] != user["email"]:
        raise HTTPException(403, "Email mismatch")
    if datetime.fromisoformat(invite["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(410, "Invite expired")

    # Add as member
    existing = await fetch_one(
        "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
        (invite["workspace_id"], user["id"]),
    )
    if not existing:
        await execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (invite["workspace_id"], user["id"], invite["role"], _now()),
        )

    await execute("UPDATE workspace_invites SET accepted_at = ? WHERE id = ?", (_now(), token))

    ws = await fetch_one("SELECT id, name, slug FROM workspaces WHERE id = ?", (invite["workspace_id"],))
    return {"workspace": ws}


# ── Audit tags ──

@router.post("/api/audits/{audit_id}/tags")
async def add_tag(audit_id: str, tag: str, user: dict = Depends(get_current_user)):
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(404)
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor"])
    await execute("INSERT OR IGNORE INTO audit_tags (audit_id, tag) VALUES (?, ?)", (audit_id, tag))
    tags = await fetch_all("SELECT tag FROM audit_tags WHERE audit_id = ?", (audit_id,))
    return {"tags": [t["tag"] for t in tags]}


@router.delete("/api/audits/{audit_id}/tags/{tag}")
async def remove_tag(audit_id: str, tag: str, user: dict = Depends(get_current_user)):
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(404)
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor"])
    await execute("DELETE FROM audit_tags WHERE audit_id = ? AND tag = ?", (audit_id, tag))
    tags = await fetch_all("SELECT tag FROM audit_tags WHERE audit_id = ?", (audit_id,))
    return {"tags": [t["tag"] for t in tags]}
```

- [ ] **Step 2: Register in main.py + commit**

```bash
git add backend/routers/invites.py backend/main.py && git commit -m "feat: add invite accept + audit tags endpoints"
```

---

### Summary

After Phase 2, the backend has:
- Workspace CRUD with members/invites
- Whitelists CRUD per workspace
- Activity logging
- Audit + workspace export (ZIP)
- Workspace import (ZIP)
- Invite acceptance flow
- Audit tagging
- Permission checks on all routes

**Next:** Phase 3 adds the frontend (login page, workspace UI, sidebar rewrite).
