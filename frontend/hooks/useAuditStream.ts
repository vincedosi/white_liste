'use client';

import { useState, useCallback, useRef } from 'react';
import type { AuditRequest } from '@/lib/types';

// Direct backend URL — Next.js rewrite proxy buffers SSE, so bypass it.
const BACKEND_URL = 'http://localhost:8002/api';

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
    let processed = 0; // how many chars we've already parsed

    xhr.open('POST', `${BACKEND_URL}/audit`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    // Process SSE chunks as they arrive
    xhr.onprogress = () => {
      const text = xhr.responseText;
      const newText = text.slice(processed);
      processed = text.length;

      if (!newText) return;

      // Parse SSE lines
      const lines = newText.split('\n');
      let currentEvt = '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') {
          currentEvt = '';
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
              break;
          }

          currentEvt = '';
        }
      }
    };

    xhr.onload = () => {
      // Stream finished — ensure we mark as done
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

    // No timeout — audits can take 30+ minutes
    xhr.timeout = 0;

    xhr.send(JSON.stringify(request));
  }, []);

  return { logs, currentStep, results, isRunning, error, auditId, startAudit };
}
