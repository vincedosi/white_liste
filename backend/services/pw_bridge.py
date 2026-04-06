"""
MLI — Playwright Bridge v4
Lance pw_worker.py dans un subprocess separe pour eviter
les conflits event loop Streamlit/Windows.
Lit stderr en temps reel pour streamer les logs au frontend.
"""
from __future__ import annotations
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

# Allow imports from backend package
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import AttentionResult

WORKER_PATH = Path(__file__).parent / "pw_worker.py"

# Thread-safe log buffer — populated by stderr reader, consumed by audit.py heartbeat
_current_logs: list[str] = []
_logs_lock = threading.Lock()


def get_and_clear_logs() -> list[str]:
    """Retrieve and clear buffered stderr logs (thread-safe)."""
    with _logs_lock:
        logs = _current_logs.copy()
        _current_logs.clear()
        return logs


def _read_stderr(stream):
    """Background thread: read stderr lines into shared buffer."""
    for raw_line in iter(stream.readline, ""):
        line = raw_line.rstrip("\n").rstrip("\r")
        if line:
            with _logs_lock:
                _current_logs.append(line)
    stream.close()


def run_playwright_worker(
    domains: list[str],
    mode: str = "attention",
    output_dir: str = "./output/screenshots",
) -> dict:
    """Lance le worker Playwright dans un process separe avec lecture live de stderr."""
    request = json.dumps({
        "domains": domains,
        "mode": mode,
        "output_dir": output_dir,
    })

    timeout_s = len(domains) * 45 + 120

    proc = subprocess.Popen(
        [sys.executable, str(WORKER_PATH)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # Start background stderr reader
    stderr_thread = threading.Thread(target=_read_stderr, args=(proc.stderr,), daemon=True)
    stderr_thread.start()

    # Send request to stdin
    proc.stdin.write(request)
    proc.stdin.close()

    # Wait for process with timeout
    try:
        proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        raise RuntimeError(f"Playwright worker timeout after {timeout_s}s")

    # Wait for stderr thread to finish reading
    stderr_thread.join(timeout=5)

    stdout = proc.stdout.read()
    proc.stdout.close()

    if proc.returncode != 0:
        remaining = get_and_clear_logs()
        error_msg = "\n".join(remaining[-10:]) if remaining else "Unknown error"
        raise RuntimeError(f"Playwright worker failed (rc={proc.returncode}): {error_msg}")

    return json.loads(stdout)


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
