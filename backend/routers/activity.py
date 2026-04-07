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
