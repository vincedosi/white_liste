'use client';

import { scoreColor } from '@/lib/score';

/**
 * Jauge donut d'une note /10 : chiffre au centre, anneau coloré proportionnel
 * à la note (rouge = mauvais → vert = bon). `value` null → anneau vide + « — ».
 */
export function ScoreDonut({
  value,
  size = 64,
  stroke = 6,
  label,
}: {
  value: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = value == null || isNaN(value as number) ? null : Math.max(0, Math.min(10, value));
  const pct = v == null ? 0 : v / 10;
  const color = scoreColor(value);
  const cx = size / 2;

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 block">
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          {v != null && (
            <circle
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-extralight tracking-tighter leading-none"
            style={{ color, fontSize: Math.round(size * 0.3) }}
          >
            {v != null ? v.toFixed(1) : '—'}
          </span>
        </div>
      </div>
      {label && (
        <span className="font-label text-[9px] uppercase tracking-[0.15em] text-on-surface-variant text-center leading-tight">
          {label}
        </span>
      )}
    </div>
  );
}
