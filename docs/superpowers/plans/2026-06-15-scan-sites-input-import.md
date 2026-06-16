# Scan de sites (saisie d'URL + import CSV/Excel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'ajouter et scanner de nouveaux sites depuis `/sites`, par saisie d'URL ou import CSV/Excel, en réutilisant le pipeline d'audit existant.

**Architecture:** Un nouvel endpoint backend `POST /api/sites/parse-input` extrait/nettoie/dédoublonne les URLs (texte + CSV + XLSX) et retire celles déjà en base. Le frontend ouvre une modale depuis `/sites`, appelle cet endpoint, puis pousse la liste des nouveaux domaines dans le pipeline SSE existant `POST /api/audit` via le hook `useAuditStream`. Aucune modification du pipeline d'audit.

**Tech Stack:** FastAPI + openpyxl + python-multipart (backend) ; Next.js 14 + React + Tailwind (frontend). Tests backend en script Python autonome (pas de DB/async pour les fonctions pures).

**Spec de référence :** `docs/superpowers/specs/2026-06-15-scan-sites-input-import-design.md`

---

## Contexte codebase (à connaître avant de commencer)

- **Moteur de scan existant** : `POST /api/audit` (`backend/routers/audit.py`) prend `AuditRequest` et upsert chaque domaine dans la table `domains`. Il lit `request.modules.attention/ads_txt/geo/screenshots` et `request.client`. Pour un scan complet il faut passer un `modules` avec tous les flags voulus à `true`.
- **Hook SSE** : `frontend/hooks/useAuditStream.ts` — `startAudit(request: AuditRequest)`. Tape `http://localhost:8020/api/audit` en direct (le proxy Next bufferise les SSE). Expose `logs`, `currentStep`, `isRunning`, `error`, `startAudit`.
- **Composant log** : `frontend/components/audit/AuditLog.tsx` — props `{ logs: string[]; isRunning: boolean }`.
- **Helpers domaine** : `backend/services/site_utils.py` — `clean_domain(raw)`, `dedup_domains(list)`.
- **Router sites** : `backend/routers/sites.py` — `router = APIRouter(prefix="/api/sites")`, imports `from db import fetch_one, fetch_all, execute, _now` et `from auth import get_current_user`.
- **Page liste** : `frontend/app/sites/page.tsx` — expose `refreshAll()` (reload liste + stats). Header dans un `<div className="flex items-baseline justify-between">`.
- **API client** : `frontend/lib/api.ts` — `const API_BASE = '/api'`, `fetchWithAuth(url, opts)` (= `fetch`, auth désactivée).
- **Types** : `frontend/lib/types.ts` — `AuditModules { attention, ads_txt, geo, categorization, screenshots }`, `AuditRequest { domains, client, modules, mistral_key?, workspace_id? }`.
- **Style modale de référence** : `frontend/components/sites/CategorizeModal.tsx` (classes `glass-card`, `glow-card`, `bg-primary-electric`, `text-on-surface`, etc.).

**Serveurs dev** : front `http://localhost:3001`, backend `http://localhost:8020`.

---

## File Structure

| Fichier | Responsabilité |
|---------|----------------|
| `backend/services/site_utils.py` (modif) | + `is_domain_like`, `extract_from_text/csv/xlsx`, `collect_candidates`, `build_scan_partition` (logique pure, testable sans DB). |
| `backend/test_scan_input.py` (create) | Tests des fonctions pures d'extraction/filtre/dédup. |
| `backend/routers/sites.py` (modif) | + endpoint `POST /api/sites/parse-input` (wiring : extraction → requête DB existants → partition). |
| `frontend/lib/api.ts` (modif) | + `ScanInputResult` + `parseScanInput(text, file)`. |
| `frontend/components/sites/ScanModal.tsx` (create) | Modale : saisie + import + progression SSE. |
| `frontend/app/sites/page.tsx` (modif) | Bouton « Scanner des sites » + état modale + `onDone={refreshAll}`. |

---

## Task 1: Backend — filtre domain-like + partition (logique pure)

