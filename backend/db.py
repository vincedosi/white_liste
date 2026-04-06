"""
MLI — SQLite database layer.
All tables use TEXT UUIDs and ISO timestamps.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

DB_PATH = Path(__file__).parent / "data" / "mli.db"

_db: aiosqlite.Connection | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        _db = await aiosqlite.connect(str(DB_PATH))
        _db.row_factory = aiosqlite.Row
        await _db.execute("PRAGMA journal_mode=WAL")
        await _db.execute("PRAGMA foreign_keys=ON")
    return _db


async def init_db() -> None:
    """Create all tables if they don't exist."""
    db = await get_db()

    await db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            logo_path TEXT,
            config_json TEXT NOT NULL DEFAULT '{}',
            onboarding_done INTEGER NOT NULL DEFAULT 0,
            created_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_members (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'editor',
            joined_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS audits (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            launched_by TEXT NOT NULL REFERENCES users(id),
            client_label TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            domain_count INTEGER NOT NULL DEFAULT 0,
            stats_json TEXT,
            results_json TEXT,
            log_json TEXT,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_tags (
            audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
            tag TEXT NOT NULL,
            PRIMARY KEY (audit_id, tag)
        );

        CREATE TABLE IF NOT EXISTS workspace_whitelists (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            domains_json TEXT NOT NULL DEFAULT '[]',
            created_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_activity (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id),
            action TEXT NOT NULL,
            detail_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_invites (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'editor',
            invited_by TEXT NOT NULL REFERENCES users(id),
            expires_at TEXT NOT NULL,
            accepted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS _migrations (
            key TEXT PRIMARY KEY,
            done_at TEXT NOT NULL
        );
    """)
    await db.commit()


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None


# ── Generic helpers ──

async def fetch_one(query: str, params: tuple = ()) -> dict | None:
    db = await get_db()
    cursor = await db.execute(query, params)
    row = await cursor.fetchone()
    return dict(row) if row else None


async def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    db = await get_db()
    cursor = await db.execute(query, params)
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]


async def execute(query: str, params: tuple = ()) -> None:
    db = await get_db()
    await db.execute(query, params)
    await db.commit()


async def execute_returning(query: str, params: tuple = ()) -> dict | None:
    db = await get_db()
    cursor = await db.execute(query, params)
    await db.commit()
    row = await cursor.fetchone()
    return dict(row) if row else None


async def migrate_json_audits() -> None:
    """Import existing output/history/*.json files into audits table.
    Creates a 'Default' workspace owned by the first admin user.
    Only runs once (checks _migrations table)."""
    import json as json_mod

    db = await get_db()
    cursor = await db.execute("SELECT key FROM _migrations WHERE key = 'migrate_json'")
    if await cursor.fetchone():
        return

    history_dir = Path(__file__).parent.parent / "output" / "history"
    if not history_dir.exists():
        await db.execute("INSERT INTO _migrations (key, done_at) VALUES (?, ?)", ("migrate_json", _now()))
        await db.commit()
        return

    json_files = list(history_dir.glob("*.json"))
    if not json_files:
        await db.execute("INSERT INTO _migrations (key, done_at) VALUES (?, ?)", ("migrate_json", _now()))
        await db.commit()
        return

    # Find first admin user as workspace owner
    admin = await fetch_one("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    if not admin:
        admin = await fetch_one("SELECT id FROM users LIMIT 1")
    if not admin:
        return

    owner_id = admin["id"]

    # Create Default workspace
    ws_id = _uuid()
    now = _now()
    await db.execute(
        "INSERT INTO workspaces (id, name, slug, config_json, onboarding_done, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ws_id, "Default", "default", "{}", 1, owner_id, now),
    )
    await db.execute(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
        (ws_id, owner_id, "owner", now),
    )

    # Also add non-admin users to Default workspace
    all_users = await fetch_all("SELECT id FROM users WHERE id != ?", (owner_id,))
    for u in all_users:
        await db.execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (ws_id, u["id"], "editor", now),
        )

    # Import each JSON audit
    imported = 0
    for json_path in json_files:
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json_mod.load(f)

            audit_id = data.get("audit_id") or json_path.stem
            client_label = data.get("client_name") or data.get("client") or "Imported"
            stats = data.get("stats", {})
            results = data.get("results", [])
            log = data.get("log", [])
            audit_date = data.get("audit_date", now)
            domain_count = stats.get("total", len(results))

            await db.execute(
                """INSERT OR IGNORE INTO audits
                (id, workspace_id, launched_by, client_label, status, domain_count,
                 stats_json, results_json, log_json, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    audit_id, ws_id, owner_id, client_label, "completed", domain_count,
                    json_mod.dumps(stats), json_mod.dumps(results), json_mod.dumps(log),
                    audit_date, audit_date,
                ),
            )
            imported += 1
        except Exception as e:
            print(f"[MLI] Skipping {json_path.name}: {e}")

    await db.execute("INSERT INTO _migrations (key, done_at) VALUES (?, ?)", ("migrate_json", _now()))
    await db.commit()
    print(f"[MLI] Migrated {imported} audits into workspace 'Default'")
