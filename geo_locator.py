"""
MLI — Module Localisation
Géolocalisation serveur (IP), extraction TLD, langue du contenu.
"""
from __future__ import annotations
import socket
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

# ── Mapping TLD → Pays ──────────────────────────────────
TLD_COUNTRY_MAP = {
    "fr": "France", "de": "Allemagne", "es": "Espagne", "it": "Italie",
    "pt": "Portugal", "nl": "Pays-Bas", "be": "Belgique", "ch": "Suisse",
    "at": "Autriche", "uk": "Royaume-Uni", "ie": "Irlande", "us": "États-Unis",
    "ca": "Canada", "au": "Australie", "nz": "Nouvelle-Zélande", "jp": "Japon",
    "cn": "Chine", "kr": "Corée du Sud", "in": "Inde", "br": "Brésil",
    "mx": "Mexique", "ar": "Argentine", "cl": "Chili", "co": "Colombie",
    "se": "Suède", "no": "Norvège", "dk": "Danemark", "fi": "Finlande",
    "pl": "Pologne", "cz": "Tchéquie", "hu": "Hongrie", "ro": "Roumanie",
    "ru": "Russie", "ua": "Ukraine", "tr": "Turquie", "il": "Israël",
    "za": "Afrique du Sud", "ma": "Maroc", "tn": "Tunisie", "dz": "Algérie",
    "eg": "Égypte", "sa": "Arabie Saoudite", "ae": "Émirats", "sg": "Singapour",
    "hk": "Hong Kong", "tw": "Taïwan", "th": "Thaïlande", "vn": "Vietnam",
    "ph": "Philippines", "id": "Indonésie", "my": "Malaisie",
}

# ── Country code → (lat, lon) for map display ─────────────
COUNTRY_COORDS = {
    "FR": (46.6, 2.2), "US": (39.8, -98.6), "DE": (51.2, 10.4),
    "GB": (55.4, -3.4), "NL": (52.1, 5.3), "CA": (56.1, -106.3),
    "IE": (53.4, -8.2), "BE": (50.5, 4.5), "CH": (46.8, 8.2),
    "IT": (41.9, 12.5), "ES": (40.5, -3.7), "PT": (39.4, -8.2),
    "SE": (60.1, 18.6), "NO": (60.5, 8.5), "DK": (56.3, 9.5),
    "FI": (61.9, 25.7), "PL": (51.9, 19.1), "CZ": (49.8, 15.5),
    "AT": (47.5, 14.6), "JP": (36.2, 138.3), "AU": (-25.3, 133.8),
    "SG": (1.4, 103.8), "HK": (22.4, 114.1), "IN": (20.6, 79.0),
    "BR": (-14.2, -51.9), "RU": (61.5, 105.3), "ZA": (-30.6, 22.9),
    "CN": (35.9, 104.2), "KR": (35.9, 127.8), "TW": (23.7, 121.0),
    "TH": (15.9, 100.5), "VN": (14.1, 108.3), "PH": (12.9, 121.8),
    "ID": (-0.8, 113.9), "MY": (4.2, 101.9), "TR": (38.9, 35.2),
    "IL": (31.0, 34.9), "SA": (23.9, 45.1), "AE": (23.4, 53.8),
    "MX": (23.6, -102.6), "AR": (-38.4, -63.6), "CL": (-35.7, -71.5),
    "CO": (4.6, -74.3), "HU": (47.2, 19.5), "RO": (45.9, 24.97),
    "UA": (48.4, 31.2), "MA": (31.8, -7.1), "TN": (33.9, 9.5),
    "DZ": (28.0, 1.7), "EG": (26.8, 30.8), "NZ": (-40.9, 174.9),
}

# ── Mapping code langue → langue lisible ─────────────────
LANG_MAP = {
    "fr": "Français", "en": "Anglais", "de": "Allemand", "es": "Espagnol",
    "it": "Italien", "pt": "Portugais", "nl": "Néerlandais", "pl": "Polonais",
    "ru": "Russe", "ja": "Japonais", "zh": "Chinois", "ko": "Coréen",
    "ar": "Arabe", "tr": "Turc", "sv": "Suédois", "da": "Danois",
    "no": "Norvégien", "fi": "Finnois", "cs": "Tchèque", "hu": "Hongrois",
    "ro": "Roumain", "uk": "Ukrainien", "th": "Thaï", "vi": "Vietnamien",
    "he": "Hébreu", "hi": "Hindi", "bn": "Bengali", "id": "Indonésien",
    "ms": "Malais", "el": "Grec", "bg": "Bulgare", "hr": "Croate",
    "sk": "Slovaque", "sl": "Slovène", "lt": "Lituanien", "lv": "Letton",
    "et": "Estonien", "ca": "Catalan",
}


