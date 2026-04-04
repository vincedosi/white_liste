"""
MLI Crawler — Exporter
Génère les fichiers de sortie (JSON structuré + Excel actionnable).
"""
from __future__ import annotations
from pathlib import Path
from datetime import datetime

import pandas as pd

from models import AuditReport, CleanAction
from config import OUTPUT_DIR


def export_json(report: AuditReport, client_name: str = "default") -> Path:
    """Export le rapport complet en JSON."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y%m%d")
    path = OUTPUT_DIR / f"audit_{client_name}_{date_str}.json"
    report.to_json(str(path))
    print(f"\n  📄 JSON exporté → {path}")
    return path


def export_excel(report: AuditReport, client_name: str = "default") -> Path:
    """Export le rapport en Excel multi-onglets."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y%m%d")
    path = OUTPUT_DIR / f"audit_{client_name}_{date_str}.xlsx"

    flat = [r.to_flat_dict() for r in report.results]
    df_all = pd.DataFrame(flat)

    # Colonnes renommées pour le trader
    col_rename = {
        "domain": "Domaine",
        "http_status": "Status HTTP",
        "http_code": "Code HTTP",
        "response_time_ms": "Temps de réponse (ms)",
        "is_alive": "Site actif",
        "ad_count": "Nb publicités",
        "attention_score": "Score d'attention",
        "is_mfa": "MFA détecté",
        "category": "Catégorie",
        "ai_confidence": "Confiance IA",
        "action": "Action recommandée",
        "action_reason": "Raison",
    }

    # Sélectionner et renommer les colonnes utiles
    cols = [c for c in col_rename if c in df_all.columns]
    df_clean = df_all[cols].rename(columns=col_rename)

    with pd.ExcelWriter(str(path), engine="openpyxl") as writer:
        # Onglet 1 : Vue complète
        df_clean.to_excel(writer, sheet_name="Audit complet", index=False)

        # Onglet 2 : Sites à supprimer
        df_remove = df_clean[
            df_all["action"].isin([CleanAction.REMOVE_DEAD.value, CleanAction.REMOVE_MFA.value])
        ]
        if not df_remove.empty:
            df_remove.to_excel(writer, sheet_name="À supprimer", index=False)

        # Onglet 3 : Sites flaggés (attention faible)
        df_flag = df_clean[df_all["action"] == CleanAction.FLAG_LOW_ATTENTION.value]
        if not df_flag.empty:
            df_flag.to_excel(writer, sheet_name="Attention faible", index=False)

        # Onglet 4 : Sites sains triés par score
        df_keep = df_clean[df_all["action"] == CleanAction.KEEP.value].sort_values(
            "Score d'attention", ascending=False
        )
        if not df_keep.empty:
            df_keep.to_excel(writer, sheet_name="Sites premium", index=False)

        # Onglet 5 : Répartition par catégorie
        if report.category_distribution:
            df_cats = pd.DataFrame(
                list(report.category_distribution.items()),
                columns=["Catégorie", "Nombre de sites"],
            )
            df_cats["Part (%)"] = (
                df_cats["Nombre de sites"] / df_cats["Nombre de sites"].sum() * 100
            ).round(1)
            df_cats.to_excel(writer, sheet_name="Répartition catégorielle", index=False)

    print(f"  📊 Excel exporté → {path}")
    return path


def print_summary(report: AuditReport) -> None:
    """Affiche un résumé console."""
    print("\n" + "=" * 60)
    print("  MEDIA-LIST INTELLIGENCE — Résumé de l'audit")
    print("=" * 60)
    print(f"  Sites audités      : {report.total_sites}")
    print(f"  Sites actifs       : {report.sites_alive}")
    print(f"  Sites morts        : {report.sites_dead}")
    print(f"  Sites MFA          : {report.sites_mfa}")
    print(f"  Sites flaggés      : {report.sites_flagged}")
    print(f"  Score attention moy: {report.avg_attention_score}/10")
    print("-" * 60)
    if report.category_distribution:
        print("  Répartition :")
        for cat, count in report.category_distribution.items():
            pct = count / report.sites_alive * 100 if report.sites_alive else 0
            bar = "█" * int(pct / 3)
            print(f"    {cat:<30} {count:>4} ({pct:.0f}%) {bar}")
    print("=" * 60)
