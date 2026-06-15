'use client';

import { useState, useCallback, useRef } from 'react';
import type { AuditRequest } from '@/lib/types';

// Direct backend URL — Next.js rewrite proxy buffers SSE, so bypass it.
const BACKEND_URL = 'http://localhost:8020/api';

export interface AuditStreamState {
  logs: string[];
  currentStep: string;
  results: unknown | null;
  isRunning: boolean;
  error: string | null;
  auditId: string | null;
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
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const startAudit = useCallback((request: AuditRequest) => {
    // Reset state
    setLogs([]);
    setCurrentStep('');
    setResults(null);
    setError(null);
    setAuditId(null);
    setIsRunning(true);

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
              try {
                const parsed = JSON.parse(rawData);
                const msg = parsed.message || parsed.msg || rawData;
                setLogs((prev) => [...prev, msg]);
              } catch {
                setLogs((prev) => [...prev, rawData]);
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

  return { logs, currentStep, results, isRunning, error, auditId, startAudit };
}
