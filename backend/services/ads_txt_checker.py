"""
MLI — Module ads.txt
Verifie la presence du fichier ads.txt et parse les SSPs autorises.
"""
from __future__ import annotations
import asyncio
import sys
from dataclasses import dataclass, field
from pathlib import Path

import httpx

# Allow imports from backend package
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import HTTP_TIMEOUT, HTTP_MAX_CONCURRENT, HTTP_USER_AGENT


@dataclass
class AdsTxtResult:
    has_ads_txt: bool = False
    http_code: int | None = None
    raw_lines: int = 0
    seller_count: int = 0
    sellers: list[dict] = field(default_factory=list)
    is_direct: bool = False
    is_reseller: bool = False
    top_ssps: list[str] = field(default_factory=list)
    error: str | None = None

    def to_flat_dict(self) -> dict:
        return {
            "has_ads_txt": self.has_ads_txt,
            "ads_txt_http_code": self.http_code,
            "ads_txt_sellers": self.seller_count,
            "ads_txt_direct": self.is_direct,
            "ads_txt_reseller": self.is_reseller,
            "ads_txt_top_ssps": ", ".join(self.top_ssps[:10]),
        }


SSP_NAMES = {
    "google.com": "Google AdX",
    "googlesyndication.com": "Google AdSense",
    "appnexus.com": "Xandr (AppNexus)",
    "indexexchange.com": "Index Exchange",
    "openx.com": "OpenX",
    "pubmatic.com": "PubMatic",
    "rubiconproject.com": "Magnite (Rubicon)",
    "smartadserver.com": "Equativ (Smart)",
    "amazon-adsystem.com": "Amazon Ads",
    "criteo.com": "Criteo",
    "triplelift.com": "TripleLift",
    "outbrain.com": "Outbrain",
    "taboola.com": "Taboola",
    "sovrn.com": "Sovrn",
    "33across.com": "33Across",
    "teads.com": "Teads",
    "freewheel.com": "FreeWheel",
    "spotx.tv": "SpotX",
    "improvedigital.com": "Improve Digital",
    "adform.com": "Adform",
    "contextweb.com": "PulsePoint",
    "sharethrough.com": "Sharethrough",
    "liveintent.com": "LiveIntent",
    "yieldmo.com": "YieldMo",
    "media.net": "Media.net",
    "richaudience.com": "Rich Audience",
    "onetag.com": "OneTag",
    "seedtag.com": "Seedtag",
    "dailymotion.com": "Dailymotion",
    "vidoomy.com": "Vidoomy",
}


def parse_ads_txt_line(line: str) -> dict | None:
    """Parse une ligne ads.txt au format IAB."""
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("//"):
        return None
    if "=" in line and "," not in line:
        return None

    parts = [p.strip() for p in line.split(",")]
    if len(parts) < 3:
        return None

    domain = parts[0].lower()
    pub_id = parts[1]
    relationship = parts[2].upper()

    if relationship not in ("DIRECT", "RESELLER"):
        return None

    cert = parts[3] if len(parts) > 3 else ""
    ssp_name = SSP_NAMES.get(domain, domain)

    return {
        "domain": domain,
        "ssp_name": ssp_name,
        "publisher_id": pub_id,
        "relationship": relationship,
        "cert_authority": cert,
    }


async def check_ads_txt(
    client: httpx.AsyncClient,
    domain: str,
    semaphore: asyncio.Semaphore,
) -> AdsTxtResult:
    """Verifie et parse le ads.txt d'un domaine."""
    url = f"https://{domain}/ads.txt"

    try:
        async with semaphore:
            response = await client.get(url, follow_redirects=True)

        result = AdsTxtResult(http_code=response.status_code)

        if response.status_code != 200:
            result.has_ads_txt = False
            return result

        content = response.text
        lines = content.splitlines()
        result.raw_lines = len(lines)
        result.has_ads_txt = True

        sellers = []
        ssp_set = set()
        has_direct = False
        has_reseller = False

        for line in lines:
            parsed = parse_ads_txt_line(line)
            if parsed:
                sellers.append(parsed)
                ssp_set.add(parsed["ssp_name"])
                if parsed["relationship"] == "DIRECT":
                    has_direct = True
                elif parsed["relationship"] == "RESELLER":
                    has_reseller = True

        result.seller_count = len(sellers)
        result.sellers = sellers[:50]
        result.is_direct = has_direct
        result.is_reseller = has_reseller
        result.top_ssps = sorted(ssp_set)[:20]

        return result

    except Exception as e:
        return AdsTxtResult(error=str(e)[:200])


async def check_all_ads_txt(domains: list[str]) -> dict[str, AdsTxtResult]:
    """Verifie ads.txt pour tous les domaines."""
    semaphore = asyncio.Semaphore(HTTP_MAX_CONCURRENT)
    results = {}
    total = len(domains)

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(HTTP_TIMEOUT),
        headers={"User-Agent": HTTP_USER_AGENT},
        verify=False,
    ) as client:
        tasks = {
            domain: asyncio.create_task(check_ads_txt(client, domain, semaphore))
            for domain in domains
        }
        done = 0
        for domain, task in tasks.items():
            results[domain] = await task
            done += 1
            r = results[domain]
            icon = "+" if r.has_ads_txt else "x"
            count = f"{r.seller_count} sellers" if r.has_ads_txt else "absent"
            print(f"  [{done}/{total}] {icon} {domain} -> {count}")

    return results
