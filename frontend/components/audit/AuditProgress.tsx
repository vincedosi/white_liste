'use client';

import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { AuditLog } from './AuditLog';

/** Pipeline step definitions matching backend order */
const PIPELINE_STEPS = [
  { key: 'health', label: 'Sante' },
  { key: 'attention', label: 'Attention' },
  { key: 'ads_txt', label: 'ads.txt' },
  { key: 'geo', label: 'Geo' },
  { key: 'categorization', label: 'IA' },
  { key: 'screenshots', label: 'Screenshots' },
] as const;

interface AuditProgressProps {
  isRunning: boolean;
  currentStep: string;
  logs: string[];
  error: string | null;
}

export function AuditProgress({ isRunning, currentStep, logs, error }: AuditProgressProps) {
  // Determine step statuses
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <Card className="mt-6 bg-surface-low">
      {/* Step indicator bar */}
      <div className="mb-5">
        <h3 className="text-xs font-mono font-medium text-muted uppercase tracking-wider mb-4">
          Progression
        </h3>
        <div className="flex items-center gap-1">
          {PIPELINE_STEPS.map((step, i) => {
            const isDone = currentIndex > i || (!isRunning && !error && currentIndex >= 0);
            const isActive = isRunning && currentIndex === i;
            const isPending = currentIndex < i || currentIndex === -1;

            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                {/* Step node */}
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div
                    className={clsx(
                      'w-3 h-3 rounded-full border-2 transition-all duration-300',
                      isDone && 'bg-primary border-primary shadow-[0_0_8px_rgba(78,222,163,0.4)]',
                      isActive && 'border-primary bg-primary/30 animate-pulse shadow-[0_0_12px_rgba(78,222,163,0.5)]',
                      isPending && 'border-dim/40 bg-transparent',
                    )}
                  />
                  <span
                    className={clsx(
                      'text-[10px] font-mono whitespace-nowrap transition-colors',
                      isDone && 'text-primary',
                      isActive && 'text-primary font-semibold',
                      isPending && 'text-dim/60',
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Connector line (not after last) */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div
                    className={clsx(
                      'flex-1 h-px mx-1.5 transition-colors duration-300',
                      isDone ? 'bg-primary/50' : 'bg-dim/20',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm font-mono">
          {error}
        </div>
      )}

      {/* Terminal log viewer */}
      <AuditLog logs={logs} isRunning={isRunning} />
    </Card>
  );
}