**Files:**
- Modify: `backend/services/site_utils.py`
- Test: `backend/test_scan_input.py`

- [ ] **Step 1: Write the failing test**

Créer `backend/test_scan_input.py` :

```python
"""Tests des helpers d'extraction/filtre/dédup pour le scan par saisie/import.
Fonctions pures — aucun DB, aucun async. Lancer : python backend/test_scan_input.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))  # importer le package backend

from services.site_utils import is_domain_like, build_scan_partition


def test_is_domain_like():
    assert is_domain_like("lemonde.fr")
    assert is_domain_like("sous.domaine.com/section")
    assert is_domain_like("jeux-video.com")
    assert not is_domain_like("url")          # en-tête de colonne
    assert not is_domain_like("123")          # nombre
    assert not is_domain_like("a.b")          # TLD 1 lettre
    assert not is_domain_like("")             # vide
    print("OK test_is_domain_like")


def test_build_scan_partition_dedup_and_existing():
    candidates = ["LeMonde.fr", "https://lemonde.fr/", "bild.de", "url", "jeuxvideo.com"]
    existing = {"jeuxvideo.com"}
    res = build_scan_partition(candidates, existing)
    assert res["to_scan"] == ["lemonde.fr", "bild.de"]   # dédup interne + nettoyage
    assert res["duplicates"] == ["jeuxvideo.com"]         # déjà en base
    assert res["invalid_count"] == 1                       # "url" rejeté
    assert res["total_found"] == 3                         # valides distincts
    print("OK test_build_scan_partition_dedup_and_existing")


if __name__ == "__main__":
    test_is_domain_like()
    test_build_scan_partition_dedup_and_existing()
    print("ALL OK (task 1)")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python backend/test_scan_input.py`
Expected: FAIL — `ImportError: cannot import name 'is_domain_like'`

- [ ] **Step 3: Write minimal implementation**

Ajouter en haut de `backend/services/site_utils.py` (après le docstring de module, avant `clean_domain`) :

```python
import re

_DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/.*)?$")
```

Puis ajouter à la fin du fichier (après `dedup_domains`) :

```python
def is_domain_like(d: str) -> bool:
    """True si *d* (déjà passé par clean_domain) ressemble à un host ou
    host/path avec un TLD de 2+ lettres. Rejette les mots seuls, nombres,
    en-têtes de colonnes."""
    if not d or "." not in d:
        return False
    if not _DOMAIN_RE.match(d):
        return False
    host = d.split("/", 1)[0]
    tld = host.rsplit(".", 1)[-1]
    return len(tld) >= 2 and tld.isalpha()


def build_scan_partition(candidates: list[str], existing: set[str]) -> dict:
    """Nettoie + filtre (domain-like) + dédoublonne *candidates*, puis sépare
    en nouveaux (`to_scan`) vs déjà connus (`duplicates`).

    Returns {to_scan, duplicates, invalid_count, total_found} où
    total_found = len(to_scan) + len(duplicates) (valides distincts) et
    invalid_count = nb de candidats rejetés par le filtre domain-like."""
    seen: set[str] = set()
    valid: list[str] = []
    invalid = 0
    for raw in candidates:
        d = clean_domain(raw)
        if not d:
            continue  # cellule vide — pas compté comme invalide
        if not is_domain_like(d):
            invalid += 1
            continue
        if d in seen:
            continue
        seen.add(d)
        valid.append(d)
    existing_clean = {clean_domain(e) for e in existing}
    to_scan = [d for d in valid if d not in existing_clean]
    duplicates = [d for d in valid if d in existing_clean]
    return {
        "to_scan": to_scan,
        "duplicates": duplicates,
        "invalid_count": invalid,
        "total_found": len(valid),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python backend/test_scan_input.py`
Expected: PASS — affiche `ALL OK (task 1)`

- [ ] **Step 5: Commit**

```bash
git add backend/services/site_utils.py backend/test_scan_input.py
git commit -m "feat(scan): filtre domain-like + partition new/duplicates (pur)"
```

