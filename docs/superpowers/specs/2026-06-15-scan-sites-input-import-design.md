# Spec — Scanner des sites (saisie d'URL + import CSV/Excel)

**Date** : 2026-06-15
**Branche** : `nextjs-migration`
**Statut** : approuvé, prêt pour le plan d'implémentation

## 1. Objectif

Permettre à l'utilisateur d'ajouter et scanner de nouveaux sites depuis la page
`/sites`, par deux moyens :

1. **Saisie directe** — coller une ou plusieurs URLs dans une zone de texte.
2. **Import de fichier** — déposer un fichier **CSV** ou **Excel (.xlsx)**.

Les sites scannés sont audités par le pipeline existant et apparaissent ensuite
dans la liste `/sites`.

## 2. Contexte existant (réutilisé tel quel)

- **Moteur de scan** : `POST /api/audit` (`backend/routers/audit.py`) prend une
  liste de domaines (`AuditRequest.domains`), lance le pipeline complet
  (health → Playwright → ads.txt → géo → catégorisation) en streaming SSE, et
  **upsert** chaque domaine dans la table `domains` via `db.upsert_domain`.
- **Hook SSE frontend** : `frontend/hooks/useAuditStream.ts` —
  `startAudit({ domains })`, expose `logs`, `currentStep`, `results`,
  `isRunning`, `error`, `auditId`. Tape le backend **directement** sur
  `http://localhost:8020/api` (le proxy Next bufferise les SSE).
- **Composants de progression** : `components/audit/AuditLog.tsx`,
  `components/audit/AuditProgress.tsx`.
- **Helpers de normalisation** : `backend/services/site_utils.py` —
  `clean_domain(raw)` (strip scheme/www/slash, lowercase, garde le path) et
  `dedup_domains(list)` (clean + dédup en préservant l'ordre).
- **Dépendances présentes** : `openpyxl 3.1.5`, `python-multipart 0.0.22`,
  `pandas`. L'upload de fichiers (`UploadFile = File(...)`) est déjà utilisé
  dans `routers/export.py` et `routers/history.py`.

**Aucune modification de `/api/audit` n'est nécessaire.**

## 3. Décisions de design (validées)

| Sujet | Décision |
|-------|----------|
| Emplacement UI | **Modale** ouverte depuis un bouton « + Scanner » dans le header de `/sites`. |
| Formats de fichier | **CSV + Excel (.xlsx)**. Le `.xlsx` est parsé côté **backend** (openpyxl). |
| Doublons | **Ignorer** : on ne scanne que les URLs absentes de la table `domains`. |

## 4. Backend

### 4.1 Nouvel endpoint `POST /api/sites/parse-input`

Ajouté dans `backend/routers/sites.py`. Auth : `Depends(get_current_user)`
(cohérent avec les autres routes du fichier). Reçoit un **multipart form** :

- `text: str | None` — contenu collé par l'utilisateur (optionnel).
- `file: UploadFile | None` — fichier CSV ou XLSX (optionnel).

Au moins l'un des deux doit être non vide, sinon `400 "Aucune entrée fournie"`.

#### Extraction des candidats

1. **Depuis `text`** : découpe sur `\n`, `\r`, `,`, `;`, espaces/tabs.
2. **Depuis `file`**, selon l'extension du `filename` (fallback content-type) :
   - `.csv` (ou `text/csv`, `text/plain`) : décode en UTF-8 (fallback
     `latin-1`), parse avec le module `csv`, aplatit toutes les cellules.
   - `.xlsx` (ou content-type OpenXML) :
     `openpyxl.load_workbook(BytesIO(bytes), read_only=True, data_only=True)`,
     itère toutes les feuilles, toutes les cellules non vides, `str(value)`.
   - Autre extension → `400 "Format non supporté (CSV ou XLSX uniquement)"`.

#### Filtre « domain-like »

Pour chaque candidat brut, on applique d'abord `clean_domain`, puis on garde
seulement ceux qui matchent :

```
^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(/.*)?$
```

avec la contrainte supplémentaire **TLD final = 2+ lettres** (la dernière
partie avant un éventuel `/` se termine par `.[a-z]{2,}`). Cela écarte les
en-têtes de colonnes (`url`, `site`, `nom`), nombres, cellules vides, etc.
Les candidats rejetés sont comptés dans `invalid_count`.

#### Dédup et comparaison à la base

1. `dedup_domains(...)` sur les candidats valides (dédup interne, ordre préservé).
2. Requête `SELECT domain FROM domains` → ensemble des domaines existants.
3. Partition :
   - `to_scan` = valides − existants (nouveaux),
   - `duplicates` = valides ∩ existants.

#### Réponse `200`

```json
{
  "to_scan": ["lemonde.fr", "bild.de"],
  "duplicates": ["jeuxvideo.com"],
  "invalid_count": 2,
  "total_found": 3
}
```

`total_found` = nombre de candidats **valides distincts** =
`len(to_scan) + len(duplicates)`. `invalid_count` (les rejets du filtre
domain-like) est compté séparément et **n'entre pas** dans `total_found`.

### 4.2 Pas de changement au pipeline

Le frontend appelle ensuite `/api/audit` (existant) avec `domains = to_scan`.

## 5. Frontend

### 5.1 Helper `lib/api.ts`

```ts
parseScanInput(text: string, file: File | null): Promise<{
  to_scan: string[];
  duplicates: string[];
  invalid_count: number;
  total_found: number;
}>
```

POST multipart (`FormData`) vers `${API_BASE}/sites/parse-input` via
`fetchWithAuth`. Erreur backend (400) → throw avec le message renvoyé.

### 5.2 Composant `components/sites/ScanModal.tsx`

Props : `{ open: boolean; onClose: () => void; onDone: () => void }`.

Machine à deux états internes :

**État « saisie »**
- `<textarea>` : « Collez des URLs, une par ligne ».
- Sélecteur de fichier + zone de dépôt (drag-and-drop) acceptant
  `.csv,.xlsx`. Affiche le nom du fichier choisi, avec bouton retirer.
- Bouton « Lancer le scan » — désactivé si textarea vide **et** aucun fichier.
- Zone de message d'erreur inline (parse-input 400, etc.).

**Transition au clic « Lancer le scan »**
1. `parseScanInput(text, file)`.
2. Affiche un résumé : « **{to_scan.length}** à scanner · **{duplicates.length}**
   doublons ignorés · **{invalid_count}** entrées ignorées ».
3. Si `to_scan.length === 0` → message « Tous les sites sont déjà présents (ou
   aucune URL valide). », reste en état saisie.
4. Sinon → `startAudit({ domains: to_scan })` et bascule en état « progression ».

**État « progression »**
- `AuditLog` (logs live du hook) + indicateur d'étape courante.
- Pendant `isRunning` : pas de fermeture accidentelle (le bouton devient
  « Fermer » seulement à la fin ou en erreur).
- À `complete` : message « {to_scan.length} sites scannés ». Bouton « Fermer ».
- À `error` : message d'erreur + bouton « Réessayer » (retour état saisie) et
  « Fermer ».
- `onClose`/« Fermer » → si au moins un scan a réussi, appelle `onDone()`.

### 5.3 Wiring `app/sites/page.tsx`

- État `scanOpen`.
- Bouton « + Scanner » dans le header de la page (haut-droite, près du titre).
- Le même bouton est rendu dans l'**état vide** de la liste (actuellement la
  base est vide), pour un point d'entrée évident.
