"""
MLI — Playwright Bridge v3
Lance pw_worker.py dans un subprocess separe pour eviter
les conflits event loop Streamlit/Windows.
"""
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

# Allow imports from backend package
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import AttentionResult

WORKER_PATH = Path(__file__).parent / "pw_worker.py"


def run_playwright_worker(
    domains: list[str],
    mode: str = "attention",
    output_dir: str = "./output/screenshots",
) -> dict:
    """Lance le worker Playwright dans un process separe."""
    request = json.dumps({
        "domains": domains,
        "mode": mode,
        "output_dir": output_dir,
    })

    result = subprocess.run(
        [sys.executable, str(WORKER_PATH)],
        input=request,
        capture_output=True,
        text=True,
        timeout=len(domains) * 30 + 60,
    )

    if result.stderr:
        for line in result.stderr.strip().splitlines():
            print(f"  {line}")

    if result.returncode != 0:
        error_msg = result.stderr[:500] if result.stderr else "Unknown error"
        raise RuntimeError(f"Playwright worker failed: {error_msg}")

    return json.loads(result.stdout)


def score_all_subprocess(
    domains: list[str],
) -> tuple[dict[str, AttentionResult], dict[str, str], dict[str, dict], dict[str, dict], dict[str, int]]:
    """
    Score d'attention via subprocess Playwright (multi-couche v3).

    Returns:
        (attention_results, content_langs, adtech_results, tracker_results, load_times)
    """
    raw_results = run_playwright_worker(domains, mode="attention")

    results = {}
    content_langs = {}
    adtech_results = {}
    tracker_results = {}
    load_times = {}

    for domain, data in raw_results.items():
        results[domain] = AttentionResult(
            ad_count=data.get("ad_count", 0),
            score=data.get("score", 5.0),
            is_mfa=data.get("is_mfa", False),
            details=data.get("details", {}),
            error=data.get("error"),
        )
        lang = data.get("content_lang", "")
        if lang:
            content_langs[domain] = lang

        adtech_results[domain] = data.get("adtech", {"scripts_detected": []})
        tracker_results[domain] = data.get("trackers", {"total": 0})
        load_times[domain] = data.get("page_load_time_ms", 0)

    return results, content_langs, adtech_results, tracker_results, load_times


def extract_metadata_subprocess(domains: list[str]) -> dict[str, dict]:
    """Extraction metadonnees via subprocess Playwright."""
    return run_playwright_worker(domains, mode="metadata")


def screenshot_all_subprocess(
    domains: list[str],
    output_dir: str = "./output/screenshots",
) -> dict[str, dict]:
    """
    Capture des screenshots avec highlighting des pubs.

    Returns:
        dict[domain -> {"viewport_path", "fullpage_path", "ad_count", "score",
                        "breakdown", "cookie_dismissed", "adtech", "trackers", "error"}]
    """
    return run_playwright_worker(domains, mode="screenshot", output_dir=output_dir)
