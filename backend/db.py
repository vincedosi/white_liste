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

        CREATE TABLE IF NOT EXISTS domains (
            id TEXT PRIMARY KEY,
            domain TEXT UNIQUE NOT NULL,
            editorial_status TEXT NOT NULL DEFAULT 'pending',
            brand_safety TEXT,
            brand_safety_source TEXT,
            category_iab TEXT,
            category_source TEXT,
            notes TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            last_score REAL,
            last_score_trend TEXT,
            last_health TEXT,
            last_ads_txt INTEGER,
            last_ad_count INTEGER,
            last_load_time_ms INTEGER,
            last_trackers INTEGER,
            last_adtech_json TEXT,
            last_country TEXT,
            last_lang TEXT,
            last_tld TEXT,
            last_audit_id TEXT,
            last_audit_date TEXT,
            audit_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS _migrations (
            key TEXT PRIMARY KEY,
            done_at TEXT NOT NULL
        );
    """)
    await db.commit()
    await _ensure_domain_columns()


async def _ensure_domain_columns() -> None:
    """Additive, idempotent column migrations for the domains table."""
    db = await get_db()
    cur = await db.execute("PRAGMA table_info(domains)")
    existing = {r[1] for r in await cur.fetchall()}
    additions = {
        "last_ad_surface_pct": "REAL",
    }
    for col, decl in additions.items():
        if col not in existing:
            await db.execute(f"ALTER TABLE domains ADD COLUMN {col} {decl}")
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


def _editorial_status_after_audit(prev_status: str | None, suspect_blocked: bool) -> str:
    """Décide l'editorial_status après un audit.
    - Ne JAMAIS écraser une validation humaine ('validated').
    - Garde-fou : si la page a de l'ad-tech mais 0 requête pub réseau (suspect_blocked),
      le score 'propre' n'est pas fiable -> 'to_review' (cf. is_suspect_blocked dans pw_worker).
    - Sinon, on conserve le statut précédent (par défaut 'pending')."""
    if prev_status == "validated":
        return "validated"
    if suspect_blocked:
        return "to_review"
    return prev_status or "pending"


async def upsert_domain(domain_name: str, audit_data: dict) -> None:
    """Insert or update a domain in the global domains table after an audit."""
    import json as json_mod
    db = await get_db()
    existing = await fetch_one(
        "SELECT id, last_score, editorial_status FROM domains WHERE domain = ?", (domain_name,)
    )

    new_score = audit_data.get("score")
    suspect_blocked = bool(audit_data.get("suspect_blocked"))
    now = _now()

    if existing:
        old_score = existing["last_score"]
        if old_score is None or new_score is None:
            trend = "stable"
        elif new_score > old_score:
            trend = "up"
        elif new_score < old_score:
            trend = "down"
        else:
            trend = "stable"

        editorial_status = _editorial_status_after_audit(
            existing["editorial_status"], suspect_blocked
        )
        await db.execute(
            """UPDATE domains SET
                last_score = ?, last_score_trend = ?, last_health = ?,
                last_ads_txt = ?, last_ad_count = ?, last_load_time_ms = ?,
                last_trackers = ?, last_adtech_json = ?,
                last_country = ?, last_lang = ?, last_tld = ?,
                last_audit_id = ?, last_audit_date = ?, editorial_status = ?,
                audit_count = audit_count + 1, updated_at = ?
            WHERE id = ?""",
            (
                new_score, trend, audit_data.get("health"),
                audit_data.get("ads_txt"), audit_data.get("ad_count"),
                audit_data.get("load_time_ms"), audit_data.get("trackers"),
                json_mod.dumps(audit_data.get("adtech")) if audit_data.get("adtech") else None,
                audit_data.get("country"), audit_data.get("lang"), audit_data.get("tld"),
                audit_data.get("audit_id"), audit_data.get("audit_date"), editorial_status,
                now, existing["id"],
            ),
        )
    else:
        editorial_status = "to_review" if suspect_blocked else "pending"
        await db.execute(
            """INSERT INTO domains
            (id, domain, editorial_status, last_score, last_score_trend, last_health,
             last_ads_txt, last_ad_count, last_load_time_ms, last_trackers, last_adtech_json,
             last_country, last_lang, last_tld, last_audit_id, last_audit_date,
             audit_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'stable', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
            (
                _uuid(), domain_name, editorial_status, new_score, audit_data.get("health"),
                audit_data.get("ads_txt"), audit_data.get("ad_count"),
                audit_data.get("load_time_ms"), audit_data.get("trackers"),
                json_mod.dumps(audit_data.get("adtech")) if audit_data.get("adtech") else None,
                audit_data.get("country"), audit_data.get("lang"), audit_data.get("tld"),
                audit_data.get("audit_id"), audit_data.get("audit_date"),
                now, now,
            ),
        )
    await db.commit()


async def backfill_domains_from_audits() -> None:
    """Backfill domains table from existing audit results_json (one-time migration)."""
    import json as json_mod

    db = await get_db()

    # Check if migration already ran
    already = await fetch_one("SELECT key FROM _migrations WHERE key = ?", ("backfill_domains_v1",))
    if already:
        return

    audits = await fetch_all(
        "SELECT id, results_json, created_at FROM audits WHERE results_json IS NOT NULL ORDER BY created_at ASC"
    )

    backfilled = 0
    for audit_row in audits:
        audit_id = audit_row["id"]
        audit_date = audit_row["created_at"]

        try:
            results = json_mod.loads(audit_row["results_json"])
        except Exception:
            continue

        if not isinstance(results, list):
            continue

        for site in results:
            if not isinstance(site, dict):
                continue

            domain_name = site.get("domain", "")
            if not domain_name:
                continue

            # Skip if domain already exists
            existing = await fetch_one("SELECT id FROM domains WHERE domain = ?", (domain_name,))
            if existing:
                continue

            # Safely extract nested dicts
            attention = site.get("attention") if isinstance(site.get("attention"), dict) else {}
            health = site.get("health") if isinstance(site.get("health"), dict) else {}
            ads_txt = site.get("ads_txt") if isinstance(site.get("ads_txt"), dict) else {}
            geo = site.get("geo") if isinstance(site.get("geo"), dict) else {}
            adtech = site.get("adtech") if isinstance(site.get("adtech"), dict) else {}

            score = attention.get("score") if attention else None
            health_status = health.get("status") if health else None
            ads_txt_present = 1 if ads_txt.get("present") else 0
            ad_count = (
                attention.get("raw_ad_count")
                or attention.get("ad_count")
                or 0
            ) if attention else 0
            load_time_ms = health.get("response_time_ms") or 0 if health else 0
            country = geo.get("country") or "" if geo else ""
            lang = geo.get("content_lang") or "" if geo else ""
            tld = geo.get("tld") or "" if geo else ""

            audit_data = {
                "score": score,
                "health": health_status,
                "ads_txt": ads_txt_present,
                "ad_count": ad_count,
                "load_time_ms": load_time_ms,
                "trackers": 0,
                "adtech": adtech,
                "country": country,
                "lang": lang,
                "tld": tld,
                "audit_id": audit_id,
                "audit_date": audit_date,
            }

            await upsert_domain(domain_name, audit_data)
            backfilled += 1

    await db.execute(
        "INSERT INTO _migrations (key, done_at) VALUES (?, ?)",
        ("backfill_domains_v1", _now()),
    )
    await db.commit()
    print(f"[MLI] Backfilled {backfilled} domains from audit history")
