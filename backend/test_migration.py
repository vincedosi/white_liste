import asyncio
import sys
sys.path.insert(0, '.')

import db as db_mod
from pathlib import Path

db_mod.DB_PATH = Path('data/test_migrate3.db')
db_mod._db = None

from db import init_db, migrate_json_audits, fetch_all
from auth import seed_users


async def test():
    await init_db()
    await seed_users()
    await migrate_json_audits()

    audits = await fetch_all('SELECT id, client_label, status, domain_count FROM audits')
    print(f'Migrated {len(audits)} audits')
    for a in audits[:3]:
        print(f'  - {a["client_label"]}: {a["domain_count"]} domains ({a["status"]})')

    ws = await fetch_all('SELECT id, name, slug FROM workspaces')
    print(f'Workspaces: {[(w["name"], w["slug"]) for w in ws]}')

    print('TEST COMPLETE')


asyncio.run(test())
