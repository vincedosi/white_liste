"""
MLI — JWT authentication.
Seed users from seed.json, issue HS256 tokens, FastAPI dependency.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request

from db import fetch_one, fetch_all, execute, get_db, _uuid, _now

SECRET_KEY = os.environ.get("MLI_JWT_SECRET", "mli-dev-secret-change-in-prod")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

SEED_PATH = Path(__file__).parent / "seed.json"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def _get_default_user() -> dict | None:
    user = await fetch_one(
        "SELECT * FROM users WHERE email = 'admin@dentsu.com'",
        (),
    )
    if user:
        return user
    user = await fetch_one(
        "SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1",
        (),
    )
    if user:
        return user
    return await fetch_one(
        "SELECT * FROM users ORDER BY created_at ASC LIMIT 1",
        (),
    )


async def get_current_user(request: Request) -> dict:
    """Authentifie via JWT : header `Authorization: Bearer <token>` ou, pour le
    SSE (qui ne peut pas toujours poser de header), le query param `?token=`.
    401 si absent / invalide / expiré."""
    token = None
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
    if not token:
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(token)  # lève 401 si invalide/expiré
    user = await fetch_one("SELECT * FROM users WHERE id = ?", (payload.get("sub"),))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def ensure_default_user_in_all_workspaces() -> None:
    """Auth disabled — make sure the default user is a member of every workspace
    so that historical data (audits, whitelists, activity) is visible."""
    user = await _get_default_user()
    if not user:
        return
    workspaces = await fetch_all("SELECT id FROM workspaces", ())
    if not workspaces:
        return
    added = 0
    for ws in workspaces:
        existing = await fetch_one(
            "SELECT 1 as x FROM workspace_members WHERE workspace_id = ? AND user_id = ?",
            (ws["id"], user["id"]),
        )
        if existing:
            continue
        await execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (ws["id"], user["id"], "owner", _now()),
        )
        added += 1
    if added:
        print(f"[MLI] Auth disabled: added default user to {added} workspaces")


async def seed_users() -> None:
    """Load users from seed.json on first boot."""
    db = await get_db()
    cursor = await db.execute("SELECT key FROM _migrations WHERE key = 'seed_users'")
    if await cursor.fetchone():
        return

    if not SEED_PATH.exists():
        return

    with open(SEED_PATH, "r", encoding="utf-8") as f:
        users = json.load(f)

    for u in users:
        user_id = _uuid()
        pw_hash = hash_password(u["password"])
        await db.execute(
            "INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, u["email"], pw_hash, u["name"], u.get("role", "user"), _now()),
        )

    await db.execute(
        "INSERT INTO _migrations (key, done_at) VALUES (?, ?)",
        ("seed_users", _now()),
    )
    await db.commit()
    print(f"[MLI] Seeded {len(users)} users from seed.json")
