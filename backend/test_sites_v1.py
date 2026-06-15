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


async def test_list_filters_pct_and_stale():
    from db import close_db
    await close_db()
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, get_db, close_db
    from routers.sites import list_sites
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    await upsert_domain("calme.fr", {"score": 9.0, "ad_surface_pct": 10.0, "audit_id": "x"})
    await upsert_domain("probleme.fr", {"score": 2.0, "ad_surface_pct": 70.0, "audit_id": "x"})
    # rendre "calme.fr" périmé, "probleme.fr" récent
    dbc = await get_db()
    await dbc.execute("UPDATE domains SET last_audit_date = '2000-01-01T00:00:00' WHERE domain='calme.fr'")
    await dbc.execute("UPDATE domains SET last_audit_date = ? WHERE domain='probleme.fr'", (now_iso,))
    await dbc.commit()

    _defaults = dict(page=1, per_page=100, sort="domain", order="asc",
                     search="", health="", country="", ads_txt="",
                     score_min=None, score_max=None, category="",
                     ad_pct_min=None, ad_pct_max=None, stale_days=None)

    res = await list_sites(**{**_defaults, "ad_pct_min": 50.0, "user": {"id": "u"}})
    names = {s["domain"] for s in res["sites"]}
    assert names == {"probleme.fr"}, names

    res2 = await list_sites(**{**_defaults, "stale_days": 14, "user": {"id": "u"}})
    names2 = {s["domain"] for s in res2["sites"]}
    assert "calme.fr" in names2 and "probleme.fr" not in names2, names2
    await close_db()
    print("OK test_list_filters_pct_and_stale")


async def test_stats_aggregates():
    from db import close_db
    await close_db()
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    from db import upsert_domain, get_db
    from routers.sites import sites_stats
    await upsert_domain("a.fr", {"score": 9.0, "ad_surface_pct": 20.0, "audit_id": "x"})
    await upsert_domain("b.fr", {"score": 2.0, "ad_surface_pct": 60.0, "audit_id": "x"})
    dbc = await get_db()
    await dbc.execute("UPDATE domains SET last_audit_date='2000-01-01T00:00:00' WHERE domain='a.fr'")
    await dbc.commit()
    s = await sites_stats(user={"id": "u"})
    assert s["problematic"] == 1, s
    assert s["stale"] >= 1, s
    assert s["avg_ad_surface_pct"] is not None and 39.0 < s["avg_ad_surface_pct"] < 41.0, s
    await close_db()
    print("OK test_stats_aggregates")


if __name__ == "__main__":
    asyncio.run(test_column_added())
    asyncio.run(test_upsert_writes_ad_surface_pct())
    asyncio.run(test_backfill_sets_pct_when_present())
    asyncio.run(test_list_filters_pct_and_stale())
    asyncio.run(test_stats_aggregates())
