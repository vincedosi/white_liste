import { TrendArrow } from '@/components/ui/TrendArrow';
import { Pill } from '@/components/ui/Pill';

function barColor(pct: number): string {
  if (pct < 30) return '#5C8B70'; // sauge
  if (pct < 50) return '#C28230'; // ambre
  return '#B44848'; // terracotta
}

function status(pct: number): { variant: 'calme' | 'vigilance' | 'tension'; label: string } {
  if (pct < 30) return { variant: 'calme', label: '✓ Acceptable' };
  if (pct < 50) return { variant: 'vigilance', label: '⚠ Élevé' };
  return { variant: 'tension', label: '🔴 Problématique' };
}

export function AdAreaBar({
  pct,
  trend,
}: {
  pct: number | null;
  trend: 'up' | 'down' | 'stable' | null;
}) {
  if (pct == null) {
    return <div className="font-label text-xs text-on-surface-variant/40">—</div>;
  }
  const s = status(pct);
  return (
    <div className="w-full">
      <div className="relative h-7 rounded-md overflow-hidden bg-surface-high">
        <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor(pct) }} />
        <div className="absolute inset-0 flex items-center justify-between px-2.5">
          <span className="num text-[13px] font-medium text-on-surface">{Math.round(pct)}%</span>
          <TrendArrow trend={trend} />
        </div>
      </div>
      <div className="mt-1">
        <Pill variant={s.variant}>{s.label}</Pill>
      </div>
    </div>
  );
}
