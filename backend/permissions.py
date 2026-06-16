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
