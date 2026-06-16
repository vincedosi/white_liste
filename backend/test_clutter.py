"""Test de l'aire d'union de rectangles (corrige le sur-comptage de surface pub
quand wrapper + iframe + doublons se chevauchent). Fonction pure.
Lancer depuis backend/ :  python test_clutter.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "services"))

from detection_helpers import rect_union_area


def test_rect_union_area():
    # 1 rectangle
    assert rect_union_area([(0, 0, 100, 100)]) == 10000
    # 2 rectangles IDENTIQUES (wrapper + iframe au même endroit) -> compté 1 fois
    assert rect_union_area([(0, 0, 100, 100), (0, 0, 100, 100)]) == 10000
    # rectangle contenu dans un autre -> aire du plus grand
    assert rect_union_area([(0, 0, 100, 100), (10, 10, 20, 20)]) == 10000
    # 2 rectangles qui se chevauchent partiellement : 10000 + 10000 - 2500
    assert rect_union_area([(0, 0, 100, 100), (50, 50, 150, 150)]) == 17500
    # 2 rectangles disjoints -> somme
    assert rect_union_area([(0, 0, 10, 10), (20, 20, 30, 30)]) == 200
    # vide / dégénéré
    assert rect_union_area([]) == 0
    assert rect_union_area([(5, 5, 5, 50)]) == 0   # largeur nulle
    # le cas lesechos : 3 copies d'un grand bloc (clippé au viewport 1280x800)
    vp = (0, 0, 1280, 800)
    assert rect_union_area([vp, vp, vp]) == 1280 * 800   # pas 3x !
    print("OK test_rect_union_area")


if __name__ == "__main__":
    test_rect_union_area()
    print("ALL OK (clutter)")
