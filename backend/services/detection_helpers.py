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