---

## Task 2: Backend — extraction texte / CSV / XLSX

**Files:**
- Modify: `backend/services/site_utils.py`
- Test: `backend/test_scan_input.py`

- [ ] **Step 1: Write the failing test**

Ajouter ces tests dans `backend/test_scan_input.py` (avant le bloc `if __name__`), et mettre à jour l'import en tête du fichier :

```python
from services.site_utils import collect_candidates  # ajouter à l'import existant
import io
from openpyxl import Workbook


def test_extract_from_text():
    got = collect_candidates("lemonde.fr, bild.de\njeuxvideo.com  marca.com", None, None)
    assert got == ["lemonde.fr", "bild.de", "jeuxvideo.com", "marca.com"]
    print("OK test_extract_from_text")


def test_extract_from_csv():
    csv_bytes = b"url,note\nlemonde.fr,ok\nbild.de,vu\n"
    got = collect_candidates(None, csv_bytes, "liste.csv")
    # En-tete "url"/"note" inclus ici — le filtre domain-like les ecarte plus tard.
    assert "lemonde.fr" in got and "bild.de" in got
    print("OK test_extract_from_csv")


def test_extract_from_xlsx():
    wb = Workbook()
    ws = wb.active
    ws.append(["url"])
    ws.append(["lemonde.fr"])
    ws.append(["bild.de"])
    buf = io.BytesIO()
    wb.save(buf)
    got = collect_candidates(None, buf.getvalue(), "liste.xlsx")
    assert "lemonde.fr" in got and "bild.de" in got
    print("OK test_extract_from_xlsx")


def test_unsupported_format_raises():
    try:
        collect_candidates(None, b"data", "image.png")
        assert False, "doit lever ValueError"
    except ValueError:
        pass
    print("OK test_unsupported_format_raises")
```

Et ajouter leurs appels dans le bloc `if __name__ == "__main__":` :

```python
    test_extract_from_text()
    test_extract_from_csv()
    test_extract_from_xlsx()
    test_unsupported_format_raises()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python backend/test_scan_input.py`
Expected: FAIL — `ImportError: cannot import name 'collect_candidates'`

- [ ] **Step 3: Write minimal implementation**

Ajouter à la fin de `backend/services/site_utils.py` :

```python
import csv as _csv
import io as _io

_SPLIT_RE = re.compile(r"[\s,;]+")


def extract_from_text(text: str) -> list[str]:
    """Découpe une saisie libre sur retours-ligne, virgules, points-virgules,
    espaces/tabs."""
    if not text:
        return []
    return [p for p in _SPLIT_RE.split(text) if p]


def extract_from_csv(data: bytes) -> list[str]:
    """Aplatit toutes les cellules non vides d'un CSV (UTF-8, fallback latin-1)."""
    try:
        decoded = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = data.decode("latin-1", errors="ignore")
    out: list[str] = []
    for row in _csv.reader(_io.StringIO(decoded)):
        for cell in row:
            cell = (cell or "").strip()
            if cell:
                out.append(cell)
    return out


def extract_from_xlsx(data: bytes) -> list[str]:
    """Aplatit toutes les cellules non vides d'un classeur .xlsx."""
    from openpyxl import load_workbook
    wb = load_workbook(_io.BytesIO(data), read_only=True, data_only=True)
    out: list[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            for cell in row:
                if cell is None:
                    continue
                s = str(cell).strip()
                if s:
                    out.append(s)
    wb.close()
    return out


def collect_candidates(text, file_bytes, filename) -> list[str]:
    """Combine la saisie libre et un éventuel fichier (CSV ou XLSX) en une liste
    brute de candidats. Lève ValueError si le fichier n'est ni .csv ni .xlsx."""
    out: list[str] = []
    if text:
        out.extend(extract_from_text(text))
    if file_bytes:
        name = (filename or "").lower()
        if name.endswith(".csv"):
            out.extend(extract_from_csv(file_bytes))
        elif name.endswith(".xlsx"):
            out.extend(extract_from_xlsx(file_bytes))
        else:
            raise ValueError("unsupported_format")
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python backend/test_scan_input.py`
Expected: PASS — `ALL OK (task 1)` puis tous les `OK test_...`

