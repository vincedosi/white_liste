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
    <div className="glass-card rounded-2xl p-6 glow-card space-y-6">
      {/* Steps */}
      <div className="flex items-center gap-0.5">
        {PIPELINE_STEPS.map((step, i) => {
          const isDone = currentIndex > i || (!isRunning && !error && currentIndex >= 0);
          const isActive = isRunning && currentIndex === i;
          const isPending = currentIndex < i || currentIndex === -1;
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={clsx(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  isDone && 'bg-gradient-fluid shadow-[0_0_8px_rgba(0,102,255,0.5)]',
                  isActive && 'bg-accent animate-pulse shadow-[0_0_15px_rgba(0,229,255,0.6)]',
                  isPending && 'bg-white/[0.06]',
                )} />
                <span className={clsx(
                  'font-label text-[8px] uppercase tracking-[0.2em] whitespace-nowrap font-extralight',
                  isDone && 'text-accent',
                  isActive && 'text-accent',
                  isPending && 'text-white/20',
                )}>
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className={clsx('flex-1 h-px mx-1', isDone ? 'bg-accent/30' : 'bg-white/[0.04]')} />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-danger/5 border border-danger/15 font-label text-xs text-danger font-light">
          {error}
        </div>
      )}

      <AuditLog logs={logs} isRunning={isRunning} />
    </div>
  );
}
