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

  return res.json();
}

/**
 * Get a single audit by ID.
 */
export async function getAudit(id: string): Promise<AuditResult> {
  const res = await fetch(`${API_BASE}/audits/${encodeURIComponent(id)}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Audit introuvable');
    }
    throw new Error(`Failed to fetch audit: ${res.status}`);
  }

  return res.json();
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
