"""
MLI — Audit history endpoints.
List, retrieve, and delete saved audit reports.
"""
from __future__ import annotations

import json
from pathlib import Path

from typing import Optional
from pydantic import BaseModel

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import FileResponse

from auth import get_current_user
from db import fetch_one, fetch_all, execute as db_execute
from permissions import check_workspace_role

router = APIRouter()

HISTORY_DIR = Path(__file__).parent.parent.parent / "output" / "history"


def _ensure_history_dir():
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


class DomainCheckRequest(BaseModel):
    domains: list[str]


class DomainHistory(BaseModel):
    domain: str
    audit_id: str
    audit_date: str
    client_name: str
    score: Optional[float] = None
    has_screenshots: bool = False


@router.post("/api/domains/check")
async def check_domains(request: DomainCheckRequest, user: dict = Depends(get_current_user)):
    """Check which domains have already been crawled in history.
    Returns a map of domain -> most recent audit info."""
    _ensure_history_dir()
    # Build domain -> best audit info (most recent wins)
    known: dict[str, DomainHistory] = {}

    for f in sorted(HISTORY_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            audit_id = f.stem
            audit_date = data.get("audit_date", "")
            client_name = data.get("client_name", "")
            for result in data.get("results", []):
                domain = result.get("domain", "").strip().lower()
                if not domain:
                    continue
                # Only keep the most recent (files sorted newest first)
                if domain in known:
                    continue
                ss = result.get("screenshots") or {}
                has_ss = bool(ss.get("viewport_path") or ss.get("fullpage_path"))
                att = result.get("attention") or {}
                score = att.get("score")
                known[domain] = DomainHistory(
                    domain=domain,
                    audit_id=audit_id,
                    audit_date=audit_date,
                    client_name=client_name,
                    score=score,
                    has_screenshots=has_ss,
                )
        except (json.JSONDecodeError, OSError):
            continue

    # Match against requested domains
    requested = [d.strip().lower() for d in request.domains if d.strip()]
    found: dict[str, dict] = {}
    new_domains: list[str] = []

    for d in requested:
        # Normalize: strip protocol, www., trailing slash
        clean = d
        for prefix in ("https://", "http://"):
            if clean.startswith(prefix):
                clean = clean[len(prefix):]
        if clean.startswith("www."):
            clean = clean[4:]
        clean = clean.rstrip("/")

        if clean in known:
            found[clean] = known[clean].model_dump()
        else:
            new_domains.append(clean)

    # Also check dead domains registry
    dead_file = HISTORY_DIR.parent / "dead_domains.json"
    dead_registry: dict = {}
    if dead_file.exists():
        try:
            dead_registry = json.loads(dead_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    known_dead: dict[str, dict] = {}
    still_new: list[str] = []
    for d in new_domains:
        if d in dead_registry:
            known_dead[d] = dead_registry[d]
        else:
            still_new.append(d)

    return {
        "found": found,
        "known_dead": known_dead,
        "new_domains": still_new,
        "total_submitted": len(requested),
        "already_crawled": len(found),
        "known_dead_count": len(known_dead),
        "new_count": len(still_new),
    }


@router.get("/api/dead-domains")
async def get_dead_domains(user: dict = Depends(get_current_user)):
    """Get the persistent registry of dead domains across all scans."""
    dead_file = HISTORY_DIR.parent / "dead_domains.json"
    if not dead_file.exists():
        return {"dead_domains": {}, "total": 0}
    try:
        registry = json.loads(dead_file.read_text(encoding="utf-8"))
        return {"dead_domains": registry, "total": len(registry)}
    except (json.JSONDecodeError, OSError):
        return {"dead_domains": {}, "total": 0}


@router.get("/api/audits")
async def list_audits(workspace_id: str = None, user: dict = Depends(get_current_user)):
    """List audits. If workspace_id is provided, scope to that workspace. Otherwise return all user's audits."""
    if workspace_id:
        await check_workspace_role(workspace_id, user["id"], ["owner", "editor", "viewer", "client"])
        audits = await fetch_all(
            "SELECT * FROM audits WHERE workspace_id = ? ORDER BY created_at DESC",
            (workspace_id,),
        )
    else:
        # Return audits from all workspaces the user belongs to
        audits = await fetch_all(
            """SELECT a.* FROM audits a
            JOIN workspace_members wm ON a.workspace_id = wm.workspace_id
            WHERE wm.user_id = ?
            ORDER BY a.created_at DESC""",
            (user["id"],),
        )

    result = []
    for a in audits:
        import json as json_mod
        stats = json_mod.loads(a["stats_json"] or "{}")
        result.append({
            "audit_id": a["id"],
            "audit_date": a["created_at"],
            "client_name": a["client_label"],
            "total_sites": stats.get("total", a["domain_count"]),
            "sites_alive": stats.get("alive", 0),
            "sites_dead": stats.get("dead", 0),
            "sites_mfa": stats.get("mfa", 0),
            "avg_attention_score": stats.get("avg_attention_score", 0),
            "workspace_id": a["workspace_id"],
            "status": a["status"],
        })
    return {"audits": result}


@router.get("/api/audits/{audit_id}")
async def get_audit(audit_id: str, user: dict = Depends(get_current_user)):
    """Retrieve a single audit report by ID from DB."""
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    # Check user has access to this workspace
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor", "viewer", "client"])

    import json as json_mod
    return {
        "audit_id": audit["id"],
        "audit_date": audit["created_at"],
        "client_name": audit["client_label"],
        "status": audit["status"],
        "domain_count": audit["domain_count"],
        "stats": json_mod.loads(audit["stats_json"] or "{}"),
        "results": json_mod.loads(audit["results_json"] or "[]"),
        "log": json_mod.loads(audit["log_json"] or "[]"),
        "workspace_id": audit["workspace_id"],
        "created_at": audit["created_at"],
        "completed_at": audit["completed_at"],
    }


@router.delete("/api/audits/{audit_id}")
async def delete_audit(audit_id: str, user: dict = Depends(get_current_user)):
    """Delete an audit from DB, JSON file, and associated screenshots."""
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor"])

    # Delete screenshots from disk
    screenshots_dir = HISTORY_DIR.parent / "screenshots"
    try:
        import json as json_mod
        results = json_mod.loads(audit.get("results_json") or "[]")
        for result in results:
            domain = result.get("domain", "")
            ss = result.get("screenshots") or {}
            # Delete by path
            for key in ("viewport_path", "fullpage_path"):
                fpath = ss.get(key, "")
                if fpath:
                    fname = fpath.replace("\\", "/").split("/")[-1]
                    fp = screenshots_dir / fname
                    if fp.exists():
                        fp.unlink()
            # Delete by domain naming convention
            if domain:
                safe = domain.replace(".", "_").replace("/", "_")
                for suffix in ("_viewport.png", "_full.png"):
                    fp = screenshots_dir / f"{safe}{suffix}"
                    if fp.exists():
                        fp.unlink()
    except Exception:
        pass  # Best effort

    # Delete JSON file
    _ensure_history_dir()
    json_path = HISTORY_DIR / f"{audit_id}.json"
    if json_path.exists():
        json_path.unlink()

    # Delete from DB
    await db_execute("DELETE FROM audits WHERE id = ?", (audit_id,))
    return {"status": "deleted", "audit_id": audit_id}


@router.post("/api/audits/import")
async def import_audit(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Import an audit JSON file into history."""
    _ensure_history_dir()
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
        if "results" not in data or "stats" not in data:
            raise HTTPException(status_code=400, detail="Invalid audit JSON: missing results or stats")
        audit_id = data.get("audit_id", file.filename.replace(".json", ""))
        path = HISTORY_DIR / f"{audit_id}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        return {"status": "imported", "audit_id": audit_id}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")


SCREENSHOTS_DIR = Path(__file__).parent.parent.parent / "output" / "screenshots"


@router.get("/api/screenshots/{filename}")
async def get_screenshot(filename: str):
    """Serve a screenshot image."""
    path = SCREENSHOTS_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(path, media_type="image/png")