- `<ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onDone={refresh} />`
  où `refresh` re-fetch la liste (via `useSitesList`).

## 6. Gestion d'erreurs

| Cas | Comportement |
|-----|--------------|
| Saisie vide ET aucun fichier | Bouton « Lancer » désactivé. |
| Fichier au mauvais format | `400` → message inline dans la modale. |
| XLSX/CSV illisible | `400 "Fichier illisible"` → message inline. |
| 0 nouveau après dédup | Message « Tous les sites sont déjà présents… », reste en saisie. |
| Erreur SSE pendant l'audit | Affichée dans le log, état progression, boutons « Réessayer » / « Fermer ». |

## 7. Tests

### Backend (`backend/test_sites_v1.py` ou nouveau fichier de test)
- Extraction depuis `text` multi-séparateurs.
- Extraction depuis bytes CSV (avec en-tête + colonnes multiples).
- Extraction depuis bytes XLSX construit en mémoire avec openpyxl.
- Filtre domain-like : rejette en-têtes/nombres, accepte `domaine.fr`,
  `sous.domaine.com/section`.
- Dédup vs base : insère un domaine existant, vérifie qu'il tombe dans
  `duplicates` et pas dans `to_scan`.

### Frontend
- `tsc --noEmit` exit 0.
- Run manuel Playwright (front 3001 / backend 8020) :
  1. Ouvrir la modale via « + Scanner ».
  2. Coller 2 URLs → Lancer → vérifier progression puis apparition dans `/sites`.
  3. Importer un petit CSV → vérifier le compteur de doublons.

## 8. Hors scope (YAGNI)

- UI de mapping de colonnes (auto-détection des cellules domain-like à la place).
- Scan en file d'attente / planifié / en arrière-plan.
- Mode « re-scanner les doublons » (l'utilisateur a choisi « ignorer »).
- Bouton « Erase all » (sujet séparé, évoqué précédemment, non inclus ici).

## 9. Fichiers touchés

| Fichier | Nature |
|---------|--------|
| `backend/routers/sites.py` | + endpoint `parse-input` |
| `backend/test_sites_v1.py` (ou nouveau) | + tests extraction/dédup |
| `frontend/lib/api.ts` | + `parseScanInput` |
| `frontend/components/sites/ScanModal.tsx` | nouveau composant |
| `frontend/app/sites/page.tsx` | bouton « + Scanner » + modale + refresh |
