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

from db import fetch_one, execute, get_db, _uuid, _now

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


async def get_current_user(request: Request) -> dict:
    """Extract and validate JWT from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = auth[7:]
    payload = decode_token(token)
    user = await fetch_one("SELECT * FROM users WHERE id = ?", (payload["sub"],))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


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
