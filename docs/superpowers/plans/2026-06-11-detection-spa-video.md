# Détection SPA + Vidéo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Note environnement :** `git` n'est pas dans le PATH de cette machine. Les étapes "Commit" sont donc **optionnelles** (à exécuter si git est installé). Les commandes Python s'exécutent via **PowerShell** (le `python` de bash n'est pas dispo). Tests via `python -m pytest`.

**Goal:** Fiabiliser le scoring de `full_audit` : ne plus scorer 10/10 une page non chargée, détecter passivement la pub vidéo (replay), et faire que ces signaux impactent réellement le score final.

**Architecture:** On isole la logique pure (sans navigateur) dans un nouveau module `backend/services/detection_helpers.py`, testé unitairement avec pytest. `pw_worker.full_audit()` câble ces helpers + un garde-fou de chargement + une couche de détection vidéo, et assemble le score final comme `min(clutter, v4+vidéo)` au lieu de `clutter` seul. Les nouvelles constantes vont dans `config.py`. La sortie `score=None` réutilise le mécanisme N/A déjà géré par `models.compute_stats`.

**Tech Stack:** Python 3.13, Playwright (sync), pytest.

---

## File Structure

- **Create** `backend/services/detection_helpers.py` — fonctions pures : garde-fou contenu, détection vidéo, pénalité vidéo, assemblage score.
- **Create** `backend/test_detection_helpers.py` — tests unitaires pytest (pattern existant : `backend/test_migration.py`).
- **Modify** `backend/config.py` — constantes vidéo + seuils garde-fou.
- **Modify** `backend/services/pw_worker.py` — câblage dans `full_audit()` + helper `_load_error_result()`.

Aucun changement frontend / API / schéma DB.

---

## Task 1 : Module de helpers purs + config + tests

**Files:**
- Create: `backend/services/detection_helpers.py`
- Create: `backend/test_detection_helpers.py`
- Modify: `backend/config.py` (append à la fin)

- [ ] **Step 1 : Écrire les tests qui échouent** — `backend/test_detection_helpers.py`

```python
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from services.detection_helpers import (
    is_content_sufficient, detect_video_ad_domains,
    compute_video_ad_units, video_penalty, combine_scores,
)

VIDEO_DOMAINS = ["imasdk.googleapis.com", "freewheel.com", "spotx.tv"]
VIDEO_HINTS = ["/pubads", "vast", "vmap"]


def test_blank_page_is_not_sufficient():
    assert is_content_sufficient(0, 3) is False

def test_real_page_is_sufficient():
    assert is_content_sufficient(5000, 800) is True

def test_borderline_text_only_not_enough():
    assert is_content_sufficient(50, 800) is False

def test_detect_video_domain():
    urls = ["https://imasdk.googleapis.com/js/sdkloader/ima3.js", "https://x.fr/article"]
    assert "imasdk.googleapis.com" in detect_video_ad_domains(urls, VIDEO_DOMAINS, VIDEO_HINTS)

def test_detect_vast_endpoint():
    urls = ["https://pubads.g.doubleclick.net/gampad/ads?vast=1"]
    assert "vast-endpoint" in detect_video_ad_domains(urls, VIDEO_DOMAINS, VIDEO_HINTS)

def test_no_video_signal():
    assert detect_video_ad_domains(["https://x.fr/"], VIDEO_DOMAINS, VIDEO_HINTS) == []

def test_video_units_player_plus_infra():
    assert compute_video_ad_units(True, ["freewheel.com"]) == 1
    assert compute_video_ad_units(True, ["freewheel.com", "spotx.tv", "imasdk.googleapis.com"]) == 3

def test_video_units_capped():
    assert compute_video_ad_units(True, ["a","b","c","d","e","f"]) == 4

def test_video_units_infra_no_player():
    assert compute_video_ad_units(False, ["freewheel.com"]) == 0
    assert compute_video_ad_units(False, ["freewheel.com","spotx.tv"]) == 1

def test_video_units_none():
    assert compute_video_ad_units(True, []) == 0

def test_video_penalty():
    assert video_penalty(2) == 3.0

def test_combine_takes_minimum():
    assert combine_scores(10.0, 6.4) == 6.4

def test_combine_handles_none():
    assert combine_scores(None, 6.4) == 6.4
    assert combine_scores(10.0, None) == 10.0
    assert combine_scores(None, None) is None
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run (PowerShell, depuis `C:\MLI\mli_crawler\backend`) :
```
python -m pytest test_detection_helpers.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'services.detection_helpers'`.

- [ ] **Step 3 : Créer le module de helpers** — `backend/services/detection_helpers.py`

```python
"""Pure detection & scoring helpers — no Playwright dependency.

Isolated from pw_worker.py so the logic can be unit-tested without a browser.
"""
from __future__ import annotations


