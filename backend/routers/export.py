"""
MLI — Export/Import for audits and workspaces.
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse

from auth import get_current_user
from db import fetch_one, fetch_all, execute, _uuid, _now
from permissions import check_workspace_role

router = APIRouter(tags=["export"])

SCREENSHOT_DIR = Path(__file__).parent.parent.parent / "output" / "screenshots"


@router.get("/api/audits/{audit_id}/export")
async def export_audit(audit_id: str, user: dict = Depends(get_current_user)):
    audit = await fetch_one("SELECT * FROM audits WHERE id = ?", (audit_id,))
    if not audit:
        raise HTTPException(404, "Audit not found")
    await check_workspace_role(audit["workspace_id"], user["id"], ["owner", "editor", "viewer", "client"])

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "audit_id": audit_id,
            "workspace_id": audit["workspace_id"],
            "client": audit["client_label"],
            "exported_at": _now(),
            "version": "1.0",
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("audit.json", json.dumps({
            "id": audit["id"],
            "client_label": audit["client_label"],
            "status": audit["status"],
            "domain_count": audit["domain_count"],
            "stats": json.loads(audit["stats_json"] or "{}"),
            "results": json.loads(audit["results_json"] or "[]"),
            "log": json.loads(audit["log_json"] or "[]"),
            "created_at": audit["created_at"],
            "completed_at": audit["completed_at"],
        }, indent=2, ensure_ascii=False))

        ss_dir = SCREENSHOT_DIR / audit_id
        if ss_dir.exists():
            for f in ss_dir.iterdir():
                if f.is_file():
                    zf.write(f, f"screenshots/{f.name}")

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="audit-{audit_id[:8]}.zip"'},
    )


@router.get("/api/workspaces/{workspace_id}/export")
async def export_workspace(workspace_id: str, user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])
    ws = await fetch_one("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
    if not ws:
        raise HTTPException(404)

    audits = await fetch_all("SELECT * FROM audits WHERE workspace_id = ?", (workspace_id,))
    whitelists = await fetch_all("SELECT * FROM workspace_whitelists WHERE workspace_id = ?", (workspace_id,))
    activity = await fetch_all("SELECT * FROM workspace_activity WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 500", (workspace_id,))

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "workspace": ws["name"],
            "slug": ws["slug"],
            "config": json.loads(ws["config_json"] or "{}"),
            "exported_at": _now(),
            "version": "1.0",
            "audit_count": len(audits),
            "whitelist_count": len(whitelists),
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        zf.writestr("config.json", ws["config_json"] or "{}")

        for wl in whitelists:
            safe_name = wl["name"].replace("/", "_").replace("\\", "_")
            zf.writestr(f"whitelists/{safe_name}.json", json.dumps({
                "id": wl["id"], "name": wl["name"],
                "domains": json.loads(wl["domains_json"] or "[]"),
                "created_at": wl["created_at"],
            }, indent=2))

        for a in audits:
            prefix = f"audits/{a['id']}/"
            zf.writestr(f"{prefix}audit.json", json.dumps({
                "id": a["id"], "client_label": a["client_label"],
                "status": a["status"], "domain_count": a["domain_count"],
                "stats": json.loads(a["stats_json"] or "{}"),
                "results": json.loads(a["results_json"] or "[]"),
                "log": json.loads(a["log_json"] or "[]"),
                "created_at": a["created_at"], "completed_at": a["completed_at"],
            }, indent=2, ensure_ascii=False))

        zf.writestr("activity.json", json.dumps([dict(a) for a in activity], indent=2, default=str))

    buf.seek(0)
    slug = ws["slug"]
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="workspace-{slug}.zip"'},
    )


@router.post("/api/workspaces/{workspace_id}/import")
async def import_workspace(workspace_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    await check_workspace_role(workspace_id, user["id"], ["owner"])

    content = await file.read()
    buf = io.BytesIO(content)
    imported_audits = 0
    imported_whitelists = 0
    skipped = 0

    try:
        with zipfile.ZipFile(buf, "r") as zf:
            for name in zf.namelist():
                if name.startswith("audits/") and name.endswith("/audit.json"):
                    data = json.loads(zf.read(name))
                    existing = await fetch_one("SELECT id FROM audits WHERE id = ?", (data["id"],))
                    if existing:
                        skipped += 1
                        continue
                    await execute(
                        """INSERT INTO audits (id, workspace_id, launched_by, client_label, status, domain_count,
                           stats_json, results_json, log_json, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                        (data["id"], workspace_id, user["id"], data.get("client_label", "Imported"),
                         data.get("status", "completed"), data.get("domain_count", 0),
                         json.dumps(data.get("stats", {})), json.dumps(data.get("results", [])),
                         json.dumps(data.get("log", [])), data.get("created_at", _now()), data.get("completed_at")),
                    )
                    imported_audits += 1

            for name in zf.namelist():
                if name.startswith("whitelists/") and name.endswith(".json"):
                    data = json.loads(zf.read(name))
                    wl_id = data.get("id", _uuid())
                    existing = await fetch_one("SELECT id FROM workspace_whitelists WHERE id = ?", (wl_id,))
                    if existing:
                        skipped += 1
                        continue
                    now = _now()
                    await execute(
                        "INSERT INTO workspace_whitelists (id, workspace_id, name, domains_json, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                        (wl_id, workspace_id, data["name"], json.dumps(data.get("domains", [])), user["id"], now, now),
                    )
                    imported_whitelists += 1
    except zipfile.BadZipFile:
        raise HTTPException(400, "Invalid ZIP file")

    return {"imported_audits": imported_audits, "imported_whitelists": imported_whitelists, "skipped": skipped}
