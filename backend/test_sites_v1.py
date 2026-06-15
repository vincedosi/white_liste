import asyncio, sys
sys.path.insert(0, '.')
import db as db_mod
from pathlib import Path

db_mod.DB_PATH = Path('data/test_sites_v1.db')
db_mod._db = None

from db import init_db, get_db


async def test_column_added():
    # repart d'une base vierge
    if db_mod.DB_PATH.exists():
        db_mod.DB_PATH.unlink()
    db_mod._db = None
    await init_db()
    dbc = await get_db()
    cur = await dbc.execute("PRAGMA table_info(domains)")
    cols = [r[1] for r in await cur.fetchall()]
    assert "last_ad_surface_pct" in cols, cols
    print("OK test_column_added")


if __name__ == "__main__":
    asyncio.run(test_column_added())
