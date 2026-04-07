'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSites, getSiteStats, getSiteCountries } from '@/lib/api';
import type { SiteEntry, SiteStats, SiteListResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { HealthDonut } from '@/components/dashboard/HealthDonut';
import { CategoryChart } from '@/components/dashboard/CategoryChart';
import { ServerMap } from '@/components/dashboard/ServerMap';
import { COLORS } from '@/lib/constants';
import { Globe, Search, ChevronUp, ChevronDown, Minus, ArrowUpDown } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/* ── helpers ── */

function scoreColor(score: number | null): string {
  if (score == null) return 'text-on-surface-variant/40';
  if (score >= 7) return 'text-success';
  if (score >= 4) return 'text-warning';
  return 'text-danger';
}

function healthVariant(h: string | null): 'ok' | 'dead' | 'mfa' | 'flag' | 'present' | 'absent' {
  if (!h) return 'absent';
  if (h === 'ok') return 'ok';
  if (h === 'dead') return 'dead';
  if (h === 'redirect' || h === 'timeout') return 'flag';
  return 'absent';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '—';
  }
}

/* ── recharts custom tooltip ── */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#121212',
        border: '1px solid #404040',
        borderRadius: 8,
        padding: '6px 12px',
      }}
    >
      <p className="font-label text-[11px] text-on-surface-variant">{label}</p>
      <p className="font-label text-xs font-medium text-on-surface">{payload[0].value}</p>
    </div>
  );
}

/* ── SiteDetailModal ── */