def is_content_sufficient(visible_text_len: int, dom_node_count: int,
                          min_text: int = 200, min_nodes: int = 50) -> bool:
    """Did the page render real content, or is it a blank/SPA shell?

    A blank page (failed SPA hydration, hard timeout) has almost no visible
    text and very few DOM nodes. Require BOTH a minimum of visible text and a
    minimum DOM size to consider the page 'loaded'.
    """
    return visible_text_len >= min_text and dom_node_count >= min_nodes


def detect_video_ad_domains(intercepted_urls, video_domains, video_path_hints):
    """Distinct in-stream video-ad signals seen in network request URLs.

    `video_domains`   : known video SSP / IMA hosts.
    `video_path_hints`: VAST/VMAP url fragments served by generic ad hosts.
    Returns a sorted list of matched keys (domain string or 'vast-endpoint').
    """
    found = set()
    for u in intercepted_urls:
        ul = (u or "").lower()
        for d in video_domains:
            if d in ul:
                found.add(d)
        if any(h in ul for h in video_path_hints):
            found.add("vast-endpoint")
    return sorted(found)


def compute_video_ad_units(has_player: bool, video_ad_domains) -> int:
    """Estimate in-stream video ad slots from passive signals (no play-click).

    Player present + video-ad infra firing => >=1 pre-roll slot; extra distinct
    video signals => more slots (capped at 4). Infra without a detected player
    is weaker: 1 unit only if >=2 distinct signals.
    """
    n = len(video_ad_domains)
    if n == 0:
        return 0
    if has_player:
        return min(n, 4)
    return 1 if n >= 2 else 0


def video_penalty(units: int, per_unit: float = 1.5) -> float:
    """Score penalty for in-stream video ads (heavier than a display banner)."""
    return units * per_unit


def combine_scores(clutter_score, v4_score):
    """Final score = the most penalizing (lowest) available evidence score.

    Returns None only if BOTH inputs are None (page not scored).
    """
    vals = [s for s in (clutter_score, v4_score) if s is not None]
    if not vals:
        return None
    return round(min(vals), 1)
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run : `python -m pytest test_detection_helpers.py -v`
Expected: PASS (14 tests).

- [ ] **Step 5 : Ajouter les constantes à `config.py`** (append à la fin du fichier)

```python
# ── Détection vidéo (in-stream / replay) ─────────────────
VIDEO_AD_DOMAINS = [
    "imasdk.googleapis.com", "freewheel.com", "spotx.tv", "spotxchange.com",
    "springserve.com", "teads.tv", "jwpcdn.com", "jwplayer.com",
    "dailymotion.com/player",
]
VIDEO_AD_PATH_HINTS = ["/pubads", "vast", "vmap", "video_ad", "preroll"]
VIDEO_PLAYER_SELECTOR = (
    "video, .video-js, .jwplayer, [class*='player'], [id*='player'], "
    "iframe[src*='dailymotion'], iframe[src*='youtube']"
)
VIDEO_PENALTY_PER_UNIT = 1.5

# ── Garde-fou chargement de page (anti page blanche / SPA) ─
CONTENT_MIN_TEXT = 200    # caractères de texte visible minimum
CONTENT_MIN_NODES = 50    # nœuds DOM minimum
NAV_RETRY_TIMEOUT_MS = 15_000
```

