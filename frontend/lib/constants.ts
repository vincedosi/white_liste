/* ------------------------------------------------------------------ */
/* MLI — Design system constants                                      */
/* ------------------------------------------------------------------ */

/** Core palette — matches tailwind.config.js */
export const COLORS = {
  background: '#0e141d',
  surface: {
    DEFAULT: '#0e141d',
    low: '#161c25',
    mid: '#1a2029',
    high: '#252a34',
    deepest: '#090e17',
  },
  primary: '#4edea3',
  primaryDim: '#10B981',
  onSurface: '#dee2f0',
  muted: '#94a3b8',
  dim: '#64748b',
  outline: '#3c4a42',
  danger: '#EF4444',
  warning: '#F97316',
  info: '#818CF8',
} as const;

/** Zone colors for attention score charts */
export const ZONE_COLORS = {
  above_fold: '#4edea3',   // primary — highest impact
  mid_page: '#10B981',     // primary dim
  deep: '#818CF8',         // info — lower impact
  footer: '#64748b',       // dim — minimal impact
  sticky: '#F97316',       // warning — intrusive
} as const;

/** Zone labels (French) */
export const ZONE_LABELS: Record<string, string> = {
  ads_above_fold: 'Above the fold',
  ads_mid_page: 'Mid-page',
  ads_deep: 'Deep',
  ads_footer: 'Footer',
  ads_sticky: 'Sticky / Fixed',
} as const;

/** Status display config */
export const STATUS_CONFIG = {
  ok: { label: 'OK', color: COLORS.primary },
  dead: { label: 'Dead', color: COLORS.danger },
  redirect: { label: 'Redirect', color: COLORS.warning },
  timeout: { label: 'Timeout', color: COLORS.warning },
  error: { label: 'Erreur', color: COLORS.danger },
} as const;

/** Brand safety display config */
export const BRAND_SAFETY_CONFIG = {
  safe: { label: 'Safe', color: COLORS.primary },
  moderate: { label: 'Moderate', color: COLORS.warning },
  unsafe: { label: 'Unsafe', color: COLORS.danger },
} as const;

/** Audit modules metadata */
export const MODULE_CONFIG = {
  attention: {
    key: 'attention' as const,
    label: 'Score d\'attention',
    description: 'Detection publicitaire et score par zone',
    icon: 'Eye',
  },
  ads_txt: {
    key: 'ads_txt' as const,
    label: 'ads.txt',
    description: 'Verification du fichier ads.txt',
    icon: 'FileText',
  },
  geo: {
    key: 'geo' as const,
    label: 'Geolocalisation',
    description: 'IP, pays, TLD et langue du contenu',
    icon: 'Globe',
  },
  categorization: {
    key: 'categorization' as const,
    label: 'Categorisation IA',
    description: 'Categorie IAB via Mistral AI',
    icon: 'Brain',
  },
  screenshots: {
    key: 'screenshots' as const,
    label: 'Screenshots',
    description: 'Captures viewport et page complete',
    icon: 'Camera',
  },
} as const;

/** Default modules selection */
export const DEFAULT_MODULES = {
  attention: true,
  ads_txt: true,
  geo: true,
  categorization: false,
  screenshots: true,
} as const;
