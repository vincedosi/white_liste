# MLI — Media-List Intelligence

## Projet
Plateforme d'audit automatisé de whitelists programmatiques.
**Stack** : Python 3.13 + Streamlit + Playwright + Mistral AI
**Cible** : Traders programmatiques, équipes media
**Contexte** : Outil interne Dentsu Programmatic Intelligence

## Architecture
```
mli_crawler/
├── app.py                  ← Interface Streamlit (FICHIER PRINCIPAL)
├── CLAUDE.md               ← Contexte projet (ce fichier)
├── DESIGN.md               ← Système de design (LIRE AVANT TOUT CHANGEMENT UI)
├── TODO.md                 ← Tâches en cours
├── ADTECH.md               ← Référence détection publicitaire et ad-tech
├── config.py               ← Paramètres (concurrency, seuils, taxonomie)
├── models.py               ← Dataclasses (SiteAudit, AuditReport, enums)
├── health_checker.py       ← Module 1 : check HTTP async (httpx)
├── pw_worker.py            ← Worker Playwright autonome (subprocess)
├── pw_bridge.py            ← Bridge : appelle pw_worker via subprocess
├── ads_txt_checker.py      ← Module 4 : vérification ads.txt
├── geo_locator.py          ← Module 5 : géolocalisation IP + TLD + langue
├── mistral_validator.py    ← Validation clé API Mistral
├── categorizer.py          ← Module 3 : catégorisation Mistral
├── exporter.py             ← Export JSON + Excel (CLI)
├── pipeline.py             ← Orchestrateur CLI
├── main.py                 ← CLI entry point
├── attention_scorer.py     ← LEGACY — ne plus utiliser
└── output/
    └── screenshots/        ← Captures Playwright
```

## Règles critiques

### Playwright = TOUJOURS via subprocess
Streamlit + Windows ProactorEventLoop = crash avec Playwright.
NE JAMAIS importer playwright dans app.py.
Utiliser UNIQUEMENT les fonctions de `pw_bridge.py` :
- `score_all_subprocess(domains)` → `(attention_results, content_langs)`
- `extract_metadata_subprocess(domains)` → `dict[domain -> metadata]`
- `screenshot_all_subprocess(domains, output_dir)` → `dict[domain -> screenshot_data]`

### Async dans Streamlit
- `health_checker.py` et `ads_txt_checker.py` → `asyncio.run()`
- `geo_locator.py` → appel direct (sync)
- `categorizer.py` → appel direct (sync)

### Pipeline dans app.py (ordre d'exécution)
1. **Health Check** — `asyncio.run(check_all(domains))`
2. **Score d'Attention** — `score_all_subprocess(alive_domains)` 
3. **ads.txt** — `asyncio.run(check_all_ads_txt(alive_domains))` 
4. **Localisation** — `localize_all(alive_domains, content_langs)` (lent: 1.5s/site)
5. **Catégorisation IA** — `categorize_all(alive_domains, metadata_map)` (clé Mistral)
6. **Screenshots** — `screenshot_all_subprocess(alive_domains, output_dir)`

### Score d'attention pondéré par zone
Les pubs ne comptent PAS toutes pareil :
- Above the fold (0-800px) = poids ×1.0
- Mid-page (800-2000px) = poids ×0.5
- Deep (2000-4000px) = poids ×0.2
- Footer (4000px+) = poids ×0.05
- Sticky/fixed = multiplicateur ×1.5
- Taille pub : petit (×0.5), standard (×1.0), intrusif (×1.5)
Champs : `ads_above_fold`, `ads_mid_page`, `ads_deep`, `ads_footer`, `ads_sticky`

### Screenshots
Deux fichiers par site :
- `viewport_path` : 1280×800 (above the fold) — vue principale
- `fullpage_path` : page complète — dans un expander/modal
Les pubs surlignées en rouge avec label de zone (ATF, MID, DEEP, FOOTER, STICKY).

### Screenshots en MODAL pas en onglet
Les screenshots ne sont PAS dans un onglet séparé.
Dans les tableaux, chaque domaine est un bouton cliquable.
Au clic → `@st.dialog` avec :
- Screenshot viewport en miniature
- Score + breakdown par zone
- `st.expander("Page complète")` avec fullpage

### Journal de logs
L'app doit afficher un journal de logs PERSISTANT dans un onglet dédié.
Voir DESIGN.md et TODO.md pour les détails.

## Design

**LIRE DESIGN.md AVANT TOUT CHANGEMENT D'INTERFACE.**
Direction : "Corporate Intelligence Dashboard" — light mode, bleu royal dominant.
Fond #EEF2FF, accent bleu #1D4ED8, sidebar bleu nuit #1E2A4A.
PAS de Streamlit brut — override CSS agressif de tout le theming.
Typo : Plus Jakarta Sans + JetBrains Mono.

## Fichiers de référence
- **DESIGN.md** : Design system dark mode complet (LIRE EN PREMIER)
- **ADTECH.md** : Détection publicitaire multi-couche (refonte complète)
- **TODO.md** : Liste des tâches à exécuter dans l'ordre
