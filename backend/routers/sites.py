"""
MLI — Sites routes: paginated/filterable domain list + aggregate stats.
All routes require authentication but NOT admin role.
"""
from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Query, HTTPException, Body, UploadFile, File, Form

from auth import get_current_user
from config import STALE_DAYS
from db import fetch_one, fetch_all, execute, _now

router = APIRouter(prefix="/api/sites", tags=["sites"])

# Same dir the worker writes to / history.py serves from.
SCREENSHOTS_DIR = Path(__file__).parent.parent.parent / "output" / "screenshots"

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
    "last_ad_surface_pct",
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


@router.post("/parse-input")
async def parse_input(
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
):
    """Extrait des domaines candidats depuis une saisie libre et/ou un fichier
    CSV/XLSX, filtre les entrées 'domain-like', dédoublonne, puis sépare en
    nouveaux (`to_scan`) vs déjà présents en base (`duplicates`).

    Ne lance AUCUN scan : le frontend appelle ensuite /api/audit avec `to_scan`.
    """
    from services.site_utils import collect_candidates, build_scan_partition

    file_bytes = await file.read() if file is not None else None
    filename = file.filename if file is not None else None

    if not (text and text.strip()) and not file_bytes:
        raise HTTPException(400, "Aucune entrée fournie")

    try:
        candidates = collect_candidates(text, file_bytes, filename)
    except ValueError:
        raise HTTPException(400, "Format non supporté (CSV ou XLSX uniquement)")
    except Exception:
        raise HTTPException(400, "Fichier illisible")

    rows = await fetch_all("SELECT domain FROM domains")
    existing = {r["domain"] for r in rows}
    return build_scan_partition(candidates, existing)


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
    ad_pct_min: float | None = Query(None),
    ad_pct_max: float | None = Query(None),
    stale_days: int | None = Query(None),
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
    if ad_pct_min is not None:
        conditions.append("last_ad_surface_pct >= ?")
        params.append(ad_pct_min)
    if ad_pct_max is not None:
        conditions.append("last_ad_surface_pct <= ?")
        params.append(ad_pct_max)
    if stale_days is not None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=stale_days)).isoformat()
        conditions.append("(last_audit_date IS NULL OR last_audit_date < ?)")
        params.append(cutoff)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_row = await fetch_one(
        f"SELECT COUNT(*) as total FROM domains {where}", tuple(params)
    )
    total = count_row["total"] if count_row else 0
    pages = max(1, math.ceil(total / per_page))

    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"SELECT * FROM domains {where} ORDER BY {sort_col} {sort_order} NULLS LAST LIMIT ? OFFSET ?",
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

    avg_pct_row = await fetch_one(
        "SELECT AVG(last_ad_surface_pct) as v FROM domains WHERE last_ad_surface_pct IS NOT NULL", ()
    )
    avg_ad_surface_pct = avg_pct_row["v"] if avg_pct_row else None

    problematic_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_ad_surface_pct >= 50.0", ()
    )
    problematic = problematic_row["n"] if problematic_row else 0

    cutoff = (datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)).isoformat()
    stale_row = await fetch_one(
        "SELECT COUNT(*) as n FROM domains WHERE last_audit_date IS NULL OR last_audit_date < ?",
        (cutoff,),
    )
    stale = stale_row["n"] if stale_row else 0

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
        "avg_ad_surface_pct": round(avg_ad_surface_pct, 2) if avg_ad_surface_pct is not None else None,
        "problematic": problematic,
        "stale": stale,
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


@router.post("/{domain}/rescan")
async def rescan_site(domain: str, user: dict = Depends(get_current_user)):
    """Re-run the Playwright audit (score + screenshot) on a single domain to
    refresh its capture and score. Runs the worker in a thread to avoid blocking
    the event loop. Only updates Playwright-derived fields — health/country/
    ads.txt are preserved (this pass doesn't recompute them)."""
    row = await fetch_one("SELECT id FROM domains WHERE domain = ?", (domain,))
    if not row:
        raise HTTPException(404, "Domain not found")

    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    from services.pw_bridge import full_audit_subprocess

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, full_audit_subprocess, [domain], str(SCREENSHOTS_DIR)
        )
    except Exception as e:
        raise HTTPException(500, f"Rescan failed: {e}")

    attention, content_langs, adtech_results, tracker_results, load_times, _shots = result
    ar = attention.get(domain)
    score = ar.score if ar else None
    ad_count = ar.ad_count if ar else None
    ad_surface_pct = (ar.details or {}).get("ad_surface_pct") if ar else None
    adtech = adtech_results.get(domain) or {}
    trackers = tracker_results.get(domain) or {}
    trackers_total = trackers.get("total", 0) if isinstance(trackers, dict) else 0
    lang = content_langs.get(domain) or None
    now = _now()

    # Suspect (score 'propre' non fiable) -> à valider à la main, si :
    #  - 0 pub détectée (on n'a probablement PAS vu les pubs), OU
    #  - garde-fou : ad-tech présent mais 0 requête pub réseau (chargement bloqué).
    suspect_blocked = bool((ar.details or {}).get("suspect_blocked")) if ar else False
    status = "to_review" if (not ad_count or suspect_blocked) else "pending"

    await execute(
        """UPDATE domains SET
            last_score = ?, last_ad_surface_pct = ?, last_ad_count = ?, last_adtech_json = ?,
            last_trackers = ?, last_lang = ?, last_audit_date = ?,
            editorial_status = ?, audit_count = audit_count + 1, updated_at = ?
           WHERE domain = ?""",
        (
            score, ad_surface_pct, ad_count, json.dumps(adtech) if adtech else None,
            trackers_total, lang, now, status, now, domain,
        ),
    )
    return {"domain": domain, "score": score, "ad_count": ad_count,
            "editorial_status": status, "rescanned_at": now}


@router.post("/{domain}/validate")
async def validate_site(domain: str, body: dict = Body(...), user: dict = Depends(get_current_user)):
    """Manually set/confirm a site's score after a human looked at the capture
    (used for 'to_review' sites where 0 ads were detected)."""
    row = await fetch_one("SELECT id FROM domains WHERE domain = ?", (domain,))
    if not row:
        raise HTTPException(404, "Domain not found")
    score = body.get("score")
    if score is None:
        raise HTTPException(400, "score required")
    try:
        score = max(0.0, min(10.0, float(score)))
    except (TypeError, ValueError):
        raise HTTPException(400, "score must be a number 0-10")
    now = _now()
    await execute(
        "UPDATE domains SET last_score = ?, editorial_status = 'validated', updated_at = ? WHERE domain = ?",
        (score, now, domain),
    )
    return {"domain": domain, "score": score, "editorial_status": "validated"}
