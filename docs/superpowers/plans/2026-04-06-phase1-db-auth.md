# Phase 1 — SQLite Database + JWT Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace file-based storage with SQLite and add JWT authentication with seeded users.

**Architecture:** SQLite via aiosqlite with async CRUD helpers. JWT HS256 tokens with FastAPI dependency injection. Seed file for initial users. Auto-migration of existing JSON audits on first boot.

**Tech Stack:** Python 3.13, FastAPI, aiosqlite, pyjwt, bcrypt, SQLite3

**Spec:** `docs/superpowers/specs/2026-04-06-workspace-auth-design.md` (sections 2, 3, 4)

---

### Task 1: Install dependencies + create data directory

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/data/.gitkeep`
- Modify: `.gitignore`

- [ ] **Step 1: Add dependencies to requirements.txt**

Add these lines to `backend/requirements.txt`:

```
aiosqlite>=0.19.0
pyjwt>=2.8.0
bcrypt>=4.1.0
```

- [ ] **Step 2: Create data directory**

```bash
mkdir -p backend/data
touch backend/data/.gitkeep
```

- [ ] **Step 3: Add data/mli.db to .gitignore**

Add to the project root `.gitignore`:

```
backend/data/mli.db
```

- [ ] **Step 4: Install dependencies**

```bash
cd backend && pip install -r requirements.txt
```

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/data/.gitkeep .gitignore
git commit -m "chore: add aiosqlite, pyjwt, bcrypt deps + data dir"
```

---

### Task 2: Create database module (db.py)

**Files:**
- Create: `backend/db.py`
- Test: manual — `python -c "import asyncio; from db import init_db; asyncio.run(init_db())"`

- [ ] **Step 1: Write db.py with schema creation**

Create `backend/db.py`:

```python
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
    if _db is None or not _db.is_alive:
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
```

- [ ] **Step 2: Test table creation**

```bash
cd backend && python -c "
import asyncio
from db import init_db, get_db, DB_PATH
async def test():
    await init_db()
    db = await get_db()
    cursor = await db.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\")
    tables = [r[0] for r in await cursor.fetchall()]
    print('Tables:', tables)
    assert 'users' in tables
    assert 'workspaces' in tables
    assert 'audits' in tables
    print('OK — DB at', DB_PATH)
asyncio.run(test())
"
```

Expected: `Tables: ['_migrations', 'audit_tags', 'audits', 'users', 'workspace_activity', 'workspace_invites', 'workspace_members', 'workspace_whitelists', 'workspaces']`

- [ ] **Step 3: Commit**

```bash
git add backend/db.py
git commit -m "feat: add SQLite database layer with 8-table schema"
```

---

### Task 3: Create auth module (auth.py)

**Files:**
- Create: `backend/auth.py`

- [ ] **Step 1: Write auth.py**

Create `backend/auth.py`:

```python
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


# ── Password helpers ──

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


# ── JWT helpers ──

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


# ── FastAPI dependency ──

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


# ── Seed ──

async def seed_users() -> None:
    """Load users from seed.json on first boot."""
    db = await get_db()
    cursor = await db.execute("SELECT key FROM _migrations WHERE key = 'seed_users'")
    if await cursor.fetchone():
        return  # Already seeded

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
```

- [ ] **Step 2: Create seed.json**

Create `backend/seed.json`:

```json
[
  {
    "email": "admin@dentsu.com",
    "password": "admin123",
    "name": "Admin Dentsu",
    "role": "admin"
  },
  {
    "email": "trader@dentsu.com",
    "password": "trader123",
    "name": "Trader Demo",
    "role": "user"
  }
]
```

- [ ] **Step 3: Test seed + auth flow**

```bash
cd backend && python -c "
import asyncio
from db import init_db
from auth import seed_users, hash_password, verify_password, create_token, decode_token
from db import fetch_all

async def test():
    await init_db()
    await seed_users()
    users = await fetch_all('SELECT id, email, name, role FROM users')
    print('Users:', [(u['email'], u['role']) for u in users])
    assert len(users) == 2

    # Test password
    h = hash_password('test123')
    assert verify_password('test123', h)
    assert not verify_password('wrong', h)

    # Test JWT
    token = create_token(users[0]['id'], users[0]['email'], users[0]['role'])
    payload = decode_token(token)
    assert payload['sub'] == users[0]['id']
    print('OK — auth works')

asyncio.run(test())
"
```

Expected: `Users: [('admin@dentsu.com', 'admin'), ('trader@dentsu.com', 'user')]` then `OK — auth works`

- [ ] **Step 4: Commit**

```bash
git add backend/auth.py backend/seed.json
git commit -m "feat: add JWT auth module with bcrypt + user seeding"
```

---

### Task 4: Create auth router

**Files:**
- Create: `backend/routers/auth_routes.py`

- [ ] **Step 1: Write auth router**

Create `backend/routers/auth_routes.py`:

