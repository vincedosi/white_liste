"""Tests des helpers de décision du re-scan multi-scénarios.
Fonctions pures — aucun navigateur. Lancer depuis backend/ :
    python test_rescan.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))            # backend/
sys.path.insert(0, str(Path(__file__).parent / "services"))  # backend/services/

from detection_helpers import is_suspect_false_negative, visible_ad_score, pick_best


def test_is_suspect_false_negative():
    # ad-tech (scripts) + 0 pub visible -> suspect
    assert is_suspect_false_negative(["PREBID"], 0, 0, 0.0) is True
    # ad-tech (requêtes réseau) + 0 pub visible -> suspect
    assert is_suspect_false_negative([], 5, 0, 0.0) is True
    # pubs visibles -> pas suspect
    assert is_suspect_false_negative(["PREBID"], 5, 8, 12.0) is False
    # surface non nulle -> pas suspect (une créa a rendu)
    assert is_suspect_false_negative(["PREBID"], 5, 0, 3.0) is False
    # aucun signal ad-tech -> pas un faux-négatif (site vraiment sans pub)
    assert is_suspect_false_negative([], 0, 0, 0.0) is False
    # None-safe
    assert is_suspect_false_negative(None, None, None, None) is False
    print("OK test_is_suspect_false_negative")


def test_pick_best_and_score():
    base = {"scenario_used": "base", "dom_ad_count": 0, "details": {"ad_surface_pct": 0}}
    s1 = {"scenario_used": "fr_patient", "dom_ad_count": 0, "details": {"ad_surface_pct": 0}}
    s2 = {"scenario_used": "headful", "dom_ad_count": 7, "details": {"ad_surface_pct": 12}}
    assert pick_best([base, s1, s2]) is s2
    # départage par surface à dom_ad_count égal
    a = {"dom_ad_count": 3, "details": {"ad_surface_pct": 4}}
    b = {"dom_ad_count": 3, "details": {"ad_surface_pct": 9}}
    assert pick_best([a, b]) is b
    assert visible_ad_score(s2) == (7, 12)
    print("OK test_pick_best_and_score")


if __name__ == "__main__":
    test_is_suspect_false_negative()
    test_pick_best_and_score()
    print("ALL OK (rescan)")
