/* ------------------------------------------------------------------ */
/* MLI — API client with auth                                         */
/* ------------------------------------------------------------------ */

import type { AuditRequest, AuditResult, AuditSummary, LoginResponse, MeResponse, Workspace, WorkspaceDetail, Whitelist, ActivityEntry, DomainEntry, DomainListResponse, CategorizeResult, SiteListResponse, SiteStats } from './types';

const API_BASE = '/api';

/* ── Token management (no-op stubs, auth disabled) ── */

export function getToken(): string | null {
  return null;
}

export function setToken(_token: string): void {
  /* auth disabled */
}

export function clearToken(): void {
  /* auth disabled */
}

/* ── Fetch (auth disabled) ── */

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, options);
}

/* ── Auth ── */

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetchWithAuth(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

/* ── Workspaces ── */

export async function getWorkspaces(): Promise<Workspace[]> {
  const res = await fetchWithAuth(`${API_BASE}/workspaces`);
  if (!res.ok) throw new Error('Failed to fetch workspaces');
  const data = await res.json();
  return data.workspaces || [];
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const res = await fetchWithAuth(`${API_BASE}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create workspace');
  return res.json();
}

export async function getWorkspace(id: string): Promise<WorkspaceDetail> {
  const res = await fetchWithAuth(`${API_BASE}/workspaces/${id}`);
  if (!res.ok) throw new Error('Failed to fetch workspace');
  return res.json();
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/workspaces/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete workspace');
}

/* ── Whitelists ── */

export async function getWhitelists(workspaceId: string): Promise<Whitelist[]> {
  const res = await fetchWithAuth(`${API_BASE}/workspaces/${workspaceId}/whitelists`);
  if (!res.ok) throw new Error('Failed to fetch whitelists');
  const data = await res.json();
  return data.whitelists || [];
}

export async function createWhitelist(workspaceId: string, name: string, domains: string[]): Promise<Whitelist> {
  const res = await fetchWithAuth(`${API_BASE}/workspaces/${workspaceId}/whitelists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, domains }),
  });
  if (!res.ok) throw new Error('Failed to create whitelist');
  return res.json();
}

/* ── Activity ── */

export async function getActivity(workspaceId: string, limit = 50, since?: string): Promise<ActivityEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (since) params.set('since', since);
  const res = await fetchWithAuth(`${API_BASE}/workspaces/${workspaceId}/activity?${params}`);
  if (!res.ok) throw new Error('Failed to fetch activity');
  const data = await res.json();
  return data.activity || [];
}

/* ── Screenshot URL helper ── */

function toScreenshotUrl(path: string | null): string | null {
  if (!path) return null;
  const filename = path.replace(/\\/g, '/').split('/').pop();
  if (!filename) return null;
  return `${API_BASE}/screenshots/${filename}`;
}

/* ── Domain check ── */

export interface DomainCheckResult {
  found: Record<string, { domain: string; audit_id: string; audit_date: string; client_name: string; score: number | null; has_screenshots: boolean }>;
  known_dead: Record<string, { last_seen: string; status: string; error: string | null; times_seen_dead: number; first_seen: string }>;
  new_domains: string[];
  total_submitted: number;
  already_crawled: number;
  known_dead_count: number;
  new_count: number;
}