```python
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


class LoginResponse(BaseModel):
    access_token: str
    user: dict


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
    # Get user's workspaces
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/routers/auth_routes.py
git commit -m "feat: add /api/auth/login and /api/auth/me routes"
```

---

### Task 5: Wire DB init + auth into main.py

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add DB lifecycle + auth router to main.py**

In `backend/main.py`, add the imports at the top:

```python
from db import init_db, close_db
from auth import seed_users
from routers.auth_routes import router as auth_router
```

Add the startup/shutdown events after the app is created:

```python
@app.on_event("startup")
async def startup():
    await init_db()
    await seed_users()


@app.on_event("shutdown")
async def shutdown():
    await close_db()
```

Add the router registration alongside existing routers:

```python
app.include_router(auth_router)
```

- [ ] **Step 2: Test the server starts**

```bash
cd backend && python -m uvicorn main:app --port 8001 &
sleep 3
curl -s http://localhost:8001/api/health
curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dentsu.com","password":"admin123"}'
```

Expected: Health returns `{"status":"ok"}`. Login returns `{"access_token":"eyJ...", "user":{"id":"...","email":"admin@dentsu.com",...}}`.

- [ ] **Step 3: Test /me with token**

```bash
TOKEN=$(curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dentsu.com","password":"admin123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s http://localhost:8001/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Expected: Returns `{"user":{...},"workspaces":[]}` (empty workspaces — none created yet).

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: wire SQLite init + auth router into FastAPI app"
```

---

### Task 6: Migrate existing JSON audits to SQLite

**Files:**
- Modify: `backend/db.py` (add `migrate_json_audits` function)

- [ ] **Step 1: Add migration function to db.py**

Append to `backend/db.py`:

```python
async def migrate_json_audits() -> None:
    """Import existing output/history/*.json files into audits table.
    Creates a 'Default' workspace owned by the first admin user.
    Only runs once (checks _migrations table)."""
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
        return  # No users yet — skip migration

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
            import json as json_mod
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
```

- [ ] **Step 2: Call migration in main.py startup**

In `backend/main.py`, update the startup event:

```python
@app.on_event("startup")
async def startup():
    await init_db()
    await seed_users()
    from db import migrate_json_audits
    await migrate_json_audits()
```

- [ ] **Step 3: Test migration**

```bash
cd backend && rm -f data/mli.db && python -c "
import asyncio
from db import init_db, migrate_json_audits, fetch_all
from auth import seed_users

async def test():
    await init_db()
    await seed_users()
    await migrate_json_audits()
    audits = await fetch_all('SELECT id, client_label, status, domain_count FROM audits')
    print(f'Migrated {len(audits)} audits')
    for a in audits[:3]:
        print(f'  - {a[\"client_label\"]}: {a[\"domain_count\"]} domains ({a[\"status\"]})')
    ws = await fetch_all('SELECT id, name, slug FROM workspaces')
    print(f'Workspaces: {[(w[\"name\"], w[\"slug\"]) for w in ws]}')

asyncio.run(test())
"
```

Expected: Shows migrated audit count + Default workspace.

- [ ] **Step 4: Commit**

```bash
git add backend/db.py backend/main.py
git commit -m "feat: auto-migrate existing JSON audits to SQLite on first boot"
```

---

### Task 7: Add new Pydantic models

**Files:**
- Modify: `backend/models.py`

- [ ] **Step 1: Add workspace/auth models to models.py**

Append these classes to `backend/models.py`:

```python
# ── Workspace & Auth models ──────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class WorkspaceConfig(BaseModel):
    modules: AuditModules = AuditModules()
    mfa_threshold: float = 4.0
    mistral_key_encrypted: str | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_path: str | None = None
    config: WorkspaceConfig = WorkspaceConfig()
    onboarding_done: bool = False
    created_by: str
    created_at: str
    member_count: int = 0
    audit_count: int = 0


class WorkspaceCreateRequest(BaseModel):
    name: str
    slug: str | None = None


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = None
    config: WorkspaceConfig | None = None


class MemberOut(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    joined_at: str


class InviteRequest(BaseModel):
    email: str
    role: str = "editor"


class WhitelistOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    domains: list[str] = []
    created_by: str
    created_at: str
    updated_at: str


class WhitelistCreateRequest(BaseModel):
    name: str
    domains: list[str]


class ActivityOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    user_name: str | None = None
    action: str
    detail: dict | None = None
    created_at: str
```

- [ ] **Step 2: Commit**

```bash
git add backend/models.py
git commit -m "feat: add Pydantic models for users, workspaces, members, whitelists, activity"
```

---

### Summary

After completing all 7 tasks, you have:
- SQLite database with 8 tables + migration tracking
- JWT auth (login, token verification, FastAPI dependency)
- 2 seeded users (admin + trader)
- Auto-migration of existing JSON audit history into a "Default" workspace
- Pydantic models for all new entities
- Auth routes wired into the FastAPI app

**Next:** Phase 2 will add workspace CRUD, scoped audit routes, whitelists, activity logging, and export/import.
