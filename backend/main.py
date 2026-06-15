"""
MLI — FastAPI Backend Entry Point

Usage:
    cd backend
    uvicorn main:app --reload --port 8000
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import audit, history, health
from db import init_db, close_db
from auth import seed_users, ensure_default_user_in_all_workspaces
from routers.auth_routes import router as auth_router
from routers.workspaces import router as workspaces_router
from routers.whitelists import router as whitelists_router
from routers.activity import router as activity_router
from routers.export import router as export_router
from routers.invites import router as invites_router
from routers.admin import router as admin_router
from routers.sites import router as sites_router

app = FastAPI(
    title="MLI - Media List Intelligence",
    description="API for automated whitelist auditing",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Lifecycle ────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await init_db()
    await seed_users()
    from db import migrate_json_audits
    await migrate_json_audits()
    from db import backfill_domains_from_audits
    await backfill_domains_from_audits()
    from db import backfill_ad_surface_pct
    await backfill_ad_surface_pct()
    await ensure_default_user_in_all_workspaces()


@app.on_event("shutdown")
async def shutdown():
    await close_db()


# ── Routers ──────────────────────────────────────────────
app.include_router(health.router, tags=["health"])
app.include_router(audit.router, tags=["audit"])
app.include_router(history.router, tags=["history"])
app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(whitelists_router)
app.include_router(activity_router)
app.include_router(export_router)
app.include_router(invites_router)
app.include_router(admin_router)
app.include_router(sites_router)

# ── Static files for screenshots ─────────────────────────
SCREENSHOTS_DIR = Path(__file__).parent.parent / "output" / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/static/screenshots",
    StaticFiles(directory=str(SCREENSHOTS_DIR)),
    name="screenshots",
)


@app.get("/")
async def root():
    return {
        "name": "MLI - Media List Intelligence API",
        "version": "1.0.0",
        "docs": "/docs",
    }
