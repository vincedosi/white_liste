"""
MLI — Invite acceptance + audit tags.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Body

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


@router.post("/api/audits/{audit_id}/tags")
async def add_tag(audit_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(404)
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor"])
    tag = body.get("tag", "")
    if not tag:
        raise HTTPException(400, "tag required")
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
