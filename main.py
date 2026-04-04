"""
MLI Crawler — Media-List Intelligence
Point d'entrée CLI.

Usage:
    python main.py                                    # Audit la whitelist par défaut
    python main.py --input sites.csv                  # Fichier custom
    python main.py --client "GroupeM" --skip-playwright  # Sans Playwright (rapide)
    python main.py --health-only                      # Seulement le health check

Env:
    MISTRAL_API_KEY=xxx   # Requis pour la catégorisation IA
"""
from __future__ import annotations
import argparse
import asyncio
import csv
import sys
from pathlib import Path

from config import INPUT_DIR
from pipeline import run_pipeline


def load_domains(filepath: Path) -> list[str]:
    """Charge les domaines depuis un fichier CSV ou texte."""
    domains = []

    if filepath.suffix == ".csv":
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Cherche une colonne 'domain', 'url', 'site', ou prend la première
                domain = (
                    row.get("domain")
                    or row.get("Domain")
                    or row.get("url")
                    or row.get("URL")
                    or row.get("site")
                    or list(row.values())[0]
                )
                if domain:
                    # Nettoyer : enlever http(s)://, www., trailing slash
                    domain = domain.strip()
                    domain = domain.replace("https://", "").replace("http://", "")
                    domain = domain.replace("www.", "")
                    domain = domain.rstrip("/")
                    if domain and "." in domain:
                        domains.append(domain)
    else:
        # Fichier texte simple (1 domaine par ligne)
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                domain = line.strip()
                if domain and not domain.startswith("#") and "." in domain:
                    domain = domain.replace("https://", "").replace("http://", "")
                    domain = domain.replace("www.", "")
                    domain = domain.rstrip("/")
                    domains.append(domain)

    # Dédupliquer en gardant l'ordre
    seen = set()
    unique = []
    for d in domains:
        if d.lower() not in seen:
            seen.add(d.lower())
            unique.append(d)

    return unique


def main():
    parser = argparse.ArgumentParser(
        description="MLI — Media-List Intelligence Crawler",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--input", "-i",
        type=Path,
        default=INPUT_DIR / "whitelist.csv",
        help="Fichier d'entrée (CSV ou TXT)",
    )
    parser.add_argument(
        "--client", "-c",
        type=str,
        default="default",
        help="Nom du client (pour nommer les fichiers de sortie)",
    )
    parser.add_argument(
        "--skip-playwright",
        action="store_true",
        help="Skip le module Attention (Playwright) — plus rapide pour debug",
    )
    parser.add_argument(
        "--skip-ai",
        action="store_true",
        help="Skip la catégorisation IA (Mistral)",
    )
    parser.add_argument(
        "--health-only",
        action="store_true",
        help="Uniquement le health check HTTP",
    )

    args = parser.parse_args()

    # Charger les domaines
    if not args.input.exists():
        print(f"❌ Fichier introuvable : {args.input}")
        sys.exit(1)

    domains = load_domains(args.input)
    if not domains:
        print("❌ Aucun domaine trouvé dans le fichier d'entrée")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  MEDIA-LIST INTELLIGENCE — Audit de {len(domains)} sites")
    print(f"  Client : {args.client}")
    print(f"  Input  : {args.input}")
    print(f"{'='*60}")

    # Déterminer les flags
    skip_attention = args.skip_playwright or args.health_only
    skip_categorization = args.skip_ai or args.health_only

    # Lancer le pipeline
    report = asyncio.run(
        run_pipeline(
            domains=domains,
            client_name=args.client,
            skip_attention=skip_attention,
            skip_categorization=skip_categorization,
        )
    )


if __name__ == "__main__":
    main()
