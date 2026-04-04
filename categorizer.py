"""
MLI Crawler — Module Expansion IA : Catégorisation
Utilise Mistral pour classer chaque site dans une taxonomie métier.
"""
from __future__ import annotations
import json
import os

from config import (
    MISTRAL_MODEL,
    MISTRAL_MAX_CONCURRENT,
    MISTRAL_TEMPERATURE,
    TAXONOMY,
    CATEGORIZATION_PROMPT,
)
from models import CategoryResult


def _build_prompt(domain: str, metadata: dict) -> str:
    """Construit le prompt de catégorisation."""
    taxonomy_str = "\n".join(f"- {cat}" for cat in TAXONOMY)
    return CATEGORIZATION_PROMPT.format(
        taxonomy=taxonomy_str,
        domain=domain,
        title=metadata.get("title", "Non disponible"),
        description=metadata.get("description", "Non disponible"),
        h1=metadata.get("h1", "Non disponible"),
    )


def extract_metadata(page_factory, domain: str) -> dict:
    """Extrait title, meta description et h1 via Playwright (sync)."""
    url = f"https://{domain}"
    try:
        page = page_factory()
        try:
            page.goto(url, timeout=15_000, wait_until="domcontentloaded")

            title = page.title() or ""
            description = ""
            h1 = ""

            try:
                meta = page.locator('meta[name="description"]').first.get_attribute("content")
                description = meta or ""
            except Exception:
                pass

            try:
                h1 = page.locator("h1").first.inner_text()
            except Exception:
                pass

            return {"title": title[:300], "description": description[:500], "h1": h1[:200]}
        finally:
            page.close()
    except Exception:
        return {"title": "", "description": "", "h1": ""}


def categorize_site(
    client,
    domain: str,
    metadata: dict,
) -> CategoryResult:
    """Catégorise un seul site via Mistral (sync)."""
    prompt = _build_prompt(domain, metadata)

    try:
        response = client.chat.complete(
            model=MISTRAL_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=MISTRAL_TEMPERATURE,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content.strip()

        # Parser la réponse JSON
        try:
            data = json.loads(raw)
            category = data.get("category", "Autre")
            confidence = float(data.get("confidence", 0.0))

            # Vérifier que la catégorie est dans la taxonomie
            if category not in TAXONOMY:
                # Chercher un match partiel
                for tax_cat in TAXONOMY:
                    if category.lower() in tax_cat.lower() or tax_cat.lower() in category.lower():
                        category = tax_cat
                        break
                else:
                    category = "Autre"

            return CategoryResult(
                category=category,
                confidence=round(confidence, 2),
                raw_response=raw,
            )
        except (json.JSONDecodeError, ValueError) as e:
            return CategoryResult(
                category="Autre",
                confidence=0.0,
                raw_response=raw,
                error=f"JSON parse error: {e}",
            )

    except Exception as e:
        return CategoryResult(error=f"Mistral error: {str(e)[:200]}")


def categorize_all(
    domains: list[str],
    metadata_map: dict[str, dict],
) -> dict[str, CategoryResult]:
    """Catégorise tous les domaines via Mistral (sync)."""
    from mistralai.client import Mistral

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        print("  ⚠ MISTRAL_API_KEY non définie — catégorisation skippée")
        return {d: CategoryResult(error="No API key") for d in domains}

    client = Mistral(api_key=api_key)
    results = {}
    total = len(domains)

    for done, domain in enumerate(domains, 1):
        results[domain] = categorize_site(client, domain, metadata_map.get(domain, {}))
        r = results[domain]
        print(f"  [{done}/{total}] {domain} → {r.category} (confiance: {r.confidence})")

    return results
