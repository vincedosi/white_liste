"""Test du garde-fou « page d'erreur navigateur ». Fonction pure.
Lancer depuis backend/ :  python test_nav_guard.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "services"))

from detection_helpers import is_navigation_error_url, is_connection_error


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


def test_is_connection_error():
    # échecs de connexion -> site mort/injoignable
    assert is_connection_error("Page.goto: net::ERR_CONNECTION_CLOSED at https://teleobs.com/") is True
    assert is_connection_error("net::ERR_CONNECTION_RESET") is True
    assert is_connection_error("net::ERR_NAME_NOT_RESOLVED at https://x.fr") is True
    assert is_connection_error("net::ERR_CONNECTION_REFUSED") is True
    assert is_connection_error("net::ERR_TIMED_OUT") is True
    assert is_connection_error("net::ERR_CERT_DATE_INVALID") is True
    # timeout Playwright (page peut-être lente) -> PAS un échec de connexion
    assert is_connection_error("Timeout 20000ms exceeded.") is False
    assert is_connection_error("") is False
    assert is_connection_error(None) is False
    print("OK test_is_connection_error")


if __name__ == "__main__":
    test_is_navigation_error_url()
    test_is_connection_error()
    print("ALL OK (nav guard)")