export async function checkDomains(domains: string[]): Promise<DomainCheckResult> {
  const res = await fetchWithAuth(`${API_BASE}/domains/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains }),
  });
  if (!res.ok) throw new Error(`Domain check failed: ${res.status}`);
  return res.json();
}

/* ── Audits ── */

export function startAuditStream(req: AuditRequest & { workspace_id?: string }): EventSource {
  const params = new URLSearchParams({
    domains: req.domains.join(','),
    client: req.client,
    modules: JSON.stringify(req.modules),
    ...(req.mistral_key ? { mistral_key: req.mistral_key } : {}),
    ...(req.workspace_id ? { workspace_id: req.workspace_id } : {}),
  });
  // Add auth token as query param for SSE (EventSource doesn't support headers)
  const token = getToken();
  if (token) params.set('token', token);
  return new EventSource(`${API_BASE}/audits/stream?${params.toString()}`);
}

export async function startAudit(req: AuditRequest): Promise<{ id: string }> {
  const res = await fetchWithAuth(`${API_BASE}/audits`, {
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

export async function getAudits(workspaceId?: string): Promise<AuditSummary[]> {
  const params = workspaceId ? `?workspace_id=${workspaceId}` : '';
  const res = await fetchWithAuth(`${API_BASE}/audits${params}`);
  if (!res.ok) throw new Error(`Failed to fetch audits: ${res.status}`);
  const data = await res.json();
  const list = data.audits || data;
  return list.map((a: Record<string, unknown>) => ({
    id: a.audit_id || a.id || '',
    audit_id: a.audit_id as string,
    client: a.client_name || a.client || '',
    client_name: a.client_name as string,
    domain_count: a.total_sites || a.domain_count || 0,
    total_sites: a.total_sites as number,
    created_at: a.audit_date || a.created_at || '',
    audit_date: a.audit_date as string,
    status: (a.status as string) || 'completed',
    avg_attention_score: a.avg_attention_score as number,
    sites_alive: a.sites_alive as number,
    sites_dead: a.sites_dead as number,
    sites_mfa: a.sites_mfa as number,
  }));
}

export async function getAudit(id: string): Promise<AuditResult> {
  const res = await fetchWithAuth(`${API_BASE}/audits/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Audit introuvable');
    throw new Error(`Failed to fetch audit: ${res.status}`);
  }
  const raw = await res.json();
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
      health: { domain: r.domain as string, status: health.status as string || 'ok', http_code: health.http_code as number | null, redirect_url: health.final_url as string | null, response_time_ms: health.response_time_ms as number | null },
      attention: attention.score !== undefined ? { domain: r.domain as string, score: (attention.clutter_score ?? attention.score) as number, clutter_score: (attention.clutter_score ?? attention.score) as number, raw_ad_count: attention.ad_count as number || 0, breakdown: { ads_above_fold: details.above_fold || 0, ads_mid_page: details.mid_page || 0, ads_deep: details.deep || 0, ads_footer: details.footer || 0, ads_sticky: details.sticky || 0 }, clutter_detail: attention.clutter_detail as Record<string, unknown> | undefined, page_profile: attention.page_profile as Record<string, unknown> | undefined } : null,
      ads_txt: ads ? { domain: r.domain as string, present: ads.has_ads_txt as boolean, sellers_count: ads.seller_count as number | null, direct_count: null, reseller_count: null, top_ssps: ads.top_ssps as string[] || [] } : null,
      geo: geo ? { domain: r.domain as string, ip: geo.ip_address as string | null, country: geo.server_country as string | null, country_code: geo.server_country_code as string | null, tld: geo.tld as string || '', content_lang: geo.content_lang as string | null } : null,
      category: cat.category && cat.category !== 'Autre' ? { domain: r.domain as string, iab_category: cat.category as string, iab_code: null, brand_safety: null, confidence: cat.confidence as number | null } : null,
      screenshots: screenshots ? { viewport_path: toScreenshotUrl(screenshots.viewport_path as string | null), fullpage_path: toScreenshotUrl(screenshots.fullpage_path as string | null) } : null,
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
    created_at: raw.audit_date || raw.created_at || '',
    completed_at: raw.completed_at || raw.audit_date || null,
    status: raw.status || 'completed',
    modules: { attention: true, ads_txt: true, geo: true, categorization: true, screenshots: true },
    sites,
    summary: { total: stats.total || results.length, alive: stats.alive || 0, dead: stats.dead || 0, avg_attention_score: stats.avg_attention_score ?? null, ads_txt_present: 0, ads_txt_absent: 0 },
    log: raw.log || [],
  };
}

export async function deleteAudit(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/audits/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete audit: ${res.status}`);
}

/* ── Admin ── */

export async function getAdminDomains(params: {
  page?: number; per_page?: number; sort?: string; order?: string;
  search?: string; status?: string; brand_safety?: string; health?: string; category?: string;
} = {}): Promise<DomainListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
  const res = await fetchWithAuth(`${API_BASE}/admin/domains?${qs}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function updateDomain(id: string, data: Record<string, unknown>): Promise<DomainEntry> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function deleteDomainEntry(id: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function categorizeDomains(domainIds: string[], mistralKey?: string): Promise<{ results: CategorizeResult[]; processed: number; errors: number }> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/categorize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain_ids: domainIds, ...(mistralKey ? { mistral_key: mistralKey } : {}) }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function bulkDomainAction(domainIds: string[], action: string, value?: string): Promise<void> {
  const res = await fetchWithAuth(`${API_BASE}/admin/domains/bulk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain_ids: domainIds, action, value }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

/* ── Sites Intelligence ── */

export async function getSites(params: {
  page?: number;
  per_page?: number;
  sort?: string;
  order?: string;
  search?: string;
  health?: string;
  country?: string;
  ads_txt?: string;
  score_min?: number;
  score_max?: number;
  category?: string;
  ad_pct_min?: number;
  ad_pct_max?: number;
  stale_days?: number;
} = {}): Promise<SiteListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const res = await fetchWithAuth(`${API_BASE}/sites?${qs.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch sites: ${res.status}`);
  return res.json();
}

export async function getSiteStats(): Promise<SiteStats> {
  const res = await fetchWithAuth(`${API_BASE}/sites/stats`);
  if (!res.ok) throw new Error(`Failed to fetch site stats: ${res.status}`);
  return res.json();
}

export async function getSiteCountries(): Promise<string[]> {
  const res = await fetchWithAuth(`${API_BASE}/sites/countries`);
  if (!res.ok) throw new Error(`Failed to fetch countries: ${res.status}`);
  const data = await res.json();
  return data.countries;
}
