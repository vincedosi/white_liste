"""
MLI — Audit history endpoints.
List, retrieve, and delete saved audit reports.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

router = APIRouter()

HISTORY_DIR = Path(__file__).parent.parent.parent / "output" / "history"


def _ensure_history_dir():
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/api/audits")
async def list_audits():
    """List all saved audit reports."""
    _ensure_history_dir()
    audits = []
    for f in sorted(HISTORY_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            audits.append({
                "audit_id": f.stem,
                "audit_date": data.get("audit_date", ""),
                "client_name": data.get("client_name", ""),
                "total_sites": data.get("stats", {}).get("total", 0),
                "sites_alive": data.get("stats", {}).get("alive", 0),
                "sites_dead": data.get("stats", {}).get("dead", 0),
                "sites_mfa": data.get("stats", {}).get("mfa", 0),
                "avg_attention_score": data.get("stats", {}).get("avg_attention_score", 0),
            })
        except (json.JSONDecodeError, OSError):
            continue
    return {"audits": audits}


@router.get("/api/audits/{audit_id}")
async def get_audit(audit_id: str):
    """Retrieve a single audit report by ID."""
    _ensure_history_dir()
    path = HISTORY_DIR / f"{audit_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audit not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(status_code=500, detail=f"Error reading audit: {e}")


@router.delete("/api/audits/{audit_id}")
async def delete_audit(audit_id: str):
    """Delete an audit report."""
    _ensure_history_dir()
    path = HISTORY_DIR / f"{audit_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audit not found")
    try:
        path.unlink()
        return {"status": "deleted", "audit_id": audit_id}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Error deleting audit: {e}")


@router.post("/api/audits/import")
async def import_audit(file: UploadFile = File(...)):
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
