"""
MLI — Playwright Worker v3
Script autonome execute dans un subprocess separe.

Detection publicitaire multi-couche :
  Couche 1 : Scripts ad-tech (script src + performance entries + globales)
  Couche 2 : Elements DOM (selectors high/medium confiance + taille IAB)
  Couche 3 : Analyse reseau (performance.getEntriesByType)

Features :
  - Cookie consent auto-dismiss (frameworks CMP + texte FR/EN)
  - Scroll complet pour lazy-loading
  - Score d'attention v3 (combine DOM + scripts)
  - Screenshots viewport + fullpage avec highlighting
  - Detection trackers (GA, FB, TikTok, LinkedIn, Bing)
  - Mesure du temps de chargement

Usage:
    echo '{"domains": ["lemonde.fr"], "mode": "attention"}' | python pw_worker.py
"""
from __future__ import annotations
import json
import os
import sys
import time as _time

from playwright.sync_api import sync_playwright

# ── Couche 2A : Selectors haute confiance ────────────────
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
    "iframe[src*='taboola']",
    "iframe[src*='outbrain']",
    "iframe[src*='criteo']",
    "iframe[src*='teads']",
    "iframe[data-google-container-id]",
]

# ── Couche 2B : Selectors confiance moyenne (verif taille) ─
MEDIUM_CONFIDENCE_SELECTORS = [
    "div[class*='ad-container']",
    "div[class*='ad-slot']",
    "div[class*='ad-wrapper']",
    "div[class*='ad-unit']",
    "div[class*='ad-banner']",
    "div[class*='advertisement']",
    "div[class*='pub-container']",
    "div[class*='sponsor']",
    "div[class*='native-ad']",
    "div[data-ad]",
    "div[data-ad-slot]",
    "div[data-ad-unit]",
    "aside[class*='ad']",
    "section[class*='ad-']",
    "div[class*='ad-label']",
    "div.ad-slot",
]

# ── IAB Standard Sizes (Couche 2C) ──────────────────────
IAB_SIZES = [
    (728, 90), (300, 250), (160, 600), (300, 600),
    (970, 250), (970, 90), (320, 50), (320, 100),
    (336, 280), (120, 600), (468, 60), (250, 250),
    (180, 150), (300, 50),
]
IAB_TOLERANCE = 20

# ── Zone weights for attention scoring ───────────────────
ZONE_WEIGHTS = [
    (800, 1.0),      # Above the fold
    (2000, 0.5),     # Mid-page
    (4000, 0.2),     # Deep content
    (999999, 0.05),  # Footer
]
STICKY_MULTIPLIER = 1.5

# Taille (surface en px2)
SIZE_THRESHOLDS = [
    (10_000, 0.5),
    (50_000, 1.0),
    (999_999_999, 1.5),
]

MFA_THRESHOLD = 4.0
BASE_PENALTY = 0.8
SCRIPT_PENALTY = 0.3  # Penalite par script ad-tech detecte
STICKY_EXTRA_PENALTY = 0.5

