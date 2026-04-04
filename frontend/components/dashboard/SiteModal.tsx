'use client';

import { useEffect, useCallback, useState } from 'react';
import clsx from 'clsx';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { SiteAudit } from '@/lib/types';
import { STATUS_CONFIG } from '@/lib/constants';

interface SiteModalProps {
  site: SiteAudit | null;
  onClose: () => void;
}

function MetricBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-surface-mid rounded-lg px-3 py-2.5 border border-outline/10">
      <span className="font-mono text-[9px] uppercase tracking-[2px] text-dim">{label}</span>
      <span className="font-sans font-bold text-lg" style={{ color: color || '#dee2f0' }}>
        {value}
      </span>
    </div>
  );
}

function ZoneCol({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-dim">{label}</span>
      <span className="font-mono text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

export function SiteModal({ site, onClose }: SiteModalProps) {
  const [showFullpage, setShowFullpage] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (site) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [site, handleKeyDown]);

  if (!site) return null;

  const score = site.attention?.score ?? null;
  const adCount = site.attention?.raw_ad_count ?? 0;
  const responseTime = site.health.response_time_ms;
  const statusConf = STATUS_CONFIG[site.health.status] || STATUS_CONFIG.error;

  const scoreColor = score !== null ? (score >= 7 ? '#4edea3' : score >= 4 ? '#F97316' : '#EF4444') : '#64748b';

  const statusBadge: 'ok' | 'dead' | 'mfa' | 'flag' =
    site.health.status === 'ok' ? 'ok' : site.health.status === 'dead' ? 'dead' : 'flag';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface-low rounded-xl border border-outline/20 shadow-2xl mx-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-surface-low/95 backdrop-blur-sm border-b border-outline/10">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-lg font-bold text-on-surface">{site.domain}</h2>
            <Badge variant={statusBadge}>{statusConf.label}</Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-dim hover:text-on-surface hover:bg-surface-high transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 4 metrics row */}
          <div className="grid grid-cols-4 gap-3">
            <MetricBox
              label="Score"
              value={score !== null ? score.toFixed(1) : '--'}
              color={scoreColor}
            />
            <MetricBox label="Pubs" value={adCount} />
            <MetricBox
              label="Chargement"
              value={responseTime ? `${responseTime}ms` : '--'}
            />
            <MetricBox
              label="Cookie"
              value={site.ads_txt?.present ? 'ads.txt' : 'N/A'}
              color={site.ads_txt?.present ? '#4edea3' : '#64748b'}
            />
          </div>

          {/* Category & brand safety */}
          {site.category && (
            <div className="flex items-center gap-2 flex-wrap">
              {site.category.iab_category && (
                <Badge variant="ok">{site.category.iab_category}</Badge>
              )}
              {site.category.brand_safety && (
                <Badge
                  variant={
                    site.category.brand_safety === 'safe'
                      ? 'ok'
                      : site.category.brand_safety === 'moderate'
                        ? 'flag'
                        : 'dead'
                  }
                >
                  {site.category.brand_safety}
                </Badge>
              )}
            </div>
          )}

          {/* Zone breakdown */}
          {site.attention?.breakdown && (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-3">
                Repartition par zone
              </h3>
              <div className="grid grid-cols-5 gap-2 bg-surface-mid/50 rounded-lg p-3 border border-outline/10">
                <ZoneCol label="ATF" value={site.attention.breakdown.ads_above_fold} color="#EF4444" />
                <ZoneCol label="Mid" value={site.attention.breakdown.ads_mid_page} color="#F97316" />
                <ZoneCol label="Deep" value={site.attention.breakdown.ads_deep} color="#EAB308" />
                <ZoneCol label="Footer" value={site.attention.breakdown.ads_footer} color="#475569" />
                <ZoneCol label="Sticky" value={site.attention.breakdown.ads_sticky} color="#7C3AED" />
              </div>
            </div>
          )}

          {/* Geo info */}
          {site.geo && (
            <div className="flex items-center gap-3 text-sm font-mono text-muted">
              {site.geo.country && <span>{site.geo.country}</span>}
              {site.geo.ip && <span className="text-dim">{site.geo.ip}</span>}
              {site.geo.content_lang && <span>Lang: {site.geo.content_lang}</span>}
            </div>
          )}

          {/* ads.txt summary */}
          {site.ads_txt && site.ads_txt.present && (
            <div className="flex items-center gap-4 text-sm font-mono text-muted">
              <span>Sellers: {site.ads_txt.sellers_count ?? '--'}</span>
              <span>Direct: {site.ads_txt.direct_count ?? '--'}</span>
              <span>Reseller: {site.ads_txt.reseller_count ?? '--'}</span>
            </div>
          )}

          {/* Viewport screenshot */}
          {site.screenshots?.viewport_path && (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-3">
                Screenshot viewport
              </h3>
              <img
                src={site.screenshots.viewport_path}
                alt={`${site.domain} viewport`}
                className="w-full rounded-lg border border-outline/15"
              />
            </div>
          )}

          {/* Expandable fullpage screenshot */}
          {site.screenshots?.fullpage_path && (
            <div>
              <button
                type="button"
                onClick={() => setShowFullpage(!showFullpage)}
                className="flex items-center gap-2 font-mono text-xs text-muted hover:text-on-surface transition-colors"
              >
                {showFullpage ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Page complete
              </button>
              {showFullpage && (
                <div className="mt-2">
                  <img
                    src={site.screenshots.fullpage_path}
                    alt={`${site.domain} fullpage`}
                    className="w-full rounded-lg border border-outline/15"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
