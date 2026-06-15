"""Tests des helpers d'extraction/filtre/dédup pour le scan par saisie/import.
Fonctions pures — aucun DB, aucun async. Lancer : python backend/test_scan_input.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))  # importer le package backend

from services.site_utils import is_domain_like, build_scan_partition


def test_is_domain_like():
    assert is_domain_like("lemonde.fr")
    assert is_domain_like("sous.domaine.com/section")
    assert is_domain_like("jeux-video.com")
    assert not is_domain_like("url")          # en-tête de colonne
    assert not is_domain_like("123")          # nombre
    assert not is_domain_like("a.b")          # TLD 1 lettre
    assert not is_domain_like("")             # vide
    print("OK test_is_domain_like")


def test_build_scan_partition_dedup_and_existing():
    candidates = ["LeMonde.fr", "https://lemonde.fr/", "bild.de", "url", "jeuxvideo.com"]
    existing = {"jeuxvideo.com"}
    res = build_scan_partition(candidates, existing)
    assert res["to_scan"] == ["lemonde.fr", "bild.de"]   # dédup interne + nettoyage
    assert res["duplicates"] == ["jeuxvideo.com"]         # déjà en base
    assert res["invalid_count"] == 1                       # "url" rejeté
    assert res["total_found"] == 3                         # valides distincts
    print("OK test_build_scan_partition_dedup_and_existing")


if __name__ == "__main__":
    test_is_domain_like()
    test_build_scan_partition_dedup_and_existing()
    print("ALL OK (task 1)")
