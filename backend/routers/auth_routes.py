"""
MLI — Auth routes: login + me.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import verify_password, create_token, get_current_user
from db import fetch_one, fetch_all

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(req: LoginRequest):
    user = await fetch_one("SELECT * FROM users WHERE email = ?", (req.email,))
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user["id"], user["email"], user["role"])

    return {
        "access_token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    workspaces = await fetch_all(
        """
        SELECT w.id, w.name, w.slug, wm.role as member_role
        FROM workspaces w
        JOIN workspace_members wm ON w.id = wm.workspace_id
        WHERE wm.user_id = ?
        ORDER BY w.name
        """,
        (user["id"],),
    )

    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
        "workspaces": workspaces,
    }
