"""
MLI — Seed de démonstration.

Insère une vingtaine de sites réalistes dans la table `domains` pour pouvoir
tester l'interface (table Sites Intelligence) sans lancer d'audit réel.

Idempotent : on fait un INSERT OR IGNORE sur `domain` (UNIQUE), donc relancer
le script ne crée pas de doublons. Pour repartir de zéro : --reset.

Usage :
    python backend/seed_sites.py          # ajoute les sites manquants
    python backend/seed_sites.py --reset  # purge les sites de démo puis réinsère
"""
from __future__ import annotations

import json
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "mli.db"

NOW = datetime.now(timezone.utc)


def iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).isoformat()


# (domain, score, trend, health, ads_txt_sellers, ad_count, load_ms, trackers,
#  adtech, country, lang, tld, category, status, surface_pct, audit_days_ago, audit_count)
SITES = [
    ("lemonde.fr",        8.4, "up",     "ok",       128, 6,  1240, 14, {"gpt": True, "prebid": True, "criteo": True},                    "France",        "fr", ".fr", "News & Politique",        "validated", 18.0, 2,   7),
    ("lefigaro.fr",       7.9, "stable", "ok",       142, 7,  1580, 19, {"gpt": True, "prebid": True, "amazon_tam": True, "teads": True}, "France",        "fr", ".fr", "News & Politique",        "validated", 24.0, 5,   6),
    ("liberation.fr",     6.8, "down",   "ok",        96, 9,  2010, 22, {"gpt": True, "prebid": True, "outbrain": True},                  "France",        "fr", ".fr", "News & Politique",        "pending",   33.0, 9,   4),
    ("20minutes.fr",      5.4, "down",   "ok",        88, 12, 2640, 27, {"gpt": True, "prebid": True, "taboola": True, "smart": True},    "France",        "fr", ".fr", "Actualités généralistes", "pending",   46.0, 12,  5),
    ("marmiton.org",      7.2, "up",     "ok",       110, 8,  1820, 17, {"gpt": True, "prebid": True, "criteo": True},                    "France",        "fr", ".org","Cuisine & Recettes",      "validated", 27.0, 3,   8),
    ("allocine.fr",       6.1, "stable", "ok",        74, 10, 2280, 21, {"gpt": True, "amazon_tam": True, "teads": True},                 "France",        "fr", ".fr", "Cinéma & Divertissement", "pending",   38.0, 7,   3),
    ("doctissimo.fr",     4.3, "down",   "ok",        58, 15, 3120, 31, {"gpt": True, "prebid": True, "taboola": True, "outbrain": True}, "France",        "fr", ".fr", "Santé & Bien-être",       "pending",   58.0, 14,  4),
    ("jeuxvideo.com",     6.6, "up",     "ok",        82, 11, 2150, 24, {"gpt": True, "prebid": True, "pubmatic": True},                  "France",        "fr", ".com","Jeux vidéo",              "validated", 35.0, 6,   5),
    ("ouest-france.fr",   7.7, "stable", "ok",       134, 6,  1490, 16, {"gpt": True, "prebid": True, "magnite": True},                   "France",        "fr", ".fr", "Presse régionale",        "validated", 22.0, 4,   6),
    ("leparisien.fr",     7.0, "up",     "ok",       118, 8,  1760, 18, {"gpt": True, "prebid": True, "criteo": True, "index": True},     "France",        "fr", ".fr", "News & Politique",        "pending",   29.0, 8,   4),
    ("theguardian.com",   8.8, "stable", "ok",       210, 4,  1100, 12, {"gpt": True, "prebid": True, "amazon_tam": True},                "United Kingdom","en", ".com","News & Politique",        "validated", 14.0, 2,   9),
    ("nytimes.com",       9.1, "up",     "ok",       248, 3,   980, 10, {"gpt": True, "prebid": True, "amazon_tam": True},                "United States", "en", ".com","News & Politique",        "validated", 11.0, 1,   11),
    ("bild.de",           4.9, "down",   "ok",        66, 14, 2980, 29, {"gpt": True, "prebid": True, "taboola": True, "appnexus": True}, "Germany",       "de", ".de", "News & Politique",        "pending",   52.0, 13,  3),
    ("marca.com",         5.8, "stable", "ok",        78, 11, 2410, 23, {"gpt": True, "prebid": True, "smart": True},                     "Spain",         "es", ".com","Sport",                   "pending",   41.0, 10,  4),
    ("repubblica.it",     6.9, "up",     "ok",        92, 9,  1930, 20, {"gpt": True, "prebid": True, "criteo": True},                    "Italy",         "it", ".it", "News & Politique",        "validated", 31.0, 5,   6),
    ("mfa-clickbait.net",  2.1, "down",  "ok",         0, 24, 4200, 44, {"gpt": True, "taboola": True, "outbrain": True},                 "Cyprus",        "en", ".net","Contenu MFA suspecté",    "to_review", 78.0, 1,   2),
    ("ad-farm-news.info",  1.6, "down",  "ok",         0, 31, 5100, 52, {"taboola": True, "outbrain": True},                              "Seychelles",    "en", ".info","Contenu MFA suspecté",   "to_review", 84.0, 0.5, 1),
    ("blog-perso-test.fr", None, "stable","ok",         0, 0,  1340, 3,  {},                                                              "France",        "fr", ".fr", None,                      "to_review", 0.0,  0.2, 1),
    ("vieux-domaine.fr",  None, "stable","dead",        0, 0,     0, 0,  {},                                                              "France",        "fr", ".fr", None,                      "pending",   0.0,  46.0, 2),
    ("redirige-ailleurs.com", None, "stable","redirect",0, 0,   620, 1,  {},                                                             "United States", "en", ".com","Redirection",             "pending",   0.0,  21.0, 1),
]


