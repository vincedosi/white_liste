"""Pure helpers for site/domain normalisation — no DB, no Playwright."""
from __future__ import annotations


def clean_domain(raw: str) -> str:
    """Normalise a domain entry: strip spaces, scheme, leading www., trailing
    slash; lowercase. Keeps any path (some entries target a sub-section)."""
    d = (raw or "").strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    if d.startswith("www."):
        d = d[4:]
    d = d.rstrip("/")
    return d


def dedup_domains(domains) -> list[str]:
    """Clean each entry, drop blanks, dedup while preserving first-seen order."""
    seen = set()
    out = []
    for raw in domains:
        d = clean_domain(raw)
        if not d or d in seen:
            continue
        seen.add(d)
        out.append(d)
    return out
