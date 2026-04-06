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
          className="absolute top-0 left-0 right-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: color }}
        />
      )}

      <p className="font-sans text-[11px] font-medium uppercase tracking-[1.5px] text-dim mb-2 select-none">
        {label}
      </p>

      <p
        className="font-sans font-extrabold text-[36px] leading-none tracking-tight"
        style={{ color: color || '#0F172A' }}
      >
        {value}
      </p>

      {delta && (
        <p
          className={clsx(
            'font-mono text-xs mt-2',
            delta.positive ? 'text-success' : 'text-danger',
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
