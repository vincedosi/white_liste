"""Pure detection & scoring helpers — no Playwright dependency.

Isolated from pw_worker.py so the logic can be unit-tested without a browser.
"""
from __future__ import annotations

import math


def dedup_nested_ads(ads):
    """Collapse over-counted ad boxes: drop a box whose centre lies inside a
    larger already-kept box (wrapper + child both matched by selectors).

    `ads`: list of dicts with x, y, width, height. Keeps the larger box.
    Returns a filtered list (order = largest first).
    """
    def _area(a):
        return (a.get("width", 0) or 0) * (a.get("height", 0) or 0)

    kept = []
    for a in sorted(ads, key=_area, reverse=True):
        cx = (a.get("x", 0) or 0) + (a.get("width", 0) or 0) / 2
        cy = (a.get("y", 0) or 0) + (a.get("height", 0) or 0) / 2
        nested = False
        for k in kept:
            kx, ky = k.get("x", 0) or 0, k.get("y", 0) or 0
            if kx <= cx <= kx + (k.get("width", 0) or 0) and ky <= cy <= ky + (k.get("height", 0) or 0):
                nested = True
                break
        if not nested:
            kept.append(a)
    return kept


def score_from_penalty(total_penalty, k: float = 8.0) -> float:
    """Saturating map from cumulative weighted ad penalty to a 0-10 score.

    0 penalty -> 10 ; the score decays smoothly and saturates toward 0 instead
    of falling off a cliff at penalty=10. `k` controls how fast it decays.
    """
    return round(10.0 * math.exp(-max(0.0, total_penalty) / k), 1)


def is_content_sufficient(visible_text_len: int, dom_node_count: int,
                          min_text: int = 200, min_nodes: int = 50) -> bool:
    """Did the page render real content, or is it a blank/SPA shell?

    A blank page (failed SPA hydration, hard timeout) has almost no visible
    text and very few DOM nodes. Require BOTH a minimum of visible text and a
    minimum DOM size to consider the page 'loaded'.
    """
    return visible_text_len >= min_text and dom_node_count >= min_nodes


def detect_video_ad_domains(intercepted_urls, video_domains, video_path_hints):
    """Distinct in-stream video-ad signals seen in network request URLs.

    `video_domains`   : known video SSP / IMA hosts.
    `video_path_hints`: VAST/VMAP url fragments served by generic ad hosts.
    Returns a sorted list of matched keys (domain string or 'vast-endpoint').
    """
    found = set()
    for u in intercepted_urls:
        ul = (u or "").lower()
        for d in video_domains:
            if d in ul:
                found.add(d)
        if any(h in ul for h in video_path_hints):
            found.add("vast-endpoint")
    return sorted(found)


def compute_video_ad_units(has_player: bool, video_ad_domains) -> int:
    """Estimate in-stream video ad slots from passive signals (no play-click).

    A confirmed VAST/VMAP ad request ('vast-endpoint'), or a detected player
    plus video infra, means a real in-stream ad slot — the network call is the
    reliable signal, so it counts even without a <video> element on the page.
    Extra distinct video signals => more slots (capped at 4). Generic video-SSP
    domains alone (no player, no VAST call) are weak (could be cookie syncs):
    1 unit only if >=2 distinct signals.
    """
    n = len(video_ad_domains)
    if n == 0:
        return 0
    strong = has_player or ("vast-endpoint" in video_ad_domains)
    if strong:
        return min(n, 4)
    return 1 if n >= 2 else 0


def video_penalty(units: int, per_unit: float = 1.5) -> float:
    """Score penalty for in-stream video ads (heavier than a display banner)."""
    return units * per_unit


def combine_scores(clutter_score, v4_score):
    """Final score = the most penalizing (lowest) available evidence score.

    Returns None only if BOTH inputs are None (page not scored).
    """
    vals = [s for s in (clutter_score, v4_score) if s is not None]
    if not vals:
        return None
    return round(min(vals), 1)


def is_suspect_false_negative(scripts_detected, network_ad_requests,
                              dom_ad_count, ad_surface_pct) -> bool:
    """Vrai si des signaux ad-tech existent (scripts détectés OU requêtes pub
    réseau) MAIS aucune pub VISIBLE (0 élément DOM encadré et surface ≈ 0 %).
    C'est le faux-négatif typique du headless (créas non rendues)."""
    has_adtech = bool(scripts_detected) or (network_ad_requests or 0) > 0
    no_visible = (dom_ad_count or 0) == 0 and (ad_surface_pct or 0) < 0.5
    return has_adtech and no_visible


def visible_ad_score(result: dict) -> tuple:
    """Clé de tri d'un résultat de scénario : plus de pubs visibles d'abord,
    puis plus de surface pub."""
    details = result.get("details") or {}
    return (result.get("dom_ad_count", 0) or 0, details.get("ad_surface_pct", 0) or 0)


def pick_best(results: list) -> dict:
    """Retourne le résultat avec le plus de pubs visibles (départage : surface)."""
    return max(results, key=visible_ad_score)


# ── Classification de détection pub (friendly iframes, conteneurs ad, IAB) ──
# Tailles IAB standard (source unique ; pw_worker importe cette liste pour le JS).
IAB_SIZES = [
    (728, 90), (300, 250), (160, 600), (300, 600),
    (970, 250), (970, 90), (320, 50), (320, 100),
    (336, 280), (120, 600), (468, 60), (250, 250),
    (180, 150), (300, 50),
]
IAB_TOLERANCE = 20

