"""
MLI Crawler — Module Hygiène : Attention Scorer
Utilise Playwright (sync) pour charger les pages et compter les éléments publicitaires.
"""
from __future__ import annotations

from config import (
    PW_TIMEOUT,
    PW_MAX_CONCURRENT,
    PW_AD_SELECTORS,
    PENALTY_PER_AD,
    MFA_THRESHOLD,
)
from models import AttentionResult


def score_site(page_factory, domain: str) -> AttentionResult:
    """Charge une page avec Playwright et compte les pubs."""
    url = f"https://{domain}"

    try:
        page = page_factory()
        try:
            page.goto(url, timeout=PW_TIMEOUT, wait_until="domcontentloaded")
            # Attendre un peu que les pubs lazy-loadent
            page.wait_for_timeout(3000)

            # Compter les éléments publicitaires par selector
            details = {}
            total_ads = 0

            for selector in PW_AD_SELECTORS:
                try:
                    count = page.locator(selector).count()
                    if count > 0:
                        details[selector] = count
                        total_ads += count
                except Exception:
                    continue

            # Calculer le score d'attention
            score = max(0.0, 10.0 - total_ads * PENALTY_PER_AD)
            is_mfa = score < MFA_THRESHOLD

            return AttentionResult(
                ad_count=total_ads,
                score=round(score, 1),
                is_mfa=is_mfa,
                details=details,
            )
        finally:
            page.close()

    except Exception as e:
        return AttentionResult(
            error=f"Playwright error: {str(e)[:200]}",
            score=5.0,  # score neutre si on ne peut pas mesurer
        )


def score_all(domains: list[str]) -> dict[str, AttentionResult]:
    """Lance le scoring d'attention sur tous les domaines vivants."""
    from playwright.sync_api import sync_playwright

    results = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )

        page_factory = context.new_page

        total = len(domains)

        for done, domain in enumerate(domains, 1):
            results[domain] = score_site(page_factory, domain)
            r = results[domain]
            mfa_flag = " ⚠ MFA" if r.is_mfa else ""
            print(f"  [{done}/{total}] {domain} → {r.ad_count} pubs, score {r.score}/10{mfa_flag}")

        browser.close()

    return results
