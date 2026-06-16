"""
MLI — Workspace whitelists CRUD.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Body

from auth import get_current_user
from db import fetch_one, fetch_all, execute, _uuid, _now
from permissions import check_workspace_role

router = APIRouter(prefix="/api/workspaces/{workspace_id}/whitelists", tags=["whitelists"])


@router.get("")
async def list_whitelists(workspace_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor", "viewer", "client"])
    rows = await fetch_all(
        "SELECT * FROM workspace_whitelists WHERE workspace_id = ? ORDER BY created_at DESC",
        (workspace_id,),
    )
    for r in rows:
        r["domains"] = json.loads(r.get("domains_json", "[]"))
    return {"whitelists": rows}


@router.post("")
async def create_whitelist(workspace_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    name = body.get("name")
    domains = body.get("domains", [])
    if not name:
        raise HTTPException(400, "name required")
    wl_id = _uuid()
    now = _now()
    await execute(
        "INSERT INTO workspace_whitelists (id, workspace_id, name, domains_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (wl_id, workspace_id, name, json.dumps(domains), user["id"], now, now),
    )
    row = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (wl_id,))
    row["domains"] = json.loads(row.get("domains_json", "[]"))
    return row


@router.patch("/{whitelist_id}")
async def update_whitelist(workspace_id: str, whitelist_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    wl = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ? AND workspace_id = ?", (whitelist_id, workspace_id))
    if not wl:
        raise HTTPException(404, "Whitelist not found")
    name = body.get("name", wl["name"])
    domains = body.get("domains")
    domains_json = json.dumps(domains) if domains is not None else wl["domains_json"]
    await execute(
        "UPDATE workspace_whitelists SET name = ?, domains_json = ?, updated_at = ? WHERE id = ?",
        (name, domains_json, _now(), whitelist_id),
    )
    row = await fetch_one("SELECT * FROM workspace_whitelists WHERE id = ?", (whitelist_id,))
    row["domains"] = json.loads(row.get("domains_json", "[]"))
    return row


@router.delete("/{whitelist_id}")
async def delete_whitelist(workspace_id: str, whitelist_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    await execute("DELETE FROM workspace_whitelists WHERE id = ? AND workspace_id = ?", (whitelist_id, workspace_id))
    return {"status": "deleted"}
