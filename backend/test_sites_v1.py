import asyncio, sys
sys.path.insert(0, '.')
import db as db_mod
from pathlib import Path

db_mod.DB_PATH = Path('data/test_sites_v1.db')
db_mod._db = None

from db import init_db, get_db


async def test_column_added():
    # repart d'une base vierge
    from db import close_db
    await close_db()
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    dbc = await get_db()
    cur = await dbc.execute("PRAGMA table_info(domains)")
    cols = [r[1] for r in await cur.fetchall()]
    assert "last_ad_surface_pct" in cols, cols
    print("OK test_column_added")


async def test_upsert_writes_ad_surface_pct():
    from db import close_db
    await close_db()
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, fetch_one
    await upsert_domain("exemple.fr", {
        "score": 5.0, "ad_count": 3, "ad_surface_pct": 62.5,
        "health": "ok", "ads_txt": 1, "audit_id": "a1",
    })
    row = await fetch_one("SELECT last_ad_surface_pct FROM domains WHERE domain = ?", ("exemple.fr",))
    assert row["last_ad_surface_pct"] == 62.5, row
    print("OK test_upsert_writes_ad_surface_pct")


async def test_backfill_sets_pct_when_present():
    import json
    from db import close_db
    await close_db()
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, fetch_one, get_db, backfill_ad_surface_pct
    # domaine sans pct (simule une donnée ancienne)
    await upsert_domain("ancien.fr", {"score": 4.0, "audit_id": "old1"})
    dbc = await get_db()
    # Insert dummy FK parents (users + workspaces) to satisfy FK constraints
    await dbc.execute(
        "INSERT OR IGNORE INTO users (id, email, password_hash, name, role, created_at) "
        "VALUES ('u1', 'test@test.com', 'x', 'Test', 'admin', '2026-01-01T00:00:00')")
    await dbc.execute(
        "INSERT OR IGNORE INTO workspaces (id, name, slug, config_json, onboarding_done, created_by, created_at) "
        "VALUES ('w1', 'TestWS', 'test-ws', '{}', 0, 'u1', '2026-01-01T00:00:00')")
    # audit contenant le pct pour ce domaine
    results = json.dumps([{"domain": "ancien.fr",
                           "attention": {"details": {"ad_surface_pct": 41.0}}}])
    await dbc.execute(
        "INSERT INTO audits (id, workspace_id, launched_by, client_label, status, results_json, created_at) "
        "VALUES ('au1', 'w1', 'u1', 'TestLabel', 'completed', ?, '2026-01-01T00:00:00')", (results,))
    await dbc.commit()
    await backfill_ad_surface_pct()
    row = await fetch_one("SELECT last_ad_surface_pct FROM domains WHERE domain = ?", ("ancien.fr",))
    assert row["last_ad_surface_pct"] == 41.0, row
    print("OK test_backfill_sets_pct_when_present")


if __name__ == "__main__":
    asyncio.run(test_column_added())
    asyncio.run(test_upsert_writes_ad_surface_pct())
    asyncio.run(test_backfill_sets_pct_when_present())