def ensure_schema(con: sqlite3.Connection) -> None:
    """Crée la table domains si la base est vierge (backend jamais lancé)."""
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS domains (
            id TEXT PRIMARY KEY,
            domain TEXT UNIQUE NOT NULL,
            editorial_status TEXT NOT NULL DEFAULT 'pending',
            brand_safety TEXT,
            brand_safety_source TEXT,
            category_iab TEXT,
            category_source TEXT,
            notes TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            last_score REAL,
            last_score_trend TEXT,
            last_health TEXT,
            last_ads_txt INTEGER,
            last_ad_count INTEGER,
            last_load_time_ms INTEGER,
            last_trackers INTEGER,
            last_adtech_json TEXT,
            last_country TEXT,
            last_lang TEXT,
            last_tld TEXT,
            last_audit_id TEXT,
            last_audit_date TEXT,
            audit_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_ad_surface_pct REAL
        );
        """
    )
    # Colonne additive si la table existait sans elle.
    cols = {r[1] for r in con.execute("PRAGMA table_info(domains)")}
    if "last_ad_surface_pct" not in cols:
        con.execute("ALTER TABLE domains ADD COLUMN last_ad_surface_pct REAL")
    con.commit()


def seed(reset: bool) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    try:
        ensure_schema(con)
        domains = [row[0] for row in SITES]

        if reset:
            con.executemany(
                "DELETE FROM domains WHERE domain = ?", [(d,) for d in domains]
            )

        now = NOW.isoformat()
        inserted = 0
        for (domain, score, trend, health, ads_txt, ad_count, load_ms, trackers,
             adtech, country, lang, tld, category, status, pct, audit_days, audit_count) in SITES:
            cur = con.execute(
                """
                INSERT OR IGNORE INTO domains (
                    id, domain, editorial_status, category_iab, category_source,
                    tags_json, last_score, last_score_trend, last_health,
                    last_ads_txt, last_ad_count, last_load_time_ms, last_trackers,
                    last_adtech_json, last_country, last_lang, last_tld,
                    last_audit_id, last_audit_date, audit_count,
                    created_at, updated_at, last_ad_surface_pct
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()), domain, status, category,
                    "ai" if category else None,
                    json.dumps([]),
                    score, trend, health,
                    ads_txt, ad_count, load_ms, trackers,
                    json.dumps(adtech) if adtech else None,
                    country, lang, tld,
                    None, iso(audit_days), audit_count,
                    now, now, pct,
                ),
            )
            inserted += cur.rowcount
        con.commit()

        total = con.execute("SELECT COUNT(*) FROM domains").fetchone()[0]
        print(f"[MLI seed] {inserted} site(s) ajouté(s) — {total} domaine(s) au total dans la base.")
    finally:
        con.close()


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
