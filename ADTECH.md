# MLI — Détection Publicitaire v3 (repensée)

## Problème actuel

La détection par selectors CSS seuls est INSUFFISANTE :
- Les sites modernes utilisent des ID/classes dynamiques ou obfusquées
- Les pubs dans des iframes cross-origin ne sont pas détectables par CSS
- Les native ads (Taboola, Outbrain) n'ont pas de markup standard
- Certains sites n'affichent rien sans consent cookie

## Nouvelle stratégie : détection multi-couche

Au lieu de compter uniquement les éléments CSS, on combine 3 approches :

### Couche 1 — Scripts ad-tech (la plus fiable)
Détecter les SCRIPTS chargés sur la page. C'est la méthode la plus fiable
car les scripts ad-tech sont toujours les mêmes quelque soit le site.

```javascript
() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const srcs = scripts.map(s => s.src.toLowerCase());
    
    // + performance entries (scripts chargés dynamiquement)
    const perfEntries = performance.getEntriesByType('resource')
        .filter(e => e.initiatorType === 'script')
        .map(e => e.name.toLowerCase());
    
    const allSrcs = [...new Set([...srcs, ...perfEntries])];
    
    const adtech = {
        gpt: allSrcs.some(s => s.includes('securepubads.g.doubleclick') || s.includes('googletagservices.com/tag/js/gpt')),
        prebid: allSrcs.some(s => s.includes('prebid')) || typeof window.pbjs !== 'undefined',
        amazon_tam: allSrcs.some(s => s.includes('amazon-adsystem.com/aax2')),
        criteo: allSrcs.some(s => s.includes('static.criteo.net') || s.includes('bidder.criteo')),
        teads: allSrcs.some(s => s.includes('teads.tv')),
        taboola: allSrcs.some(s => s.includes('cdn.taboola')),
        outbrain: allSrcs.some(s => s.includes('widgets.outbrain')),
        smart: allSrcs.some(s => s.includes('sascdn.com') || s.includes('smartadserver')),
        pubmatic: allSrcs.some(s => s.includes('ads.pubmatic')),
        appnexus: allSrcs.some(s => s.includes('adnxs.com')),
        magnite: allSrcs.some(s => s.includes('rubiconproject')),
        index: allSrcs.some(s => s.includes('casalemedia') || s.includes('indexww')),
    };
    
    adtech.scripts_detected = Object.entries(adtech)
        .filter(([k, v]) => v === true && k !== 'scripts_detected')
        .map(([k]) => k.toUpperCase());
    
    return adtech;
}
```

### Couche 2 — Éléments du DOM (selectors enrichis)
Compter les éléments pub visibles. Combiner :

**A. Selectors spécifiques (haute confiance)**
```python
HIGH_CONFIDENCE_SELECTORS = [
    # Google Ad Manager
    "div[id^='google_ads_iframe']",
    "div[id^='div-gpt-ad']",
    "div[data-google-query-id]",
    "ins.adsbygoogle",
    "iframe[id^='google_ads_iframe']",
    
    # SSPs identifiables
    "div[id*='taboola-']",
    "div[id*='outbrain-']",
    "div[class*='teads-']",
    "div[data-criteo-id]",
    
    # Iframes pub identifiables
    "iframe[src*='doubleclick']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='safeframe']",
    "iframe[src*='amazon-adsystem']",
]
```

**B. Selectors génériques (confiance moyenne — vérifier taille)**
```python
MEDIUM_CONFIDENCE_SELECTORS = [
    "div[class*='ad-container']",
    "div[class*='ad-slot']",
    "div[class*='ad-wrapper']",
    "div[class*='ad-unit']",
    "div[class*='ad-banner']",
    "div[class*='advertisement']",
    "div[class*='pub-container']",
    "div[class*='sponsor']",
    "aside[class*='ad']",
]
# Pour ceux-ci : vérifier que l'élément a une taille > 50×50 px
# et n'est pas display:none
```

