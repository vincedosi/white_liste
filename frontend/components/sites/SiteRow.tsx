'use client';
import { Globe, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { AdAreaBar } from './AdAreaBar';
import { SiteKebabMenu } from './SiteKebabMenu';
import type { SiteEntry } from '@/lib/types';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return '—';
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'il y a 1 j';
  return `il y a ${days} j`;
}

function healthVariant(h: string | null): 'ok' | 'dead' | 'flag' | 'absent' {
  if (h === 'ok') return 'ok';
  if (h === 'dead') return 'dead';
  if (h === 'redirect' || h === 'timeout') return 'flag';
  return 'absent';
}

export function SiteRow({
  site, selected, scanning, onToggle, onOpen, onRescan, onValidate, onRemove,
}: {
  site: SiteEntry; selected: boolean; scanning: boolean;
  onToggle: () => void; onOpen: () => void;
  onRescan: () => void; onValidate: () => void; onRemove: () => void;
}) {
  return (
    <tr
      className={`border-b border-outline/20 hover:bg-surface-high cursor-pointer transition-all ${scanning ? 'opacity-50' : ''}`}
      onClick={onOpen}
    >
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-on-surface-variant/50 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-sm text-on-surface truncate">{site.domain}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 w-[280px]">
        <AdAreaBar pct={site.last_ad_surface_pct} trend={site.last_score_trend} />
      </td>
      <td className="px-3 py-3 num text-sm text-on-surface">{site.last_ad_count ?? '—'}</td>
      <td className="px-3 py-3"><Badge variant={healthVariant(site.last_health)}>{site.last_health ?? '—'}</Badge></td>
      <td className="px-3 py-3 text-xs text-on-surface-variant" title={scanning ? 'Analyse en cours…' : (site.last_audit_date ?? '')}>
        {scanning
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
          : timeAgo(site.last_audit_date)}
      </td>
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <SiteKebabMenu
          onRescan={onRescan} onValidate={onValidate}
          onOpenSite={() => window.open(`https://${site.domain}`, '_blank')}
          onOpenDetail={onOpen} onRemove={onRemove}
        />
      </td>
    </tr>
  );
}
