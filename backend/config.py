"""
MLI Crawler — Configuration
"""
from pathlib import Path

# ── Chemins ──────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR.parent / "output"

# ── Health Checker ───────────────────────────────────────
HTTP_TIMEOUT = 8  # secondes
HTTP_MAX_CONCURRENT = 50  # requêtes parallèles (ajuster selon ta bande passante)
HTTP_RETRIES = 1
HTTP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Attention Scorer (Playwright) ────────────────────────
PW_TIMEOUT = 20_000  # ms
PW_MAX_CONCURRENT = 5  # Playwright est gourmand — garder bas
PW_AD_SELECTORS = [
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='amazon-adsystem']",
    "iframe[src*='taboola']",
    "iframe[src*='outbrain']",
    "div[id*='google_ads']",
    "div[class*='ad-container']",
    "div[class*='ad-slot']",
    "div[class*='pub-container']",
    "div[class*='advertisement']",
    "div[data-ad]",
    "ins.adsbygoogle",
    "div[id*='taboola']",
    "div[id*='outbrain']",
    "aside[class*='ad']",
]

# Seuils du score d'attention (0-10)
# Le score est calculé comme : max(0, 10 - nb_ads * PENALTY_PER_AD)
PENALTY_PER_AD = 0.8  # chaque pub détectée enlève 0.8 points
MFA_THRESHOLD = 4.0  # en dessous = Made For Advertising

# ── Catégorisation IA (Mistral) ──────────────────────────
MISTRAL_MODEL = "mistral-small-latest"
MISTRAL_MAX_CONCURRENT = 10  # rate limit Mistral
MISTRAL_TEMPERATURE = 0.1  # basse pour de la classification

TAXONOMY = [
    "News / Actualités",
    "Sport",
    "Finance / Économie",
    "Automobile",
    "Tech / Science",
    "Lifestyle / Mode",
    "Cuisine / Gastronomie",
    "Santé / Bien-être",
    "Culture / Divertissement",
    "Gaming / Jeux vidéo",
    "Immobilier",
    "Voyage / Tourisme",
    "Éducation",
    "Petites annonces / Marketplace",
    "Autre",
]

CATEGORIZATION_PROMPT = """Tu es un expert en catégorisation de sites web pour l'industrie publicitaire programmatique.

Analyse les métadonnées suivantes d'un site web et attribue-lui UNE SEULE catégorie parmi la liste ci-dessous.

Catégories possibles :
{taxonomy}

Réponds UNIQUEMENT avec un JSON valide, sans aucun texte avant ou après :
{{"category": "<catégorie exacte de la liste>", "confidence": <float entre 0 et 1>}}

Métadonnées du site :
- Domaine : {domain}
- Titre : {title}
- Description : {description}
- H1 principal : {h1}
"""

# ── Détection vidéo (in-stream / replay) ─────────────────
VIDEO_AD_DOMAINS = [
    "imasdk.googleapis.com", "freewheel.com", "spotx.tv", "spotxchange.com",
    "springserve.com", "teads.tv", "jwpcdn.com", "jwplayer.com",
    "dailymotion.com/player",
]
VIDEO_AD_PATH_HINTS = ["/pubads", "vast", "vmap", "video_ad", "preroll"]
VIDEO_PLAYER_SELECTOR = (
    "video, .video-js, .jwplayer, [class*='player'], [id*='player'], "
    "iframe[src*='dailymotion'], iframe[src*='youtube']"
)
VIDEO_PENALTY_PER_UNIT = 1.5

# Âge (jours) au-delà duquel un site est "à ré-analyser"
STALE_DAYS = 14

# ── Garde-fou chargement de page (anti page blanche / SPA) ─
CONTENT_MIN_TEXT = 200    # caractères de texte visible minimum
CONTENT_MIN_NODES = 50    # nœuds DOM minimum
NAV_RETRY_TIMEOUT_MS = 15_000