- [ ] **Step 5: Commit**

```bash
git add backend/services/site_utils.py backend/test_scan_input.py
git commit -m "feat(scan): extraction candidats depuis texte / CSV / XLSX"
```

---

## Task 3: Backend — endpoint POST /api/sites/parse-input

**Files:**
- Modify: `backend/routers/sites.py`

- [ ] **Step 1: Étendre l'import FastAPI**

Dans `backend/routers/sites.py`, remplacer la ligne d'import FastAPI :

```python
from fastapi import APIRouter, Depends, Query, HTTPException, Body
```

par :

```python
from fastapi import APIRouter, Depends, Query, HTTPException, Body, UploadFile, File, Form
```

- [ ] **Step 2: Ajouter l'endpoint**

Ajouter, juste après la définition de `router` et des constantes (par ex. après le bloc `_SCORE_BUCKETS`, avant les autres routes), le code suivant :

```python
@router.post("/parse-input")
async def parse_input(
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    user: dict = Depends(get_current_user),
):
    """Extrait des domaines candidats depuis une saisie libre et/ou un fichier
    CSV/XLSX, filtre les entrées 'domain-like', dédoublonne, puis sépare en
    nouveaux (`to_scan`) vs déjà présents en base (`duplicates`).

    Ne lance AUCUN scan : le frontend appelle ensuite /api/audit avec `to_scan`.
    """
    from services.site_utils import collect_candidates, build_scan_partition

    file_bytes = await file.read() if file is not None else None
    filename = file.filename if file is not None else None

    if not (text and text.strip()) and not file_bytes:
        raise HTTPException(400, "Aucune entrée fournie")

    try:
        candidates = collect_candidates(text, file_bytes, filename)
    except ValueError:
        raise HTTPException(400, "Format non supporté (CSV ou XLSX uniquement)")
    except Exception:
        raise HTTPException(400, "Fichier illisible")

    rows = await fetch_all("SELECT domain FROM domains")
    existing = {r["domain"] for r in rows}
    return build_scan_partition(candidates, existing)
```

- [ ] **Step 3: Vérification manuelle (backend dev sur :8020)**

S'assurer que le backend tourne (sinon le (re)lancer). Tester texte + dédup :

```bash
curl -s -X POST http://localhost:8020/api/sites/parse-input \
  -F $'text=lemonde.fr\nbild.de\nurl\nlemonde.fr'
```

Expected (la base `domains` est vide à ce stade) :
```json
{"to_scan":["lemonde.fr","bild.de"],"duplicates":[],"invalid_count":1,"total_found":2}
```

Tester un import CSV :

```bash
printf 'url,note\nmarca.com,ok\njeuxvideo.com,vu\n' > /tmp/mli_test.csv
curl -s -X POST http://localhost:8020/api/sites/parse-input -F file=@/tmp/mli_test.csv
```

Expected :
```json
{"to_scan":["marca.com","jeuxvideo.com"],"duplicates":[],"invalid_count":2,"total_found":2}
```
(les en-têtes `url`/`note` comptent dans `invalid_count`).

- [ ] **Step 4: Commit**

```bash
git add backend/routers/sites.py
git commit -m "feat(scan): endpoint POST /api/sites/parse-input"
```

---

## Task 4: Frontend — helper API parseScanInput

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Ajouter le type et la fonction**

À la fin de `frontend/lib/api.ts`, ajouter :

```ts
/* ── Scan : analyse de la saisie / fichier importé ── */

export interface ScanInputResult {
  to_scan: string[];
  duplicates: string[];
  invalid_count: number;
  total_found: number;
}

export async function parseScanInput(text: string, file: File | null): Promise<ScanInputResult> {
  const fd = new FormData();
  if (text.trim()) fd.append('text', text);
  if (file) fd.append('file', file);
  const res = await fetchWithAuth(`${API_BASE}/sites/parse-input`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Échec de l’analyse' }));
    throw new Error(err.detail || 'Échec de l’analyse');
  }
  return res.json();
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (aucune erreur)

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(scan): helper API parseScanInput"
```

