"""
MLI — Admin routes: domain database CRUD + Mistral categorization.
All routes require admin role.
"""
from __future__ import annotations

import json
import math
import os

from fastapi import APIRouter, Depends, HTTPException, Body, Query

from auth import get_current_user
from db import fetch_one, fetch_all, execute, get_db, _uuid, _now

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")


@router.get("/domains")
async def list_domains(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort: str = Query("domain"),
    order: str = Query("asc"),
    search: str = Query(""),
    status: str = Query(""),
    brand_safety: str = Query(""),
    health: str = Query(""),
    category: str = Query(""),
    user: dict = Depends(get_current_user),
):
    _require_admin(user)

    allowed_sorts = {"domain", "last_score", "editorial_status", "brand_safety", "category_iab", "last_health", "last_audit_date", "audit_count"}
    sort_col = sort if sort in allowed_sorts else "domain"
    sort_order = "DESC" if order.lower() == "desc" else "ASC"

    conditions = []
    params: list = []

    if search:
        conditions.append("domain LIKE ?")
        params.append(f"%{search}%")
    if status:
        conditions.append("editorial_status = ?")
        params.append(status)
    if brand_safety:
        conditions.append("brand_safety = ?")
        params.append(brand_safety)
    if health:
        conditions.append("last_health = ?")
        params.append(health)
    if category:
        conditions.append("category_iab = ?")
        params.append(category)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_row = await fetch_one(f"SELECT COUNT(*) as total FROM domains {where}", tuple(params))
    total = count_row["total"] if count_row else 0
    pages = max(1, math.ceil(total / per_page))

    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"SELECT * FROM domains {where} ORDER BY {sort_col} {sort_order} LIMIT ? OFFSET ?",
        tuple(params) + (per_page, offset),
    )

    for r in rows:
        r["tags"] = json.loads(r.get("tags_json") or "[]")
        r["adtech"] = json.loads(r.get("last_adtech_json") or "{}")

    return {"domains": rows, "total": total, "page": page, "per_page": per_page, "pages": pages}


@router.patch("/domains/{domain_id}")
async def update_domain(domain_id: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    _require_admin(user)
    d = await fetch_one("SELECT * FROM domains WHERE id = ?", (domain_id,))
    if not d:
        raise HTTPException(404, "Domain not found")

    allowed = {"editorial_status", "brand_safety", "brand_safety_source", "category_iab", "category_source", "notes", "tags_json"}
    updates = []
    params = []
    for key in allowed:
        if key in body:
            val = body[key]
            updates.append(f"{key} = ?")
            params.append(json.dumps(val) if isinstance(val, (list, dict)) else val)

    if not updates:
        raise HTTPException(400, "Nothing to update")

    updates.append("updated_at = ?")
    params.append(_now())
    params.append(domain_id)

    await execute(f"UPDATE domains SET {', '.join(updates)} WHERE id = ?", tuple(params))
    updated = await fetch_one("SELECT * FROM domains WHERE id = ?", (domain_id,))
    if updated:
        updated["tags"] = json.loads(updated.get("tags_json") or "[]")
        updated["adtech"] = json.loads(updated.get("last_adtech_json") or "{}")
    return updated


@router.delete("/domains/{domain_id}")
async def delete_domain(domain_id: str, user: dict = Depends(get_current_user)):
    _require_admin(user)
    d = await fetch_one("SELECT * FROM domains WHERE id = ?", (domain_id,))
    if not d:
        raise HTTPException(404, "Domain not found")
    await execute("DELETE FROM domains WHERE id = ?", (domain_id,))
    return {"status": "deleted"}


@router.post("/domains/categorize")
async def categorize_domains(body: dict = Body(...), user: dict = Depends(get_current_user)):
    _require_admin(user)
    domain_ids = body.get("domain_ids", [])
    if not domain_ids:
        raise HTTPException(400, "domain_ids required")

    mistral_key = os.environ.get("MISTRAL_API_KEY") or body.get("mistral_key")
    if not mistral_key:
        raise HTTPException(400, "MISTRAL_API_KEY not set and no mistral_key provided")
    os.environ["MISTRAL_API_KEY"] = mistral_key

    # Import categorizer — it uses the Mistral API
    try:
        from services.categorizer import categorize_all
    except ImportError:
        raise HTTPException(500, "Categorizer service not available")

    results = []
    errors = 0
    for did in domain_ids:
        d = await fetch_one("SELECT * FROM domains WHERE id = ?", (did,))
        if not d:
            errors += 1
            continue
        try:
            # categorize_all expects dict[domain -> metadata]
            cat_results = categorize_all([d["domain"]], {d["domain"]: {}})
            cat_result = cat_results.get(d["domain"])
            if cat_result:
                category = cat_result.category if hasattr(cat_result, 'category') else str(cat_result)
                confidence = cat_result.confidence if hasattr(cat_result, 'confidence') else 0.0
            else:
                category = "Autre"
                confidence = 0.0

            # For now brand_safety is derived from category
            bs = "safe"
            unsafe_cats = {"Adulte", "Jeux d'argent", "Alcool", "Tabac"}
            moderate_cats = {"Politique", "Religion"}
            if category in unsafe_cats:
                bs = "unsafe"
            elif category in moderate_cats:
                bs = "moderate"

            await execute(
                """UPDATE domains SET category_iab = ?, category_source = 'mistral',
                   brand_safety = ?, brand_safety_source = 'mistral',
                   updated_at = ? WHERE id = ?""",
                (category, bs, _now(), did),
            )

            results.append({
                "domain_id": did,
                "domain": d["domain"],
                "category_iab": category,
                "brand_safety": bs,
                "confidence": confidence,
            })
        except Exception as e:
            errors += 1
            results.append({"domain_id": did, "domain": d["domain"], "error": str(e)})

    return {"results": results, "processed": len(results), "errors": errors}


@router.post("/domains/bulk")
async def bulk_action(body: dict = Body(...), user: dict = Depends(get_current_user)):
    _require_admin(user)
    domain_ids = body.get("domain_ids", [])
    action = body.get("action")
    value = body.get("value", "")

    if not domain_ids or not action:
        raise HTTPException(400, "domain_ids and action required")

    if action == "set_status":
        if value not in ("pending", "validated", "blacklisted"):
            raise HTTPException(400, "Invalid status value")
        placeholders = ",".join("?" * len(domain_ids))
        await execute(
            f"UPDATE domains SET editorial_status = ?, updated_at = ? WHERE id IN ({placeholders})",
            (value, _now()) + tuple(domain_ids),
        )

    elif action == "add_tag":
        if not value:
            raise HTTPException(400, "tag value required")
        for did in domain_ids:
            d = await fetch_one("SELECT tags_json FROM domains WHERE id = ?", (did,))
            if d:
                tags = json.loads(d["tags_json"] or "[]")
                if value not in tags:
                    tags.append(value)
                await execute(
                    "UPDATE domains SET tags_json = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(tags), _now(), did),
                )

    elif action == "delete":
        placeholders = ",".join("?" * len(domain_ids))
        await execute(f"DELETE FROM domains WHERE id IN ({placeholders})", tuple(domain_ids))

    else:
        raise HTTPException(400, f"Unknown action: {action}")

    return {"status": "ok", "affected": len(domain_ids)}
