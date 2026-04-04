"""
MLI Crawler — Pipeline Orchestrateur
Enchaîne les 3 modules : Health → Attention → Catégorisation.
"""
from __future__ import annotations
import asyncio
import time

from models import SiteAudit, AuditReport, HealthResult, AttentionResult, CategoryResult
from health_checker import check_all
from attention_scorer import score_all
from categorizer import categorize_all, extract_metadata
from exporter import export_json, export_excel, print_summary


async def run_pipeline(
    domains: list[str],
    client_name: str = "default",
    skip_attention: bool = False,
    skip_categorization: bool = False,
) -> AuditReport:
    """
    Pipeline principal MLI.

    Args:
        domains: Liste de domaines à auditer.
        client_name: Nom du client (pour les fichiers de sortie).
        skip_attention: Skip le module Playwright (plus rapide pour debug).
        skip_categorization: Skip le module Mistral (pas de clé API).
    """
    total_start = time.monotonic()
    audits: dict[str, SiteAudit] = {d: SiteAudit(domain=d) for d in domains}

    # ── Étape 1 : Health Check ───────────────────────────
    print("\n🔍 Étape 1/3 — Health Check (HTTP async)")
    print("-" * 40)
    t = time.monotonic()
    health_results = await check_all(domains)
    for domain, result in health_results.items():
        audits[domain].health = result
    print(f"  ⏱ Terminé en {time.monotonic() - t:.1f}s")

    # Filtrer les sites vivants pour les étapes suivantes
    alive_domains = [d for d in domains if audits[d].health.is_alive]
    dead_count = len(domains) - len(alive_domains)
    print(f"\n  → {len(alive_domains)} sites vivants, {dead_count} morts")

    # ── Étape 2 : Attention Scoring ──────────────────────
    if not skip_attention and alive_domains:
        print("\n👁 Étape 2/3 — Attention Scoring (Playwright)")
        print("-" * 40)
        t = time.monotonic()
        attention_results = score_all(alive_domains)
        for domain, result in attention_results.items():
            audits[domain].attention = result
        print(f"  ⏱ Terminé en {time.monotonic() - t:.1f}s")
    else:
        if skip_attention:
            print("\n👁 Étape 2/3 — Attention Scoring → SKIPPÉ")

    # ── Étape 3 : Catégorisation IA ──────────────────────
    if not skip_categorization and alive_domains:
        print("\n🤖 Étape 3/3 — Catégorisation IA (Mistral)")
        print("-" * 40)
        t = time.monotonic()

        # Extraire les métadonnées si Playwright est dispo
        metadata_map = {}
        if not skip_attention:
            print("  Extraction des métadonnées...")
            from playwright.sync_api import sync_playwright

            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                context = browser.new_context()
                page_factory = context.new_page

                for domain in alive_domains:
                    metadata_map[domain] = extract_metadata(page_factory, domain)

                browser.close()
        else:
            # Fallback : métadonnées vides, Mistral se base sur le nom de domaine
            metadata_map = {d: {} for d in alive_domains}

        cat_results = categorize_all(alive_domains, metadata_map)
        for domain, result in cat_results.items():
            audits[domain].categorization = result
        print(f"  ⏱ Terminé en {time.monotonic() - t:.1f}s")
    else:
        if skip_categorization:
            print("\n🤖 Étape 3/3 — Catégorisation IA → SKIPPÉ")

    # ── Décisions finales ────────────────────────────────
    for audit in audits.values():
        audit.decide_action()

    # ── Rapport ──────────────────────────────────────────
    report = AuditReport(results=list(audits.values()))
    report.compute_stats()

    # Export
    export_json(report, client_name)
    export_excel(report, client_name)
    print_summary(report)

    total_elapsed = time.monotonic() - total_start
    print(f"\n⏱ Pipeline complet en {total_elapsed:.1f}s")

    return report