- [ ] **Step 6 : (Optionnel) Commit**

```bash
git add backend/services/detection_helpers.py backend/test_detection_helpers.py backend/config.py
git commit -m "feat(detection): pure helpers for page-load guard, video detection, score assembly"
```

---

## Task 2 : Garde-fou page chargée + retry dans `full_audit`

**Files:**
- Modify: `backend/services/pw_worker.py` (fonction `full_audit`, après le bloc nav ~ligne 1417 ; + nouveau helper `_load_error_result` avant `full_audit`)

- [ ] **Step 1 : Ajouter le helper `_load_error_result`** juste avant `def full_audit(` (~ligne 1396)

```python
def _load_error_result(domain: str, metrics: dict, load_ms: int) -> dict:
    """Result for a page that never rendered real content (blank SPA / timeout).
    score=None => exclu des moyennes (models.compute_stats ignore les None)."""
    return {
        "ad_count": 0, "interstitials_count": 0, "interstitials": [],
        "score": None, "clutter_score": None, "attention_score": None,
        "is_mfa": False, "status": "load_error",
        "error": f"page non chargee (text={metrics.get('t', 0)}, nodes={metrics.get('n', 0)})",
        "content_lang": "", "adtech": {"scripts_detected": []},
        "trackers": {"total": 0}, "page_load_time_ms": load_ms,
        "clutter_detail": {}, "page_profile": {},
        "viewport_path": "", "fullpage_path": "",
        "breakdown": {}, "cookie_dismissed": False,
    }
```

- [ ] **Step 2 : Insérer le garde-fou** dans `full_audit`, juste après le bloc try/except du `page.goto` (après la ligne `_log(f"    [nav] Timeout/erreur apres {page_load_time_ms}ms — on continue")`, ~ligne 1417)

```python
        # 1b. Page-load guard — retry once if blank/SPA shell
        from services.detection_helpers import is_content_sufficient
        from config import CONTENT_MIN_TEXT, CONTENT_MIN_NODES, NAV_RETRY_TIMEOUT_MS

        def _content_metrics():
            try:
                return page.evaluate(
                    "() => ({t: ((document.body && document.body.innerText) || '').length,"
                    " n: document.querySelectorAll('*').length})")
            except Exception:
                return {"t": 0, "n": 0}

        page.wait_for_timeout(600)
        _m = _content_metrics()
        if not is_content_sufficient(_m["t"], _m["n"], CONTENT_MIN_TEXT, CONTENT_MIN_NODES):
            _log(f"    [guard] Contenu faible (text={_m['t']} nodes={_m['n']}) — retry networkidle...")
            try:
                page.goto(url, timeout=NAV_RETRY_TIMEOUT_MS, wait_until="networkidle")
            except Exception:
                pass
            page.wait_for_timeout(1500)
            _m = _content_metrics()
            if not is_content_sufficient(_m["t"], _m["n"], CONTENT_MIN_TEXT, CONTENT_MIN_NODES):
                _log(f"    [guard] Page non chargee (text={_m['t']} nodes={_m['n']}) -> load_error")
                remove_network_listener(page)
                return _load_error_result(domain, _m, page_load_time_ms)
```

- [ ] **Step 3 : Vérifier la syntaxe**

Run (PowerShell, depuis `backend`) :
```
python -c "import ast; ast.parse(open(r'services/pw_worker.py',encoding='utf-8').read()); print('OK')"
```
Expected: `OK`.

- [ ] **Step 4 : Smoke test du garde-fou sur my.tf1.fr**

