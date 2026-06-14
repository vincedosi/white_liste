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

# Make `config` (in backend/) and `detection_helpers` (in backend/services/)
# importable whether run standalone (`python services/pw_worker.py`) or as a
# subprocess from the backend cwd.
_HERE = os.path.dirname(os.path.abspath(__file__))      # .../backend/services
_BACKEND = os.path.dirname(_HERE)                         # .../backend
for _p in (_BACKEND, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from playwright.sync_api import sync_playwright
from detection_helpers import dedup_nested_ads, score_from_penalty

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


def detect_interstitials(page) -> list[dict]:
    """Detect interstitial ads BEFORE removing overlays.
    Interstitials are full-screen fixed overlays that contain ad content
    (iframes, ad network scripts, large images, or ad-related classes).
    Returns list of detected interstitial info dicts.
    """
    js = """
    () => {
        const interstitials = [];
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const adKeywords = [
            'ad', 'pub', 'sponsor', 'promo', 'interstitial', 'modal-ad',
            'overlay-ad', 'splash', 'takeover', 'preroll', 'welcome-ad',
            'page-skin', 'skin-ad', 'fullscreen-ad',
        ];
        const adNetworks = [
            'doubleclick', 'googlesyndication', 'googleadservices',
            'taboola', 'outbrain', 'criteo', 'teads', 'amazon-adsystem',
            'pubmatic', 'adnxs', 'rubiconproject', 'smartadserver',
        ];

        function hasAdContent(el) {
            // Check class/id for ad keywords
            const classId = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
            if (adKeywords.some(k => classId.includes(k))) return true;

            // Check for ad iframes inside
            const iframes = el.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const src = (iframe.src || '').toLowerCase();
                if (adNetworks.some(n => src.includes(n))) return true;
                // Large iframe inside overlay = likely ad
                if (iframe.offsetWidth > vw * 0.3 && iframe.offsetHeight > vh * 0.3) return true;
            }

            // Check for ad images (large external images)
            const imgs = el.querySelectorAll('img[src]');
            for (const img of imgs) {
                if (img.offsetWidth > vw * 0.4 && img.offsetHeight > vh * 0.3) return true;
            }

            // Check for GPT slots inside
            if (el.querySelector('div[id^="div-gpt-ad"], div[id^="google_ads_iframe"], ins.adsbygoogle')) return true;

            // Check data attributes
            const html = el.outerHTML.slice(0, 500).toLowerCase();
            if (adNetworks.some(n => html.includes(n))) return true;

            return false;
        }

        document.querySelectorAll('*').forEach(el => {
            const s = window.getComputedStyle(el);
            if (s.position !== 'fixed') return;

            const z = parseInt(s.zIndex) || 0;
            if (z < 100) return;

            const w = el.offsetWidth;
            const h = el.offsetHeight;

            // Must cover significant portion of viewport
            const isFullscreen = w >= vw * 0.7 && h >= vh * 0.5;
            const isLargeOverlay = w >= vw * 0.5 && h >= vh * 0.4 && z > 500;

            if (!isFullscreen && !isLargeOverlay) return;

            // Check if it contains ad content (not just a cookie banner)
            if (!hasAdContent(el)) return;

            interstitials.push({
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                class: (el.className || '').toString().slice(0, 100),
                width: w,
                height: h,
                zIndex: z,
                area: w * h,
                viewport_coverage: Math.round((w * h) / (vw * vh) * 100),
                has_iframe: el.querySelectorAll('iframe').length > 0,
                has_gpt: !!el.querySelector('div[id^="div-gpt-ad"], ins.adsbygoogle'),
            });
        });

        return interstitials;
    }
    """
    try:
        return page.evaluate(js)
    except Exception:
        return []


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


# JS exécuté DANS chaque frame : trouve et clique le bouton "tout accepter".
# Cible aussi les CMP rendus en iframe (Sourcepoint `about:srcdoc`, etc.), normalise
# les apostrophes typographiques (’) et EXCLUT les boutons refuser/paramétrer/s'abonner.
_FRAME_CONSENT_JS = r"""
() => {
  const norm = s => (s||'').replace(/’|ʼ/g, "'").replace(/\s+/g,' ').trim().toLowerCase();
  const ACCEPT = /(tout accepter|accepter et continuer|accepter & continuer|accepter et fermer|accepter & fermer|fermer et accepter|fermer & accepter|accepter tout|oui,? ?j'accepte|j'accepte|^accepter$|accept all|accept cookies|i agree|allow all|^agree$|tout accepter et fermer)/;
  const REFUSE = /(refus|param|sans accepter|s'abonner|abonner|payer|continuer sans|g[ée]rer|manage|settings|en savoir plus|s'inscrire|personnaliser|pr[ée]f[ée]rences)/;
  const KNOWN = ['#didomi-notice-agree-button','#onetrust-accept-btn-handler','#axeptio_btn_acceptAll',
    "[data-testid='uc-accept-all-button']",'#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '.sp_choice_type_11','.Cmp__action--yes','.cmpboxbtn.cmpboxbtnyes','#tarteaucitronPersonalize2',
    '.fast-cmp-button-primary'];
  for (const k of KNOWN) {
    const el = document.querySelector(k);
    if (el) { const r = el.getBoundingClientRect(); if (r.width>0 && r.height>0) { el.click(); return 'known:'+k; } }
  }
  const els = document.querySelectorAll('button,[role=button],a,input[type=button],input[type=submit]');
  for (const el of els) {
    const txt = norm(el.textContent || el.value);
    if (!txt || txt.length > 40) continue;
    if (ACCEPT.test(txt) && !REFUSE.test(txt)) {
      const r = el.getBoundingClientRect();
      if (r.width>0 && r.height>0) { el.click(); return 'text:'+txt; }
    }
  }
  return null;
}
"""


def dismiss_cookie_banner(page, deadline_s: float = 6.0) -> bool:
    """Clique le bandeau de consentement pour obtenir un VRAI consentement (les régies
    n'affichent les créas qu'avec un consentement réel). Scanne le frame principal ET les
    iframes (Sourcepoint/srcdoc), avec polling car le CMP se charge en asynchrone.
    Retourne True si un bouton a été cliqué."""
    deadline = _time.monotonic() + deadline_s
    while _time.monotonic() < deadline:
        for frame in page.frames:
            try:
                if frame.evaluate(_FRAME_CONSENT_JS):
                    _settle_after_consent(page)
                    return True
            except Exception:
                # frame détachée juste après le clic (CMP qui se ferme) = succès probable
                continue
        page.wait_for_timeout(400)
    return False


def _settle_after_consent(page):
    """Certains CMP (ex: voici.fr) RECHARGENT la page après le clic « accepter » pour
    réappliquer le consentement. La navigation détruit le contexte JS et faisait planter
    les page.evaluate() suivants (« Execution context was destroyed ») -> audit en erreur,
    score par défaut 5.0. On laisse la nav éventuelle démarrer puis on attend un DOM stable
    (no-op si pas de navigation). Borné pour ne jamais pendre."""
    try:
        page.wait_for_timeout(500)                                   # laisse un reload éventuel démarrer
        page.wait_for_load_state("domcontentloaded", timeout=5000)   # attend le nouveau DOM (sinon instantané)
    except Exception:
        pass


def scroll_full_page(page):
    """Fast scroll: big steps, short pauses. Triggers lazy-loading.

    Driven from Python with a hard step cap so it CANNOT hang: each scrollTo is
    a synchronous, instant evaluate (no Promise — page.evaluate of a Promise has
    no timeout and would hang forever if the page's JS loop stalls or its context
    is destroyed mid-scroll, e.g. an SPA route change). Bounded to 12 steps."""
    try:
        height = page.evaluate("() => document.body.scrollHeight") or 0
    except Exception:
        height = 0
    pos = 0
    steps = 0
    while pos < height and steps < 12:
        pos += 1200
        try:
            # Options-object form works for native scrollTo AND sites that
            # override window.scrollTo to expect {top} (e.g. legisocial.fr).
            page.evaluate("(y) => window.scrollTo({top: y, left: 0})", pos)
        except Exception:
            break
        page.wait_for_timeout(60)
        steps += 1
    try:
        page.evaluate("() => window.scrollTo({top: 0, left: 0})")
    except Exception:
        pass


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


def is_suspect_blocked(net_stats: dict, adtech: dict) -> bool:
    """True si la page a une infra ad-tech (GPT/Prebid…) MAIS 0 requête pub réseau.
    Signature d'un chargement bloqué (anti-bot / rate-limit / CMP manqué) : les scripts
    pub sont là mais aucune enchère n'a tiré → le score « propre » n'est PAS fiable.
    Le consommateur (ingestion) bascule alors en editorial_status='to_review'."""
    return net_stats.get("ad_requests", 0) == 0 and bool(adtech.get("scripts_detected"))


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


def analyze_ads_multi_layer(page, highlight: bool = False) -> list[dict]:
    """
    Detection pub multi-couche par COMPORTEMENT puis selectors.
    Couche 1 : Comportement (iframes cross-origin, taille IAB, slots GPT, blocs sponsors)
    Couche 2 : Selectors connus (high + medium confiance)
    Tout deduplique via Set() d'elements DOM.
    When highlight=True, ads are outlined in red directly during detection
    (no second pass / position matching needed).
    """
    iab_json = json.dumps(IAB_SIZES)
    ad_domains_json = json.dumps(AD_NETWORK_DOMAINS)

    js = f"""
    (args) => {{
        const [highSel, medSel, doHighlight] = args;
        const ads = [];
        const seen = new Set();
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const siteDomain = window.location.hostname.replace(/^www\\./, '');

        const adDomains = {ad_domains_json};
        const iabSizes = {iab_json};
        const tolerance = 20;

        // Inject highlight styles once if highlighting
        if (doHighlight) {{
            const style = document.createElement('style');
            style.textContent = `
                .mli-ad-highlight {{
                    outline: 3px solid #ef4444 !important;
                    outline-offset: 2px !important;
                    position: relative !important;
                }}
                .mli-ad-label {{
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
                }}
                .mli-ad-sticky {{ outline-color: #7C3AED !important; outline-width: 4px !important; }}
                .mli-ad-sticky .mli-ad-label {{ background: #7C3AED !important; }}
                .mli-ad-interstitial {{ outline-color: #F97316 !important; outline-width: 5px !important; }}
                .mli-ad-interstitial .mli-ad-label {{ background: #F97316 !important; font-size: 11px !important; padding: 2px 8px !important; }}
            `;
            document.head.appendChild(style);
        }}

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

            const absY = Math.round(rect.y + scrollY);
            const isSticky = style.position === 'fixed' || style.position === 'sticky';

            seen.add(el);
            ads.push({{
                x: Math.round(rect.x),
                y: absY,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                area: Math.round(rect.width * rect.height),
                is_sticky: isSticky,
                tag: el.tagName.toLowerCase(),
                method: method,
            }});

            // Highlight inline — no second pass needed
            if (doHighlight) {{
                let zone = 'FOOTER';
                if (method === 'interstitial') zone = 'INTERSTIT.';
                else if (isSticky) zone = 'STICKY';
                else if (absY < 800) zone = 'ATF';
                else if (absY < 2000) zone = 'MID';
                else if (absY < 4000) zone = 'DEEP';

                el.classList.add('mli-ad-highlight');
                if (method === 'interstitial') el.classList.add('mli-ad-interstitial');
                else if (isSticky) el.classList.add('mli-ad-sticky');

                const label = document.createElement('span');
                label.className = 'mli-ad-label';
                label.textContent = zone;
                if (!style.position || style.position === 'static') {{
                    el.style.position = 'relative';
                }}
                el.appendChild(label);
            }}
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
        return page.evaluate(js, [HIGH_CONFIDENCE_SELECTORS, MEDIUM_CONFIDENCE_SELECTORS, highlight])
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
    breakdown = {"above_fold": 0, "mid_page": 0, "deep": 0, "footer": 0, "sticky": 0, "interstitial": 0}

    dom_ad_count = len(ads)
    net_visual_count = net_stats.get("ad_visual_requests", 0)

    if dom_ad_count == 0 and net_visual_count == 0 and not adtech.get("scripts_detected"):
        return 10.0, breakdown, "none"

    # DOM penalty (from positioned elements). Footer ads beyond a cap are usually
    # noise (link/widget/"à lire aussi" blocks matched as ads) -> cap them.
    FOOTER_CAP = 6
    dom_penalty = 0.0
    has_sticky = False
    has_interstitial = False
    footer_seen = 0
    for ad in ads:
        y = ad.get("y", 0)
        area = ad.get("area", 0)
        is_sticky = ad.get("is_sticky", False)
        method = ad.get("method", "")

        # Interstitials get heavy penalty (2.0 per interstitial)
        if method == "interstitial":
            dom_penalty += 2.0
            breakdown["interstitial"] += 1
            has_interstitial = True
            continue

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
            footer_seen += 1
            if footer_seen > FOOTER_CAP:
                continue  # de-noise: ignore footer over-count
            breakdown["footer"] += 1

        dom_penalty += penalty

    # ── Network visual ad requests = the MOST RELIABLE signal ──────────────
    # Creatives actually loaded from ad domains (image/iframe/media/subdocument).
    # The DOM selector layer under-counts badly on cross-origin/safeframe ads
    # (largus.fr: 2 DOM vs 64 visual). So we derive a penalty from net_visual and
    # take the MAX with the DOM penalty — network is no longer a mere fallback.
    net_visual_penalty = net_visual_count * 0.25

    if net_visual_penalty >= dom_penalty and net_visual_count > 0:
        detection_method = "network"
        primary_penalty = net_visual_penalty
    elif dom_ad_count > 0:
        detection_method = "dom"
        primary_penalty = dom_penalty
    else:
        detection_method = "none"
        primary_penalty = 0.0

    # Script penalty (capped so scripts alone don't go below 7)
    scripts_detected = adtech.get("scripts_detected", [])
    script_penalty = min(len(scripts_detected) * SCRIPT_PENALTY, 3.0)

    # Sticky extra
    sticky_penalty = STICKY_EXTRA_PENALTY if has_sticky else 0.0

    total_penalty = primary_penalty + script_penalty + sticky_penalty
    # Saturating curve instead of a hard 10 - penalty cliff: many ads decay the
    # score smoothly toward 0 rather than slamming every ad-heavy site to 0.
    score = score_from_penalty(total_penalty)
    return score, breakdown, detection_method


CLUTTER_MEASURE_JS = """
() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const viewportArea = vw * vh;
    const viewportTop = window.scrollY;

    const adElements = new Set();

    // A. Known ad selectors
    const adSelectors = [
        'div[id^="div-gpt-ad"]', 'div[id^="google_ads_iframe"]',
        'ins.adsbygoogle', 'div[data-google-query-id]',
        'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
        'iframe[src*="safeframe"]', 'iframe[src*="amazon-adsystem"]',
        'div[id*="taboola"]', 'div[id*="outbrain"]',
        'div[class*="teads"]', 'div[data-criteo-id]',
        'div[class*="ad-container"]', 'div[class*="ad-slot"]',
        'div[class*="ad-wrapper"]', 'div[class*="advertisement"]',
        'div[class*="pub-container"]', 'div[class*="sponsor"]',
    ];
    adSelectors.forEach(sel => {
        try { document.querySelectorAll(sel).forEach(el => adElements.add(el)); } catch(e) {}
    });

    // B. Cross-origin iframes
    const siteDomain = location.hostname.replace(/^www\\./, '');
    document.querySelectorAll('iframe[src]').forEach(iframe => {
        try {
            const src = new URL(iframe.src);
            const iframeDomain = src.hostname.replace(/^www\\./, '');
            if (iframeDomain !== siteDomain && !iframeDomain.endsWith('.' + siteDomain)) {
                adElements.add(iframe);
            }
        } catch(e) {}
    });

    // C. GPT slots
    try {
        if (window.googletag && googletag.pubads) {
            googletag.pubads().getSlots().forEach(slot => {
                const el = document.getElementById(slot.getSlotElementId());
                if (el) adElements.add(el);
            });
        }
    } catch(e) {}

    // D. Elements already highlighted by MLI detection
    document.querySelectorAll('.mli-ad-highlight').forEach(el => adElements.add(el));

    // Compute visible ad surface in current viewport
    let adSurfaceInViewport = 0;
    const adsInViewport = [];

    adElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;

        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, vh);
        const visibleLeft = Math.max(rect.left, 0);
        const visibleRight = Math.min(rect.right, vw);

        if (visibleTop < visibleBottom && visibleLeft < visibleRight) {
            const visibleArea = (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
            adSurfaceInViewport += visibleArea;

            adsInViewport.push({
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                visibleArea: Math.round(visibleArea),
                y: Math.round(rect.top + viewportTop),
                isSticky: style.position === 'fixed' || style.position === 'sticky',
                tag: el.tagName.toLowerCase(),
            });
        }
    });

    // Compute editorial content surface
    let contentArea = 0;
    document.querySelectorAll('article, main, [role="main"], .content, .article-body, .post-content, .entry-content').forEach(el => {
        const rect = el.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, vh);
        const visibleLeft = Math.max(rect.left, 0);
        const visibleRight = Math.min(rect.right, vw);
        if (visibleTop < visibleBottom && visibleLeft < visibleRight) {
            contentArea += (visibleRight - visibleLeft) * (visibleBottom - visibleTop);
        }
    });

    const adRatio = adSurfaceInViewport / viewportArea;
    const contentRatio = Math.min(contentArea / viewportArea, 1.0);

    return {
        viewport_area: viewportArea,
        ad_surface: Math.round(adSurfaceInViewport),
        ad_ratio: Math.round(adRatio * 1000) / 1000,
        content_surface: Math.round(contentArea),
        content_ratio: Math.round(contentRatio * 1000) / 1000,
        ads_visible: adsInViewport.length,
        ads_detail: adsInViewport,
        scroll_y: viewportTop,
    };
}
"""


def compute_clutter_score(page) -> tuple[float, dict, dict]:
    """Measure visual ad clutter at 3 scroll positions.
    Returns: (clutter_score, clutter_detail, page_profile)
    """
    positions = [
        ("atf", 0),        # Above the fold
        ("mid", 0.5),      # Mid-page (50%)
        ("deep", 0.8),     # Deep (80%)
    ]
    captures = {}

    for name, scroll_pct in positions:
        if scroll_pct == 0:
            page.evaluate("window.scrollTo(0, 0)")
        else:
            page.evaluate(f"window.scrollTo(0, document.body.scrollHeight * {scroll_pct})")
        page.wait_for_timeout(400)
        result = page.evaluate(CLUTTER_MEASURE_JS)
        captures[name] = result

    # Weighted score: ATF 50%, Mid 30%, Deep 20%
    atf_ratio = captures["atf"]["ad_ratio"]
    mid_ratio = captures["mid"]["ad_ratio"]
    deep_ratio = captures["deep"]["ad_ratio"]

    weighted_ratio = atf_ratio * 0.5 + mid_ratio * 0.3 + deep_ratio * 0.2
    clutter_score = 10 * (1 - weighted_ratio)
    clutter_score = max(0.0, min(10.0, round(clutter_score, 1)))

    # Build formula string
    formula = (
        f"10 × (1 - ({atf_ratio}×0.5 + {mid_ratio}×0.3 + {deep_ratio}×0.2)) = {clutter_score}"
    )

    clutter_detail = {
        "atf": captures["atf"],
        "mid": captures["mid"],
        "deep": captures["deep"],
        "weighted_ratio": round(weighted_ratio, 3),
        "formula": formula,
    }

    # Page profile: average across 3 captures
    avg_ad_pct = round(
        (atf_ratio + mid_ratio + deep_ratio) / 3 * 100
    )
    avg_content_pct = round(
        (captures["atf"]["content_ratio"] + captures["mid"]["content_ratio"] + captures["deep"]["content_ratio"]) / 3 * 100
    )
    page_profile = {
        "total_ad_surface_pct": avg_ad_pct,
        "total_content_pct": avg_content_pct,
        "total_nav_pct": max(0, 100 - avg_ad_pct - avg_content_pct - 10),
        "total_empty_pct": 10,  # estimated
    }

    return clutter_score, clutter_detail, page_profile


def _log(msg: str):
    """Log to stderr with timestamp (captured by pw_bridge for live streaming)."""
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", file=sys.stderr, flush=True)


def score_attention(page, domain: str) -> dict:
    """Charge une page avec interception reseau + detection DOM multi-couche.
    Consent cookies are pre-injected on the context before this call.
    Uses adaptive waits.
    """
    url = f"https://{domain}"
    intercepted = []
    try:
        intercepted = setup_network_listener(page)
        _log(f"    [net] Listener installe pour {domain}")

        _log(f"    [nav] goto {url}...")
        t_start = _time.monotonic()
        try:
            page.goto(url, timeout=20_000, wait_until="load")
            page_load_time_ms = int((_time.monotonic() - t_start) * 1000)
            _log(f"    [nav] Page chargee en {page_load_time_ms}ms")
        except Exception as nav_err:
            page_load_time_ms = int((_time.monotonic() - t_start) * 1000)
            _log(f"    [nav] Timeout/erreur apres {page_load_time_ms}ms — on continue")

        _log(f"    [cmp] Detection CMP...")
        page.wait_for_timeout(800)
        cookie_dismissed = dismiss_cookie_banner(page)
        _log(f"    [cmp] Cookie: {'CLIQUE' if cookie_dismissed else 'absent'}")

        # Detect interstitials BEFORE removing overlays
        interstitials = detect_interstitials(page)
        if interstitials:
            _log(f"    [interstitial] {len(interstitials)} interstitiel(s) detecte(s)!")

        n_removed = force_remove_overlays(page)
        if n_removed:
            _log(f"    [cmp] {n_removed} overlays supprimes")

        _log(f"    [ads] Attente adaptative (max 3s)...")
        ad_wait = _wait_for_ads(page, max_ms=3000)
        _log(f"    [ads] Ads apres {ad_wait}ms")

        _log(f"    [scroll] Scroll complet...")
        scroll_full_page(page)
        page.wait_for_timeout(1000)
        page.evaluate("window.scrollTo(0, 0)")

        _log(f"    [ads] Attente auctions (max 3s)...")
        _wait_for_ads(page, max_ms=3000)

        content_lang = extract_lang(page)
        _log(f"    [lang] Langue detectee: '{content_lang}'")

        # 11. DOM analysis
        _log(f"    [dom] Detection pubs multi-couche...")
        ads = analyze_ads_multi_layer(page)
        for it in interstitials:
            ads.append({
                "x": 0, "y": 0,
                "width": it.get("width", 0), "height": it.get("height", 0),
                "area": it.get("area", 0),
                "is_sticky": True, "tag": it.get("tag", "div"),
                "method": "interstitial",
            })
        _log(f"    [dom] {len(ads)} elements pub trouves ({len(interstitials)} interstitiel(s))")

        # 12. Ad-tech scripts
        adtech = detect_adtech_scripts(page)
        scripts = adtech.get("scripts_detected", [])
        _log(f"    [adtech] Scripts: {', '.join(scripts) if scripts else 'aucun'}")

        # 13. Trackers
        trackers = detect_trackers(page)
        _log(f"    [track] Trackers: {trackers.get('total', 0)} detectes")

        # 14. Network stats
        net_stats = compute_network_stats(intercepted)
        ad_hit_count = net_stats.get("ad_requests", 0)
        visual_hit_count = net_stats.get("ad_visual_requests", 0)
        ad_domains = net_stats.get("ad_domains", [])
        _log(f"    [net] {ad_hit_count} ad reqs, {visual_hit_count} visual, domaines: {', '.join(ad_domains[:5])}")

        # 15. Score v4
        _log(f"    [score] Calcul score v4...")
        score, breakdown, detection_method = compute_score_v4(ads, adtech, net_stats)
        _log(f"    [score] v4={score} method={detection_method} breakdown={breakdown}")

        # 16. Clutter score
        _log(f"    [clutter] Mesure encombrement 3 positions...")
        try:
            clutter_score, clutter_detail, page_profile = compute_clutter_score(page)
            _log(f"    [clutter] score={clutter_score} atf={clutter_detail.get('atf', {}).get('ad_ratio', '?')} mid={clutter_detail.get('mid', {}).get('ad_ratio', '?')} deep={clutter_detail.get('deep', {}).get('ad_ratio', '?')}")
        except Exception as e:
            _log(f"    [clutter] ERREUR: {e} — fallback v4")
            clutter_score = score
            clutter_detail = {}
            page_profile = {}

        # ad_count: max of DOM elements vs network visual estimate (creatives
        # loaded). 0 only when NEITHER sees anything -> flagged "à valider".
        net_visual_ct = net_stats.get("ad_visual_requests", 0)
        net_est_visual = round(net_visual_ct / 3) if net_visual_ct > 0 else 0
        effective_ad_count = max(len(ads), net_est_visual)

        # Cleanup
        remove_network_listener(page)

        return {
            "ad_count": effective_ad_count,
            "score": clutter_score,                # NEW: clutter score is primary
            "clutter_score": clutter_score,         # NEW: explicit field
            "attention_score": clutter_score,        # retrocompat alias
            "is_mfa": clutter_score < 4.0,          # MFA threshold on clutter
            "clutter_detail": clutter_detail,        # NEW: per-zone surface ratios
            "page_profile": page_profile,            # NEW: page composition
            "details": {**breakdown, "suspect_blocked": is_suspect_blocked(net_stats, adtech)},  # + garde-fou 0-req/ad-tech
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


def _wait_for_ads(page, max_ms: int = 4000, check_interval: int = 500) -> int:
    """Wait until ad iframes appear or max_ms elapsed. Returns actual wait ms."""
    t0 = _time.monotonic()
    waited = 0
    while waited < max_ms:
        page.wait_for_timeout(check_interval)
        waited = int((_time.monotonic() - t0) * 1000)
        # Check if ad iframes or GPT slots have rendered
        ad_count = page.evaluate("""
            () => document.querySelectorAll(
                'iframe[src*="doubleclick"], iframe[src*="googlesyndication"], '
                + 'iframe[src*="safeframe"], div[id^="google_ads_iframe"], '
                + 'div[id^="div-gpt-ad"], ins.adsbygoogle[data-ad-status]'
            ).length
        """)
        if ad_count > 0:
            break
    return waited


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


def full_audit(page, domain: str, output_dir: str) -> dict:
    """Single-pass: scoring + ad highlighting + screenshots + metadata.
    Replaces the old two-pass approach (score_attention + screenshot_with_ads).
    Uses adaptive waits instead of fixed delays.
    """
    url = f"https://{domain}"
    intercepted = []
    try:
        # 0. Network listener
        intercepted = setup_network_listener(page)
        _log(f"    [net] Listener installe pour {domain}")

        # 1. Navigate
        _log(f"    [nav] goto {url}...")
        t_start = _time.monotonic()
        try:
            page.goto(url, timeout=20_000, wait_until="load")
            page_load_time_ms = int((_time.monotonic() - t_start) * 1000)
            _log(f"    [nav] Page chargee en {page_load_time_ms}ms")
        except Exception as nav_err:
            page_load_time_ms = int((_time.monotonic() - t_start) * 1000)
            _log(f"    [nav] Timeout/erreur apres {page_load_time_ms}ms — on continue")

        # 1b. Page-load guard — retry once if blank/SPA shell
        from detection_helpers import is_content_sufficient
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

        # 2. CMP — quick check, no fixed 2s wait
        _log(f"    [cmp] Detection CMP...")
        page.wait_for_timeout(800)
        cookie_dismissed = dismiss_cookie_banner(page)
        _log(f"    [cmp] Cookie: {'CLIQUE' if cookie_dismissed else 'absent'}")

        # 2b. Detect interstitials BEFORE removing overlays
        _log(f"    [interstitial] Detection pubs interstitielles...")
        interstitials = detect_interstitials(page)
        if interstitials:
            _log(f"    [interstitial] {len(interstitials)} interstitiel(s) detecte(s)!")
            for it in interstitials:
                _log(f"      -> {it.get('tag')}#{it.get('id','')} z={it.get('zIndex')} {it.get('viewport_coverage')}% viewport")
        else:
            _log(f"    [interstitial] Aucun detecte")

        n_removed = force_remove_overlays(page)
        if n_removed:
            _log(f"    [cmp] {n_removed} overlays supprimes")

        # 3. Wait for ads — adaptive: stop early if ad iframes appear
        _log(f"    [ads] Attente adaptative post-consent (max 3s)...")
        ad_wait = _wait_for_ads(page, max_ms=3000, check_interval=500)
        _log(f"    [ads] Ads detectes apres {ad_wait}ms")

        # 4. Scroll
        _log(f"    [scroll] Scroll complet...")
        scroll_full_page(page)
        page.wait_for_timeout(1000)
        page.evaluate("window.scrollTo(0, 0)")

        # 5. Prebid/GPT — adaptive wait
        _log(f"    [ads] Attente auctions (max 3s)...")
        auction_wait = _wait_for_ads(page, max_ms=3000, check_interval=500)
        _log(f"    [ads] Auctions apres {auction_wait}ms")

        # 6. Language
        content_lang = extract_lang(page)
        _log(f"    [lang] Langue detectee: '{content_lang}'")

        # 7. DOM detection WITH highlighting (single pass)
        _log(f"    [dom] Detection pubs + highlighting...")
        ads = analyze_ads_multi_layer(page, highlight=True)
        _n_raw = len(ads)
        ads = dedup_nested_ads(ads)
        if len(ads) != _n_raw:
            _log(f"    [dom] dedup nested: {_n_raw} -> {len(ads)} pubs")
        # Add interstitials as ads with 'interstitial' method
        for it in interstitials:
            ads.append({
                "x": 0, "y": 0,
                "width": it.get("width", 0), "height": it.get("height", 0),
                "area": it.get("area", 0),
                "is_sticky": True,
                "tag": it.get("tag", "div"),
                "method": "interstitial",
            })
        _log(f"    [dom] {len(ads)} pubs detectees ({len(interstitials)} interstitiel(s))")

        # 8. Ad-tech scripts
        adtech = detect_adtech_scripts(page)
        scripts = adtech.get("scripts_detected", [])
        _log(f"    [adtech] Scripts: {', '.join(scripts) if scripts else 'aucun'}")

        # 9. Trackers
        trackers = detect_trackers(page)
        _log(f"    [track] Trackers: {trackers.get('total', 0)} detectes")

        # 10. Network stats
        net_stats = compute_network_stats(intercepted)
        _log(f"    [net] {net_stats.get('ad_requests', 0)} ad reqs, {net_stats.get('ad_visual_requests', 0)} visual")

        # 10b. Video ad detection (passive — no play-click)
        from detection_helpers import (
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

        # 11. Score v4
        _log(f"    [score] Calcul score v4...")
        score, breakdown, detection_method = compute_score_v4(ads, adtech, net_stats)
        _log(f"    [score] v4={score} method={detection_method} breakdown={breakdown}")

        # 12. Clutter score
        _log(f"    [clutter] Mesure encombrement 3 positions...")
        try:
            clutter_score, clutter_detail, page_profile = compute_clutter_score(page)
            _log(f"    [clutter] score={clutter_score}")
        except Exception as e:
            _log(f"    [clutter] ERREUR: {e} — fallback v4")
            clutter_score = score
            clutter_detail = {}
            page_profile = {}

        # 12b. Final score = most penalizing of clutter vs v4(+video)
        v4_with_video = max(0.0, round(score - video_penalty(video_units, VIDEO_PENALTY_PER_UNIT), 1))
        final_score = combine_scores(clutter_score, v4_with_video)
        if final_score is None:
            final_score = 10.0  # both None: page loaded but no evidence -> clean
        _log(f"    [score] final={final_score} (clutter={clutter_score} v4+video={v4_with_video} video_units={video_units})")

        # ad_count: max of DOM elements vs network visual estimate (creatives
        # loaded). 0 only when NEITHER sees anything -> flagged "à valider".
        net_visual_ct = net_stats.get("ad_visual_requests", 0)
        net_est_visual = round(net_visual_ct / 3) if net_visual_ct > 0 else 0
        effective_ad_count = max(len(ads), net_est_visual)

        # 13. MLI banner + screenshots
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(500)

        atf_pct = round(clutter_detail.get("atf", {}).get("ad_ratio", 0) * 100)
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
                    Encombrement: <b style="color:${info.score >= 7 ? '#10B981' : info.score >= 4 ? '#F97316' : '#EF4444'}">${info.score}/10</b> —
                    ATF ${info.atf_pct}% pub · ${info.total} element(s)
                </span>
            `;
            document.body.prepend(banner);
            document.body.style.paddingTop = '44px';
        }
        """
        page.evaluate(banner_js, {
            "domain": domain, "score": final_score,
            "total": effective_ad_count, "atf_pct": atf_pct,
            "interstitials": len(interstitials),
        })

        os.makedirs(output_dir, exist_ok=True)
        safe_name = domain.replace(".", "_").replace("/", "_")

        # Viewport (above-the-fold) — best-effort, the modal shows this by default.
        _log(f"    [screenshot] Capture viewport...")
        viewport_path = os.path.join(output_dir, f"{safe_name}_viewport.png")
        try:
            page.screenshot(path=viewport_path, full_page=False, timeout=30_000)
        except Exception as e:
            _log(f"    [screenshot] viewport echec: {str(e)[:80]}")
            viewport_path = ""

        # Full page — best-effort AND height-gated: Playwright's full_page
        # screenshot can hang past its timeout on giant/infinite-scroll pages
        # (e.g. creusot-infos.com). Skip it when the page is pathologically tall.
        fullpage_path = os.path.join(output_dir, f"{safe_name}_full.png")
        try:
            _ph = page.evaluate("() => document.body.scrollHeight") or 0
        except Exception:
            _ph = 0
        if _ph and _ph <= 12000:
            _log(f"    [screenshot] Capture fullpage ({_ph}px)...")
            try:
                page.screenshot(path=fullpage_path, full_page=True, timeout=20_000)
                _log(f"    [screenshot] OK")
            except Exception as e:
                _log(f"    [screenshot] fullpage echec (on garde viewport): {str(e)[:80]}")
                fullpage_path = ""
        else:
            _log(f"    [screenshot] fullpage SKIP (page {_ph}px trop longue)")
            fullpage_path = ""

        remove_network_listener(page)

        return {
            # Attention fields
            "ad_count": effective_ad_count,
            "interstitials_count": len(interstitials),
            "interstitials": interstitials,
            "score": final_score,
            "clutter_score": clutter_score,
            "attention_score": final_score,
            "is_mfa": final_score < 4.0,
            "video_units": video_units,
            "video_signals": video_signals,
            "clutter_detail": clutter_detail,
            "page_profile": page_profile,
            "details": {**breakdown, "suspect_blocked": is_suspect_blocked(net_stats, adtech)},  # + garde-fou 0-req/ad-tech
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
            # Screenshot fields
            "viewport_path": viewport_path,
            "fullpage_path": fullpage_path,
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
            "dom_ad_count": 0, "network_ad_requests": 0,
            "network_ad_domains": [], "network_tracker_requests": 0,
            "viewport_path": "", "fullpage_path": "",
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
        intercepted = setup_network_listener(page)
        _log(f"    [net] Listener installe")

        _log(f"    [nav] goto {url}...")
        t_start = _time.monotonic()
        try:
            page.goto(url, timeout=20_000, wait_until="load")
            load_ms = int((_time.monotonic() - t_start) * 1000)
            _log(f"    [nav] Charge en {load_ms}ms")
        except Exception as e:
            load_ms = int((_time.monotonic() - t_start) * 1000)
            _log(f"    [nav] Timeout/erreur {load_ms}ms — on continue")

        _log(f"    [cmp] Detection CMP...")
        page.wait_for_timeout(800)
        cookie_dismissed = dismiss_cookie_banner(page)
        _log(f"    [cmp] Cookie: {'CLIQUE' if cookie_dismissed else 'absent'}")
        n_removed = force_remove_overlays(page)
        if n_removed:
            _log(f"    [cmp] {n_removed} overlays supprimes")
        _log(f"    [ads] Attente adaptative (max 3s)...")
        _wait_for_ads(page, max_ms=3000)
        _log(f"    [scroll] Scroll complet...")
        scroll_full_page(page)
        page.wait_for_timeout(1000)
        page.evaluate("window.scrollTo(0, 0)")
        _log(f"    [ads] Attente auctions (max 3s)...")
        _wait_for_ads(page, max_ms=3000)

        _log(f"    [dom] Detection + highlighting...")
        ads = analyze_ads_multi_layer(page, highlight=True)
        _log(f"    [dom] {len(ads)} pubs highlightees")

        adtech = detect_adtech_scripts(page)
        trackers = detect_trackers(page)
        net_stats = compute_network_stats(intercepted)
        score, breakdown, _ = compute_score_v4(ads, adtech, net_stats)
        _log(f"    [score] v4={score} ads_dom={len(ads)} net_ad_reqs={net_stats.get('ad_requests', 0)}")

        _log(f"    [clutter] Mesure 3 positions...")
        try:
            clutter_score, clutter_detail, page_profile = compute_clutter_score(page)
            _log(f"    [clutter] score={clutter_score}")
        except Exception as e:
            _log(f"    [clutter] ERREUR: {e}")
            clutter_score, clutter_detail, page_profile = score, {}, {}

        # ad_count: max of DOM elements vs network visual estimate (creatives
        # loaded). 0 only when NEITHER sees anything -> flagged "à valider".
        net_visual_ct = net_stats.get("ad_visual_requests", 0)
        net_est_visual = round(net_visual_ct / 3) if net_visual_ct > 0 else 0
        effective_ad_count = max(len(ads), net_est_visual)

        # MLI banner — scroll back to top first
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(500)

        atf_pct = round(clutter_detail.get("atf", {}).get("ad_ratio", 0) * 100)
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
                    Encombrement: <b style="color:${info.score >= 7 ? '#10B981' : info.score >= 4 ? '#F97316' : '#EF4444'}">${info.score}/10</b> —
                    ATF ${info.atf_pct}% pub · ${info.total} element(s)
                </span>
            `;
            document.body.prepend(banner);
            document.body.style.paddingTop = '44px';
        }
        """
        page.evaluate(banner_js, {
            "domain": domain, "score": clutter_score,
            "total": effective_ad_count, "atf_pct": atf_pct,
        })

        # Screenshots
        os.makedirs(output_dir, exist_ok=True)
        safe_name = domain.replace(".", "_").replace("/", "_")

        _log(f"    [screenshot] Capture viewport...")
        viewport_path = os.path.join(output_dir, f"{safe_name}_viewport.png")
        page.screenshot(path=viewport_path, full_page=False, timeout=60_000)

        _log(f"    [screenshot] Capture fullpage...")
        fullpage_path = os.path.join(output_dir, f"{safe_name}_full.png")
        page.screenshot(path=fullpage_path, full_page=True, timeout=60_000)
        _log(f"    [screenshot] OK — {viewport_path}")

        remove_network_listener(page)

        return {
            "viewport_path": viewport_path,
            "fullpage_path": fullpage_path,
            "ad_count": effective_ad_count,
            "score": clutter_score,
            "clutter_score": clutter_score,
            "clutter_detail": clutter_detail,
            "page_profile": page_profile,
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


def _error_result(mode: str, error: str) -> dict:
    """Return a safe error result dict for any mode."""
    if mode in ("attention", "full"):
        return {
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
            "viewport_path": "", "fullpage_path": "",
            "error": error[:200],
        }
    elif mode == "screenshot":
        return {
            "viewport_path": "", "fullpage_path": "",
            "ad_count": 0, "score": 5.0, "breakdown": {},
            "cookie_dismissed": False,
            "adtech": {"scripts_detected": []},
            "trackers": {"total": 0},
            "error": error[:200],
        }
    return {"title": "", "description": "", "h1": ""}


def _new_context(browser):
    """Crée un contexte navigateur ISOLÉ (un par domaine). Repartir d'un contexte vierge
    pour chaque site réinitialise cookies/localStorage/état CMP → casse l'accumulation de
    signaux anti-bot / rate-limit qui, sur un contexte partagé, faisait planter certains
    domaines en milieu de batch (0 requête pub → faux score « propre »)."""
    context = browser.new_context(
        viewport={"width": 1280, "height": 800},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    )
    # Anti-détection : masque navigator.webdriver (signal #1 utilisé par les anti-bots).
    context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
    )
    # NB: on N'INJECTE PLUS de faux consentement (CONSENT_INIT_SCRIPT / get_consent_cookies) :
    # le mock __tcfapi renvoyait `vendor.consents: {}` → masquait le bandeau mais bloquait le
    # rendu des créas. dismiss_cookie_banner() clique désormais le VRAI CMP → vrai consentement.
    # Bound navigation / selector waits so a slow site throws instead of hanging.
    # (Note: page.evaluate of a Promise is NOT governed by this — the scroll JS self-terminates.)
    context.set_default_timeout(20_000)
    context.set_default_navigation_timeout(20_000)
    return context


def main():
    raw = sys.stdin.read()
    request = json.loads(raw)

    domains = request["domains"]
    mode = request.get("mode", "attention")
    output_dir = request.get("output_dir", "./output/screenshots")
    headless = request.get("headless", True)  # passe à False pour contourner les détections de bot
    total = len(domains)

    _log(f"[pw_worker] START mode={mode} domains={total} headless={headless}")

    results = {}

    with sync_playwright() as pw:
        _log(f"[pw_worker] Lancement navigateur (headless={headless})...")
        browser = pw.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        _log(f"[pw_worker] Navigateur pret (contexte frais par domaine)")

        for i, domain in enumerate(domains):
            t_start = _time.monotonic()
            _log(f"[{i+1}/{total}] -- {domain} --")

            # Contexte ISOLÉ par domaine (reset cookies/storage/état → anti rate-limit). cf _new_context.
            context = _new_context(browser)
            page = context.new_page()
            try:
                if mode == "full":
                    results[domain] = full_audit(page, domain, output_dir)
                elif mode == "attention":
                    results[domain] = score_attention(page, domain)
                elif mode == "screenshot":
                    results[domain] = screenshot_with_ads(page, domain, output_dir)
                else:
                    results[domain] = extract_metadata(page, domain)

                elapsed = int((_time.monotonic() - t_start) * 1000)
                err = results[domain].get("error", "")
                if err:
                    _log(f"  [RESULT] {domain} -- ERR: {err} -- {elapsed}ms")
                else:
                    score = results[domain].get("score", "?")
                    ad_count = results[domain].get("ad_count", "?")
                    _log(f"  [RESULT] {domain} -- score={score} ads={ad_count} -- {elapsed}ms OK")
            except Exception as e:
                elapsed = int((_time.monotonic() - t_start) * 1000)
                _log(f"  [CRASH] {domain} -- {str(e)[:120]} -- {elapsed}ms")
                results[domain] = _error_result(mode, str(e))
            finally:
                page.close()
                try:
                    context.close()  # libère le contexte isolé du domaine
                except Exception:
                    pass

        _log(f"[pw_worker] Fermeture navigateur...")
        browser.close()
        _log(f"[pw_worker] DONE -- {total} domaines")

    json.dump(results, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
