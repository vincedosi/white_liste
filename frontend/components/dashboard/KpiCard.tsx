'use client';

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
    <Card>
      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
        {label}
      </span>
      <div className="flex items-baseline gap-2 mt-2">
        <span
          className="text-4xl font-extralight tracking-tighter text-on-surface glow-blue"
          style={color ? { color } : undefined}
        >
          {value}
        </span>
        {delta && (
          <span className={`font-label text-[10px] font-extralight tracking-widest ${delta.positive ? 'text-secondary' : 'text-danger'}`}>
            {delta.positive ? '+' : ''}{delta.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="font-label text-[9px] text-on-surface-variant/50 font-extralight mt-1 tracking-wider">
          {subtitle}
        </p>
      )}
    </Card>
  );
}