Run (PowerShell, depuis `backend`) :
```
'{"domains":["my.tf1.fr"],"mode":"full","output_dir":"C:/MLI/mli_crawler/output/screenshots"}' | python -u services/pw_worker.py 2>&1 | Select-String "guard|load_error|RESULT"
```
Expected: une ligne `[guard]` puis soit un score réel si le retry a chargé la page, soit `-> load_error`. Plus jamais `score=10.0 ads=0` silencieux sur page blanche.

- [ ] **Step 5 : (Optionnel) Commit**

```bash
git add backend/services/pw_worker.py
git commit -m "feat(detection): page-load guard with retry, mark blank/SPA pages as load_error"
```

---

## Task 3 : Détection vidéo passive + assemblage du score

**Files:**
- Modify: `backend/services/pw_worker.py` (fonction `full_audit`, section scoring ~lignes 1483-1564)

- [ ] **Step 1 : Insérer la détection vidéo** juste après la ligne `net_stats = compute_network_stats(intercepted)` et son `_log` (~ligne 1485), avant `# 11. Score v4`

```python
        # 10b. Video ad detection (passive — no play-click)
        from services.detection_helpers import (
            detect_video_ad_domains, compute_video_ad_units, video_penalty, combine_scores,
        )
        from config import (
            VIDEO_AD_DOMAINS, VIDEO_AD_PATH_HINTS, VIDEO_PLAYER_SELECTOR, VIDEO_PENALTY_PER_UNIT,
        )
        try:
            has_player = bool(page.evaluate("(sel) => !!document.querySelector(sel)", VIDEO_PLAYER_SELECTOR))
        except Exception:
            has_player = False
        video_signals = detect_video_ad_domains(
            [r.get("url", "") for r in intercepted], VIDEO_AD_DOMAINS, VIDEO_AD_PATH_HINTS)
        video_units = compute_video_ad_units(has_player, video_signals)
        _log(f"    [video] player={has_player} signals={video_signals} units={video_units}")
```

- [ ] **Step 2 : Assembler le score final** — remplacer, après le calcul de `clutter_score` (après le bloc try/except `compute_clutter_score`, ~ligne 1502), l'usage de `clutter_score` par un `final_score`. Insérer juste après ce bloc :

```python
        # 12b. Final score = most penalizing of clutter vs v4(+video)
        v4_with_video = max(0.0, round(score - video_penalty(video_units, VIDEO_PENALTY_PER_UNIT), 1))
        final_score = combine_scores(clutter_score, v4_with_video)
        if final_score is None:
            final_score = 10.0  # both None: no evidence -> treat as clean (page loaded but nothing found)
        _log(f"    [score] final={final_score} (clutter={clutter_score} v4+video={v4_with_video} video_units={video_units})")
```

- [ ] **Step 3 : Utiliser `final_score` dans le banner et le return.** Dans l'appel `page.evaluate(banner_js, {...})` remplacer `"score": clutter_score,` par `"score": final_score,`. Dans le `return {...}` (~lignes 1556-1564) remplacer les trois lignes :

```python
            "score": clutter_score,
            "clutter_score": clutter_score,
            "attention_score": clutter_score,
            "is_mfa": clutter_score < 4.0,
```
par :
```python
            "score": final_score,
            "clutter_score": clutter_score,
            "attention_score": final_score,
            "is_mfa": final_score < 4.0,
            "video_units": video_units,
            "video_signals": video_signals,
```

- [ ] **Step 4 : Vérifier la syntaxe**

Run (PowerShell, depuis `backend`) :
```
python -c "import ast; ast.parse(open(r'services/pw_worker.py',encoding='utf-8').read()); print('OK')"
```
Expected: `OK`.

- [ ] **Step 5 : (Optionnel) Commit**

```bash
git add backend/services/pw_worker.py
git commit -m "feat(detection): passive video-ad detection + final score = min(clutter, v4+video)"
```

---

## Task 4 : Validation en direct (3 sites + échantillon)

**Files:** aucun (run de validation). Backend doit être relançable.

- [ ] **Step 1 : Re-run les 3 sites de référence**

