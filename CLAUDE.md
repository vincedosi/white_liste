# MLI — Media-List Intelligence

## Projet
Plateforme d'audit automatisé de whitelists programmatiques.
**Stack** : Python 3.13 + Next.js 14 + FastAPI + Playwright + Mistral AI
**Cible** : Traders programmatiques, équipes media
**Contexte** : Outil interne Dentsu Programmatic Intelligence

## Architecture
```
mli_crawler/
├── CLAUDE.md                   ← Contexte projet (ce fichier)
├── DESIGN.md                   ← Système de design (LIRE AVANT TOUT CHANGEMENT UI)
├── TODO.md                     ← Tâches en cours
├── ADTECH.md                   ← Référence détection publicitaire et ad-tech
├── app.py                      ← Interface Streamlit LEGACY (ne plus toucher)
│
├── backend/                    ← API FastAPI (port 8003)
│   ├── main.py                 ← Entry point FastAPI + CORS + static files
│   ├── config.py               ← Paramètres (concurrency, seuils, taxonomie)
│   ├── models.py               ← Pydantic models (SiteAudit, AuditReport, enums)
│   ├── routers/
│   │   ├── audit.py            ← SSE endpoint /api/audit (pipeline complet)
│   │   ├── history.py          ← CRUD /api/audits + /api/screenshots
│   │   └── health.py           ← /api/health
│   └── services/
│       ├── pw_worker.py        ← Worker Playwright (subprocess, stdin/stdout)
│       ├── pw_bridge.py        ← Bridge v4 : Popen + stderr live streaming
│       ├── health_checker.py   ← Health check HTTP async (httpx)
│       ├── ads_txt_checker.py  ← Vérification ads.txt
│       ├── geo_locator.py      ← Géolocalisation IP batch (ip-api.com)
│       └── categorizer.py      ← Catégorisation Mistral AI
│
├── frontend/                   ← Next.js 14 (port 3001)
│   ├── app/
│   │   ├── page.tsx            ← Page d'accueil — nouvel audit
│   │   ├── audit/[id]/page.tsx ← Dashboard résultats d'un audit
│   │   └── history/page.tsx    ← Historique avec sélection bulk
│   ├── hooks/
│   │   └── useAuditStream.ts   ← SSE via XMLHttpRequest (bypass proxy)
│   ├── components/
│   │   ├── audit/              ← AuditProgress, AuditLog
│   │   ├── dashboard/          ← SiteTable, SiteModal, ServerMap, etc.
│   │   ├── layout/             ← Header, Sidebar
│   │   └── ui/                 ← Card, Button, Badge
│   ├── lib/
│   │   ├── api.ts              ← Client API (fetch + screenshot URL helper)
│   │   ├── types.ts            ← Types TypeScript partagés
│   │   └── constants.ts        ← Constantes UI
│   └── next.config.js          ← Rewrite proxy /api → backend:8003
│
└── output/
    ├── history/                ← Rapports JSON sauvegardés
    └── screenshots/            ← Captures PNG Playwright
```

## Règles critiques

### Playwright = TOUJOURS via subprocess
Windows ProactorEventLoop = crash avec Playwright dans le process principal.
NE JAMAIS importer playwright dans le backend FastAPI directement.
Utiliser UNIQUEMENT `pw_bridge.py` qui lance `pw_worker.py` via `subprocess.Popen`.

### Fonctions pw_bridge.py
- `full_audit_subprocess(domains, output_dir)` → scoring + screenshots en 1 passe
- `score_all_subprocess(domains)` → scoring seul (sans screenshots)
- `screenshot_all_subprocess(domains, output_dir)` → screenshots seul
- `extract_metadata_subprocess(domains)` → metadata pour catégorisation

### Mode full (single-pass)
Quand attention ET screenshots sont activés, le pipeline utilise `full_audit_subprocess`
qui fait score + highlight + capture en UNE SEULE navigation par domaine (~15s/site).
Cela remplace l'ancien système à 2 passes (~40s/site).

### Pipeline SSE dans audit.py (ordre d'exécution)
1. **Health Check** — httpx async, timeout 8s, 1 retry
2. **Playwright** — `full_audit_subprocess` ou `score_all_subprocess`
   - Attentes adaptatives (détection CMP, détection iframes pub)
   - Scroll rapide (1200px/60ms)
   - Clutter score (ratio surface pub/viewport à 3 positions)
3. **ads.txt** — httpx async parallèle
4. **Géolocalisation** — DNS batch + ip-api.com batch (1 appel pour toutes les IPs)
5. **Catégorisation IA** — Mistral API séquentielle
6. **Screenshots** — skip si déjà fait par full_audit (étape 2)

### SSE Streaming
- Backend envoie des événements SSE (log, step, heartbeat, complete, error)
- `_run_with_heartbeat()` maintient la connexion pendant les opérations longues
- Les logs stderr de pw_worker sont streamés en temps réel via un thread
- Frontend utilise `XMLHttpRequest.onprogress` (pas fetch, pas EventSource)
- Le frontend appelle le backend DIRECTEMENT (port 8003), PAS via le proxy Next.js
  (le proxy Next.js bufferise les SSE)

### Score d'encombrement (clutter score)
Score principal basé sur le ratio de surface pub/viewport mesuré à 3 positions :
- ATF (above the fold) = poids 50%
- Mid-page (50% scroll) = poids 30%
- Deep (80% scroll) = poids 20%
Formula : `10 × (1 - weighted_ratio)`
Seuil MFA : score < 4.0

### Screenshots
Deux fichiers par site dans `output/screenshots/` :
- `{domain}_viewport.png` : 1280×800 (above the fold)
- `{domain}_full.png` : page complète
Les pubs sont surlignées en rouge avec label de zone (ATF, MID, DEEP, FOOTER, STICKY).
Bandeau MLI en haut avec score et stats.

### Carte géo (ServerMap)
Choroplèthe mondial avec `world-map-country-shapes` (211 pays).
Pays colorés par densité de serveurs et action (vert/ambre/rouge).
Pays sans données = gris clair. Tooltip au hover.

### Suppression d'audit
La suppression d'un audit supprime le JSON ET les screenshots PNG associées.
La page historique supporte la sélection bulk + suppression en masse.

## Design

**LIRE DESIGN.md AVANT TOUT CHANGEMENT D'INTERFACE.**
Direction : "Corporate Intelligence Dashboard" — light mode, bleu royal dominant.
Fond #EEF2FF, accent bleu #1D4ED8, sidebar bleu nuit #1E2A4A.
PAS de Streamlit brut — override CSS agressif de tout le theming.
Typo : Plus Jakarta Sans + JetBrains Mono.

## Fichiers de référence
- **DESIGN.md** : Design system complet (LIRE EN PREMIER)
- **ADTECH.md** : Détection publicitaire multi-couche (refonte complète)
- **TODO.md** : Liste des tâches à exécuter dans l'ordre