function SiteDetailModal({
  site,
  onClose,
}: {
  site: SiteEntry;
  onClose: () => void;
}) {
  const score = site.last_score;
  const adtechEntries = Object.entries(site.adtech ?? {}).filter(([, v]) => v);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-1">
              Site Intelligence
            </p>
            <h2 className="text-2xl font-extralight tracking-tight text-on-surface flex items-center gap-2">
              <Globe className="w-5 h-5 text-accent/60" />
              {site.domain}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors px-3 py-1.5 border border-outline/30 rounded-lg"
          >
            Fermer
          </button>
        </div>

        {/* 2×2 metric grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Score</p>
            <span className={`text-3xl font-extralight tracking-tighter ${scoreColor(score)}`}>
              {score != null ? score.toFixed(1) : '—'}
            </span>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Sante</p>
            <Badge variant={healthVariant(site.last_health)}>
              {site.last_health ?? 'N/A'}
            </Badge>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Pubs detectees</p>
            <span className="text-3xl font-extralight tracking-tighter text-on-surface">
              {site.last_ad_count ?? '—'}
            </span>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">ads.txt</p>
            <Badge variant={site.last_ads_txt != null && site.last_ads_txt > 0 ? 'present' : 'absent'}>
              {site.last_ads_txt != null && site.last_ads_txt > 0 ? `${site.last_ads_txt} vendeurs` : 'Absent'}
            </Badge>
          </div>
        </div>

        {/* Key-value pairs */}
        <div className="space-y-2.5 mb-6">
          {[
            { label: 'Pays', value: site.last_country ?? '—' },
            { label: 'Langue', value: site.last_lang ?? '—' },
            { label: 'TLD', value: site.last_tld ?? '—' },
            { label: 'Categorie IAB', value: site.category_iab ?? '—' },
            { label: 'Temps de chargement', value: site.last_load_time_ms != null ? `${site.last_load_time_ms} ms` : '—' },
            { label: 'Nb audits', value: String(site.audit_count) },
            { label: 'Dernier audit', value: fmtDate(site.last_audit_date) },
            {
              label: 'Tendance',
              value: site.last_score_trend === 'up'
                ? '▲ Amelioration'
                : site.last_score_trend === 'down'
                ? '▼ Degradation'
                : site.last_score_trend === 'stable'
                ? '— Stable'
                : '—',
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
                {label}
              </span>
              <span className="font-label text-xs text-on-surface font-light">{value}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        {site.tags?.length > 0 && (
          <div className="mb-5">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {site.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full text-[10px] font-label font-extralight text-accent border border-accent/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Adtech */}
        {adtechEntries.length > 0 && (
          <div>
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">
              Adtech detecte
            </p>
            <div className="flex flex-wrap gap-2">
              {adtechEntries.map(([k]) => (
                <span
                  key={k}
                  className="px-2.5 py-1 rounded-full text-[10px] font-label font-extralight text-warning border border-warning/20"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SortIcon ── */

function SortIcon({ col, sortCol, sortOrder }: { col: string; sortCol: string; sortOrder: string }) {
  if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return sortOrder === 'asc'
    ? <ChevronUp className="w-3 h-3 text-accent" />
    : <ChevronDown className="w-3 h-3 text-accent" />;
}

/* ── Main Page ── */

export default function SitesPage() {
  const [tab, setTab] = useState<'dashboard' | 'sites'>('dashboard');
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);

  // Table filters
  const [page, setPage] = useState(1);
  const perPage = 100;
  const [sortCol, setSortCol] = useState('last_audit_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterAdsTxt, setFilterAdsTxt] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [selectedSite, setSelectedSite] = useState<SiteEntry | null>(null);

  /* ── Load stats + countries once ── */
  useEffect(() => {
    Promise.all([getSiteStats(), getSiteCountries()])
      .then(([s, c]) => {
        setStats(s);
        setCountries(c);
      })
      .catch(console.error);
  }, []);

  /* ── Load sites on filter/sort/page change ── */
  useEffect(() => {
    setLoading(true);
    getSites({
      page,
      per_page: perPage,
      sort: sortCol,
      order: sortOrder,
      search: search || undefined,
      health: filterHealth || undefined,
      country: filterCountry || undefined,
      ads_txt: filterAdsTxt || undefined,
      category: filterCategory || undefined,
    })
      .then((res: SiteListResponse) => {
        setSites(res.sites);
        setTotal(res.total);
        setPages(res.pages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, perPage, sortCol, sortOrder, search, filterHealth, filterCountry, filterAdsTxt, filterCategory]);

  /* ── Map data ── */
  const mapData = useMemo(
    () =>
      sites
        .filter((s) => s.last_country)
        .map((s) => ({
          domain: s.domain,
          country: s.last_country ?? '',
          countryCode: '',
          city: '',
          ip: '',
          isp: '',
          score: s.last_score ?? undefined,
          action:
            s.last_score != null && s.last_score < 4
              ? 'remove'
              : s.last_score != null && s.last_score < 7
              ? 'flag'
              : undefined,
        })),
    [sites]
  );

  /* ── Sort handler ── */
  function handleSort(col: string) {
    if (sortCol === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortOrder('desc');
    }
    setPage(1);
  }

  /* ── Score bucket colors ── */
  function bucketColor(range: string): string {
    const low = parseFloat(range.split('-')[0] ?? range);
    if (low >= 7) return COLORS.success;
    if (low >= 4) return COLORS.warning;
    return COLORS.danger;
  }

  /* ── Top countries chart data ── */
  const topCountriesData = useMemo(
    () =>
      stats?.countries
        ?.slice(0, 10)
        .map((c) => ({ name: c.country || 'Unknown', count: c.count })) ?? [],
    [stats]
  );

  /* ── Adtech chart data ── */
  const adtechData = useMemo(
    () =>
      Object.entries(stats?.adtech ?? {})
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    [stats]
  );

  /* ── Category map for CategoryChart ── */
  const categoryMap = useMemo(() => {
    const m: Record<string, number> = {};
    (stats?.categories ?? []).forEach((c) => {
      if (c.category) m[c.category] = c.count;
    });
    return m;
  }, [stats]);

  const ThCol = ({
    col,
    children,
    className = '',
  }: {
    col: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      className={`px-3 py-3 font-label text-[9px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight cursor-pointer hover:text-on-surface transition-colors select-none ${className}`}
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        <SortIcon col={col} sortCol={sortCol} sortOrder={sortOrder} />
      </span>
    </th>
  );

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-16">
      {/* Header */}
      <div className="mb-8 animate-fade-up delay-1">
        <p className="font-label text-[11px] uppercase tracking-[0.2em] text-accent mb-2">
          Sites Intelligence
        </p>
        <div className="flex items-baseline gap-4">
          <h1 className="text-4xl md:text-5xl font-extralight text-on-surface tracking-tight">
            Tous les sites
          </h1>
          {total > 0 && (
            <span className="font-label text-sm font-extralight text-on-surface-variant">
              {total.toLocaleString('fr-FR')} sites
            </span>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="mb-8 animate-fade-up delay-2">
        <div className="inline-flex bg-surface-container rounded-full p-1 gap-1">
          {(['dashboard', 'sites'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-full font-label text-[11px] uppercase tracking-[0.15em] font-extralight transition-all duration-200 ${
                tab === t
                  ? 'bg-surface-high text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t === 'dashboard' ? 'Dashboard' : 'Sites List'}
            </button>
          ))}
        </div>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div className="space-y-6 animate-fade-up delay-3">
          {/* KPI row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Sites crawles"
              value={stats?.total ?? '—'}
            />
            <KpiCard
              label="Score moyen"
              value={stats?.avg_score != null ? stats.avg_score.toFixed(1) : '—'}
              color={
                stats?.avg_score != null
                  ? stats.avg_score >= 7
                    ? COLORS.success
                    : stats.avg_score >= 4
                    ? COLORS.warning
                    : COLORS.danger
                  : undefined
              }
            />
            <KpiCard
              label="Sites MFA"
              value={stats?.mfa ?? '—'}
              color={COLORS.danger}
            />
            <KpiCard
              label="ads.txt OK"
              value={
                stats?.total
                  ? `${Math.round((stats.ads_txt_ok / stats.total) * 100)}%`
                  : '—'
              }
            />
            <KpiCard
              label="Sites alive"
              value={stats?.alive ?? '—'}
              color={COLORS.success}
            />
          </div>

          {/* KPI row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Ad count moyen"
              value={
                stats?.avg_ad_count != null ? stats.avg_ad_count.toFixed(1) : '—'
              }
            />
            <KpiCard
              label="Top pays"
              value={stats?.countries?.[0]?.country ?? '—'}
            />
            <KpiCard
              label="Redirections"
              value={stats?.redirect ?? '—'}
              color={COLORS.warning}
            />
            <KpiCard
              label="Erreurs"
              value={(stats?.dead ?? 0) + (stats?.error ?? 0)}
              color={COLORS.danger}
            />
          </div>

          {/* ServerMap */}
          <ServerMap data={mapData} />

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Score distribution */}
            <Card>
              <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
                Distribution des scores
              </span>
              <div className="w-full mt-4" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats?.score_buckets ?? []}
                    margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="range"
                      tick={{ fill: '#909090', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#909090', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={24}>
                      {(stats?.score_buckets ?? []).map((b, i) => (
                        <Cell key={i} fill={bucketColor(b.range)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Health donut */}
            <HealthDonut
              healthy={
                (stats?.alive ?? 0) - (stats?.mfa ?? 0) > 0
                  ? (stats?.alive ?? 0) - (stats?.mfa ?? 0)
                  : 0
              }
              flagged={stats?.redirect ?? 0}
              mfa={stats?.mfa ?? 0}
              dead={stats?.dead ?? 0}
            />

            {/* Top 10 countries */}
            <Card>
              <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
                Top 10 pays
              </span>
              <div className="w-full mt-4" style={{ height: Math.max(200, topCountriesData.length * 32 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topCountriesData}
                    layout="vertical"
                    margin={{ left: 10, right: 10, top: 0, bottom: 0 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fill: '#909090', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fill: '#909090', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,102,255,0.04)' }} />
                    <Bar dataKey="count" fill={COLORS.accent} radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Categories IAB */}
            <CategoryChart data={categoryMap} />

            {/* Adtech stack — full width */}
            {adtechData.length > 0 && (
              <div className="lg:col-span-2">
                <Card>
                  <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
                    Stack adtech detectee
                  </span>
                  <div
                    className="w-full mt-4"
                    style={{ height: Math.max(200, adtechData.length * 32 + 40) }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={adtechData}
                        layout="vertical"
                        margin={{ left: 10, right: 10, top: 0, bottom: 0 }}
                      >
                        <XAxis
                          type="number"
                          tick={{ fill: '#909090', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          tick={{ fill: '#909090', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,102,255,0.04)' }} />
                        <Bar dataKey="count" fill={COLORS.primary} radius={[0, 4, 4, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SITES TAB ── */}
      {tab === 'sites' && (
        <div className="space-y-4 animate-fade-up delay-3">
          {/* Filters */}
          <Card>
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/40" />
                <input
                  type="text"
                  placeholder="Rechercher un domaine…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2 bg-surface-high rounded-lg border border-outline/30 focus:border-accent/50 focus:outline-none font-label text-xs text-on-surface placeholder:text-on-surface-variant/40 transition-colors"
                />
              </div>

              {/* Health filter */}
              <select
                value={filterHealth}
                onChange={(e) => { setFilterHealth(e.target.value); setPage(1); }}
                className="px-3 py-2 bg-surface-high rounded-lg border border-outline/30 focus:border-accent/50 focus:outline-none font-label text-xs text-on-surface transition-colors"
              >
                <option value="">Toutes santes</option>
                <option value="ok">OK</option>
                <option value="dead">Dead</option>
                <option value="redirect">Redirect</option>
                <option value="timeout">Timeout</option>
                <option value="error">Erreur</option>
              </select>

              {/* Country filter */}
              <select
                value={filterCountry}
                onChange={(e) => { setFilterCountry(e.target.value); setPage(1); }}
                className="px-3 py-2 bg-surface-high rounded-lg border border-outline/30 focus:border-accent/50 focus:outline-none font-label text-xs text-on-surface transition-colors"
              >
                <option value="">Tous les pays</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* ads.txt filter */}
              <select
                value={filterAdsTxt}
                onChange={(e) => { setFilterAdsTxt(e.target.value); setPage(1); }}
                className="px-3 py-2 bg-surface-high rounded-lg border border-outline/30 focus:border-accent/50 focus:outline-none font-label text-xs text-on-surface transition-colors"
              >
                <option value="">ads.txt : tous</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
              </select>

              {/* Category filter */}
              <input
                type="text"
                placeholder="Categorie IAB…"
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                className="px-3 py-2 bg-surface-high rounded-lg border border-outline/30 focus:border-accent/50 focus:outline-none font-label text-xs text-on-surface placeholder:text-on-surface-variant/40 transition-colors min-w-[140px]"
              />
            </div>
          </Card>

          {/* Table */}
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-high">
                    <ThCol col="domain" className="pl-5">Domaine</ThCol>
                    <ThCol col="last_score">Score</ThCol>
                    <ThCol col="last_health">Sante</ThCol>
                    <ThCol col="last_ads_txt">ads.txt</ThCol>
                    <ThCol col="last_ad_count">Pubs</ThCol>
                    <ThCol col="last_load_time_ms">Temps (ms)</ThCol>
                    <ThCol col="last_country">Pays</ThCol>
                    <ThCol col="last_lang">Langue</ThCol>
                    <ThCol col="category_iab">Categorie</ThCol>
                    <ThCol col="audit_count">Audits</ThCol>
                    <ThCol col="last_audit_date">Dernier audit</ThCol>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center">
                        <span className="font-label text-xs text-on-surface-variant font-extralight animate-pulse">
                          Chargement…
                        </span>
                      </td>
                    </tr>
                  ) : sites.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center">
                        <span className="font-label text-xs text-on-surface-variant font-extralight">
                          Aucun site trouve.
                        </span>
                      </td>
                    </tr>
                  ) : (
                    sites.map((site) => (
                      <tr
                        key={site.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => setSelectedSite(site)}
                      >
                        {/* Domaine */}
                        <td className="px-5 py-3 font-label text-[12px] text-accent font-light whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Globe className="w-3 h-3 text-accent/40 shrink-0" />
                            {site.domain}
                          </span>
                        </td>
                        {/* Score */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`font-label text-sm font-light flex items-center gap-1 ${scoreColor(site.last_score)}`}>
                            {site.last_score != null ? site.last_score.toFixed(1) : '—'}
                            {site.last_score_trend === 'up' && (
                              <ChevronUp className="w-3 h-3 text-success" />
                            )}
                            {site.last_score_trend === 'down' && (
                              <ChevronDown className="w-3 h-3 text-danger" />
                            )}
                            {site.last_score_trend === 'stable' && (
                              <Minus className="w-3 h-3 text-on-surface-variant/40" />
                            )}
                          </span>
                        </td>
                        {/* Sante */}
                        <td className="px-3 py-3">
                          <Badge variant={healthVariant(site.last_health)}>
                            {site.last_health ?? '—'}
                          </Badge>
                        </td>
                        {/* ads.txt */}
                        <td className="px-3 py-3">
                          <Badge variant={site.last_ads_txt != null && site.last_ads_txt > 0 ? 'present' : 'absent'}>
                            {site.last_ads_txt != null && site.last_ads_txt > 0 ? `${site.last_ads_txt}` : '—'}
                          </Badge>
                        </td>
                        {/* Pubs */}
                        <td className="px-3 py-3 font-label text-xs text-on-surface font-extralight">
                          {site.last_ad_count ?? '—'}
                        </td>
                        {/* Temps */}
                        <td className="px-3 py-3 font-label text-xs text-on-surface-variant font-extralight whitespace-nowrap">
                          {site.last_load_time_ms != null ? site.last_load_time_ms.toLocaleString('fr-FR') : '—'}
                        </td>
                        {/* Pays */}
                        <td className="px-3 py-3 font-label text-xs text-on-surface-variant font-extralight">
                          {site.last_country ?? '—'}
                        </td>
                        {/* Langue */}
                        <td className="px-3 py-3 font-label text-xs text-on-surface-variant font-extralight">
                          {site.last_lang ?? '—'}
                        </td>
                        {/* Categorie */}
                        <td className="px-3 py-3 font-label text-[10px] text-on-surface-variant font-extralight max-w-[140px] truncate">
                          {site.category_iab ?? '—'}
                        </td>
                        {/* Audits */}
                        <td className="px-3 py-3 font-label text-xs text-on-surface-variant font-extralight">
                          {site.audit_count}
                        </td>
                        {/* Dernier audit */}
                        <td className="px-3 py-3 font-label text-xs text-on-surface-variant font-extralight whitespace-nowrap">
                          {fmtDate(site.last_audit_date)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between px-1">
            <span className="font-label text-[10px] text-on-surface-variant font-extralight">
              {total.toLocaleString('fr-FR')} sites — page {page}/{pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest font-extralight border border-outline/30 text-on-surface-variant hover:text-on-surface hover:border-outline/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Precedent
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest font-extralight border border-outline/30 text-on-surface-variant hover:text-on-surface hover:border-outline/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Site Detail Modal ── */}
      {selectedSite && (
        <SiteDetailModal site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}
    </div>
  );
}
