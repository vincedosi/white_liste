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
  if (score === null) return '#64748b';
  if (score >= 7) return '#4edea3';
  if (score >= 4) return '#F97316';
  return '#EF4444';
}

function actionLabel(site: SiteAudit): { text: string; variant: 'ok' | 'dead' | 'mfa' | 'flag' } {
  if (site.health.status === 'dead' || site.health.status === 'error') {
    return { text: 'Supprimer', variant: 'dead' };
  }
  const score = site.attention?.score ?? null;
  if (score !== null && score < 4) {
    return { text: 'Attention', variant: 'flag' };
  }
  return { text: 'Conserver', variant: 'ok' };
}

export function SiteTable({ sites, onDomainClick }: SiteTableProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-high">
              {['Domaine', 'Status', 'Code', 'Temps', 'Pubs', 'Score', 'Categorie', 'Action'].map(
                (col) => (
                  <th
                    key={col}
                    className="px-4 py-3 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium whitespace-nowrap"
                  >
                    {col}
                  </th>
                ),
              )}
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
                <tr
                  key={site.domain}
                  className="border-t border-outline/10 bg-surface-low hover:bg-surface-mid transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => onDomainClick(site.domain)}
                      className="font-mono text-sm text-primary hover:text-primary/80 hover:underline transition-colors text-left"
                    >
                      {site.domain}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusBadge}>{statusConf.label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm text-muted">
                    {site.health.http_code ?? '--'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm text-muted">
                    {site.health.response_time_ms ? `${site.health.response_time_ms}ms` : '--'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm text-muted">
                    {adCount ?? '--'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="font-mono text-sm font-bold"
                      style={{ color: scoreColor(score) }}
                    >
                      {score !== null ? score.toFixed(1) : '--'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {site.category?.iab_category ?? '--'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={action.variant}>{action.text}</Badge>
                  </td>
                </tr>
              );
            })}
            {sites.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-dim">
                  Aucun site dans cette categorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