---

## Task 5: Frontend — composant ScanModal

**Files:**
- Create: `frontend/components/sites/ScanModal.tsx`

- [ ] **Step 1: Créer le composant**

Créer `frontend/components/sites/ScanModal.tsx` :

```tsx
'use client';

import { useState } from 'react';
import { ScanLine, UploadCloud, Loader2, X } from 'lucide-react';
import { useAuditStream } from '@/hooks/useAuditStream';
import { parseScanInput, type ScanInputResult } from '@/lib/api';
import { AuditLog } from '@/components/audit/AuditLog';

export function ScanModal({
  open, onClose, onDone,
}: {
  open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScanInputResult | null>(null);
  const [phase, setPhase] = useState<'input' | 'running'>('input');
  const [succeeded, setSucceeded] = useState(false);

  const { logs, currentStep, isRunning, error: streamError, startAudit } = useAuditStream();

  if (!open) return null;

  const canLaunch = (text.trim().length > 0 || file !== null) && !preparing;

  const reset = () => {
    setText(''); setFile(null); setError(null); setSummary(null);
    setPhase('input'); setSucceeded(false);
  };

  const handleClose = () => {
    if (isRunning) return; // pas de fermeture pendant le scan
    const didScan = succeeded;
    reset();
    onClose();
    if (didScan) onDone();
  };

  const launch = async () => {
    setError(null); setSummary(null); setPreparing(true);
    try {
      const res = await parseScanInput(text, file);
      setSummary(res);
      if (res.to_scan.length === 0) {
        setError('Aucun nouveau site à scanner (tous déjà présents ou aucune URL valide).');
        return;
      }
      setPhase('running');
      setSucceeded(true);
      startAudit({
        domains: res.to_scan,
        client: 'Scan manuel',
        modules: { attention: true, ads_txt: true, geo: true, categorization: false, screenshots: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="glass-card rounded-2xl p-8 max-w-lg w-full mx-4 glow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ScanLine size={22} className="text-accent" />
            <h2 className="text-xl font-extralight text-on-surface">Scanner des sites</h2>
          </div>
          {!isRunning && (
            <button onClick={handleClose} className="text-on-surface-variant hover:text-on-surface">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'input' ? (
          <>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
              Coller des URLs
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'lemonde.fr\nbild.de\njeuxvideo.com'}
              rows={5}
              className="w-full px-4 py-3 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none resize-none font-mono"
            />

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-outline/20" />
              <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">ou</span>
              <div className="flex-1 h-px bg-outline/20" />
            </div>

            <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-lg border border-dashed border-outline/40 cursor-pointer hover:border-accent/50 text-sm text-on-surface-variant">
              <UploadCloud size={16} />
              {file ? file.name : 'Importer un fichier CSV ou Excel (.xlsx)'}
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                onClick={() => setFile(null)}
                className="mt-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-danger"
              >
                Retirer le fichier
              </button>
            )}

            {summary && (
              <p className="mt-4 text-sm text-on-surface-variant">
                <span className="text-accent">{summary.to_scan.length}</span> à scanner ·{' '}
                {summary.duplicates.length} doublons ignorés · {summary.invalid_count} entrées ignorées
              </p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface">
                Annuler
              </button>
              <button
                onClick={launch}
                disabled={!canLaunch}
                className="px-5 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all disabled:opacity-30 flex items-center gap-2"
              >
                {preparing ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                {preparing ? 'Analyse...' : 'Lancer le scan'}
              </button>
            </div>
          </>
        ) : (
          <>
            {summary && (
              <p className="mb-3 text-sm text-on-surface-variant">
                {isRunning ? 'Scan en cours' : 'Scan terminé'} —{' '}
                <span className="text-accent">{summary.to_scan.length}</span> sites
                {currentStep && isRunning ? ` · ${currentStep}` : ''}
              </p>
            )}
            <AuditLog logs={logs} isRunning={isRunning} />
            {streamError && <p className="mt-3 text-sm text-danger">{streamError}</p>}
            <div className="flex gap-3 justify-end mt-6">
              {!isRunning && (
                <>
                  <button onClick={reset} className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface">
                    Nouveau scan
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-5 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all"
                  >
                    Fermer
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (aucune erreur)

- [ ] **Step 3: Commit**

```bash
git add frontend/components/sites/ScanModal.tsx
git commit -m "feat(scan): composant ScanModal (saisie + import + progression SSE)"
```

---

## Task 6: Frontend — câblage dans /sites

**Files:**
- Modify: `frontend/app/sites/page.tsx`

- [ ] **Step 1: Ajouter l'import du composant et de l'icône**

Dans `frontend/app/sites/page.tsx`, après la ligne `import { CategorizeModal } ...`, ajouter :

```tsx
import { ScanModal } from '@/components/sites/ScanModal';
import { ScanLine } from 'lucide-react';
```

- [ ] **Step 2: Ajouter l'état d'ouverture**

Juste après `const [detail, setDetail] = useState<SiteEntry | null>(null);`, ajouter :

```tsx
  const [scanOpen, setScanOpen] = useState(false);
