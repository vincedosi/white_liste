# MLI — TODO v3

## Pré-requis : LIRE AVANT DE CODER
1. `CLAUDE.md` — architecture, règles, pipeline
2. `DESIGN.md` — **design system v3 DARK MODE** (inspiré Sequence.io)
3. `ADTECH.md` — **détection pubs v3 multi-couche**
4. `/mnt/skills/public/frontend-design/SKILL.md` — principes design

## Contexte des corrections

L'utilisateur a testé l'app et remonte 4 problèmes critiques :

1. **Journal de logs** : les logs s'affichent pendant le process puis 
   disparaissent. Il faut les rendre persistants dans un onglet dédié
   avec boutons télécharger/copier.

2. **Interface UI** : le rendu fait "Streamlit brut". L'objectif est 
   un dashboard dark mode premium (voir DESIGN.md, inspiré Sequence.io).

3. **Captures d'écran** : les screenshots s'affichent en taille réelle 
   et cassent la mise en page. Il faut les contraindre dans des modals.

4. **Détection des pubs** : le système ne fonctionne pas sur tous les 
   sites. La logique doit être entièrement repensée (voir ADTECH.md).

---

## Tâche 1 : Refonte pw_worker.py (détection pubs)

Lire ADTECH.md en entier. Réécrire la logique de détection.

### 1A. Détection multi-couche
- [ ] Couche 1 : `detect_adtech_scripts(page)` — scanner les <script src> 
      ET les performance entries ET les variables globales (window.pbjs, 
      window.googletag). Voir le code JS dans ADTECH.md.
- [ ] Couche 2 : Selectors enrichis en 2 niveaux de confiance 
      (HIGH_CONFIDENCE + MEDIUM_CONFIDENCE avec vérif taille). 
      Ajouter détection par taille IAB sur les iframes.
- [ ] Couche 3 : `analyze_network(page)` — compter les requêtes réseau 
      vers les domaines ad-tech via performance.getEntriesByType.

### 1B. Séquence de crawl améliorée
- [ ] Après cookie dismiss : attendre 3s (pas 2s)
- [ ] Scroll complet de la page (bas puis haut) APRÈS le cookie accept
- [ ] Attendre 1.5s après scroll pour lazy-load
- [ ] Mesurer page_load_time_ms (temps entre goto et fin)
- [ ] Voir séquence complète dans ADTECH.md

### 1C. Cookie consent enrichi
- [ ] Utiliser la liste complète de ADTECH.md (Cookiebot, Consentmanager, 
      génériques, texte FR/EN)

### 1D. Trackers
- [ ] Détecter : Google Analytics, GTM, Facebook Pixel, TikTok, 
      LinkedIn, Bing UET
- [ ] Retourner { "google_analytics": bool, ..., "total": int }

### 1E. Résultat enrichi
Le dict retourné par score_attention() doit contenir :
```python
{
    "ad_count": int,
    "score": float,
    "is_mfa": bool,
    "ads_above_fold": int,
    "ads_mid_page": int,
    "ads_deep": int,
    "ads_footer": int,
    "ads_sticky": int,
    "content_lang": str,
    "cookie_dismissed": bool,
    "page_load_time_ms": int,
    "adtech": {
        "gpt": bool, "prebid": bool, "amazon_tam": bool,
        "criteo": bool, "teads": bool, "taboola": bool,
        "outbrain": bool, "smart": bool, "pubmatic": bool,
        "appnexus": bool, "magnite": bool, "index": bool,
        "scripts_detected": ["GPT", "PREBID", ...],
    },
    "trackers": {
        "google_analytics": bool, "facebook_pixel": bool,
        "tiktok_pixel": bool, "linkedin": bool, "bing_uet": bool,
        "total": int,
    },
    "network_stats": {
        "ad_requests": int, "tracker_requests": int, "total_requests": int,
    },
    "error": None,
}
```

---

## Tâche 2 : Adapter pw_bridge.py

- [ ] `score_all_subprocess()` doit parser les nouveaux champs 
      (adtech, trackers, network_stats, page_load_time_ms) depuis le JSON
- [ ] Les retourner dans un format exploitable par app.py
- [ ] Garder la signature : retourne (attention_results, content_langs, 
      adtech_results, tracker_results, load_times)

---

## Tâche 3 : Refonte complète de app.py

Lire DESIGN.md v3 en entier. C'est un DARK MODE inspiré Sequence.io.

