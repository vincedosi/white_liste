'use client';

import clsx from 'clsx';
import { Card } from '@/components/ui/Card';

interface KpiCardProps {
  label: string;
  value: string | number;
  color?: string;
  delta?: { value: string; positive: boolean };
  subtitle?: string;
}

export function KpiCard({ label, value, color, delta, subtitle }: KpiCardProps) {
  return (
    <Card hover className="relative overflow-hidden group">
      {/* Subtle top accent line */}
      {color && (
        <div
          className="absolute top-0 left-0 right-0 h-[1px] opacity-40 group-hover:opacity-70 transition-opacity"
          style={{ backgroundColor: color }}
        />
      )}

      <p className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-2 select-none">
        {label}
      </p>

      <p
        className="font-sans font-bold text-[36px] leading-none tracking-tight"
        style={{ color: color || 'var(--color-on-surface, #dee2f0)' }}
      >
        {value}
      </p>

      {delta && (
        <p
          className={clsx(
            'font-mono text-xs mt-2',
            delta.positive ? 'text-primary' : 'text-danger',
          )}
        >
          {delta.positive ? '+' : ''}{delta.value}
        </p>
      )}

      {subtitle && (
        <p className="font-mono text-[11px] text-dim mt-1.5">{subtitle}</p>
      )}
    </Card>
  );
}