# ── Cookie consent (ADTECH.md v3) ───────────────────────
CONSENT_SELECTORS = [
    # Frameworks specifiques (ID stables)
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

# ── Pre-injected consent cookies ────────────────────────
# TCF v2 "consent all" string (valid IAB format, all purposes + vendors)
TCF_CONSENT_STRING = "CPzvOYAPzvOYAGXABBENDECgAAAAAAAAAAAAAAAAAAAA.YAAAAAAAAAAA"

# OneTrust "consent all" (all groups C0001-C0005 = 1)
ONETRUST_CONSENT = (
    "isGpcEnabled=0&datestamp=Thu+Jan+01+2026+00%3A00%3A00+GMT%2B0100"
    "&version=202312.1.0&browserGpcFlag=0&isIABGlobal=false"
    "&consentId=00000000-0000-0000-0000-000000000001&interactionCount=1"
    "&landingPath=NotLandingPage"
    "&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1%2CC0005%3A1"
    "&geolocation=FR%3BIDF&AwaitingReconsent=false"
)

# TarteAuCitron "consent all"
TARTEAUCITRON_CONSENT = (
    "googletagmanager=true!gtag=true!googleads=true!facebook=true"
    "!twitter=true!youtube=true!vimeo=true!linkedin=true"
    "!analytics=true!adsense=true!doubleclick=true!criteo=true"
    "!taboola=true!outbrain=true!hotjar=true!matomo=true"
)

# localStorage init script for Didomi, Axeptio, and __tcfapi mock
CONSENT_INIT_SCRIPT = """
() => {
    // ── Didomi consent in localStorage ──
    try {
        const didomiConsent = JSON.stringify({
            "user_id": "mli-audit-agent",
            "created": "2026-01-01T00:00:00.000Z",
            "updated": "2026-01-01T00:00:00.000Z",
            "vendors": {"enabled": ["google","c:yahoo","c:microsoft","c:criteo","c:taboola","c:outbrain","c:teads","c:amazon"], "disabled": []},
            "purposes": {"enabled": ["cookies","create_ads_profile","geolocation_data","select_basic_ads","select_personalized_ads","measure_ad_performance","measure_content_performance","market_research","improve_products"], "disabled": []}
        });
        localStorage.setItem('didomi_token', didomiConsent);
        localStorage.setItem('didomi_token_type', 'regular');
    } catch(e) {}

    // ── Axeptio consent in localStorage ──
    try {
        localStorage.setItem('axeptio_authorized_vendors', JSON.stringify([
            "google_analytics", "google_ads", "facebook_pixel", "criteo",
            "taboola", "outbrain", "teads", "linkedin", "tiktok", "hotjar"
        ]));
        localStorage.setItem('axeptio_all_vendors', 'true');
        localStorage.setItem('axeptio_cookies', JSON.stringify({$$completed: true, $$date: "2026-01-01T00:00:00.000Z"}));
    } catch(e) {}

    // ── Usercentrics consent in localStorage ──
    try {
        localStorage.setItem('uc_user_interaction', 'true');
    } catch(e) {}

    // ── __tcfapi mock (TCF v2 CMP API) ──
    // Many ad scripts check __tcfapi to know if consent was given.
    // We mock it to always return consent=true.
    window.__tcfapi = function(command, version, callback) {
        if (command === 'addEventListener' || command === 'getTCData') {
            callback({
                tcString: '""" + TCF_CONSENT_STRING + """',
                gdprApplies: true,
                eventStatus: 'tcloaded',
                cmpStatus: 'loaded',
                listenerId: 1,
                purpose: { consents: {1:true,2:true,3:true,4:true,5:true,6:true,7:true,8:true,9:true,10:true} },
                vendor: { consents: {} },
                tcfPolicyVersion: 4,
            }, true);
        } else if (command === 'ping') {
            callback({
                gdprApplies: true,
                cmpLoaded: true,
                cmpStatus: 'loaded',
                displayStatus: 'hidden',
                apiVersion: '2.2',
                cmpVersion: 1,
                cmpId: 10,
                gvlVersion: 100,
                tcfPolicyVersion: 4,
            });
        }
    };
    window.__tcfapi.a = [];

    // ── googletag consent mock ──
    // Some GPT implementations check consent before loading ads
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.controlledMessagingFunction = function(m) { m.proceed(false); };
}
"""


def get_consent_cookies(domain: str) -> list[dict]:
    """Return consent cookies to inject for a domain before page.goto()."""
    base_domain = domain.split("/")[0]
    return [
        {
            "name": "euconsent-v2",
            "value": TCF_CONSENT_STRING,
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "didomi_token",
            "value": "1",
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "OptanonConsent",
            "value": ONETRUST_CONSENT,
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "OptanonAlertBoxClosed",
            "value": "2026-01-01T00:00:00.000Z",
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "tarteaucitron",
            "value": TARTEAUCITRON_CONSENT,
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "CookieConsent",
            "value": "{stamp:'mli',necessary:true,preferences:true,statistics:true,marketing:true}",
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "cookieconsent_status",
            "value": "allow",
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "hasConsent",
            "value": "true",
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
        {
            "name": "consentUUID",
            "value": "00000000-0000-0000-0000-000000000001",
            "domain": f".{base_domain}",
            "path": "/",
            "sameSite": "Lax",
        },
    ]


# ── Ad domains for network interception (page.route) ────
AD_NETWORK_DOMAINS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com",
    "google-analytics.com", "googletagmanager.com", "gpt.gstatic.com",
    "pagead2.googlesyndication.com", "adservice.google.com",
    "criteo.com", "criteo.net", "bidder.criteo.com",
    "amazon-adsystem.com", "aax.amazon-adsystem.com",
    "taboola.com", "cdn.taboola.com", "trc.taboola.com",
    "outbrain.com", "widgets.outbrain.com", "log.outbrain.com",
    "teads.tv", "a.teads.tv", "cdn.teads.tv",
    "pubmatic.com", "ads.pubmatic.com",
    "adnxs.com", "ib.adnxs.com",
    "rubiconproject.com", "fastlane.rubiconproject.com",
    "casalemedia.com", "htlb.casalemedia.com",
    "smartadserver.com", "sascdn.com",
    "adsrvr.org", "bidswitch.net", "openx.net",
    "contextweb.com", "liveintent.com", "sharethrough.com",
    "triplelift.com", "yieldmo.com", "sovrn.com",
    "33across.com", "media.net", "seedtag.com",
    "freewheel.com", "spotx.tv", "springserve.com",
]

TRACKER_NETWORK_DOMAINS = [
    "google-analytics.com", "googletagmanager.com",
    "connect.facebook.net", "facebook.com",
    "analytics.tiktok.com", "snap.licdn.com",
    "bat.bing.com", "clarity.ms",
]

# Resource types that indicate a visible ad (not just a script)
AD_VISUAL_TYPES = {"image", "media", "iframe", "subdocument", "object"}


def force_remove_overlays(page) -> int:
    """Supprime TOUS les overlays/bandeaux/modals sans connaitre le CMP.
    Approche universelle : detecte par position, z-index et taille.
    Retourne le nombre d'elements supprimes.
    """
    js = """
    () => {
        let removed = 0;

        document.querySelectorAll('*').forEach(el => {
            const s = window.getComputedStyle(el);
            const z = parseInt(s.zIndex) || 0;
            const isFixed = s.position === 'fixed' || s.position === 'sticky';
            const isOverlay = s.position === 'fixed'
                && el.offsetWidth > window.innerWidth * 0.5
                && el.offsetHeight > window.innerHeight * 0.3;

            // High z-index fixed/sticky elements (cookie banners, modals)
            if (isFixed && z > 900 && (el.offsetHeight > 80 || isOverlay)) {
                el.remove();
                removed++;
                return;
            }

            // Full-screen backdrop/overlay (semi-transparent blocking layer)
            if (isFixed && z > 100 && el.offsetWidth >= window.innerWidth * 0.9
                && el.offsetHeight >= window.innerHeight * 0.5) {
                el.remove();
                removed++;
                return;
            }

            // Semi-transparent overlays (backdrop with opacity or rgba background)
            if (isFixed && z > 100 && s.opacity !== '1'
                && el.offsetWidth >= window.innerWidth * 0.9) {
                el.remove();
                removed++;
                return;
            }
        });

        // Unblock body and html scroll
        document.body.style.cssText += 'overflow:auto!important;position:static!important;height:auto!important;';
        document.documentElement.style.cssText += 'overflow:auto!important;height:auto!important;';

        // Remove scroll-blocking classes commonly set by CMPs
        document.body.classList.remove(
            'modal-open', 'no-scroll', 'overflow-hidden', 'noscroll',
            'has-overlay', 'cookie-modal-open', 'didomi-popup-open'
        );

        return removed;
    }
    """
    try:
        return page.evaluate(js)
    except Exception:
        return 0


def dismiss_cookie_banner(page) -> bool:
    """Tente de fermer le bandeau cookie. Retourne True si un bouton a ete clique."""
    for selector in CONSENT_SELECTORS:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=500):
                btn.click(timeout=2000)
                return True
        except Exception:
            continue
    return False


