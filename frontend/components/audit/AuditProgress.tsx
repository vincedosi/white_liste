'use client';

import clsx from 'clsx';
import { AuditLog } from './AuditLog';

const PIPELINE_STEPS = [
  { key: 'health', label: 'Sante' },
  { key: 'attention', label: 'Attention' },
  { key: 'ads_txt', label: 'ads.txt' },
  { key: 'geo', label: 'Geo' },
  { key: 'categorization', label: 'IA' },
  { key: 'screenshots', label: 'Captures' },
] as const;

interface AuditProgressProps {
  isRunning: boolean;
  currentStep: string;
  logs: string[];
  error: string | null;
}

export function AuditProgress({ isRunning, currentStep, logs, error }: AuditProgressProps) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="bg-white rounded-2xl border border-outline shadow-card p-5 mt-6">
      {/* Step dots */}
      <div className="mb-5">
        <div className="flex items-center gap-0.5">
          {PIPELINE_STEPS.map((step, i) => {
            const isDone = currentIndex > i || (!isRunning && !error && currentIndex >= 0);
            const isActive = isRunning && currentIndex === i;
            const isPending = currentIndex < i || currentIndex === -1;

            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div className={clsx(
                    'w-2.5 h-2.5 rounded-full transition-all duration-300',
                    isDone && 'bg-primary shadow-[0_0_6px_rgba(37,99,235,0.4)]',
                    isActive && 'bg-accent animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.5)]',
                    isPending && 'bg-surface-deepest',
                  )} />
                  <span className={clsx(
                    'text-[9px] font-mono whitespace-nowrap transition-colors uppercase tracking-wider',
                    isDone && 'text-primary',
                    isActive && 'text-accent font-semibold',
                    isPending && 'text-dim/40',
                  )}>
                    {step.label}
                  </span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={clsx(
                    'flex-1 h-px mx-1 transition-colors duration-300',
                    isDone ? 'bg-primary/30' : 'bg-surface-deepest',
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-danger-light border border-danger/15 text-danger text-xs font-mono">
          {error}
        </div>
      )}

      <AuditLog logs={logs} isRunning={isRunning} />
    </div>
  );
}
