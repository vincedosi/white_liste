'use client';

import { useState, useCallback, useRef } from 'react';
import type { AuditRequest } from '@/lib/types';

// Direct backend URL — Next.js rewrite proxy buffers SSE, so bypass it.
// (doit pointer sur le même port que le proxy next.config.js)
const BACKEND_URL = 'http://localhost:8021/api';

// Étapes d'un audit de site (worker), pour la barre de progression du site courant.
const SITE_STEPS: [string, number][] = [
  ['[nav]', 1], ['[cmp]', 2], ['[ads]', 3], ['[scroll]', 4],
  ['[dom]', 5], ['[score]', 6], ['[clutter]', 7], ['[screenshot]', 8],
];
const SITE_STEPS_TOTAL = 8;

export interface AuditStreamState {
  logs: string[];
  currentStep: string;
  results: unknown | null;
  isRunning: boolean;
  error: string | null;
  auditId: string | null;
  // Progression
  siteCurrent: number;   // n° du site en cours (1-indexé)
  siteTotal: number;     // nb total de sites à auditer
  currentDomain: string; // domaine en cours d'audit
  siteStepPct: number;   // 0..1 — avancée du scan du site courant
}

export interface UseAuditStreamReturn extends AuditStreamState {
  startAudit: (request: AuditRequest) => void;
}

export function useAuditStream(): UseAuditStreamReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [results, setResults] = useState<unknown | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [siteCurrent, setSiteCurrent] = useState(0);
  const [siteTotal, setSiteTotal] = useState(0);
  const [currentDomain, setCurrentDomain] = useState('');
  const [siteStepPct, setSiteStepPct] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const startAudit = useCallback((request: AuditRequest) => {
    // Reset state
    setLogs([]);
    setCurrentStep('');
    setResults(null);
    setError(null);
    setAuditId(null);
    setIsRunning(true);
    setSiteCurrent(0);
    setCurrentDomain('');
    setSiteStepPct(0);
    setSiteTotal(Array.isArray(request.domains) ? request.domains.length : 0);

    // Abort any previous request
    if (xhrRef.current) {
      xhrRef.current.abort();
    }

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    let processed = 0;
    // MUST persist across onprogress calls — SSE event/data may arrive in separate chunks
    let currentEvt = '';

    // workspace_id must be sent as query param (not in body)
    const wsId = (request as unknown as Record<string, unknown>).workspace_id as string | undefined;
    const qs = wsId ? `?workspace_id=${encodeURIComponent(wsId)}` : '';
    xhr.open('POST', `${BACKEND_URL}/audit${qs}`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onprogress = () => {
      const text = xhr.responseText;
      const newText = text.slice(processed);
      processed = text.length;

      if (!newText) return;

      const lines = newText.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Empty line = end of SSE message
        if (trimmed === '') {
          currentEvt = '';
          continue;
        }

        // SSE comment (ping/keepalive from sse-starlette)
        if (trimmed.startsWith(':')) {
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvt = trimmed.slice(6).trim();
          continue;
        }

        if (trimmed.startsWith('data:')) {
          const rawData = trimmed.slice(5).trim();

          switch (currentEvt) {
            case 'log': {
              let msg = rawData;
              try {
                const parsed = JSON.parse(rawData);
                msg = parsed.message || parsed.msg || rawData;
              } catch { /* garde rawData */ }
              setLogs((prev) => [...prev, msg]);

              // Progression : "[N/total] -- domaine --" = nouveau site
              const siteMatch = msg.match(/\[(\d+)\/(\d+)\]\s*--\s*(\S+)/);
              if (siteMatch) {
                setSiteCurrent(Number(siteMatch[1]));
                setSiteTotal(Number(siteMatch[2]));
                setCurrentDomain(siteMatch[3]);
                setSiteStepPct(0);
              } else if (msg.includes('[RESULT]')) {
                setSiteStepPct(1);
              } else {
                for (const [tok, ord] of SITE_STEPS) {
                  if (msg.includes(tok)) {
                    setSiteStepPct((p) => Math.max(p, ord / SITE_STEPS_TOTAL));
                    break;
                  }
                }
              }
              break;
            }

            case 'step': {
              try {
                const parsed = JSON.parse(rawData);
                setCurrentStep(parsed.step || rawData);
              } catch {
                setCurrentStep(rawData);
              }
              break;
            }

            case 'complete': {
              try {
                const parsed = JSON.parse(rawData);
                setResults(parsed.results ?? parsed);
                setAuditId(parsed.audit_id ?? parsed.id ?? null);
              } catch {
                setAuditId(rawData || null);
              }
              setIsRunning(false);
              break;
            }

            case 'error': {
              try {
                const parsed = JSON.parse(rawData);
                setError(parsed.message || parsed.detail || rawData);
              } catch {
                setError(rawData);
              }
              setIsRunning(false);
              break;
            }

            case 'heartbeat':
              break;

            default:
              // No event prefix — treat as log
              if (rawData) {
                setLogs((prev) => [...prev, rawData]);
              }
              break;
          }
        }
      }
    };

    xhr.onload = () => {
      setIsRunning(false);
    };

    xhr.onerror = () => {
      setError('Erreur de connexion au serveur');
      setIsRunning(false);
    };

    xhr.ontimeout = () => {
      setError('Timeout — le serveur ne repond pas');
      setIsRunning(false);
    };

    xhr.timeout = 0;
    // Strip workspace_id from body (sent as query param)
    const { workspace_id: _ws, ...body } = request as unknown as Record<string, unknown>;
    xhr.send(JSON.stringify(body));
  }, []);

  return {
    logs, currentStep, results, isRunning, error, auditId, startAudit,
    siteCurrent, siteTotal, currentDomain, siteStepPct,
  };
}