def scroll_full_page(page):
    """Scroll complet bas puis haut pour declencher le lazy-loading."""
    page.evaluate("""
        () => {
            return new Promise((resolve) => {
                const totalHeight = document.body.scrollHeight;
                let currentPosition = 0;
                const step = 400;
                const interval = setInterval(() => {
                    currentPosition += step;
                    window.scrollTo(0, currentPosition);
                    if (currentPosition >= totalHeight) {
                        clearInterval(interval);
                        window.scrollTo(0, 0);
                        resolve();
                    }
                }, 100);
            });
        }
    """)


def extract_lang(page) -> str:
    """Extrait le code langue de la page."""
    try:
        lang = page.locator("html").get_attribute("lang") or ""
        if lang:
            return lang.strip()
    except Exception:
        pass
    try:
        meta_lang = page.locator('meta[http-equiv="content-language"]').first.get_attribute("content")
        if meta_lang:
            return meta_lang.strip()
    except Exception:
        pass
    return ""


def get_zone_weight(y_pos: float) -> float:
    for threshold, weight in ZONE_WEIGHTS:
        if y_pos < threshold:
            return weight
    return 0.05


def get_size_multiplier(area: float) -> float:
    for threshold, mult in SIZE_THRESHOLDS:
        if area < threshold:
            return mult
    return 1.5


def detect_adtech_scripts(page) -> dict:
    """Couche 1 : detecte scripts ad-tech via src + performance entries + globales."""
    js = """
    () => {
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        const srcs = scripts.map(s => s.src.toLowerCase());

        let perfEntries = [];
        try {
            perfEntries = performance.getEntriesByType('resource')
                .filter(e => e.initiatorType === 'script')
                .map(e => e.name.toLowerCase());
        } catch(e) {}

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

        // Also check globals
        if (typeof window.googletag !== 'undefined') adtech.gpt = true;
        if (typeof window.pbjs !== 'undefined') adtech.prebid = true;

        adtech.scripts_detected = Object.entries(adtech)
            .filter(([k, v]) => v === true && k !== 'scripts_detected')
            .map(([k]) => k.toUpperCase());

        return adtech;
    }
    """
    try:
        return page.evaluate(js)
    except Exception:
        return {"scripts_detected": []}


def detect_trackers(page) -> dict:
    """Detecte les trackers courants."""
    js = """
    () => {
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        const srcs = scripts.map(s => s.src.toLowerCase());

        let perfEntries = [];
        try {
            perfEntries = performance.getEntriesByType('resource')
                .map(e => e.name.toLowerCase());
        } catch(e) {}

        const all = [...new Set([...srcs, ...perfEntries])];

        const trackers = {
            google_analytics: all.some(s => s.includes('google-analytics.com') || s.includes('googletagmanager.com/gtag')),
            facebook_pixel: all.some(s => s.includes('connect.facebook.net')),
            tiktok_pixel: all.some(s => s.includes('analytics.tiktok.com')),
            linkedin: all.some(s => s.includes('snap.licdn.com')),
            bing_uet: all.some(s => s.includes('bat.bing.com')),
        };

        trackers.total = Object.values(trackers).filter(v => v === true).length;
        return trackers;
    }
    """
    try:
        return page.evaluate(js)
    except Exception:
        return {"total": 0}


