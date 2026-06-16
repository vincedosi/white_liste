"""Test du plan de capture pleine page (full vs bornée). Fonction pure.
Lancer depuis backend/ :  python test_capture.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "services"))

from detection_helpers import fullpage_capture_plan


def test_fullpage_capture_plan():
    # Pages normales (<= seuil) : full_page natif, hauteur réelle
    assert fullpage_capture_plan(6997) == ("full", 6997)
    assert fullpage_capture_plan(12000) == ("full", 12000)
    # Pages hautes mais finies (> seuil, <= max) : capture bornée pleine hauteur
    assert fullpage_capture_plan(12001) == ("bounded", 12001)
    assert fullpage_capture_plan(14368) == ("bounded", 14368)   # cas bretagne.com
    assert fullpage_capture_plan(20000) == ("bounded", 20000)
    # Pages pathologiques (> max) : bornées au max (haut de page)
    assert fullpage_capture_plan(30000) == ("bounded", 20000)
    assert fullpage_capture_plan(250000) == ("bounded", 20000)
    # Hauteur inconnue (échec scrollHeight) : bornée au max, jamais full_page
    assert fullpage_capture_plan(0) == ("bounded", 20000)
    assert fullpage_capture_plan(None) == ("bounded", 20000)
    print("OK test_fullpage_capture_plan")


if __name__ == "__main__":
    test_fullpage_capture_plan()
    print("ALL OK (capture)")
