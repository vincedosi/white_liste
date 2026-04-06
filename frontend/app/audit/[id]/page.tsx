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
import { CategoryChart } from '@/components/dashboard/CategoryChart';

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
  'Methodologie',
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
  const auditLogs = audit?.log ?? [];

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
    return sites
      .filter((s) => s.health.status === 'ok' && s.adtech)
      .map((s) => ({
        domain: s.domain,
        adtech: (s.adtech || {}) as Record<string, boolean>,
        trackers: (s.trackers as Record<string, unknown>)?.total as number || 0,
      }));
  }, [sites]);

  const sspData = useMemo(() => {
    // Aggregate top SSPs from ads_txt data
    const counts: Record<string, number> = {};
    for (const s of sites) {
      const adsTxt = s.ads_txt as Record<string, unknown> | null;
      if (!adsTxt) continue;
      // ads_txt might have top_ssps from backend or from our mapping
      const topSsps = (adsTxt as unknown as { top_ssps?: string[] }).top_ssps;
      if (topSsps && Array.isArray(topSsps)) {
        for (const ssp of topSsps) {
          counts[ssp] = (counts[ssp] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [sites]);

  const geoData = useMemo(
    () =>
      sites
        .filter((s) => s.geo)
        .map((s) => ({
          domain: s.domain,
          country: s.geo!.country ?? '--',
          countryCode: s.geo!.country_code ?? '',
          city: '--',
          ip: s.geo!.ip ?? '--',
          isp: '--',
          score: s.attention?.score,
          action:
            s.health.status !== 'ok'
              ? 'remove'
              : s.attention && s.attention.score < 4
                ? 'remove'
                : s.attention && s.attention.score < 7
                  ? 'flag'
                  : 'keep',
        })),
    [sites],
  );

  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sites) {
      if (s.category?.iab_category) {
        const cat = s.category.iab_category;
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [sites]);

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
          subtitle="Score d'encombrement"
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

      {/* Category chart */}
      {Object.keys(categoryData).length > 0 && (
        <CategoryChart data={categoryData} />
      )}

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
        <JournalPanel logs={auditLogs} />
      ) : currentTab === 'Methodologie' ? (
        <MethodologyPanel />
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

function MethodologyPanel() {
  const scoreRanges = [
    { range: '9 – 10', label: 'Page clean', desc: 'Experience premium, publicite minimale', color: '#4edea3' },
    { range: '7 – 8', label: 'Acceptable', desc: 'Standard editeur, encombrement modere', color: '#4edea3' },
    { range: '5 – 6', label: 'Page chargee', desc: 'Attention reduite, pression publicitaire notable', color: '#F97316' },
    { range: '3 – 4', label: 'Forte pression', desc: 'Experience degradee, risque MFA', color: '#EF4444' },
    { range: '0 – 2', label: 'MFA', desc: 'Made For Advertising — a supprimer', color: '#EF4444' },
  ];

  return (
    <Card>
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-on-surface mb-3">
            Score d&apos;Encombrement Visuel — Methodologie
          </h3>
          <p className="text-sm text-muted leading-relaxed">
            Le score MLI mesure l&apos;encombrement publicitaire d&apos;une page web
            tel qu&apos;il est percu par un utilisateur reel. Au lieu de simplement
            compter les publicites, nous mesurons la proportion de l&apos;ecran
            occupee par des elements publicitaires a trois moments cles de
            la navigation.
          </p>
        </div>

        {/* 3 positions diagram */}
        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-3">
            3 captures a 3 positions
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'ATF', pct: '0%', weight: '50%', desc: 'Premiere impression' },
              { name: 'Mid-scroll', pct: '50%', weight: '30%', desc: 'Navigation courante' },
              { name: 'Deep', pct: '80%', weight: '20%', desc: 'Bas de page' },
            ].map((pos) => (
              <div key={pos.name} className="bg-surface-mid rounded-lg p-3 border border-outline/10 text-center">
                <div className="font-mono text-xs font-bold text-on-surface">{pos.name}</div>
                <div className="font-mono text-[10px] text-dim mt-1">scroll {pos.pct}</div>
                <div className="font-mono text-sm font-bold text-primary mt-2">×{pos.weight}</div>
                <div className="text-[10px] text-muted mt-1">{pos.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Formula */}
        <div className="bg-surface-deepest rounded-lg p-4 border border-outline/10">
          <div className="font-mono text-xs text-primary mb-2">Formule</div>
          <div className="font-mono text-sm text-on-surface">
            Score = 10 × (1 - (ratio_ATF × 0.5 + ratio_Mid × 0.3 + ratio_Deep × 0.2))
          </div>
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            Un ratio de 15% en ATF signifie que 15% de ce que l&apos;utilisateur
            voit en premier est de la publicite. L&apos;ATF est pondere a 50% car
            c&apos;est la premiere impression qui determine si l&apos;utilisateur reste.
          </p>
        </div>

        {/* Score table */}
        <div>
          <h4 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-3">
            Grille d&apos;interpretation
          </h4>
          <div className="space-y-1">
            {scoreRanges.map((row) => (
              <div
                key={row.range}
                className="flex items-center gap-3 bg-surface-mid/30 rounded-lg px-3 py-2 border border-outline/5"
              >
                <span className="font-mono text-sm font-bold w-14" style={{ color: row.color }}>
                  {row.range}
                </span>
                <span className="font-mono text-xs font-medium text-on-surface w-28">
                  {row.label}
                </span>
                <span className="text-xs text-muted">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function JournalPanel({ logs }: { logs: string[] }) {
  const logText = logs.join('\n');

  const handleDownload = () => {
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit_log.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim">
          Journal d&apos;audit
        </h3>
        {logs.length > 0 && (
          <button
            onClick={handleDownload}
            className="text-xs font-mono text-primary hover:text-primary-dim transition-colors"
          >
            Telecharger
          </button>
        )}
      </div>
      <div className="bg-surface-deepest rounded-lg p-4 max-h-[500px] overflow-y-auto font-mono text-xs text-muted space-y-0.5">
        {logs.length > 0 ? (
          logs.map((line, i) => (
            <div key={i} className={
              line.includes('━━') ? 'text-primary font-medium mt-2' :
              line.includes('✓') ? 'text-emerald-400' :
              line.includes('✗') ? 'text-red-400' :
              ''
            }>
              {line}
            </div>
          ))
        ) : (
          <p className="text-dim">Aucun journal disponible pour cet audit.</p>
        )}
      </div>
    </Card>
  );
}