Run (PowerShell, depuis `backend`) :
```
'{"domains":["my.tf1.fr","6play.fr","lemonde.fr"],"mode":"full","output_dir":"C:/MLI/mli_crawler/output/screenshots"}' | python -u services/pw_worker.py > C:/MLI/test2_result.json 2> C:/MLI/test2_logs.txt
```
Puis inspecter :
```
python -c "import json; d=json.loads(open(r'C:/MLI/test2_result.json','rb').read().decode('utf-8','replace')); [print(k, '-> score=', v.get('score'), 'status=', v.get('status'), 'video=', v.get('video_units'), 'ads=', v.get('ad_count')) for k,v in d.items()]"
```

Expected (critères de réussite) :
- `lemonde.fr` → `score` ≈ **6.4** (plus 10.0), `status` absent/ok.
- `6play.fr` → `score` **< 10** et `video_units` ≥ 1 (signal vidéo capté).
- `my.tf1.fr` → soit `status='load_error'` (score None), soit un score réel si le retry a chargé la page — **plus de 10/10 sur page blanche**.

- [ ] **Step 2 : Échantillon élargi (~15 sites de la whitelist)**

Run (PowerShell) — extrait 15 domaines nettoyés de l'Excel et les audite :
```
python -c "import openpyxl,json; ws=openpyxl.load_workbook(r'C:\MLI\WhiteListe_GAE_2025 1.xlsx',data_only=True)['Sheet1']; s=[str(r[0]).strip() for r in ws.iter_rows(min_row=2,values_only=True) if r[0]][:15]; open(r'C:/MLI/sample15.json','w').write(json.dumps({'domains':s,'mode':'full','output_dir':'C:/MLI/mli_crawler/output/screenshots'}))"
Get-Content C:/MLI/sample15.json | python -u services/pw_worker.py > C:/MLI/sample15_result.json 2> C:/MLI/sample15_logs.txt
python -c "import json; d=json.loads(open(r'C:/MLI/sample15_result.json','rb').read().decode('utf-8','replace')); import statistics as st; sc=[v.get('score') for v in d.values() if v.get('score') is not None]; le=[k for k,v in d.items() if v.get('status')=='load_error']; print('scored:',len(sc),'avg:',round(sum(sc)/len(sc),2) if sc else 'NA','load_error:',len(le),le)"
```

Expected : distribution de scores variée (pas tous à 10), un nombre de `load_error` plausible (pas 15/15), pas de crash. Si >50% en `load_error`, ajuster `CONTENT_MIN_TEXT/NODES` dans `config.py` et relancer.

- [ ] **Step 3 : Vérifier l'absence de régression display**

Confirmer dans `C:/MLI/sample15_logs.txt` que les sites de news/contenu classique gardent une détection DOM cohérente (`[dom] N pubs detectees` avec N réaliste) et un `final` proche du v4 quand des pubs sont trouvées.

- [ ] **Step 4 : (Optionnel) Commit du doc de résultats** si tu sauvegardes un récap.

---

## Self-Review (auteur du plan)

- **Couverture spec :** garde-fou page blanche (Task 2) ✓ ; détection vidéo passive (Task 3) ✓ ; assemblage score min(clutter, v4+vidéo) (Task 3) ✓ ; N/A exclu des stats (réutilise `models.compute_stats`, vérifié en Task 4) ✓ ; non-régression display (Task 4 step 3) ✓.
- **Placeholders :** aucun — code complet à chaque étape.
- **Cohérence des types/noms :** `is_content_sufficient`, `detect_video_ad_domains`, `compute_video_ad_units`, `video_penalty`, `combine_scores`, `_load_error_result`, `final_score`, `video_units`, `video_signals` — utilisés de façon cohérente entre Task 1/2/3. Constantes config référencées identiquement.
- **Note :** `score` (v4) est calculé ligne ~1489 et reste la base de `v4_with_video` en Task 3 — bien le conserver (ne pas le renommer).
