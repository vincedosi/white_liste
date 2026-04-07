"""
MLI — Workspace CRUD + members + invites.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Body

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
async def create_workspace(body: dict = Body(...), user: dict = Depends(get_current_user)):
    name = body.get("name")
    if not name:
        raise HTTPException(400, "name required")
    slug = _slugify(name)
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
    return await fetch_one("SELECT * FROM workspaces WHERE id = ?", (ws_id,))


@router.get("/{workspace_id}")
async def get_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    ws = await get_workspace_or_404(workspace_id)
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor", "viewer", "client"])
    members = await fetch_all(
        "SELECT wm.user_id, u.email, u.name, wm.role, wm.joined_at FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = ?",
        (workspace_id,),
    )
    audit_count = await fetch_one("SELECT COUNT(*) as c FROM audits WHERE workspace_id = ?", (workspace_id,))
    ws_dict = dict(ws)
    ws_dict["members"] = members
    ws_dict["audit_count"] = audit_count["c"] if audit_count else 0
    return ws_dict


@router.patch("/{workspace_id}")
async def update_workspace(workspace_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    updates, params = [], []
    if "name" in body:
        updates.append("name = ?"); params.append(body["name"])
    if "config_json" in body:
        updates.append("config_json = ?"); params.append(json.dumps(body["config_json"]) if isinstance(body["config_json"], dict) else body["config_json"])
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
async def invite_member(workspace_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    email = body.get("email")
    role = body.get("role", "editor")
    if not email:
        raise HTTPException(400, "email required")
    if role not in ("editor", "viewer", "client"):
        raise HTTPException(400, "Invalid role")
    invite_id = _uuid()
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await execute(
        "INSERT INTO workspace_invites (id, workspace_id, email, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        (invite_id, workspace_id, email, role, user["id"], expires),
    )
    await _log_activity(workspace_id, user["id"], "member_invited", {"email": email, "role": role})
    return {"invite_id": invite_id, "invite_url": f"/invite/{invite_id}"}


@router.patch("/{workspace_id}/members/{member_user_id}")
async def update_member_role(workspace_id: str, member_user_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    role = body.get("role")
    if not role or role not in ("owner", "editor", "viewer", "client"):
        raise HTTPException(400, "Invalid role")
    await execute("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?", (role, workspace_id, member_user_id))
    await _log_activity(workspace_id, user["id"], "member_role_changed", {"target": member_user_id, "role": role})
    return {"status": "updated"}


@router.delete("/{workspace_id}/members/{member_user_id}")
async def remove_member(workspace_id: str, member_user_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])
    if member_user_id == user["id"]:
        raise HTTPException(400, "Cannot remove yourself")
    await execute("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", (workspace_id, member_user_id))
    await _log_activity(workspace_id, user["id"], "member_removed", {"target": member_user_id})
    return {"status": "removed"}
