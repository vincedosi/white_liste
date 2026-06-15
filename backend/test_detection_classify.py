"""Tests des helpers de classification de détection pub (friendly iframes,
conteneurs ad, taille IAB). Fonctions pures — aucun navigateur.
Lancer depuis backend/ :  python test_detection_classify.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "services"))

from detection_helpers import (
    iab_size_match,
    is_ad_container_signature,
    is_friendly_iframe_ad,
    IAB_SIZES,
)


def test_iab_size_match():
    assert iab_size_match(728, 90, IAB_SIZES) is True
    assert iab_size_match(740, 95, IAB_SIZES) is True          # dans la tolérance (20)
    assert iab_size_match(300, 250, IAB_SIZES) is True
    assert iab_size_match(336, 280, IAB_SIZES) is True
    assert iab_size_match(120, 600, IAB_SIZES) is True
    assert iab_size_match(500, 500, IAB_SIZES) is False        # taille non standard
    assert iab_size_match(0, 0, IAB_SIZES) is False
    assert iab_size_match(None, None, IAB_SIZES) is False
    print("OK test_iab_size_match")


def test_is_ad_container_signature():
    # Marqueurs ad réels (vus sur bebasket.fr)
    assert is_ad_container_signature("actirise-brand") is True
    assert is_ad_container_signature("device-desktop ads actirise-brand") is True
    assert is_ad_container_signature("ad-module-scss-module__Zorh0W__AdLocal") is True
    assert is_ad_container_signature("div-gpt-ad-12345") is True
    assert is_ad_container_signature("dfp-slot top") is True
    assert is_ad_container_signature("adsbygoogle") is True
    assert is_ad_container_signature("pub") is True
    # NE DOIT PAS matcher : 'ad' n'est qu'une sous-chaîne d'un mot non-pub
    assert is_ad_container_signature("header") is False
    assert is_ad_container_signature("main-loader spinner") is False
    assert is_ad_container_signature("gradient-overlay") is False
    assert is_ad_container_signature("download-button") is False
    assert is_ad_container_signature("breadcrumb thread") is False
    assert is_ad_container_signature("") is False
    assert is_ad_container_signature(None) is False
    print("OK test_is_ad_container_signature")


def test_is_friendly_iframe_ad():
    # Les 3 slots réels de bebasket : about:blank, taille IAB, dans conteneur ad
    assert is_friendly_iframe_ad(728, 90, "about:blank", True, True) is True
    assert is_friendly_iframe_ad(120, 600, "about:blank", True, True) is True
    assert is_friendly_iframe_ad(336, 280, "about:blank", True, True) is True
    # IAB seule suffit (hors conteneur)
    assert is_friendly_iframe_ad(300, 250, "", False, True) is True
    # conteneur ad seul suffit (taille non-IAB)
    assert is_friendly_iframe_ad(250, 80, "about:blank", True, False) is True
    # src None traité comme friendly
    assert is_friendly_iframe_ad(728, 90, None, True, True) is True
    # javascript: = friendly
    assert is_friendly_iframe_ad(300, 250, "javascript:void(0)", False, True) is True
    # Tracker 1x1 : trop petit -> rejeté
    assert is_friendly_iframe_ad(1, 1, "about:blank", True, True) is False
    # Aucun signal (pas IAB, pas conteneur) -> rejeté même si grand
    assert is_friendly_iframe_ad(600, 400, "about:blank", False, False) is False
    # iframe avec vrai src (cross-origin) : pas "friendly" -> géré ailleurs, ici False
    assert is_friendly_iframe_ad(728, 90, "https://adserver.com/x", False, True) is False
    # None-safe sur tailles
    assert is_friendly_iframe_ad(None, None, "about:blank", True, True) is False
    print("OK test_is_friendly_iframe_ad")


if __name__ == "__main__":
    test_iab_size_match()
    test_is_ad_container_signature()
    test_is_friendly_iframe_ad()
    print("ALL OK (detection classify)")
