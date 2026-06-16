import { KpiCard } from '@/components/dashboard/KpiCard';
import type { SiteStats } from '@/lib/types';

export function SitesKpis({ stats }: { stats: SiteStats | null }) {
  const pctMoyen =
    stats?.avg_ad_surface_pct != null ? `${Math.round(stats.avg_ad_surface_pct)}%` : '—';
  const adsTxtPct =
    stats && stats.total > 0 ? `${Math.round((stats.ads_txt_ok / stats.total) * 100)}%` : '—';
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard label="Sites suivis" value={stats?.total ?? '—'} />
      <KpiCard label="% pub moyen" value={pctMoyen} />
      <KpiCard label="Problématiques" value={stats?.problematic ?? '—'} />
      <KpiCard label="ads.txt OK" value={adsTxtPct} />
    </div>
  );
}
