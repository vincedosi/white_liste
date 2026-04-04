'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Loader2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { HealthDonut } from '@/components/dashboard/HealthDonut';
import { AttentionBar } from '@/components/dashboard/AttentionBar';
import { AdTechTable } from '@/components/dashboard/AdTechTable';
import { SiteTable } from '@/components/dashboard/SiteTable';
import { SiteModal } from '@/components/dashboard/SiteModal';
import { SspChart } from '@/components/dashboard/SspChart';
import { ServerMap } from '@/components/dashboard/ServerMap';

import { getAudit } from '@/lib/api';
import type { AuditResult, SiteAudit } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Tab definitions                                                     */
/* ------------------------------------------------------------------ */
const TABS = [
  'Sites sains',
  'Attention faible',
  'A supprimer',
  'Vue complete',
  'Ad-Tech',
  'Geo',
  'Journal',
] as const;

type TabName = (typeof TABS)[number];

/* ------------------------------------------------------------------ */
/* Helper: filter sites per tab                                        */
/* ------------------------------------------------------------------ */
function filterSites(sites: SiteAudit[], tab: TabName): SiteAudit[] {
  switch (tab) {
    case 'Sites sains':
      return sites.filter(
        (s) => s.health.status === 'ok' && (s.attention?.score ?? 10) >= 7,
      );
    case 'Attention faible':
      return sites.filter(
        (s) =>
          s.health.status === 'ok' &&
          s.attention?.score !== undefined &&
          s.attention.score < 7 &&
          s.attention.score >= 4,
      );
    case 'A supprimer':
      return sites.filter(
        (s) =>
          s.health.status !== 'ok' ||
          (s.attention?.score !== undefined && s.attention.score < 4),
      );
    case 'Vue complete':
    default:
      return sites;
  }
}

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */
export default function AuditResultPage() {
  const params = useParams();
  const auditId = params.id as string;

  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<number>(0);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  /* Fetch audit data */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAudit(auditId)
      .then((data) => {
        if (!cancelled) setAudit(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Erreur inconnue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auditId]);

  /* Derived data */
  const sites = audit?.sites ?? [];

  const healthCounts = useMemo(() => {
    let healthy = 0;
    let flagged = 0;
    let mfa = 0;
    let dead = 0;
    for (const s of sites) {
      if (s.health.status !== 'ok') {
        dead++;
      } else if (s.attention && s.attention.score < 4) {
        mfa++;
      } else if (s.attention && s.attention.score < 7) {
        flagged++;
      } else {
        healthy++;
      }
    }
    return { healthy, flagged, mfa, dead };
  }, [sites]);

  const avgScore = useMemo(() => {
    const scored = sites.filter((s) => s.attention?.score != null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, s) => sum + (s.attention?.score ?? 0), 0) / scored.length;
  }, [sites]);

  const attentionData = useMemo(
    () =>
      sites
        .filter((s) => s.attention?.breakdown)
        .map((s) => ({
          domain: s.domain,
          atf: s.attention!.breakdown.ads_above_fold,
          mid: s.attention!.breakdown.ads_mid_page,
          deep: s.attention!.breakdown.ads_deep,
          footer: s.attention!.breakdown.ads_footer,
          sticky: s.attention!.breakdown.ads_sticky,
        }))
        .sort(
          (a, b) =>
            b.atf + b.mid + b.deep + b.footer + b.sticky -
            (a.atf + a.mid + a.deep + a.footer + a.sticky),
        )
        .slice(0, 15),
    [sites],
  );

  const adTechData = useMemo(() => {
    // Placeholder: derive from attention or ads_txt
    // In a real implementation the backend would return adtech details
    return sites
      .filter((s) => s.health.status === 'ok')
      .map((s) => ({
        domain: s.domain,
        adtech: {} as Record<string, boolean>,
        trackers: 0,
      }));
  }, [sites]);

  const sspData = useMemo(() => {
    // Aggregate sellers from ads_txt if available
    const counts: Record<string, number> = {};
    for (const s of sites) {
      if (s.ads_txt?.present && s.ads_txt.sellers_count) {
        // Without detailed SSP data we use a placeholder
      }
    }
    // Return empty for now -- backend should provide SSP breakdown
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [sites]);

  const geoData = useMemo(
    () =>
      sites
        .filter((s) => s.geo)
        .map((s) => ({
          domain: s.domain,
          country: s.geo!.country ?? '--',
          city: '--',
          ip: s.geo!.ip ?? '--',
          isp: '--',
        })),
    [sites],
  );

  const selectedSite = useMemo(
    () => sites.find((s) => s.domain === selectedDomain) ?? null,
    [sites, selectedDomain],
  );

  const currentTab = TABS[activeTab];
  const filteredSites = useMemo(
    () => filterSites(sites, currentTab),
    [sites, currentTab],
  );

  const cleanedCount = healthCounts.mfa + healthCounts.dead;

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <div className="min-h-screen p-6 lg:p-10 lg:pt-8">
        <PageHeader auditId={auditId} />
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 size={28} className="text-primary animate-spin mb-5" />
          <h2 className="text-base font-semibold text-on-surface mb-1.5">
            Chargement...
          </h2>
          <p className="text-sm text-muted max-w-sm">
            Recuperation des resultats de l&apos;audit en cours.
          </p>
        </Card>
      </div>
    );
  }

  /* ---- Error state ---- */
  if (error) {
    return (
      <div className="min-h-screen p-6 lg:p-10 lg:pt-8">
        <PageHeader auditId={auditId} />
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle size={28} className="text-danger mb-5" />
          <h2 className="text-base font-semibold text-on-surface mb-1.5">
            Erreur
          </h2>
          <p className="text-sm text-muted max-w-sm">{error}</p>
        </Card>
      </div>
    );
  }

  if (!audit) return null;

  /* ---- Main dashboard ---- */
  return (
    <div className="min-h-screen p-6 lg:p-10 lg:pt-8 space-y-6">
      <PageHeader auditId={auditId} client={audit.client} createdAt={audit.created_at} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Sites audites"
          value={audit.summary.total}
          color="#dee2f0"
          subtitle={`Client: ${audit.client}`}
        />
        <KpiCard
          label="Sites nettoyes"
          value={cleanedCount}
          color="#EF4444"
          delta={
            audit.summary.total > 0
              ? {
                  value: `${((cleanedCount / audit.summary.total) * 100).toFixed(0)}%`,
                  positive: false,
                }
              : undefined
          }
        />
        <KpiCard
          label="Sites sains"
          value={healthCounts.healthy}
          color="#4edea3"
          delta={
            audit.summary.total > 0
              ? {
                  value: `${((healthCounts.healthy / audit.summary.total) * 100).toFixed(0)}%`,
                  positive: true,
                }
              : undefined
          }
        />
        <KpiCard
          label="Score moyen"
          value={avgScore !== null ? avgScore.toFixed(1) : '--'}
          color={
            avgScore !== null
              ? avgScore >= 7
                ? '#4edea3'
                : avgScore >= 4
                  ? '#F97316'
                  : '#EF4444'
              : '#64748b'
          }
          subtitle="Attention score"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HealthDonut {...healthCounts} />
        {sspData.length > 0 ? (
          <SspChart data={sspData} />
        ) : (
          <Card className="flex items-center justify-center">
            <p className="text-sm text-dim font-mono">
              Donnees SSP non disponibles
            </p>
          </Card>
        )}
      </div>

      {/* Attention bar chart */}
      {attentionData.length > 0 && <AttentionBar data={attentionData} />}

      {/* Tabs */}
      <div className="bg-surface-low rounded-xl p-1 flex gap-1 overflow-x-auto">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(i)}
            className={clsx(
              'px-4 py-2 rounded-lg font-mono text-xs tracking-wide whitespace-nowrap transition-all',
              activeTab === i
                ? 'bg-surface-high text-primary font-medium'
                : 'text-muted hover:text-on-surface hover:bg-surface-mid/50',
            )}
          >
            {tab}
            {/* Count badge */}
            {i < 4 && (
              <span className="ml-2 text-[10px] text-dim">
                ({filterSites(sites, TABS[i]).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {currentTab === 'Ad-Tech' ? (
        <AdTechTable data={adTechData} onDomainClick={setSelectedDomain} />
      ) : currentTab === 'Geo' ? (
        <ServerMap data={geoData} />
      ) : currentTab === 'Journal' ? (
        <JournalPanel />
      ) : (
        <SiteTable sites={filteredSites} onDomainClick={setSelectedDomain} />
      )}

      {/* Site modal */}
      <SiteModal site={selectedSite} onClose={() => setSelectedDomain(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function PageHeader({
  auditId,
  client,
  createdAt,
}: {
  auditId: string;
  client?: string;
  createdAt?: string;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
          <BarChart3 size={16} className="text-primary" />
        </div>
        <h1 className="text-2xl font-sans font-bold tracking-tight text-on-surface">
          Resultats de l&apos;audit
        </h1>
      </div>
      <div className="flex items-center gap-4 ml-11">
        <p className="text-sm text-muted font-mono">ID: {auditId}</p>
        {client && <p className="text-sm text-dim font-mono">Client: {client}</p>}
        {createdAt && (
          <p className="text-sm text-dim font-mono">
            {new Date(createdAt).toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function JournalPanel() {
  return (
    <Card>
      <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-4">
        Journal d&apos;audit
      </h3>
      <div className="bg-surface-mid rounded-lg p-4 max-h-[400px] overflow-y-auto font-mono text-xs text-muted space-y-1">
        <p className="text-dim">
          Le journal sera disponible pour les audits lances depuis cette interface.
        </p>
      </div>
    </Card>
  );
}
