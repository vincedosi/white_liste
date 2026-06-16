"""Tests des helpers d'extraction/filtre/dédup pour le scan par saisie/import.
Fonctions pures — aucun DB, aucun async. Lancer : python backend/test_scan_input.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))  # importer le package backend

from services.site_utils import is_domain_like, build_scan_partition
from services.site_utils import collect_candidates  # ajouter à l'import existant
import io
from openpyxl import Workbook


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


def test_extract_from_text():
    got = collect_candidates("lemonde.fr, bild.de\njeuxvideo.com  marca.com", None, None)
    assert got == ["lemonde.fr", "bild.de", "jeuxvideo.com", "marca.com"]
    print("OK test_extract_from_text")


def test_extract_from_csv():
    csv_bytes = b"url,note\nlemonde.fr,ok\nbild.de,vu\n"
    got = collect_candidates(None, csv_bytes, "liste.csv")
    # En-tete "url"/"note" inclus ici — le filtre domain-like les ecarte plus tard.
    assert "lemonde.fr" in got and "bild.de" in got
    print("OK test_extract_from_csv")


def test_extract_from_xlsx():
    wb = Workbook()
    ws = wb.active
    ws.append(["url"])
    ws.append(["lemonde.fr"])
    ws.append(["bild.de"])
    buf = io.BytesIO()
    wb.save(buf)
    got = collect_candidates(None, buf.getvalue(), "liste.xlsx")
    assert "lemonde.fr" in got and "bild.de" in got
    print("OK test_extract_from_xlsx")


def test_unsupported_format_raises():
    try:
        collect_candidates(None, b"data", "image.png")
        assert False, "doit lever ValueError"
    except ValueError:
        pass
    print("OK test_unsupported_format_raises")


if __name__ == "__main__":
    test_is_domain_like()
    test_build_scan_partition_dedup_and_existing()
    print("ALL OK (task 1)")
    test_extract_from_text()
    test_extract_from_csv()
    test_extract_from_xlsx()
    test_unsupported_format_raises()
