import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from services.site_utils import clean_domain, dedup_domains


def test_clean_strips_scheme_www_space_and_lowercases():
    assert clean_domain("  HTTPS://WWW.Lemonde.FR/  ") == "lemonde.fr"

def test_clean_strips_path():
    assert clean_domain("cdiscount.com/le-sport") == "cdiscount.com/le-sport"

def test_clean_empty_returns_empty():
    assert clean_domain("   ") == ""

def test_dedup_preserves_order_and_drops_blanks():
    raw = ["www.A.fr", "a.fr", "  ", "b.fr", "B.FR"]
    assert dedup_domains(raw) == ["a.fr", "b.fr"]
