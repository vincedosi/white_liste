"""
MLI — Audit SSE endpoint.
Runs the full audit pipeline and streams events via SSE.
"""
from __future__ import annotations

import asyncio
import json
import sys
import traceback
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

# Ensure backend package is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import (
    AuditRequest,
    AuditReport,
    SiteAudit,
    HealthResult,
    AttentionResult,
    CategoryResult,
    SiteStatus,
)

router = APIRouter()

HISTORY_DIR = Path(__file__).parent.parent.parent / "output" / "history"
SCREENSHOTS_DIR = Path(__file__).parent.parent.parent / "output" / "screenshots"


def _ensure_dirs():
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def _save_report(audit_id: str, report: AuditReport, logs: list[str] | None = None) -> None:
    """Save audit report to output/history/."""
    _ensure_dirs()
    path = HISTORY_DIR / f"{audit_id}.json"
    data = {
        "audit_id": report.audit_id,
        "audit_date": report.audit_date,
        "client_name": report.client_name,
        "stats": {
            "total": report.total_sites,
            "alive": report.sites_alive,
            "dead": report.sites_dead,
            "mfa": report.sites_mfa,
            "flagged": report.sites_flagged,
            "avg_attention_score": report.avg_attention_score,
            "category_distribution": report.category_distribution,
        },
        "results": [r.model_dump() for r in report.results],
        "log": logs or [],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


@router.post("/api/audit")
async def run_audit(request: AuditRequest):
    """
    Run a full audit pipeline and stream progress via SSE.

    Events:
    - event: "log"      data: {"message": "...", "level": "info|warning|error"}
    - event: "step"     data: {"step": "health|attention|ads_txt|geo|screenshots|categorization",
                                "status": "start|complete", "result": {...}}
    - event: "complete" data: {"audit_id": "...", "report": {...}}
    - event: "error"    data: {"message": "..."}
    """

    async def event_generator():
        audit_id = str(uuid4())
        def _clean_domain(d: str) -> str:
            d = d.strip().lower()
            # Strip protocol
            for prefix in ("https://", "http://"):
                if d.startswith(prefix):
                    d = d[len(prefix):]
            # Strip www. prefix
            if d.startswith("www."):
                d = d[4:]
            # Strip trailing slash
            d = d.rstrip("/")
            return d

        domains = [_clean_domain(d) for d in request.domains if d.strip()]
        domains = [d for d in domains if d]  # Remove empty after cleaning
        audit_logs: list[str] = []  # Collect all log messages for saving

        if not domains:
            yield dict(
                event="error",
                data=json.dumps({"message": "No valid domains provided"}),
            )
            return

        def _log(message: str):
            """Collect log message with timestamp."""
            ts = datetime.now().strftime("%H:%M:%S")
            audit_logs.append(f"[{ts}] {message}")
            return message

        _log(f"Starting audit {audit_id} for {len(domains)} domains")
        yield dict(
            event="log",
            data=json.dumps({
                "message": f"Starting audit {audit_id} for {len(domains)} domains",
                "level": "info",
                "audit_id": audit_id,
            }),
        )

        # Collect results per domain
        site_audits: dict[str, SiteAudit] = {}
        for domain in domains:
            site_audits[domain] = SiteAudit(domain=domain)

        # ── Step 1: Health Check ─────────────────────────────
        yield dict(
            event="step",
            data=json.dumps({"step": "health", "status": "start"}),
        )
        try:
            from services.health_checker import check_all

            health_results = await asyncio.to_thread(
                asyncio.run, check_all(domains)
            )

            alive_domains = []
            for domain, hr in health_results.items():
                site_audits[domain].health = HealthResult(
                    status=hr.status,
                    http_code=hr.http_code,
                    response_time_ms=hr.response_time_ms,
                    final_url=hr.final_url,
                    error_message=hr.error_message,
                )
                if hr.is_alive:
                    alive_domains.append(domain)

            yield dict(
                event="step",
                data=json.dumps({
                    "step": "health",
                    "status": "complete",
                    "result": {
                        "total": len(domains),
                        "alive": len(alive_domains),
                        "dead": len(domains) - len(alive_domains),
                    },
                }),
            )
            yield dict(
                event="log",
                data=json.dumps({
                    "message": _log(f"Health check complete: {len(alive_domains)}/{len(domains)} alive"),
                    "level": "info",
                }),
            )
        except Exception as e:
            yield dict(
                event="log",
                data=json.dumps({
                    "message": _log(f"Health check failed: {e}"),
                    "level": "error",
                }),
            )
            alive_domains = domains  # fallback: try all

        # ── Step 2: Attention Score (Playwright) ─────────────
        content_langs: dict[str, str] = {}
        metadata_map: dict[str, dict] = {}
        adtech_results: dict[str, dict] = {}
        tracker_results: dict[str, dict] = {}
        load_times: dict[str, int] = {}

        if alive_domains and request.modules.attention:
            yield dict(
                event="step",
                data=json.dumps({"step": "attention", "status": "start"}),
            )
            try:
                from services.pw_bridge import score_all_subprocess

                attention_results, content_langs, adtech_results, tracker_results, load_times = (
                    await asyncio.to_thread(score_all_subprocess, alive_domains)
                )

                for domain, ar in attention_results.items():
                    site_audits[domain].attention = AttentionResult(
                        ad_count=ar.ad_count,
                        score=ar.score,
                        is_mfa=ar.is_mfa,
                        details=ar.details,
                        error=ar.error,
                    )
                    if domain in adtech_results:
                        site_audits[domain].adtech = adtech_results[domain]
                    if domain in tracker_results:
                        site_audits[domain].trackers = tracker_results[domain]
                    if domain in load_times:
                        site_audits[domain].load_time_ms = load_times[domain]

                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "attention",
                        "status": "complete",
                        "result": {"domains_scored": len(attention_results)},
                    }),
                )
                yield dict(
                    event="log",
                    data=json.dumps({
                        "message": _log(f"Attention scoring complete for {len(attention_results)} domains"),
                        "level": "info",
                    }),
                )
            except Exception as e:
                yield dict(
                    event="log",
                    data=json.dumps({
                        "message": _log(f"Attention scoring failed: {e}"),
                        "level": "error",
                    }),
                )

        # ── Step 3: ads.txt ──────────────────────────────────
        if alive_domains and request.modules.ads_txt:
            yield dict(
                event="step",
                data=json.dumps({"step": "ads_txt", "status": "start"}),
            )
            try:
                from services.ads_txt_checker import check_all_ads_txt

                ads_txt_results = await asyncio.to_thread(
                    asyncio.run, check_all_ads_txt(alive_domains)
                )

                for domain, atr in ads_txt_results.items():
                    site_audits[domain].ads_txt = {
                        "has_ads_txt": atr.has_ads_txt,
                        "seller_count": atr.seller_count,
                        "is_direct": atr.is_direct,
                        "is_reseller": atr.is_reseller,
                        "top_ssps": atr.top_ssps,
                        "error": atr.error,
                    }

                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "ads_txt",
                        "status": "complete",
                        "result": {
                            "checked": len(ads_txt_results),
                            "with_ads_txt": sum(1 for r in ads_txt_results.values() if r.has_ads_txt),
                        },
                    }),
                )
            except Exception as e:
                yield dict(
                    event="log",
                    data=json.dumps({
                        "message": _log(f"ads.txt check failed: {e}"),
                        "level": "error",
                    }),
                )

        # ── Step 4: Geo Localization ─────────────────────────
        if alive_domains and request.modules.geo:
            yield dict(
                event="step",
                data=json.dumps({"step": "geo", "status": "start"}),
            )
            try:
                from services.geo_locator import localize_all

                geo_results = await asyncio.to_thread(
                    localize_all, alive_domains, content_langs
                )

                for domain, gr in geo_results.items():
                    site_audits[domain].geo = gr.to_flat_dict()

                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "geo",
                        "status": "complete",
                        "result": {"localized": len(geo_results)},
                    }),
                )
            except Exception as e:
                yield dict(
                    event="log",
                    data=json.dumps({
                        "message": _log(f"Geo localization failed: {e}"),
                        "level": "error",
                    }),
                )

        # ── Step 5: Screenshots ──────────────────────────────
        if alive_domains and request.modules.screenshots:
            yield dict(
                event="step",
                data=json.dumps({"step": "screenshots", "status": "start"}),
            )
            try:
                from services.pw_bridge import screenshot_all_subprocess

                _ensure_dirs()
                screenshot_results = await asyncio.to_thread(
                    screenshot_all_subprocess,
                    alive_domains,
                    str(SCREENSHOTS_DIR),
                )

                for domain, sr in screenshot_results.items():
                    site_audits[domain].screenshots = sr

                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "screenshots",
                        "status": "complete",
                        "result": {"captured": len(screenshot_results)},
                    }),
                )
            except Exception as e:
                yield dict(
                    event="log",
                    data=json.dumps({
                        "message": _log(f"Screenshots failed: {e}"),
                        "level": "error",
                    }),
                )

        # ── Step 6: Categorization (Mistral AI) ─────────────
        if alive_domains and request.modules.categorization:
            yield dict(
                event="step",
                data=json.dumps({"step": "categorization", "status": "start"}),
            )
            try:
                # Get metadata if not already extracted
                if not metadata_map:
                    from services.pw_bridge import extract_metadata_subprocess

                    metadata_map = await asyncio.to_thread(
                        extract_metadata_subprocess, alive_domains
                    )

                from services.categorizer import categorize_all

                cat_results = await asyncio.to_thread(
                    categorize_all, alive_domains, metadata_map
                )

                for domain, cr in cat_results.items():
                    site_audits[domain].categorization = CategoryResult(
                        category=cr.category,
                        confidence=cr.confidence,
                        raw_response=cr.raw_response,
                        error=cr.error,
                    )

                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "categorization",
                        "status": "complete",
                        "result": {"categorized": len(cat_results)},
                    }),
                )
            except Exception as e:
                yield dict(
                    event="log",
                    data=json.dumps({
                        "message": _log(f"Categorization failed: {e}"),
                        "level": "error",
                    }),
                )

        # ── Finalize: decide actions & compute stats ─────────
        for sa in site_audits.values():
            sa.decide_action()

        report = AuditReport(
            audit_id=audit_id,
            client_name=request.client,
            results=list(site_audits.values()),
        )
        report.compute_stats()

        # Save to history
        try:
            _log("Audit complete")
            _save_report(audit_id, report, logs=audit_logs)
        except Exception as e:
            yield dict(
                event="log",
                data=json.dumps({
                    "message": _log(f"Failed to save report: {e}"),
                    "level": "warning",
                }),
            )

        # Send final complete event
        yield dict(
            event="complete",
            data=json.dumps({
                "audit_id": audit_id,
                "report": report.model_dump(),
            }, default=str),
        )

    return EventSourceResponse(event_generator())
