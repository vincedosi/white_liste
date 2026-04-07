"""
MLI Crawler — Module Hygiene : Health Checker
Verifie la disponibilite reelle des sites (HTTP async).
"""
from __future__ import annotations
import asyncio
import sys
import time
from pathlib import Path

import httpx

# Allow imports from backend package
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import HTTP_TIMEOUT, HTTP_MAX_CONCURRENT, HTTP_RETRIES, HTTP_USER_AGENT
from models import HealthResult, SiteStatus


async def _try_url(
    client: httpx.AsyncClient,
    url: str,
    semaphore: asyncio.Semaphore,
) -> HealthResult | None:
    """Try a single URL. Returns HealthResult on success, None on failure."""
    try:
        async with semaphore:
            start = time.monotonic()
            response = await client.get(url, follow_redirects=True)
            elapsed_ms = int((time.monotonic() - start) * 1000)

        if 200 <= response.status_code < 300:
            status = SiteStatus.OK
        elif 300 <= response.status_code < 400:
            status = SiteStatus.REDIRECT
        elif 400 <= response.status_code < 500:
            status = SiteStatus.CLIENT_ERROR
        else:
            status = SiteStatus.SERVER_ERROR

        return HealthResult(
            status=status,
            http_code=response.status_code,
            response_time_ms=elapsed_ms,
            final_url=str(response.url),
        )
    except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError):
        return None


async def check_site(
    client: httpx.AsyncClient,
    domain: str,
    semaphore: asyncio.Semaphore,
) -> HealthResult:
    """Check un seul site avec fallback www. et http://."""
    # Try URLs in order: https://domain, https://www.domain, http://domain
    urls_to_try = [f"https://{domain}"]
    if not domain.startswith("www."):
        urls_to_try.append(f"https://www.{domain}")
    urls_to_try.append(f"http://{domain}")

    last_error = ""
    for url in urls_to_try:
        result = await _try_url(client, url, semaphore)
        if result is not None:
            return result

    # All failed — do one final attempt with details for error reporting
    url = f"https://{domain}"
    try:
        async with semaphore:
            await client.get(url, follow_redirects=True)
    except httpx.TimeoutException:
        return HealthResult(status=SiteStatus.TIMEOUT, error_message="Timeout after retries")
    except httpx.ConnectError as e:
        error_msg = str(e).lower()
        if "name resolution" in error_msg or "dns" in error_msg or "getaddrinfo" in error_msg:
            return HealthResult(status=SiteStatus.DNS_ERROR, error_message=str(e)[:200])
        return HealthResult(status=SiteStatus.CONNECTION_ERROR, error_message=str(e)[:200])
    except httpx.HTTPError as e:
        if "ssl" in str(e).lower() or "certificate" in str(e).lower():
            return HealthResult(status=SiteStatus.SSL_ERROR, error_message=str(e)[:200])
        return HealthResult(status=SiteStatus.CONNECTION_ERROR, error_message=str(e)[:200])

    return HealthResult(status=SiteStatus.CONNECTION_ERROR, error_message="Failed after retries")


async def check_all(domains: list[str]) -> dict[str, HealthResult]:
    """Lance le health check sur tous les domaines en parallele."""
    semaphore = asyncio.Semaphore(HTTP_MAX_CONCURRENT)

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(HTTP_TIMEOUT),
        headers={"User-Agent": HTTP_USER_AGENT},
        verify=False,
    ) as client:
        tasks = {
            domain: asyncio.create_task(check_site(client, domain, semaphore))
            for domain in domains
        }
        results = {}
        total = len(tasks)
        done = 0
        for domain, task in tasks.items():
            results[domain] = await task
            done += 1
            status_icon = "+" if results[domain].is_alive else "x"
            print(f"  [{done}/{total}] {status_icon} {domain} -> {results[domain].status.value} ({results[domain].http_code or 'N/A'})", flush=True)

    return results