### 3A. CSS Dark Mode complet
- [ ] Lire /mnt/skills/public/frontend-design/SKILL.md
- [ ] Supprimer TOUT le CSS existant
- [ ] Implémenter les overrides Streamlit de DESIGN.md (fond #060B14, 
      sidebar #0A1628, cards #0D1B2A, etc.)
- [ ] Google Fonts : Inter + JetBrains Mono
- [ ] Tout doit être dark : inputs, boutons, tabs, expanders, metrics
- [ ] Accent principal : teal #10B981
- [ ] Bouton "Lancer l'audit" avec gradient teal

### 3B. Header
- [ ] "Media-List Intelligence" en Inter 28px bold
- [ ] Le "I" de "Intelligence" en teal #10B981
- [ ] Subtitle en #94A3B8
- [ ] Fond transparent (le bg-app fait le reste)

### 3C. KPI Cards
- [ ] 4 cards en ligne avec le style de DESIGN.md
- [ ] Chiffres en Inter 36px 700
- [ ] Labels uppercase letterspaced #64748B
- [ ] Delta en JetBrains Mono (teal positif, red négatif)

### 3D. Journal de logs PERSISTANT
C'est le point critique. Voir DESIGN.md section "Journal de Logs".
- [ ] `st.session_state.audit_log = []`
- [ ] Fonction `log(message)` avec timestamp
- [ ] Pendant l'audit : preview live dans un placeholder
- [ ] Après l'audit : logs dans un **onglet dédié "📋 Journal"** 
      (au même niveau que "Sites sains", "À supprimer", etc.)
- [ ] Dans l'onglet Journal : `st.code()` avec le log complet
- [ ] 2 boutons au-dessus :
  - `st.download_button("Télécharger le journal", log_text, "audit_log.txt")`
  - Le `st.code()` permet déjà le copier natif
- [ ] Format des logs : voir DESIGN.md (timestamps, icônes, résumés par étape)
- [ ] Logger TOUT : début/fin étape, résultat par site, ad-tech, timings, erreurs

### 3E. Screenshots en modal UNIQUEMENT
- [ ] SUPPRIMER tout onglet Screenshots séparé
- [ ] SUPPRIMER tout st.image() dans le flow principal
- [ ] Dans les tableaux : domaine = st.button(type="tertiary") cliquable
- [ ] Au clic → @st.dialog avec :
  - 4 metrics en ligne (score, pubs, chargement, cookie)
  - Badges ad-tech en ligne
  - Breakdown 5 zones
  - Screenshot viewport (use_container_width=True dans le dialog)
  - st.expander("Page complète") avec fullpage
- [ ] Le modal contraint naturellement la taille (width="large" = ~700px)

### 3F. Tableaux custom
- [ ] NE PAS utiliser st.dataframe pour les tableaux principaux
- [ ] Utiliser st.columns par row pour boutons cliquables + badges HTML
- [ ] Header : fond #132337, texte #64748B uppercase
- [ ] Rows : fond transparent, bordure subtile rgba(148,163,184,0.05)
- [ ] Domaine cliquable → ouvre le modal screenshot

### 3G. Charts Plotly dark mode
- [ ] Tous les charts : paper_bgcolor et plot_bgcolor transparents
- [ ] Font : Inter, color #94A3B8
- [ ] Gridlines : rgba(148,163,184,0.08)
- [ ] Donut santé : teal/indigo/orange/red
- [ ] Stacked bar attention : 5 couleurs (ATF red, Mid orange, 
      Deep amber, Footer gray, Sticky violet)
- [ ] Bar ad-tech : teal #10B981
- [ ] Bar top SSPs : teal dégradé
- [ ] Bar pays serveur : teal

### 3H. Onglet Ad-Tech Stack
- [ ] Tableau : Domaine | GPT | Prebid | Amazon | Criteo | Teads | ... | Trackers
- [ ] Badges .badge-present (vert) / .badge-absent (gris) pour chaque tech
- [ ] Chart adoption : combien de sites ont chaque technologie

### 3I. Exports
- [ ] Excel enrichi (colonnes ad-tech, trackers, load_time, network_stats)
- [ ] JSON enrichi
- [ ] Whitelist nettoyée TXT
- [ ] ZIP screenshots
- [ ] **NOUVEAU : Journal d'audit TXT** (depuis l'onglet Journal)

---

## Ne PAS toucher
- health_checker.py
- ads_txt_checker.py
- geo_locator.py
- mistral_validator.py
- categorizer.py
- models.py (sauf ajout de champs si nécessaire)
- config.py (sauf ajout de constantes)
