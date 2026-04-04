/* ------------------------------------------------------------------ */
/* MLI — Media-List Intelligence : shared TypeScript types            */
/* ------------------------------------------------------------------ */

/** Modules that can be toggled per audit */
export interface AuditModules {
  attention: boolean;
  ads_txt: boolean;
  geo: boolean;
  categorization: boolean;
  screenshots: boolean;
}

/** Payload sent to POST /api/audits */
export interface AuditRequest {
  domains: string[];
  client: string;
  modules: AuditModules;
  mistral_key?: string;
}

/** Server-Sent-Event envelope */
export interface AuditEvent {
  event: 'log' | 'step' | 'progress' | 'result' | 'error' | 'complete';
  data: unknown;
}

/** Log line emitted during an audit */
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  module?: string;
}

/** Step progress update */
export interface StepProgress {
  step: string;
  current: number;
  total: number;
  label: string;
}

/* ---- Site-level results ------------------------------------------ */

export type SiteStatus = 'ok' | 'dead' | 'redirect' | 'timeout' | 'error';

export interface HealthResult {
  domain: string;
  status: SiteStatus;
  http_code: number | null;
  redirect_url: string | null;
  response_time_ms: number | null;
}

export interface AttentionBreakdown {
  ads_above_fold: number;
  ads_mid_page: number;
  ads_deep: number;
  ads_footer: number;
  ads_sticky: number;
}

export interface AttentionResult {
  domain: string;
  score: number;
  raw_ad_count: number;
  breakdown: AttentionBreakdown;
}

export interface AdsTxtResult {
  domain: string;
  present: boolean;
  sellers_count: number | null;
  direct_count: number | null;
  reseller_count: number | null;
}

export interface GeoResult {
  domain: string;
  ip: string | null;
  country: string | null;
  country_code: string | null;
  tld: string;
  content_lang: string | null;
}

export interface CategoryResult {
  domain: string;
  iab_category: string | null;
  iab_code: string | null;
  brand_safety: 'safe' | 'moderate' | 'unsafe' | null;
  confidence: number | null;
}

export interface ScreenshotPaths {
  viewport_path: string | null;
  fullpage_path: string | null;
}

/** Full per-site audit result */
export interface SiteAudit {
  domain: string;
  health: HealthResult;
  attention: AttentionResult | null;
  ads_txt: AdsTxtResult | null;
  geo: GeoResult | null;
  category: CategoryResult | null;
  screenshots: ScreenshotPaths | null;
}

/* ---- Audit-level aggregates -------------------------------------- */

export interface AuditSummary {
  id: string;
  client: string;
  domain_count: number;
  created_at: string;
  status: 'running' | 'completed' | 'failed';
}

export interface AuditResult {
  id: string;
  client: string;
  created_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  modules: AuditModules;
  sites: SiteAudit[];
  summary: {
    total: number;
    alive: number;
    dead: number;
    avg_attention_score: number | null;
    ads_txt_present: number;
    ads_txt_absent: number;
  };
}