**C. Détection par taille IAB (sur les iframes sans src identifiable)**
```python
IAB_SIZES = [
    (728, 90), (300, 250), (160, 600), (300, 600),
    (970, 250), (970, 90), (320, 50), (320, 100),
    (336, 280), (120, 600), (468, 60), (250, 250),
]
TOLERANCE = 15  # ±15px

# Chercher les iframes dont la taille matche un format IAB
# C'est très probablement une pub
```

### Couche 3 — Performance/réseau (bonus)
Compter les requêtes réseau vers des domaines ad-tech connus :

```javascript
() => {
    const adDomains = [
        'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
        'googletagmanager.com', 'criteo.com', 'taboola.com', 'outbrain.com',
        'amazon-adsystem.com', 'adnxs.com', 'rubiconproject.com',
        'pubmatic.com', 'casalemedia.com', 'teads.tv', 'smartadserver.com',
        'facebook.net', 'analytics.tiktok.com',
    ];
    
    const entries = performance.getEntriesByType('resource');
    let adRequests = 0;
    let trackerRequests = 0;
    
    entries.forEach(e => {
        const url = e.name.toLowerCase();
        if (adDomains.some(d => url.includes(d))) {
            if (url.includes('analytics') || url.includes('pixel') || url.includes('facebook')) {
                trackerRequests++;
            } else {
                adRequests++;
            }
        }
    });
    
    return { ad_requests: adRequests, tracker_requests: trackerRequests, total_requests: entries.length };
}
```

## Score d'attention v3

Le score combine les 3 couches :

```
score = 10.0
- Σ(pub_visible × poids_zone × poids_taille)   # Couche 2
- (ad_scripts_count × 0.3)                       # Couche 1 : pénalité légère par script
- (0.5 si has_sticky_ads)                         # Pénalité sticky
score = max(0, min(10, score))
```

La présence de scripts ad-tech SEULE ne devrait pas faire tomber le score
en dessous de 7. C'est normal d'avoir GPT + Prebid. Ce qui pénalise,
c'est le NOMBRE de pubs visibles et leur position.

## Cookie consent amélioré

Ordre d'essai (du plus spécifique au plus générique) :

```python
CONSENT_SELECTORS = [
    # Frameworks spécifiques (ID stables)
    "#didomi-notice-agree-button",
    "#onetrust-accept-btn-handler", 
    "#axeptio_btn_acceptAll",
    "[data-testid='uc-accept-all-button']",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#tarteaucitronPersonalize2",
    ".qc-cmp2-summary-buttons button:first-child",
    ".sp_choice_type_11",
    ".cmpboxbtn.cmpboxbtnyes",
    
    # Generiques fiables
    ".cc-accept",
    ".cookie-consent-accept",
    "#accept-cookies",
    ".js-accept-cookies",
    "[data-cookie-accept]",
    
    # Par texte (FR)
    "button:has-text('Tout accepter')",
    "button:has-text('Accepter tout')", 
    "button:has-text('Accepter et fermer')",
    "button:has-text('J\\'accepte')",
    "button:has-text('Continuer sans accepter')",
    "button:has-text('OK')",
    
    # Par texte (EN)
    "button:has-text('Accept all')",
    "button:has-text('Accept cookies')",
    "button:has-text('I agree')",
    "button:has-text('Allow all')",
]
```

## Séquence complète dans pw_worker.py

```
1. page.goto(url, wait_until="domcontentloaded")
2. page.wait_for_timeout(1000)       ← laisser le DOM se stabiliser
3. dismiss_cookie_banner(page)       ← cliquer cookie
4. page.wait_for_timeout(3000)       ← CRUCIAL : les pubs chargent après consent
5. scroll_full_page(page)            ← scroll bas/haut pour lazy-load
6. page.wait_for_timeout(1500)       ← lazy-loaded ads apparaissent
7. ads = analyze_ads_multi_layer(page)  ← 3 couches
8. adtech = detect_adtech_scripts(page) ← scripts
9. trackers = detect_trackers(page)     ← trackers
10. network = analyze_network(page)     ← requêtes réseau
11. score = compute_score(ads, adtech)  ← score final
```
