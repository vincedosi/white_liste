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

from fastapi import APIRouter, Depends, Query
from sse_starlette.sse import EventSourceResponse

from auth import get_current_user
from db import execute as db_execute, _uuid, _now
from permissions import check_workspace_role
import json as json_mod

# ---------------------------------------------------------------------------
# Heartbeat helper — keeps SSE alive during long blocking operations
# ---------------------------------------------------------------------------

async def _run_with_heartbeat(func, *args, interval: float = 3.0):
    """
    Run a blocking *func* in a thread while yielding heartbeat dicts
    and subprocess logs every *interval* seconds to keep the SSE stream alive.

    Yields:
    - Log dicts (event="log") from subprocess stderr (via pw_bridge buffer)
    - Heartbeat dicts (event="heartbeat") when no logs are available
    - Final result dict with key '_result'
    """
    loop = asyncio.get_event_loop()
    future = loop.run_in_executor(None, lambda: func(*args))
    while True:
        try:
            result = await asyncio.wait_for(asyncio.shield(future), timeout=interval)
            # Done — flush any remaining logs
            try:
                from services.pw_bridge import get_and_clear_logs
                for line in get_and_clear_logs():
                    yield {
                        "event": "log",
                        "data": json.dumps({"message": line, "level": "info"}),
                    }
            except ImportError:
                pass
            yield {"_result": result}
            return
        except asyncio.TimeoutError:
            # Not done yet — check for subprocess logs
            try:
                from services.pw_bridge import get_and_clear_logs
                logs = get_and_clear_logs()
                if logs:
                    for line in logs:
                        yield {
                            "event": "log",
                            "data": json.dumps({"message": line, "level": "info"}),
                        }
                else:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"ts": datetime.now().isoformat()}),
                    }
            except ImportError:
                yield {
                    "event": "heartbeat",
                    "data": json.dumps({"ts": datetime.now().isoformat()}),
                }

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
async def run_audit(
    request: AuditRequest,
    workspace_id: str = Query(None),
    user: dict = Depends(get_current_user),
):
    """
    Run a full audit pipeline and stream progress via SSE.

    Events:
    - event: "log"      data: {"message": "...", "level": "info|warning|error"}
    - event: "step"     data: {"step": "health|attention|ads_txt|geo|screenshots|categorization",
                                "status": "start|complete", "result": {...}}
    - event: "complete" data: {"audit_id": "...", "report": {...}}
    - event: "error"    data: {"message": "..."}
    """
    # Validate workspace access if workspace_id provided
    if workspace_id:
        await check_workspace_role(workspace_id, user["id"], ["owner", "editor"])

    _workspace_id = workspace_id
    _user_id = user["id"]

    async def event_generator():
        audit_id = str(uuid4())
        from services.site_utils import clean_domain

        domains = [clean_domain(d) for d in request.domains if d.strip()]
        domains = [d for d in domains if d]  # Remove empty after cleaning
        audit_logs: list[str] = []  # Collect all log messages for saving

        if not domains:
            yield dict(
                event="error",
                data=json.dumps({"message": "No valid domains provided"}),
            )
            return

        def _log(message: str) -> str:
            """Collect log message with timestamp. Returns timestamped string."""
            ts = datetime.now().strftime("%H:%M:%S")
            stamped = f"[{ts}] {message}"
            audit_logs.append(stamped)
            return stamped

        def _log_evt(message: str, level: str = "info"):
            """Log + yield helper — returns a dict ready to be yielded."""
            return dict(
                event="log",
                data=json.dumps({"message": _log(message), "level": level}),
            )

        yield _log_evt(f"━━ AUDIT {audit_id[:8]} ━━━━━━━━━━━━━━━━━━━━━━━━━━")
        yield _log_evt(f"Domains recus: {len(domains)}")
        for i, d in enumerate(domains, 1):
            yield _log_evt(f"  [{i:02d}] {d}")

        # Collect results per domain
        site_audits: dict[str, SiteAudit] = {}
        for domain in domains:
            site_audits[domain] = SiteAudit(domain=domain)

        # ── Step 1: Health Check ─────────────────────────────
        yield _log_evt("━━ HEALTH CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        yield _log_evt(f"Lancement du health check pour {len(domains)} domaines...")
        yield dict(
            event="step",
            data=json.dumps({"step": "health", "status": "start"}),
        )
        try:
            from services.health_checker import check_all

            async for evt in _run_with_heartbeat(asyncio.run, check_all(domains)):
                if "_result" in evt:
                    health_results = evt["_result"]
                else:
                    yield evt

            alive_domains = []
            dead_domains = []
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
                    rt = f"{hr.response_time_ms}ms" if hr.response_time_ms else "?"
                    yield _log_evt(f"  ✓ {domain} — HTTP {hr.http_code or '?'} — {rt}")
                else:
                    dead_domains.append(domain)
                    yield _log_evt(f"  ✗ {domain} — {hr.error_message or 'dead'}", "warning")

            yield dict(
                event="step",
                data=json.dumps({
                    "step": "health",
                    "status": "complete",
                    "result": {
                        "total": len(domains),
                        "alive": len(alive_domains),
                        "dead": len(dead_domains),
                    },
                }),
            )
            yield _log_evt(f"Health check termine: {len(alive_domains)} alive, {len(dead_domains)} dead")
            if dead_domains:
                yield _log_evt(f"⚠ Domaines morts retires du pipeline: {', '.join(dead_domains)}", "warning")
        except Exception as e:
            yield _log_evt(f"✗ ERREUR health check: {e}", "error")
            yield _log_evt(f"Fallback: on continue avec les {len(domains)} domaines", "warning")
            alive_domains = domains  # fallback: try all

        # ── Step 2: Playwright (Attention + Screenshots merged) ─────────
        content_langs: dict[str, str] = {}
        metadata_map: dict[str, dict] = {}
        adtech_results: dict[str, dict] = {}
        tracker_results: dict[str, dict] = {}
        load_times: dict[str, int] = {}
        screenshot_results_from_full: dict[str, dict] | None = None

        if not alive_domains:
            yield _log_evt("⚠ Aucun domaine alive — skip attention, ads.txt, geo, screenshots, categorisation", "warning")

        # Use full_audit (single-pass) when both attention and screenshots are enabled
        use_full_mode = bool(alive_domains) and request.modules.attention and request.modules.screenshots
        yield _log_evt(f"Modules: attention={request.modules.attention} screenshots={request.modules.screenshots} -> full_mode={use_full_mode}")

        if use_full_mode:
            yield _log_evt("━━ AUDIT COMPLET (Playwright single-pass) ━━━━")
            yield _log_evt(f"Score + Screenshots en UNE passe pour {len(alive_domains)} domaines")
            yield _log_evt(f"Timeout configure: {len(alive_domains) * 90 + 120}s")
            yield dict(
                event="step",
                data=json.dumps({"step": "attention", "status": "start"}),
            )
            try:
                from services.pw_bridge import full_audit_subprocess

                _ensure_dirs()
                async for evt in _run_with_heartbeat(full_audit_subprocess, alive_domains, str(SCREENSHOTS_DIR)):
                    if "_result" in evt:
                        attention_results, content_langs, adtech_results, tracker_results, load_times, screenshot_results_from_full = evt["_result"]
                    else:
                        yield evt

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

                # Screenshots already captured — store them
                for domain, sr in screenshot_results_from_full.items():
                    site_audits[domain].screenshots = sr

                n_mfa = sum(1 for ar in attention_results.values() if ar.is_mfa)
                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "attention",
                        "status": "complete",
                        "result": {"domains_scored": len(attention_results)},
                    }),
                )
                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "screenshots",
                        "status": "complete",
                        "result": {"captured": len(screenshot_results_from_full)},
                    }),
                )
                yield _log_evt(f"Audit Playwright termine: {len(attention_results)} scores, {n_mfa} MFA, {len(screenshot_results_from_full)} screenshots")
            except Exception as e:
                yield _log_evt(f"✗ ERREUR audit Playwright: {e}", "error")
                import traceback as tb
                yield _log_evt(f"  {tb.format_exc().splitlines()[-1]}", "error")

        elif alive_domains and request.modules.attention:
            # Attention only (no screenshots)
            yield _log_evt("━━ ATTENTION SCORING (Playwright) ━━━━━━━━━━━━")
            yield _log_evt(f"Lancement Playwright subprocess pour {len(alive_domains)} domaines...")
            yield dict(
                event="step",
                data=json.dumps({"step": "attention", "status": "start"}),
            )
            try:
                from services.pw_bridge import score_all_subprocess

                async for evt in _run_with_heartbeat(score_all_subprocess, alive_domains):
                    if "_result" in evt:
                        attention_results, content_langs, adtech_results, tracker_results, load_times = evt["_result"]
                    else:
                        yield evt

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

                n_mfa = sum(1 for ar in attention_results.values() if ar.is_mfa)
                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "attention",
                        "status": "complete",
                        "result": {"domains_scored": len(attention_results)},
                    }),
                )
                yield _log_evt(f"Attention termine: {len(attention_results)} scores, {n_mfa} MFA detectes")
            except Exception as e:
                yield _log_evt(f"✗ ERREUR attention scoring: {e}", "error")

        # ── Step 3: ads.txt ──────────────────────────────────
        if alive_domains and request.modules.ads_txt:
            yield _log_evt("━━ ADS.TXT CHECK ━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            yield _log_evt(f"Verification ads.txt pour {len(alive_domains)} domaines...")
            yield dict(
                event="step",
                data=json.dumps({"step": "ads_txt", "status": "start"}),
            )
            try:
                from services.ads_txt_checker import check_all_ads_txt

                async for evt in _run_with_heartbeat(asyncio.run, check_all_ads_txt(alive_domains)):
                    if "_result" in evt:
                        ads_txt_results = evt["_result"]
                    else:
                        yield evt

                for domain, atr in ads_txt_results.items():
                    site_audits[domain].ads_txt = {
                        "has_ads_txt": atr.has_ads_txt,
                        "seller_count": atr.seller_count,
                        "is_direct": atr.is_direct,
                        "is_reseller": atr.is_reseller,
                        "top_ssps": atr.top_ssps,
                        "error": atr.error,
                    }

                n_with = sum(1 for r in ads_txt_results.values() if r.has_ads_txt)
                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "ads_txt",
                        "status": "complete",
                        "result": {"checked": len(ads_txt_results), "with_ads_txt": n_with},
                    }),
                )
                yield _log_evt(f"ads.txt termine: {n_with}/{len(ads_txt_results)} ont un ads.txt")
            except Exception as e:
                yield _log_evt(f"✗ ERREUR ads.txt: {e}", "error")

        # ── Step 4: Geo Localization ─────────────────────────
        if alive_domains and request.modules.geo:
            yield _log_evt("━━ GEO LOCALISATION ━━━━━━━━━━━━━━━━━━━━━━━━")
            yield _log_evt(f"Localisation IP + TLD + langue pour {len(alive_domains)} domaines...")
            yield _log_evt(f"Langues detectees: {len(content_langs)} — {dict(list(content_langs.items())[:5])}")
            yield dict(
                event="step",
                data=json.dumps({"step": "geo", "status": "start"}),
            )
            try:
                from services.geo_locator import localize_all

                async for evt in _run_with_heartbeat(localize_all, alive_domains, content_langs):
                    if "_result" in evt:
                        geo_results = evt["_result"]
                    else:
                        yield evt

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
                yield _log_evt(f"Geo termine: {len(geo_results)} domaines localises")
            except Exception as e:
                yield _log_evt(f"✗ ERREUR geo: {e}", "error")

        # ── Step 5: Screenshots (skip if already done by full_audit) ──
        if alive_domains and request.modules.screenshots and screenshot_results_from_full is None:
            # Screenshots only (attention was disabled or not run)
            yield _log_evt("━━ SCREENSHOTS (Playwright) ━━━━━━━━━━━━━━━━━")
            yield _log_evt(f"Capture screenshots pour {len(alive_domains)} domaines...")
            yield dict(
                event="step",
                data=json.dumps({"step": "screenshots", "status": "start"}),
            )
            try:
                from services.pw_bridge import screenshot_all_subprocess

                _ensure_dirs()
                async for evt in _run_with_heartbeat(screenshot_all_subprocess, alive_domains, str(SCREENSHOTS_DIR)):
                    if "_result" in evt:
                        screenshot_results = evt["_result"]
                    else:
                        yield evt

                for domain, sr in screenshot_results.items():
                    site_audits[domain].screenshots = sr

                n_ok = sum(1 for sr in screenshot_results.values() if not sr.get("error"))
                yield dict(
                    event="step",
                    data=json.dumps({
                        "step": "screenshots",
                        "status": "complete",
                        "result": {"captured": len(screenshot_results)},
                    }),
                )
                yield _log_evt(f"Screenshots termine: {n_ok}/{len(screenshot_results)} captures reussies")
            except Exception as e:
                yield _log_evt(f"✗ ERREUR screenshots: {e}", "error")
        elif screenshot_results_from_full is not None:
            yield _log_evt("Screenshots deja captures dans la passe unique ✓")

        # ── Step 6: Categorization (Mistral AI) ─────────────
        if alive_domains and request.modules.categorization:
            yield _log_evt("━━ CATEGORISATION IA (Mistral) ━━━━━━━━━━━━━━")
            yield _log_evt(f"Categorisation pour {len(alive_domains)} domaines...")
            yield dict(
                event="step",
                data=json.dumps({"step": "categorization", "status": "start"}),
            )
            try:
                # Get metadata if not already extracted
                if not metadata_map:
                    yield _log_evt("Extraction metadata via Playwright subprocess...")
                    from services.pw_bridge import extract_metadata_subprocess

                    async for evt in _run_with_heartbeat(extract_metadata_subprocess, alive_domains):
                        if "_result" in evt:
                            metadata_map = evt["_result"]
                        else:
                            yield evt
                    yield _log_evt(f"Metadata extraite pour {len(metadata_map)} domaines")
                else:
                    yield _log_evt(f"Metadata deja disponible pour {len(metadata_map)} domaines (cache)")

                from services.categorizer import categorize_all

                yield _log_evt("Appel Mistral AI pour categorisation...")
                async for evt in _run_with_heartbeat(categorize_all, alive_domains, metadata_map):
                    if "_result" in evt:
                        cat_results = evt["_result"]
                    else:
                        yield evt

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
                yield _log_evt(f"Categorisation terminee: {len(cat_results)} domaines")
            except Exception as e:
                yield _log_evt(f"✗ ERREUR categorisation: {e}", "error")

        # ── Finalize: decide actions & compute stats ─────────
        yield _log_evt("━━ FINALISATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        yield _log_evt("Calcul des actions et statistiques...")

        for sa in site_audits.values():
            sa.decide_action()

        report = AuditReport(
            audit_id=audit_id,
            client_name=request.client,
            results=list(site_audits.values()),
        )
        report.compute_stats()

        yield _log_evt(f"Total: {report.total_sites} sites")
        yield _log_evt(f"  Alive: {report.sites_alive} | Dead: {report.sites_dead}")
        yield _log_evt(f"  MFA: {report.sites_mfa} | Flagged: {report.sites_flagged}")
        yield _log_evt(f"  Score attention moyen: {report.avg_attention_score:.1f}" if report.avg_attention_score else "  Score attention moyen: N/A")
        if report.category_distribution:
            yield _log_evt(f"  Categories: {report.category_distribution}")

        # Recap actions
        from collections import Counter
        action_counts = Counter()
        for sa in site_audits.values():
            action = getattr(sa, 'action', None) or 'unknown'
            action_counts[action] += 1
        yield _log_evt(f"  Actions: {dict(action_counts)}")

        # Save to history (JSON file)
        try:
            _save_report(audit_id, report, logs=audit_logs)
            yield _log_evt(f"Rapport sauvegarde: {HISTORY_DIR / f'{audit_id}.json'}")
        except Exception as e:
            yield _log_evt(f"⚠ Erreur sauvegarde JSON: {e}", "warning")

        # Save to DB (alongside JSON)
        results_list = [r.model_dump() for r in report.results]
        if _workspace_id:
            try:
                stats = {
                    "total": report.total_sites,
                    "alive": report.sites_alive,
                    "dead": report.sites_dead,
                    "mfa": report.sites_mfa,
                    "flagged": report.sites_flagged,
                    "avg_attention_score": report.avg_attention_score,
                    "category_distribution": report.category_distribution,
                }
                await db_execute(
                    """INSERT OR REPLACE INTO audits
                    (id, workspace_id, launched_by, client_label, status, domain_count,
                     stats_json, results_json, log_json, created_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        audit_id, _workspace_id, _user_id,
                        report.client_name or "", "completed", report.total_sites,
                        json_mod.dumps(stats, default=str),
                        json_mod.dumps(results_list, default=str),
                        json_mod.dumps(audit_logs),
                        report.audit_date, _now(),
                    ),
                )
                yield _log_evt(f"Rapport sauvegarde en DB (workspace {_workspace_id})")
            except Exception as e:
                yield _log_evt(f"⚠ Erreur sauvegarde DB: {e}", "warning")

        # Upsert domains into global table
        from db import upsert_domain as _upsert_domain
        for _site_result in results_list:
            try:
                _domain_name = _site_result.get("domain", "")
                if not _domain_name:
                    continue
                _health = _site_result.get("health", {})
                _attention = _site_result.get("attention", {})
                _geo = _site_result.get("geo", {})
                _ads_txt_data = _site_result.get("ads_txt", {})
                _adtech_data = _site_result.get("adtech", {})
                _trackers_data = _site_result.get("trackers", {})

                await _upsert_domain(_domain_name, {
                    "score": _attention.get("clutter_score") or _attention.get("score"),
                    "health": _health.get("status", "ok"),
                    "ads_txt": 1 if _ads_txt_data.get("has_ads_txt") else 0,
                    "ad_count": _attention.get("ad_count", 0),
                    "load_time_ms": _site_result.get("load_time_ms"),
                    "trackers": _trackers_data.get("total", 0) if isinstance(_trackers_data, dict) else 0,
                    "adtech": _adtech_data if isinstance(_adtech_data, dict) else {},
                    # Garde-fou : ad-tech présent mais 0 requête pub réseau -> 'to_review' (cf. db._editorial_status_after_audit)
                    "suspect_blocked": (_attention.get("details") or {}).get("suspect_blocked", False),
                    "ad_surface_pct": (_attention.get("details") or {}).get("ad_surface_pct"),
                    "clutter_score": (_attention.get("details") or {}).get("clutter_score"),
                    "v4_score": (_attention.get("details") or {}).get("v4_score"),
                    "country": _geo.get("server_country") if isinstance(_geo, dict) else None,
                    "lang": _geo.get("content_lang") if isinstance(_geo, dict) else None,
                    "tld": _geo.get("tld") if isinstance(_geo, dict) else None,
                    "audit_id": audit_id,
                    "audit_date": _now(),
                })
            except Exception as _upsert_err:
                print(f"[MLI] upsert_domain error for {_domain_name}: {_upsert_err}")

        # Update persistent dead domains registry
        try:
            dead_file = HISTORY_DIR.parent / "dead_domains.json"
            registry: dict = {}
            if dead_file.exists():
                registry = json.loads(dead_file.read_text(encoding="utf-8"))

            new_dead = 0
            for sa in site_audits.values():
                if not sa.health.is_alive:
                    d = sa.domain
                    if d not in registry:
                        new_dead += 1
                    registry[d] = {
                        "last_seen": datetime.now().isoformat(),
                        "last_audit_id": audit_id,
                        "status": sa.health.status.value,
                        "error": sa.health.error_message,
                        "times_seen_dead": registry.get(d, {}).get("times_seen_dead", 0) + 1,
                        "first_seen": registry.get(d, {}).get("first_seen", datetime.now().isoformat()),
                    }

            with open(dead_file, "w", encoding="utf-8") as f:
                json.dump(registry, f, ensure_ascii=False, indent=2, default=str)

            total_dead = len(registry)
            if new_dead:
                yield _log_evt(f"Registre sites morts: +{new_dead} nouveaux, {total_dead} total")
            else:
                yield _log_evt(f"Registre sites morts: {total_dead} domaines connus")
        except Exception as e:
            yield _log_evt(f"⚠ Erreur registre morts: {e}", "warning")

        yield _log_evt(f"━━ AUDIT TERMINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        # Send final complete event
        yield dict(
            event="complete",
            data=json.dumps({
                "audit_id": audit_id,
                "report": report.model_dump(),
            }, default=str),
        )

    return EventSourceResponse(event_generator())
