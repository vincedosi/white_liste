/* ------------------------------------------------------------------ */
/* MLI — Design system constants                                      */
/* ------------------------------------------------------------------ */

/** Core palette — matches tailwind.config.js */
export const COLORS = {
  background: '#F8FAFC',
  surface: {
    DEFAULT: '#FFFFFF',
    low: '#FFFFFF',
    mid: '#F8FAFF',
    high: '#F1F5F9',
    deepest: '#E8ECF4',
  },
  primary: '#2563EB',
  primaryDim: '#1D4ED8',
  primaryLight: '#3B82F6',
  primaryLighter: '#60A5FA',
  accent: '#0EA5E9',
  onSurface: '#0F172A',
  muted: '#64748B',
  dim: '#94A3B8',
  outline: '#E2E8F0',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#6366F1',
  success: '#10B981',
} as const;

/** Zone colors for attention score charts */
export const ZONE_COLORS = {
  above_fold: '#EF4444',
  mid_page: '#F97316',
  deep: '#EAB308',
  footer: '#CBD5E1',
  sticky: '#8B5CF6',
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
  ok: { label: 'OK', color: COLORS.success },
  dead: { label: 'Dead', color: COLORS.danger },
  redirect: { label: 'Redirect', color: COLORS.warning },
  timeout: { label: 'Timeout', color: COLORS.warning },
  error: { label: 'Erreur', color: COLORS.danger },
} as const;

/** Brand safety display config */
export const BRAND_SAFETY_CONFIG = {
  safe: { label: 'Safe', color: COLORS.success },
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
