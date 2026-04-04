'use client';

import { useState, useCallback, useRef } from 'react';
import type { AuditRequest } from '@/lib/types';

const API_BASE = '/api';

export interface AuditStreamState {
  logs: string[];
  currentStep: string;
  results: unknown | null;
  isRunning: boolean;
  error: string | null;
  auditId: string | null;
}

export interface UseAuditStreamReturn extends AuditStreamState {
  startAudit: (request: AuditRequest) => Promise<void>;
}

export function useAuditStream(): UseAuditStreamReturn {
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [results, setResults] = useState<unknown | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startAudit = useCallback(async (request: AuditRequest) => {
    // Reset state
    setLogs([]);
    setCurrentStep('');
    setResults(null);
    setError(null);
    setAuditId(null);
    setIsRunning(true);

    // Abort any previous stream
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null — streaming not supported');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on newlines; keep the last incomplete line in the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed === '') {
            // Empty line = end of SSE message, reset event type
            currentEvent = '';
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const rawData = trimmed.slice(5).trim();

            switch (currentEvent) {
              case 'log': {
                // Log lines can be plain text or JSON
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
                  // If data is just an audit ID string
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

              default:
                // Unknown event or no event prefix — treat as log
                break;
            }

            // Reset event after processing data
            currentEvent = '';
          }
        }
      }

      // Stream ended — if still running, mark as complete
      setIsRunning((prev) => {
        if (prev) return false;
        return prev;
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Intentional abort, do nothing
        return;
      }
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(message);
      setIsRunning(false);
    }
  }, []);

  return { logs, currentStep, results, isRunning, error, auditId, startAudit };
}
