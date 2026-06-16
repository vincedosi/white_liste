/* MLI — Design system constants (Command dark theme) */

export const COLORS = {
  background: '#080808',
  surface: { DEFAULT: '#080808', low: '#0d0d0d', container: '#121212', high: '#181818', highest: '#1c1c1c' },
  primary: '#339dff',
  primaryElectric: '#0066ff',
  accent: '#00e5ff',
  secondary: '#00fc40',
  onSurface: '#ffffff',
  onSurfaceVariant: '#909090',
  muted: '#909090',
  dim: '#606060',
  outline: '#404040',
  danger: '#ff716c',
  warning: '#F59E0B',
  success: '#00fc40',
} as const;

export const ZONE_COLORS = {
  above_fold: '#ff716c',
  mid_page: '#F59E0B',
  deep: '#00e5ff',
  footer: '#404040',
  sticky: '#a855f6',
} as const;

export const ZONE_LABELS: Record<string, string> = {
  ads_above_fold: 'Above the fold', ads_mid_page: 'Mid-page',
  ads_deep: 'Deep', ads_footer: 'Footer', ads_sticky: 'Sticky / Fixed',
} as const;

export const STATUS_CONFIG = {
  ok: { label: 'OK', color: COLORS.success },
  dead: { label: 'Dead', color: COLORS.danger },
  redirect: { label: 'Redirect', color: COLORS.warning },
  timeout: { label: 'Timeout', color: COLORS.warning },
  error: { label: 'Erreur', color: COLORS.danger },
} as const;

export const BRAND_SAFETY_CONFIG = {
  safe: { label: 'Safe', color: COLORS.success },
  moderate: { label: 'Moderate', color: COLORS.warning },
  unsafe: { label: 'Unsafe', color: COLORS.danger },
} as const;

export const MODULE_CONFIG = {
  attention: { key: 'attention' as const, label: "Score d'attention", description: 'Detection publicitaire et score par zone', icon: 'Eye' },
  ads_txt: { key: 'ads_txt' as const, label: 'ads.txt', description: 'Verification du fichier ads.txt', icon: 'FileText' },
  geo: { key: 'geo' as const, label: 'Geolocalisation', description: 'IP, pays, TLD et langue du contenu', icon: 'Globe' },
  categorization: { key: 'categorization' as const, label: 'Categorisation IA', description: 'Categorie IAB via Mistral AI', icon: 'Brain' },
  screenshots: { key: 'screenshots' as const, label: 'Screenshots', description: 'Captures viewport et page complete', icon: 'Camera' },
} as const;

export const DEFAULT_MODULES = { attention: true, ads_txt: true, geo: true, categorization: false, screenshots: true } as const;