def analyze_ads_multi_layer(page) -> list[dict]:
    """
    Detection pub multi-couche par COMPORTEMENT puis selectors.
    Couche 1 : Comportement (iframes cross-origin, taille IAB, slots GPT, blocs sponsors)
    Couche 2 : Selectors connus (high + medium confiance)
    Tout deduplique via Set() d'elements DOM.
    """
    iab_json = json.dumps(IAB_SIZES)
    ad_domains_json = json.dumps(AD_NETWORK_DOMAINS)

    js = f"""
    (args) => {{
        const [highSel, medSel] = args;
        const ads = [];
        const seen = new Set();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const siteDomain = window.location.hostname.replace(/^www\\./, '');

        const adDomains = {ad_domains_json};
        const iabSizes = {iab_json};
        const tolerance = 20;

        function isAdDomain(hostname) {{
            return adDomains.some(d => hostname === d || hostname.endsWith('.' + d));
        }}

        function matchesIAB(w, h) {{
            for (const [iw, ih] of iabSizes) {{
                if (Math.abs(w - iw) <= tolerance && Math.abs(h - ih) <= tolerance) return true;
            }}
            return false;
        }}

        function addAd(el, method) {{
            if (seen.has(el)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width < 5 || rect.height < 5) return;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return;

            seen.add(el);
            ads.push({{
                x: Math.round(rect.x),
                y: Math.round(rect.y + scrollY),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                area: Math.round(rect.width * rect.height),
                is_sticky: style.position === 'fixed' || style.position === 'sticky',
                tag: el.tagName.toLowerCase(),
                method: method,
            }});
        }}

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // COUCHE 1 : Detection par COMPORTEMENT
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 1A. Iframes cross-origin
        document.querySelectorAll('iframe').forEach(iframe => {{
            if (seen.has(iframe)) return;
            const src = iframe.src || iframe.getAttribute('src') || '';
            if (!src || src === 'about:blank' || src.startsWith('javascript:')) return;

            let isCrossOrigin = false;
            let isAdNetwork = false;
            try {{
                const url = new URL(src, window.location.href);
                const iframeHost = url.hostname.replace(/^www\\./, '');
                isCrossOrigin = iframeHost !== siteDomain && !iframeHost.endsWith('.' + siteDomain);
                isAdNetwork = isAdDomain(iframeHost);
            }} catch(e) {{
                isCrossOrigin = true;
            }}

            if (!isCrossOrigin) return;

            const rect = iframe.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);

            // Ad network domain → confirmed ad
            if (isAdNetwork) {{
                addAd(iframe, 'behavior_adnet_iframe');
                return;
            }}

            // IAB size match → very likely ad
            if (matchesIAB(w, h)) {{
                addAd(iframe, 'behavior_iab_iframe');
                return;
            }}

            // Large cross-origin iframe (> 200x100) → likely ad
            if (w >= 200 && h >= 80) {{
                addAd(iframe, 'behavior_crossorigin_iframe');
            }}
        }});

        // 1B. Elements with IAB sizes containing iframes or external images
        const candidates = document.querySelectorAll('div, section, aside, figure, article');
        candidates.forEach(el => {{
            if (seen.has(el)) return;
            const rect = el.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);
            if (w < 100 || h < 40) return;
            if (!matchesIAB(w, h)) return;

            // Must contain an iframe or an external image
            const hasIframe = el.querySelector('iframe');
            let hasExternalImg = false;
            el.querySelectorAll('img[src]').forEach(img => {{
                try {{
                    const imgUrl = new URL(img.src, window.location.href);
                    const imgHost = imgUrl.hostname.replace(/^www\\./, '');
                    if (imgHost !== siteDomain && !imgHost.endsWith('.' + siteDomain)) {{
                        hasExternalImg = true;
                    }}
                }} catch(e) {{}}
            }});

            if (hasIframe || hasExternalImg) {{
                addAd(el, 'behavior_iab_container');
            }}
        }});

        // 1C. GPT slots (googletag API)
        try {{
            if (window.googletag && googletag.pubads && typeof googletag.pubads === 'function') {{
                const slots = googletag.pubads().getSlots();
                if (slots && slots.length) {{
                    slots.forEach(slot => {{
                        try {{
                            const slotId = slot.getSlotElementId();
                            if (slotId) {{
                                const el = document.getElementById(slotId);
                                if (el) addAd(el, 'behavior_gpt_slot');
                            }}
                        }} catch(e) {{}}
                    }});
                }}
            }}
        }} catch(e) {{}}

        // 1D. Sponsored blocks: large blocks (>200x150) containing only
        // a linked external image (native ads, sponsored content)
        document.querySelectorAll('a[href]').forEach(link => {{
            try {{
                const linkUrl = new URL(link.href, window.location.href);
                const linkHost = linkUrl.hostname.replace(/^www\\./, '');
                // Skip same-site, social media, and common non-ad domains
                if (linkHost === siteDomain || linkHost.endsWith('.' + siteDomain)) return;
                const skipDomains = ['twitter.com','x.com','facebook.com','instagram.com','youtube.com','linkedin.com','tiktok.com','reddit.com','wikipedia.org','github.com'];
                if (skipDomains.some(d => linkHost === d || linkHost.endsWith('.' + d))) return;

                const rect = link.getBoundingClientRect();
                if (rect.width < 200 || rect.height < 150) return;

                // Must contain an image that fills most of the link
                const imgs = link.querySelectorAll('img');
                if (imgs.length === 0) return;
                let hasLargeImg = false;
                imgs.forEach(img => {{
                    const ir = img.getBoundingClientRect();
                    if (ir.width > rect.width * 0.5 && ir.height > rect.height * 0.3) hasLargeImg = true;
                }});
                if (!hasLargeImg) return;

                // Check if the link or its parent is already seen
                const container = link.closest('div, section, aside, figure') || link;
                addAd(container, 'behavior_sponsored_block');
            }} catch(e) {{}}
        }});

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // COUCHE 2 : Selectors connus (complement)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 2A. High confidence selectors
        for (const sel of highSel) {{
            try {{
                document.querySelectorAll(sel).forEach(el => addAd(el, 'selector_high'));
            }} catch(e) {{}}
        }}

        // 2B. Medium confidence selectors (require min 50x50)
        for (const sel of medSel) {{
            try {{
                document.querySelectorAll(sel).forEach(el => {{
                    if (seen.has(el)) return;
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 50 || rect.height < 50) return;
                    addAd(el, 'selector_medium');
                }});
            }} catch(e) {{}}
        }}

        return ads;
    }}
    """
    try:
        return page.evaluate(js, [HIGH_CONFIDENCE_SELECTORS, MEDIUM_CONFIDENCE_SELECTORS])
    except Exception:
        return []