# Tokens de classe/id qui, SEULS, marquent un conteneur pub (égalité exacte).
AD_CONTAINER_TOKENS = (
    "ad", "ads", "pub", "pubs", "publicite", "publicites",
    "annonce", "annonces", "werbung", "reklama", "sponsor", "sponsored",
)
# Sous-chaînes ad reconnues à l'intérieur d'un token (réseaux / frameworks).
AD_CONTAINER_SUBSTRINGS = (
    "actirise", "adunit", "adslot", "adsense", "adsbygoogle", "adtech",
    "advert", "adngin", "adbutler", "prebid", "googletag", "gpt", "dfp",
    "taboola", "outbrain", "smartad", "admiral",
)


def iab_size_match(w, h, sizes=IAB_SIZES, tolerance: int = IAB_TOLERANCE) -> bool:
    """Vrai si (w, h) correspond à une taille IAB standard (± tolerance)."""
    w = w or 0
    h = h or 0
    for iw, ih in sizes:
        if abs(w - iw) <= tolerance and abs(h - ih) <= tolerance:
            return True
    return False


def is_ad_container_signature(signature) -> bool:
    """Vrai si la signature (`id + ' ' + className`) d'un élément dénote un
    conteneur publicitaire. Tokenise sur les non-alphanum pour éviter les faux
    positifs ('header', 'loader', 'gradient'… contiennent 'ad' en sous-chaîne
    mais ne sont PAS des tokens 'ad')."""
    if not signature:
        return False
    import re
    tokens = [t for t in re.split(r"[^a-z0-9]+", signature.lower()) if t]
    for tok in tokens:
        if tok in AD_CONTAINER_TOKENS:
            return True
        if any(sub in tok for sub in AD_CONTAINER_SUBSTRINGS):
            return True
    return False


def is_friendly_iframe_ad(width, height, src, in_ad_container, iab_match,
                          min_w: int = 100, min_h: int = 30) -> bool:
    """Vrai si une iframe « friendly » (src vide / about:blank / javascript:,
    créa injectée par JS — rendu standard Prebid/SafeFrame/actirise) est une pub.
    Critère : friendly + taille non triviale + (taille IAB OU dans un conteneur
    ad). Les iframes à vrai src (cross-origin) renvoient False — gérées ailleurs."""
    s = (src or "").strip().lower()
    is_friendly = s in ("", "about:blank") or s.startswith("javascript:")
    if not is_friendly:
        return False
    if (width or 0) < min_w or (height or 0) < min_h:
        return False
    return bool(iab_match or in_ad_container)


def rect_union_area(rects) -> float:
    """Aire de l'UNION de rectangles `(x1, y1, x2, y2)` — les chevauchements
    ne sont comptés qu'une fois. Évite le sur-comptage de surface pub quand un
    wrapper, son iframe enfant et des doublons couvrent la même zone (sinon
    surface > viewport → ratio > 100 %). Compression de coordonnées, O(n²)."""
    boxes = [r for r in rects if r[2] > r[0] and r[3] > r[1]]
    if not boxes:
        return 0.0
    xs = sorted({r[0] for r in boxes} | {r[2] for r in boxes})
    ys = sorted({r[1] for r in boxes} | {r[3] for r in boxes})
    area = 0.0
    for i in range(len(xs) - 1):
        x1, x2 = xs[i], xs[i + 1]
        cx = (x1 + x2) / 2
        for j in range(len(ys) - 1):
            y1, y2 = ys[j], ys[j + 1]
            cy = (y1 + y2) / 2
            for r in boxes:
                if r[0] <= cx <= r[2] and r[1] <= cy <= r[3]:
                    area += (x2 - x1) * (y2 - y1)
                    break
    return area


def should_retry_headful(status, currently_headless) -> bool:
    """Vrai si un domaine en `load_error` doit être ré-audité en non-headless.
    Le navigateur visible débloque souvent les anti-bot (DataDome) et les shells
    SPA qui refusent le headless. Inutile si on tourne déjà en non-headless."""
    return status == "load_error" and bool(currently_headless)


def is_navigation_error_url(url) -> bool:
    """Vrai si l'URL courante de la page est une page d'erreur INTERNE du
    navigateur (échec de navigation : connexion refusée/réinitialisée, timeout…).
    `chrome-error://` n'est jamais une vraie page : en non-headless Chrome y rend
    une page d'erreur AVEC texte qui tromperait le garde-fou de contenu → faux
    10/10. La détecter permet de basculer en load_error."""
    return bool(url) and str(url).startswith("chrome-error://")


def fullpage_capture_plan(scroll_height, full_threshold: int = 12000,
                          max_px: int = 20000) -> tuple:
    """Plan de capture pleine page. `<= full_threshold` → `("full", h)` :
    `full_page=True` natif (chemin éprouvé, inchangé pour les sites courants).
    Sinon → `("bounded", h)` : capture bornée par redimensionnement viewport à
    `min(hauteur, max_px)`, qui évite le hang de `full_page` sur les pages
    géantes/infinies tout en gardant une capture (le haut de page contient les
    zones scorées ATF/MID/DEEP). Hauteur inconnue (0/None) → bornée au max."""
    h = scroll_height or 0
    if 0 < h <= full_threshold:
        return ("full", h)
    return ("bounded", min(h, max_px) if h else max_px)


def is_iab_container_ad(iab_match, has_iframe, has_ad_network_img,
                        has_image, in_ad_container) -> bool:
    """Un conteneur de taille IAB n'est une pub que s'il porte un signal pub
    CORROBORANT : il contient une iframe, une image servie par une régie, ou
    il est dans un conteneur classé ad ET contient une créa (image). Une simple
    image externe (CDN first-party, ex. vignettes Wikipédia) ne suffit PLUS."""
    if not iab_match:
        return False
    if has_iframe or has_ad_network_img:
        return True
    if in_ad_container and has_image:
        return True
    return False
