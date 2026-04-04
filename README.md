# MLI — Media-List Intelligence Crawler

Audit industriel et automatisé de whitelists programmatiques.

## Setup

```bash
pip install -r requirements.txt
playwright install chromium
```

## Variables d'environnement

```bash
# Requis pour la catégorisation IA
export MISTRAL_API_KEY="votre_clé_mistral"
```

## Lancer l'application

```bash
# Interface web Streamlit (recommandé)
streamlit run app.py

# Mode CLI (pour automatisation / cron)
python main.py --client "GroupeM" --input input/whitelist.csv
```

## Pipeline

```
whitelist.csv
    │
    ▼
┌──────────────────────┐
│  1. Health Checker    │  httpx async — 50 requêtes parallèles
│     Status HTTP       │  Détecte: morts, redirects, DNS, SSL
└──────────┬───────────┘
           │ filtre: sites vivants uniquement
           ▼
┌──────────────────────┐
│  2. Attention Scorer  │  Playwright headless — comptage pubs
│     Score 0-10        │  Détecte: MFA, encombrement publicitaire
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  3. Catégorisation IA │  Mistral Small — classification taxonomie
│     15 catégories     │  Coût: ~2€ / 2000 sites
└──────────┬───────────┘
           │
           ▼
    output/
    ├── audit_client_YYYYMMDD.json
    └── audit_client_YYYYMMDD.xlsx (5 onglets)
```

## Structure du projet

```
mli_crawler/
├── main.py              # CLI entry point
├── config.py            # Paramètres (concurrency, seuils, taxonomie)
├── models.py            # Dataclasses (SiteAudit, AuditReport)
├── health_checker.py    # Module 1 : check HTTP async
├── attention_scorer.py  # Module 2 : Playwright comptage ads
├── categorizer.py       # Module 3 : Mistral catégorisation
├── pipeline.py          # Orchestrateur séquentiel
├── exporter.py          # Export JSON + Excel multi-onglets
├── requirements.txt
├── input/
│   └── whitelist.csv    # Liste d'entrée
└── output/              # Résultats
```
