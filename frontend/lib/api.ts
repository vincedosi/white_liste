/* ------------------------------------------------------------------ */
/* MLI — API client                                                   */
/* ------------------------------------------------------------------ */

import type { AuditRequest, AuditResult, AuditSummary } from './types';

const API_BASE = '/api';

/**
 * Start a new audit via SSE.
 * Returns an EventSource that streams AuditEvent messages.
 */
export function startAuditStream(req: AuditRequest): EventSource {
  // POST the request first, then open SSE on the returned audit ID
  // For SSE we use a GET endpoint with the audit ID
  // The backend creates the audit and returns an SSE stream
  const params = new URLSearchParams({
    domains: req.domains.join(','),
    client: req.client,
    modules: JSON.stringify(req.modules),
    ...(req.mistral_key ? { mistral_key: req.mistral_key } : {}),
  });

  const es = new EventSource(`${API_BASE}/audits/stream?${params.toString()}`);
  return es;
}

/**
 * Start audit (non-streaming) — POST request.
 */
export async function startAudit(req: AuditRequest): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/audits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * List all past audits.
 */
export async function getAudits(): Promise<AuditSummary[]> {
  const res = await fetch(`${API_BASE}/audits`);

  if (!res.ok) {
    throw new Error(`Failed to fetch audits: ${res.status}`);
  }

  const data = await res.json();
  const list = data.audits || data;

  // Map backend shape → frontend AuditSummary
  return list.map((a: Record<string, unknown>) => ({
    id: a.audit_id || a.id || '',
    audit_id: a.audit_id as string,
    client: a.client_name || a.client || '',
    client_name: a.client_name as string,
    domain_count: a.total_sites || 0,
    total_sites: a.total_sites as number,
    created_at: a.audit_date || a.created_at || '',
    audit_date: a.audit_date as string,
    status: 'completed' as const,
    avg_attention_score: a.avg_attention_score as number,
    sites_alive: a.sites_alive as number,
    sites_dead: a.sites_dead as number,
    sites_mfa: a.sites_mfa as number,
  }));
}

/**
 * Get a single audit by ID.
 * Maps backend format to frontend AuditResult format.
 */
export async function getAudit(id: string): Promise<AuditResult> {
  const res = await fetch(`${API_BASE}/audits/${encodeURIComponent(id)}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Audit introuvable');
    }
    throw new Error(`Failed to fetch audit: ${res.status}`);
  }

  const raw = await res.json();

  // Map backend shape → frontend AuditResult shape
  const stats = raw.stats || {};
  const results = raw.results || [];

  const sites = results.map((r: Record<string, unknown>) => {
    const health = (r.health || {}) as Record<string, unknown>;
    const attention = (r.attention || {}) as Record<string, unknown>;
    const details = (attention.details || {}) as Record<string, number>;
    const cat = (r.categorization || {}) as Record<string, unknown>;
    const geo = (r.geo || null) as Record<string, unknown> | null;
    const ads = (r.ads_txt || null) as Record<string, unknown> | null;
    const screenshots = (r.screenshots || null) as Record<string, unknown> | null;

    return {
      domain: r.domain as string,
      health: {
        domain: r.domain as string,
        status: health.status as string || 'ok',
        http_code: health.http_code as number | null,
        redirect_url: health.final_url as string | null,
        response_time_ms: health.response_time_ms as number | null,
      },
      attention: attention.score !== undefined ? {
        domain: r.domain as string,
        score: attention.score as number,
        raw_ad_count: attention.ad_count as number || 0,
        breakdown: {
          ads_above_fold: details.above_fold || 0,
          ads_mid_page: details.mid_page || 0,
          ads_deep: details.deep || 0,
          ads_footer: details.footer || 0,
          ads_sticky: details.sticky || 0,
        },
      } : null,
      ads_txt: ads ? {
        domain: r.domain as string,
        present: ads.has_ads_txt as boolean,
        sellers_count: ads.seller_count as number | null,
        direct_count: null,
        reseller_count: null,
        top_ssps: ads.top_ssps as string[] || [],
      } : null,
      geo: geo ? {
        domain: r.domain as string,
        ip: geo.ip_address as string | null,
        country: geo.server_country as string | null,
        country_code: geo.server_country_code as string | null,
        tld: geo.tld as string || '',
        content_lang: geo.content_lang as string | null,
      } : null,
      category: cat.category && cat.category !== 'Autre' ? {
        domain: r.domain as string,
        iab_category: cat.category as string,
        iab_code: null,
        brand_safety: null,
        confidence: cat.confidence as number | null,
      } : null,
      screenshots: screenshots ? {
        viewport_path: screenshots.viewport_path as string | null,
        fullpage_path: screenshots.fullpage_path as string | null,
      } : null,
      // Pass through extra backend fields
      action: r.action as string | undefined,
      action_reason: r.action_reason as string | undefined,
      adtech: r.adtech as Record<string, unknown> | undefined,
      trackers: r.trackers as Record<string, unknown> | undefined,
      load_time_ms: r.load_time_ms as number | undefined,
    };
  });

  return {
    id: raw.audit_id || id,
    client: raw.client_name || raw.client || '',
    created_at: raw.audit_date || '',
    completed_at: raw.audit_date || null,
    status: 'completed',
    modules: { attention: true, ads_txt: true, geo: true, categorization: true, screenshots: true },
    sites,
    summary: {
      total: stats.total || results.length,
      alive: stats.alive || 0,
      dead: stats.dead || 0,
      avg_attention_score: stats.avg_attention_score ?? null,
      ads_txt_present: 0,
      ads_txt_absent: 0,
    },
    log: raw.log || [],
  };
}

/**
 * Delete an audit.
 */
export async function deleteAudit(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/audits/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error(`Failed to delete audit: ${res.status}`);
  }
}
