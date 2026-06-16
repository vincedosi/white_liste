"""Test du garde-fou « page d'erreur navigateur ». Fonction pure.
Lancer depuis backend/ :  python test_nav_guard.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "services"))

from detection_helpers import is_navigation_error_url


def test_is_navigation_error_url():
    # Page d'erreur interne Chrome (connexion reset/timeout) -> True
    assert is_navigation_error_url("chrome-error://chromewebdata/") is True
    assert is_navigation_error_url("chrome-error://chromewebdata/#-100") is True
    # Vraies pages -> False
    assert is_navigation_error_url("https://tribuca.fr/") is False
    assert is_navigation_error_url("https://www.lesechos.fr") is False
    # about:blank (échec DNS / état initial) -> géré par le garde-fou de contenu,
    # pas ici (about:blank peut être transitoire)
    assert is_navigation_error_url("about:blank") is False
    # None / vide -> False
    assert is_navigation_error_url("") is False
    assert is_navigation_error_url(None) is False
    print("OK test_is_navigation_error_url")


if __name__ == "__main__":
    test_is_navigation_error_url()
    print("ALL OK (nav guard)")