def setup_network_listener(page) -> list[dict]:
    """Install page.on('request') to PASSIVELY monitor ad/tracker requests.
    Unlike page.route(), this does NOT block any request — it just observes.
    Returns the shared list that collects matched requests.
    Must be called BEFORE page.goto()."""
    intercepted = []

    def _on_request(request):
        try:
            url = request.url.lower()
            resource_type = request.resource_type
            matched_domain = ""
            is_tracker = False

            for domain in AD_NETWORK_DOMAINS:
                if domain in url:
                    matched_domain = domain
                    break

            if not matched_domain:
                for domain in TRACKER_NETWORK_DOMAINS:
                    if domain in url:
                        matched_domain = domain
                        is_tracker = True
                        break

            if matched_domain:
                intercepted.append({
                    "url": url[:200],
                    "domain": matched_domain,
                    "type": resource_type,
                    "is_tracker": is_tracker,
                    "is_visual": resource_type in AD_VISUAL_TYPES,
                })
        except Exception:
            pass  # Never crash — just skip this request

    page.on("request", _on_request)
    return intercepted


def remove_network_listener(page):
    """Remove request listener (best effort)."""
    try:
        page.remove_listener("request", lambda _: None)
    except Exception:
        pass


def compute_network_stats(intercepted: list[dict]) -> dict:
    """Compute ad/tracker stats from intercepted network requests."""
    ad_requests = [r for r in intercepted if not r["is_tracker"]]
    tracker_requests = [r for r in intercepted if r["is_tracker"]]
    ad_visual = [r for r in ad_requests if r["is_visual"]]
    ad_domains = list(set(r["domain"] for r in ad_requests))
    tracker_domains = list(set(r["domain"] for r in tracker_requests))

    return {
        "ad_requests": len(ad_requests),
        "ad_visual_requests": len(ad_visual),
        "ad_domains": ad_domains,
        "tracker_requests": len(tracker_requests),
        "tracker_domains": tracker_domains,
        "total_intercepted": len(intercepted),
    }