@dataclass
class LocalizationResult:
    # TLD
    tld: str = ""
    tld_country: str = ""

    # IP / Serveur
    ip_address: str = ""
    server_country: str = ""
    server_country_code: str = ""
    server_city: str = ""
    server_isp: str = ""

    # Contenu
    content_lang_code: str = ""
    content_lang: str = ""

    # Erreurs
    error: str | None = None

    def to_flat_dict(self) -> dict:
        return {
            "tld": self.tld,
            "tld_country": self.tld_country,
            "ip_address": self.ip_address,
            "server_country": self.server_country,
            "server_country_code": self.server_country_code,
            "server_city": self.server_city,
            "server_isp": self.server_isp,
            "content_lang_code": self.content_lang_code,
            "content_lang": self.content_lang,
        }


def extract_tld(domain: str) -> tuple[str, str]:
    """Extrait le TLD et le pays correspondant."""
    parts = domain.lower().strip().rstrip("/").split(".")
    tld = parts[-1] if parts else ""

    # Gérer les TLD composés (co.uk, com.au, etc.)
    if len(parts) >= 3 and parts[-2] in ("co", "com", "org", "net", "ac", "gov"):
        country_tld = parts[-1]
    else:
        country_tld = tld

    country = TLD_COUNTRY_MAP.get(country_tld, "")
    return tld, country


def resolve_ip(domain: str) -> str:
    """Résout le domaine en adresse IP."""
    try:
        return socket.getaddrinfo(domain, 443)[0][4][0]
    except (socket.gaierror, IndexError, OSError):
        try:
            return socket.getaddrinfo(domain, 80)[0][4][0]
        except Exception:
            return ""


def geolocate_ip(ip: str) -> dict:
    """Géolocalise une IP via ip-api.com (gratuit, 45 req/min)."""
    if not ip:
        return {}
    try:
        resp = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,country,countryCode,city,isp"},
            timeout=5,
        )
        data = resp.json()
        if data.get("status") == "success":
            return data
    except Exception:
        pass
    return {}


def parse_content_lang(lang_raw: str) -> tuple[str, str]:
    """Parse un code langue brut ('fr-FR', 'en', 'fr_FR') en (code, nom)."""
    if not lang_raw:
        return "", ""

    # Normaliser
    code = lang_raw.strip().lower().replace("_", "-").split("-")[0]

    if len(code) != 2:
        return lang_raw, ""

    name = LANG_MAP.get(code, "")
    return code, name


def localize_all(
    domains: list[str],
    content_langs: dict[str, str] | None = None,
    progress_callback=None,
) -> dict[str, LocalizationResult]:
    """
    Localise tous les domaines.

    Args:
        domains: Liste de domaines.
        content_langs: dict[domain -> lang_code] extrait de Playwright.
        progress_callback: Callable(done, total, domain, result) pour le suivi.
    """
    results = {}
    total = len(domains)

    # Batch les requêtes IP (rate limit ip-api.com : 45/min)
    for i, domain in enumerate(domains):
        result = LocalizationResult()

        # 1. TLD
        tld, tld_country = extract_tld(domain)
        result.tld = tld
        result.tld_country = tld_country

        # 2. IP + Géoloc
        ip = resolve_ip(domain)
        result.ip_address = ip

        if ip:
            geo = geolocate_ip(ip)
            if geo:
                result.server_country = geo.get("country", "")
                result.server_country_code = geo.get("countryCode", "")
                result.server_city = geo.get("city", "")
                result.server_isp = geo.get("isp", "")

        # 3. Langue du contenu (fournie par Playwright)
        if content_langs and domain in content_langs:
            lang_raw = content_langs[domain]
            code, name = parse_content_lang(lang_raw)
            result.content_lang_code = code
            result.content_lang = name

        results[domain] = result

        if progress_callback:
            progress_callback(i + 1, total, domain, result)

        # Rate limit pour ip-api.com (45 req/min → ~1.4s entre chaque)
        # On met 1.5s pour être safe, sauf si pas de géoloc
        if ip and i < total - 1:
            time.sleep(1.5)

    return results
