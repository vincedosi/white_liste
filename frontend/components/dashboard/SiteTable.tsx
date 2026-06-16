'use client';

import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import type { SiteAudit } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';

interface SiteTableProps {
  sites: SiteAudit[];
  onDomainClick: (domain: string) => void;
}

function scoreColor(score: number | null): string {
  if (score === null) return '#606060';
  if (score >= 7) return '#00fc40';
  if (score >= 4) return '#F59E0B';
  return '#ff716c';
}

function actionLabel(site: SiteAudit): { text: string; variant: 'ok' | 'dead' | 'mfa' | 'flag' } {
  if (site.health.status === 'dead' || site.health.status === 'error') return { text: 'SUPPRIMER', variant: 'dead' };
  const score = site.attention?.score ?? null;
  if (score !== null && score < 4) return { text: 'ATTENTION', variant: 'flag' };
  return { text: 'CONSERVER', variant: 'ok' };
}

export function SiteTable({ sites, onDomainClick }: SiteTableProps) {
  return (
    <Card className="p-0 overflow-hidden" glow="none">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-high border-b border-white/[0.03]">
              {['Domaine', 'Status', 'Code', 'Temps', 'Pubs', 'Score', 'Categorie', 'Action'].map((col) => (
                <th key={col} className="px-4 py-3 font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const statusConf = STATUS_CONFIG[site.health.status] || STATUS_CONFIG.error;
              const score = site.attention?.score ?? null;
              const adCount = site.attention?.raw_ad_count ?? null;
              const action = actionLabel(site);
              const statusBadge: 'ok' | 'dead' | 'mfa' | 'flag' =
                site.health.status === 'ok' ? 'ok' : site.health.status === 'dead' ? 'dead' : 'flag';
              return (
                <tr key={site.domain} className="border-t border-white/[0.03] bg-transparent hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onDomainClick(site.domain)}
                      className="font-label text-[12px] text-accent font-light hover:text-accent/70 transition-colors text-left tracking-wide"
                    >
                      {site.domain}
                    </button>
                  </td>
                  <td className="px-4 py-2.5"><Badge variant={statusBadge}>{statusConf.label}</Badge></td>
                  <td className="px-4 py-2.5 font-label text-xs text-on-surface-variant font-extralight">{site.health.http_code ?? '--'}</td>
                  <td className="px-4 py-2.5 font-label text-xs text-on-surface-variant font-extralight">{site.health.response_time_ms ? `${site.health.response_time_ms}ms` : '--'}</td>
                  <td className="px-4 py-2.5 font-label text-xs text-on-surface-variant font-extralight">{adCount ?? '--'}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-label text-xs font-medium" style={{ color: scoreColor(score) }}>
                      {score !== null ? score.toFixed(1) : '--'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-label text-[10px] text-on-surface-variant font-extralight">{site.category?.iab_category ?? '--'}</td>
                  <td className="px-4 py-2.5"><Badge variant={action.variant}>{action.text}</Badge></td>
                </tr>
              );
            })}
            {sites.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center font-label text-xs text-on-surface-variant font-extralight">Aucun site dans cette categorie.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