def compute_score_v4(ads: list[dict], adtech: dict, net_stats: dict) -> tuple[float, dict, str]:
    """
    Score v4 : combine DOM + network interception.
    Network visual requests (image/iframe to ad domain) = most reliable signal.
    Uses the higher of DOM count vs network visual count.

    Returns: (score, breakdown, detection_method)
    """
    breakdown = {"above_fold": 0, "mid_page": 0, "deep": 0, "footer": 0, "sticky": 0}

    dom_ad_count = len(ads)
    net_visual_count = net_stats.get("ad_visual_requests", 0)

    if dom_ad_count == 0 and net_visual_count == 0 and not adtech.get("scripts_detected"):
        return 10.0, breakdown, "none"

    # DOM penalty (from positioned elements)
    dom_penalty = 0.0
    has_sticky = False
    for ad in ads:
        y = ad.get("y", 0)
        area = ad.get("area", 0)
        is_sticky = ad.get("is_sticky", False)

        zone_weight = get_zone_weight(y)
        size_mult = get_size_multiplier(area)
        penalty = BASE_PENALTY * zone_weight * size_mult

        if is_sticky:
            penalty *= STICKY_MULTIPLIER
            breakdown["sticky"] += 1
            has_sticky = True
        elif y < 800:
            breakdown["above_fold"] += 1
        elif y < 2000:
            breakdown["mid_page"] += 1
        elif y < 4000:
            breakdown["deep"] += 1
        else:
            breakdown["footer"] += 1

        dom_penalty += penalty

    # Network-based ad count estimate:
    # Use number of unique ad domains as proxy for ad slots (not raw request count,
    # which includes pixels, syncs, etc.). Cap at reasonable value.
    net_ad_domains = len(net_stats.get("ad_domains", []))
    # Estimate: ~1 visible ad per 2 unique ad domains (conservative)
    net_estimated_ads = max(net_ad_domains // 2, 1) if net_ad_domains > 0 else 0
    net_penalty = net_estimated_ads * BASE_PENALTY * 0.7  # lighter weight than DOM

    # Use DOM as primary if it found ads; fall back to network estimate
    if dom_ad_count > 0:
        detection_method = "dom"
        primary_penalty = dom_penalty
    elif net_estimated_ads > 0:
        detection_method = "network"
        primary_penalty = net_penalty
    else:
        detection_method = "none"
        primary_penalty = 0.0

    # Script penalty (capped so scripts alone don't go below 7)
    scripts_detected = adtech.get("scripts_detected", [])
    script_penalty = min(len(scripts_detected) * SCRIPT_PENALTY, 3.0)

    # Sticky extra
    sticky_penalty = STICKY_EXTRA_PENALTY if has_sticky else 0.0

    total_penalty = primary_penalty + script_penalty + sticky_penalty
    score = max(0.0, 10.0 - total_penalty)
    return round(score, 1), breakdown, detection_method


def score_attention(page, domain: str) -> dict:
    """Charge une page avec interception reseau + detection DOM multi-couche.
    Consent cookies are pre-injected on the context before this call.
    """
    url = f"https://{domain}"
    intercepted = []
    try:
        # 0. Install PASSIVE network listener BEFORE navigation
        #    (page.on("request") — does NOT block any request)
        intercepted = setup_network_listener(page)

        # 1. Navigate — wait_until="load" lets subresources (ads) start loading
        t_start = _time.monotonic()
        try:
            page.goto(url, timeout=25_000, wait_until="load")
        except Exception:
            # Timeout on "load" is common for heavy sites — continue anyway
            pass
        page_load_time_ms = int((_time.monotonic() - t_start) * 1000)

        # 2. Wait for CMP to appear
        page.wait_for_timeout(2000)

        # 3. FIRST try clicking consent (gives real consent to CMP)
        cookie_dismissed = dismiss_cookie_banner(page)

        # 4. THEN force-remove any remaining overlays/backdrops
        force_remove_overlays(page)

        # 5. Wait 4s — ads load after consent is given
        page.wait_for_timeout(4000)

        # 6. Scroll full page for lazy-loading
        scroll_full_page(page)

        # 7. Wait for lazy ads to appear
        page.wait_for_timeout(2000)

        # 8. Scroll back to top
        page.evaluate("window.scrollTo(0, 0)")

        # 9. Wait 5s — Prebid/GPT auctions + creative rendering
        page.wait_for_timeout(5000)

        # 10. Extract language
        content_lang = extract_lang(page)

        # 11. DOM analysis (behavior + selectors)
        ads = analyze_ads_multi_layer(page)

        # 12. Ad-tech scripts
        adtech = detect_adtech_scripts(page)

        # 13. Trackers (JS-based)
        trackers = detect_trackers(page)

        # 14. Compute network stats from intercepted requests
        net_stats = compute_network_stats(intercepted)

        # Debug: log network hits to stderr
        ad_hit_count = net_stats.get("ad_requests", 0)
        visual_hit_count = net_stats.get("ad_visual_requests", 0)
        print(f"  [{domain}] Network: {ad_hit_count} ad reqs, {visual_hit_count} visual | DOM: {len(ads)} elements", file=sys.stderr, flush=True)

        # 15. Score v4 (DOM + network combined)
        score, breakdown, detection_method = compute_score_v4(ads, adtech, net_stats)

        # ad_count: DOM elements if found, else estimate from unique ad domains
        net_ad_domain_count = len(net_stats.get("ad_domains", []))
        net_estimated = max(net_ad_domain_count // 2, 1) if net_ad_domain_count > 0 else 0
        effective_ad_count = len(ads) if len(ads) > 0 else net_estimated

        # Cleanup
        remove_network_listener(page)

        return {
            "ad_count": effective_ad_count,
            "score": score,
            "is_mfa": score < MFA_THRESHOLD,
            "details": breakdown,
            "ads_above_fold": breakdown["above_fold"],
            "ads_mid_page": breakdown["mid_page"],
            "ads_deep": breakdown["deep"],
            "ads_footer": breakdown["footer"],
            "ads_sticky": breakdown["sticky"],
            "content_lang": content_lang,
            "cookie_dismissed": cookie_dismissed,
            "page_load_time_ms": page_load_time_ms,
            "adtech": adtech,
            "trackers": trackers,
            "network_stats": net_stats,
            "detection_method": detection_method,
            "dom_ad_count": len(ads),
            "network_ad_requests": net_stats.get("ad_requests", 0),
            "network_ad_domains": net_stats.get("ad_domains", []),
            "network_tracker_requests": net_stats.get("tracker_requests", 0),
            "error": None,
        }
    except Exception as e:
        remove_network_listener(page)
        return {
            "ad_count": 0, "score": 5.0, "is_mfa": False,
            "details": {},
            "ads_above_fold": 0, "ads_mid_page": 0,
            "ads_deep": 0, "ads_footer": 0, "ads_sticky": 0,
            "content_lang": "", "cookie_dismissed": False,
            "page_load_time_ms": 0,
            "adtech": {"scripts_detected": []},
            "trackers": {"total": 0},
            "network_stats": {"ad_requests": 0, "ad_visual_requests": 0, "ad_domains": [], "tracker_requests": 0, "tracker_domains": [], "total_intercepted": 0},
            "detection_method": "none",
            "dom_ad_count": 0,
            "network_ad_requests": 0,
            "network_ad_domains": [],
            "network_tracker_requests": 0,
            "error": str(e)[:200],
        }


def extract_metadata(page, domain: str) -> dict:
    """Extrait title, meta description, h1."""
    url = f"https://{domain}"
    try:
        page.goto(url, timeout=15_000, wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        dismiss_cookie_banner(page)
        force_remove_overlays(page)

        title = page.title() or ""
        description = ""
        h1 = ""

        try:
            meta = page.locator('meta[name="description"]').first.get_attribute("content")
            description = meta or ""
        except Exception:
            pass

        try:
            h1 = page.locator("h1").first.inner_text()
        except Exception:
            pass

        return {"title": title[:300], "description": description[:500], "h1": h1[:200]}
    except Exception:
        return {"title": "", "description": "", "h1": ""}


def screenshot_with_ads(page, domain: str, output_dir: str) -> dict:
    """Capture la page avec pubs surlignees et labellisees par zone.
    Consent cookies are pre-injected on the context before this call.
    """
    url = f"https://{domain}"
    intercepted = []
    try:
        # Passive network listener BEFORE navigation
        intercepted = setup_network_listener(page)

        try:
            page.goto(url, timeout=25_000, wait_until="load")
        except Exception:
            pass

        # Same sequence as score_attention
        page.wait_for_timeout(2000)
        cookie_dismissed = dismiss_cookie_banner(page)  # Click consent FIRST
        force_remove_overlays(page)  # Then remove leftovers
        page.wait_for_timeout(4000)
        scroll_full_page(page)
        page.wait_for_timeout(2000)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(5000)  # Wait for Prebid/GPT auctions

        # Full analysis first (behavior + selectors)
        ads = analyze_ads_multi_layer(page)

        # Highlight detected ads by position matching
        highlight_js = """
        (adPositions) => {
            const style = document.createElement('style');
            style.textContent = `
                .mli-ad-highlight {
                    outline: 3px solid #ef4444 !important;
                    outline-offset: 2px !important;
                    position: relative !important;
                }
                .mli-ad-label {
                    position: absolute !important;
                    top: -2px !important;
                    right: -2px !important;
                    background: #ef4444 !important;
                    color: white !important;
                    font-size: 9px !important;
                    font-weight: bold !important;
                    padding: 1px 6px !important;
                    border-radius: 0 0 0 4px !important;
                    z-index: 999999 !important;
                    font-family: Arial, sans-serif !important;
                    pointer-events: none !important;
                }
                .mli-ad-sticky { outline-color: #7C3AED !important; outline-width: 4px !important; }
            `;
            document.head.appendChild(style);

            const scrollY = window.scrollY || 0;
            let count = 0;

            // Walk all elements and match by position
            const allEls = document.querySelectorAll('iframe, div, section, aside, figure, ins, article, a');
            allEls.forEach(el => {
                if (el.classList.contains('mli-ad-highlight')) return;
                const rect = el.getBoundingClientRect();
                if (rect.width < 5 || rect.height < 5) return;
                const elX = Math.round(rect.x);
                const elY = Math.round(rect.y + scrollY);
                const elW = Math.round(rect.width);
                const elH = Math.round(rect.height);

                const match = adPositions.find(a =>
                    Math.abs(a.x - elX) < 5 && Math.abs(a.y - elY) < 5 &&
                    Math.abs(a.width - elW) < 5 && Math.abs(a.height - elH) < 5
                );
                if (!match) return;

                const absY = elY;
                const cStyle = window.getComputedStyle(el);
                const isSticky = cStyle.position === 'fixed' || cStyle.position === 'sticky';

                let zone = 'FOOTER';
                if (isSticky) zone = 'STICKY';
                else if (absY < 800) zone = 'ATF';
                else if (absY < 2000) zone = 'MID';
                else if (absY < 4000) zone = 'DEEP';

                el.classList.add('mli-ad-highlight');
                if (isSticky) el.classList.add('mli-ad-sticky');

                const label = document.createElement('span');
                label.className = 'mli-ad-label';
                label.textContent = zone;
                el.style.position = el.style.position || 'relative';
                el.appendChild(label);
                count++;
            });
            return count;
        }
        """
        page.evaluate(highlight_js, ads)
        adtech = detect_adtech_scripts(page)
        trackers = detect_trackers(page)
        net_stats = compute_network_stats(intercepted)
        score, breakdown, _ = compute_score_v4(ads, adtech, net_stats)
        # ad_count: DOM elements if found, else estimate from unique ad domains
        net_ad_domain_count = len(net_stats.get("ad_domains", []))
        net_estimated = max(net_ad_domain_count // 2, 1) if net_ad_domain_count > 0 else 0
        effective_ad_count = len(ads) if len(ads) > 0 else net_estimated

        # MLI banner
        banner_js = """
        (info) => {
            const banner = document.createElement('div');
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; z-index: 9999999;
                background: linear-gradient(135deg, #060B14, #0D1B2A);
                color: #F1F5F9; padding: 10px 20px;
                font-family: Inter, Arial, sans-serif; font-size: 12px;
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid rgba(16,185,129,0.3);
            `;
            banner.innerHTML = `
                <span style="font-weight:700;font-size:14px;">MLI <span style="color:#10B981">Intelligence</span></span>
                <span>
                    ${info.domain} —
                    Score: <b style="color:${info.score >= 7 ? '#10B981' : info.score >= 4 ? '#F97316' : '#EF4444'}">${info.score}/10</b> —
                    ${info.total} pub(s) :
                    ATF ${info.atf} · Mid ${info.mid} · Deep ${info.deep} · Footer ${info.footer} · Sticky ${info.sticky}
                </span>
            `;
            document.body.prepend(banner);
            document.body.style.paddingTop = '44px';
        }
        """
        page.evaluate(banner_js, {
            "domain": domain, "score": score, "total": effective_ad_count,
            "atf": breakdown["above_fold"], "mid": breakdown["mid_page"],
            "deep": breakdown["deep"], "footer": breakdown["footer"],
            "sticky": breakdown["sticky"],
        })

        # Screenshots
        os.makedirs(output_dir, exist_ok=True)
        safe_name = domain.replace(".", "_").replace("/", "_")

        viewport_path = os.path.join(output_dir, f"{safe_name}_viewport.png")
        page.screenshot(path=viewport_path, full_page=False)

        fullpage_path = os.path.join(output_dir, f"{safe_name}_full.png")
        page.screenshot(path=fullpage_path, full_page=True)

        remove_network_listener(page)

        return {
            "viewport_path": viewport_path,
            "fullpage_path": fullpage_path,
            "ad_count": effective_ad_count,
            "score": score,
            "breakdown": breakdown,
            "cookie_dismissed": cookie_dismissed,
            "adtech": adtech,
            "trackers": trackers,
            "error": None,
        }

    except Exception as e:
        remove_network_listener(page)
        return {
            "viewport_path": "", "fullpage_path": "",
            "ad_count": 0, "score": 5.0, "breakdown": {},
            "cookie_dismissed": False,
            "adtech": {"scripts_detected": []},
            "trackers": {"total": 0},
            "error": str(e)[:200],
        }


def main():
    raw = sys.stdin.read()
    request = json.loads(raw)

    domains = request["domains"]
    mode = request.get("mode", "attention")
    output_dir = request.get("output_dir", "./output/screenshots")

    results = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        )

        # Inject localStorage consent mock on every new page
        context.add_init_script(CONSENT_INIT_SCRIPT)

        for i, domain in enumerate(domains):
            # Inject consent cookies for this domain BEFORE navigating
            try:
                context.add_cookies(get_consent_cookies(domain))
            except Exception:
                pass  # some domain formats may fail, that's ok

            page = context.new_page()
            try:
                if mode == "attention":
                    results[domain] = score_attention(page, domain)
                elif mode == "screenshot":
                    results[domain] = screenshot_with_ads(page, domain, output_dir)
                else:
                    results[domain] = extract_metadata(page, domain)
            except Exception as e:
                if mode == "attention":
                    results[domain] = {
                        "ad_count": 0, "score": 5.0, "is_mfa": False, "details": {},
                        "ads_above_fold": 0, "ads_mid_page": 0, "ads_deep": 0,
                        "ads_footer": 0, "ads_sticky": 0,
                        "content_lang": "", "cookie_dismissed": False,
                        "page_load_time_ms": 0,
                        "adtech": {"scripts_detected": []},
                        "trackers": {"total": 0},
                        "network_stats": {"ad_requests": 0, "ad_visual_requests": 0, "ad_domains": [], "tracker_requests": 0, "tracker_domains": [], "total_intercepted": 0},
                        "detection_method": "none",
                        "dom_ad_count": 0, "network_ad_requests": 0,
                        "network_ad_domains": [], "network_tracker_requests": 0,
                        "error": str(e)[:200],
                    }
                elif mode == "screenshot":
                    results[domain] = {
                        "viewport_path": "", "fullpage_path": "",
                        "ad_count": 0, "score": 5.0, "breakdown": {},
                        "cookie_dismissed": False,
                        "adtech": {"scripts_detected": []},
                        "trackers": {"total": 0},
                        "error": str(e)[:200],
                    }
                else:
                    results[domain] = {"title": "", "description": "", "h1": ""}
            finally:
                page.close()

            print(f"[{i+1}/{len(domains)}] {domain}", file=sys.stderr, flush=True)

        browser.close()

    json.dump(results, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