```

- [ ] **Step 3: Ajouter le bouton dans le header**

Remplacer le bloc header (le `<div className="flex items-baseline justify-between">` … `</div>` contenant le titre) par :

```tsx
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Inventaire des sites</p>
            <h1 className="text-xl font-medium text-on-surface mt-1">Analyse de placement publicitaire</h1>
          </div>
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all"
          >
            <ScanLine size={15} /> Scanner des sites
          </button>
        </div>
```

- [ ] **Step 4: Ajouter un CTA dans l'état vide + monter la modale**

Juste avant la ligne `{detail && <SiteDetailModal ...`, ajouter le CTA état-vide et la modale :

```tsx
      {total === 0 && !loading && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all"
          >
            <ScanLine size={15} /> Scanner des premiers sites
          </button>
        </div>
      )}

      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDone={refreshAll} />
```

- [ ] **Step 5: Vérifier la compilation TypeScript**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0 (aucune erreur)

- [ ] **Step 6: Vérification manuelle de bout en bout (Playwright, front 3001 / backend 8020)**

1. Ouvrir `http://localhost:3001/sites`.
2. Cliquer « Scanner des sites » → la modale s'ouvre.
3. Coller `lemonde.fr` et `bild.de` (une par ligne) → « Lancer le scan ».
4. Vérifier le résumé (« 2 à scanner · 0 doublons · 0 ignorées ») puis le log SSE qui défile.
5. À la fin, « Fermer » → la liste `/sites` se rafraîchit et affiche les 2 sites scannés.
6. Rouvrir la modale, re-coller `lemonde.fr` → vérifier qu'il tombe en doublon (« 0 à scanner · 1 doublon ignoré »).
7. Importer un petit CSV (`url\nmarca.com\n`) → vérifier qu'il est scanné et ajouté.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/sites/page.tsx
git commit -m "feat(scan): bouton + modale Scanner des sites dans /sites"
```

---

## Notes d'implémentation

- **Pourquoi `categorization: false`** : la catégorisation IA exige une clé Mistral (fournie séparément via `CategorizeModal`). Le backend `AuditRequest` n'a pas de champ `mistral_key`, donc on désactive ce module dans le scan ; l'utilisateur catégorise ensuite via le bouton existant.
- **Full mode** : `attention: true` + `screenshots: true` déclenche le scan single-pass (score + capture en une navigation), comportement le plus complet.
- **Proxy SSE** : `parseScanInput` passe par le proxy Next (`/api`, POST JSON classique — OK) ; le scan SSE passe en direct sur `:8020` via `useAuditStream` (déjà géré).
- **Doublons** : la comparaison se fait sur `clean_domain` des deux côtés (saisie et base), donc `https://LeMonde.fr/` == `lemonde.fr`.
```
