"""
MLI — Sites routes: paginated/filterable domain list + aggregate stats.
All routes require authentication but NOT admin role.
"""
from __future__ import annotations

import json
import math

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from db import fetch_one, fetch_all

router = APIRouter(prefix="/api/sites", tags=["sites"])

# Columns allowed as sort targets
_ALLOWED_SORTS = {
    "domain",
    "last_score",
    "last_health",
    "last_ads_txt",
    "last_ad_count",
    "last_load_time_ms",
    "last_country",
    "category_iab",
    "audit_count",
    "last_audit_date",
}

# Ad-tech keys tracked for the stats endpoint
_ADTECH_KEYS = [
    "gpt",
    "prebid",
    "amazon_tam",
    "criteo",
    "teads",
    "taboola",
    "outbrain",
    "smart",
    "pubmatic",
    "appnexus",
    "magnite",
    "index",
]

# Score bucket labels
_SCORE_BUCKETS = [f"{i}-{i+1}" for i in range(10)]


@router.get("")
async def list_sites(
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    sort: str = Query("domain"),
    order: str = Query("asc"),
    search: str = Query(""),
    health: str = Query(""),
    country: str = Query(""),
    ads_txt: str = Query(""),
    score_min: float | None = Query(None),
    score_max: float | None = Query(None),
    category: str = Query(""),
    user: dict = Depends(get_current_user),
):
    sort_col = sort if sort in _ALLOWED_SORTS else "domain"
    sort_order = "DESC" if order.lower() == "desc" else "ASC"

    conditions: list[str] = []
    params: list = []

    if search:
        conditions.append("domain LIKE ?")
        params.append(f"%{search}%")
    if health:
        conditions.append("last_health = ?")
        params.append(health)
    if country:
        conditions.append("last_country = ?")
        params.append(country)
    if ads_txt in ("0", "1"):
        conditions.append("last_ads_txt = ?")
        params.append(int(ads_txt))
    if score_min is not None:
        conditions.append("last_score >= ?")
        params.append(score_min)
    if score_max is not None:
        conditions.append("last_score <= ?")
        params.append(score_max)
    if category:
        conditions.append("category_iab = ?")
        params.append(category)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_row = await fetch_one(
        f"SELECT COUNT(*) as total FROM domains {where}", tuple(params)
    )
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

    return {
        "sites": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }


@router.get("/stats")
async def sites_stats(user: dict = Depends(get_current_user)):
    # ── Counts by health status ──────────────────────────────────────────────
    total_row = await fetch_one("SELECT COUNT(*) as n FROM domains", ())
    total = total_row["n"] if total_row else 0

    alive_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_health = 'ok'", ()
    )
    alive = alive_row["n"] if alive_row else 0

    dead_row = await fetch_one(
        """SELECT COUNT(*) as n FROM domains
           WHERE last_health IN ('dns_error','timeout','connection_error','ssl_error')""",
        (),
    )
    dead = dead_row["n"] if dead_row else 0

    redirect_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_health = 'redirect'", ()
    )
    redirect = redirect_row["n"] if redirect_row else 0

    error_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_health IN ('client_error','server_error')",
        (),
    )
    error = error_row["n"] if error_row else 0

    # ── Quality KPIs ─────────────────────────────────────────────────────────
    mfa_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_score IS NOT NULL AND last_score < 4.0",
        (),
    )
    mfa = mfa_row["n"] if mfa_row else 0

    ads_txt_ok_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_ads_txt = 1", ()
    )
    ads_txt_ok = ads_txt_ok_row["n"] if ads_txt_ok_row else 0

    avg_score_row = await fetch_one(
        "SELECT AVG(last_score) as v FROM domains WHERE last_score IS NOT NULL", ()
    )
    avg_score = avg_score_row["v"] if avg_score_row else None

    avg_ad_count_row = await fetch_one(
        "SELECT AVG(last_ad_count) as v FROM domains WHERE last_ad_count IS NOT NULL", ()
    )
    avg_ad_count = avg_ad_count_row["v"] if avg_ad_count_row else None

    # ── Countries distribution ────────────────────────────────────────────────
    country_rows = await fetch_all(
        """SELECT last_country as country, COUNT(*) as count FROM domains
           WHERE last_country IS NOT NULL AND last_country != ''
           GROUP BY last_country ORDER BY count DESC""",
        (),
    )
    countries = [{"country": r["country"], "count": r["count"]} for r in country_rows]

    # ── Categories distribution ───────────────────────────────────────────────
    cat_rows = await fetch_all(
        """SELECT category_iab as category, COUNT(*) as count FROM domains
           WHERE category_iab IS NOT NULL AND category_iab != ''
           GROUP BY category_iab ORDER BY count DESC""",
        (),
    )
    categories = [{"category": r["category"], "count": r["count"]} for r in cat_rows]

    # ── Ad-tech presence ─────────────────────────────────────────────────────
    # Load all last_adtech_json values and parse in Python — avoids complex
    # SQLite JSON queries and keeps logic consistent with the rest of the code.
    adtech_rows = await fetch_all(
        "SELECT last_adtech_json FROM domains WHERE last_adtech_json IS NOT NULL AND last_adtech_json != ''",
        (),
    )
    adtech: dict[str, int] = {k: 0 for k in _ADTECH_KEYS}
    for row in adtech_rows:
        try:
            data = json.loads(row["last_adtech_json"] or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        for key in _ADTECH_KEYS:
            if data.get(key):
                adtech[key] += 1

    # ── Score distribution (10 buckets 0-1 … 9-10) ───────────────────────────
    score_rows = await fetch_all(
        "SELECT last_score FROM domains WHERE last_score IS NOT NULL", ()
    )
    bucket_counts = [0] * 10
    for row in score_rows:
        score = row["last_score"]
        idx = min(int(score), 9)  # 10.0 falls into bucket 9-10
        bucket_counts[idx] += 1

    score_buckets = [
        {"range": _SCORE_BUCKETS[i], "count": bucket_counts[i]} for i in range(10)
    ]

    return {
        "total": total,
        "alive": alive,
        "dead": dead,
        "redirect": redirect,
        "error": error,
        "mfa": mfa,
        "ads_txt_ok": ads_txt_ok,
        "avg_score": round(avg_score, 2) if avg_score is not None else None,
        "avg_ad_count": round(avg_ad_count, 1) if avg_ad_count is not None else None,
        "countries": countries,
        "categories": categories,
        "adtech": adtech,
        "score_buckets": score_buckets,
    }


@router.get("/countries")
async def list_countries(user: dict = Depends(get_current_user)):
    rows = await fetch_all(
        """SELECT DISTINCT last_country as country FROM domains
           WHERE last_country IS NOT NULL AND last_country != ''
           ORDER BY last_country ASC""",
        (),
    )
    return {"countries": [r["country"] for r in rows]}
