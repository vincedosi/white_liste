# Design — Fiabiliser la détection : SPA/page blanche + pub vidéo

Date : 2026-06-11
Fichier cible principal : `backend/services/pw_worker.py` (fonction `full_audit`)
Secondaire : `backend/config.py` (domaines réseau vidéo)

## Contexte & problème

Le crawler MLI audite l'encombrement publicitaire d'une whitelist (~1199 sites
média FR). Un test en direct sur 3 sites a révélé deux défauts majeurs :

| Site | Type | Chargé | Pubs vues | Score | Réalité |
|---|---|---|---|---|---|
| my.tf1.fr | replay vidéo (SPA) | ❌ page blanche (timeout 2,9s) | 0 | **10/10** | saturé de pub |
| 6play.fr | replay vidéo | ✅ home (pas le player) | 0 visible (7 reqs pub réseau) | **10/10** | pré-rolls non vus |
| lemonde.fr | news display | ✅ | 10 (encadrées) | **10/10** | devrait être ~6.4 |

### Cause racine découverte
Le score final renvoyé (`pw_worker.py` ~ligne 1561) est **uniquement le
`clutter_score`** (ratio de surface pub mesuré à 3 positions de scroll). Le
score riche `compute_score_v4()` — qui compte pubs DOM, sticky, interstitiels,
réseau, et donne 6.4 pour lemonde — est **calculé puis ignoré**. Donc :
1. lemonde (10 pubs) ressort à 10/10 car la mesure de surface sous-lit.
2. Toute amélioration de détection (vidéo incluse) serait sans effet tant que
   le score final ignore ces signaux.

## Objectifs

1. Ne plus jamais scorer 10/10 une page non chargée → la marquer en erreur.
2. Détecter et pénaliser la charge pub **vidéo** (replay) en mode passif.
3. Faire en sorte que les signaux de détection **impactent réellement** le score.

Non-objectifs : ne pas casser la détection display existante (lemonde = 10 pubs
OK) ; ne pas cliquer « play » (trop fragile/lent sur 1199 sites, auth requise) ;
ne pas refondre l'UI ni le pipeline FastAPI.

## Conception — 3 changements coordonnés

### 1. Garde-fou « page chargée » (fix SPA / page blanche)
- Après navigation + attentes, évaluer la **densité de contenu réelle** :
  longueur du texte visible (`document.body.innerText`) et nombre de nœuds DOM
  significatifs (hors script/style).
- Si contenu sous un seuil **ou** navigation en timeout → **1 retry** avec
  `wait_until="networkidle"`, timeout allongé (~15 s) et settle supplémentaire.
- Si toujours vide après retry → retourner `status="load_error"`, `score=None`
  (N/A), exclu des stats/moyennes. Plus de faux 10/10 silencieux.

### 2. Détection vidéo passive (nouvelle couche)
- **DOM** : présence d'éléments `<video>` + conteneurs de players connus
  (TF1, M6/6play, JWPlayer, Dailymotion, generic `.video-js`, etc.).
- **Réseau** : ajouter `imasdk.googleapis.com` et endpoints VAST/`/pubads/` à la
  classification ; distinguer **pub vidéo** vs display. (`freewheel.com`,
  `spotx.tv`, `springserve.com`, `teads.tv` déjà surveillés.)
- Produit un signal `video_ads` : si player présent **et** requêtes SSP vidéo
  actives → N unités de pub vidéo avec pénalité dédiée, injectées dans le v4.

### 3. Assemblage du score (pour que le signal compte)
- Score final = **le plus pénalisant** des signaux fiables :
  `final = min(clutter_score, score_v4_incluant_vidéo)` au lieu de clutter seul.
- Effet : lemonde ≈ 6.4, 6play chute via signal vidéo, sites propres restent ~10.
- Conserver `clutter_detail` + breakdown v4 dans la sortie (transparence).
- `is_mfa = final < 4.0` recalculé sur le score final.

## Flux de données (full_audit, après refonte)
```
goto + attentes
  └─ [NOUVEAU] garde-fou contenu ──vide?──> retry networkidle ──vide?──> load_error (N/A)
       │ ok
       ▼
détection display DOM (inchangée)  +  [NOUVEAU] détection vidéo (DOM+réseau)
       ▼
compute_score_v4(ads + video_ads, adtech, net_stats)   ← v4 désormais utilisé
compute_clutter_score(page)
       ▼
final_score = min(clutter_score, score_v4)             ← changement clé
banner + screenshots + return {score: final_score, ...}
```

## Gestion d'erreurs
- Échec de navigation total (même après retry) → `load_error`, capture quand même
  un screenshot pour diagnostic si possible.
- Exception dans la couche vidéo → log + on continue sans le signal vidéo (dégradé).
- `compute_clutter_score` qui throw → fallback sur v4 (déjà en place).

## Tests / validation
Re-run `mode=full` sur :
- Les 3 sites du test : my.tf1 → `load_error` ou scoré si retry réussit ;
  6play → score baisse + `video_ads` > 0 ; lemonde → ~6.4 (plus 10).
- Échantillon élargi ~15-20 sites de la whitelist (mix news/MFA/replay) pour
  mesurer le taux de `load_error` et l'absence de régression sur le display.
- Vérifier qu'un site réellement propre (peu de pub) reste haut (~9-10).

## Périmètre des fichiers
- `backend/services/pw_worker.py` : garde-fou, couche vidéo, assemblage score.
- `backend/config.py` : nouveaux domaines/endpoints vidéo + éventuels seuils.
- Aucun changement frontend / API / DB schema.
