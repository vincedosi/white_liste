'use client';

import { useState, useEffect } from 'react';
import { getSites, getSiteCountries, categorizeDomains } from '@/lib/api';
import type { SiteEntry, SiteListResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Globe, Search, ChevronUp, ChevronDown, Minus, ArrowUpDown } from 'lucide-react';
import { SiteDetailModal } from '@/components/sites/SiteDetailModal';
import { CategorizeModal } from '@/components/sites/CategorizeModal';

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

/* ── SortIcon ── */

function SortIcon({ col, sortCol, sortOrder }: { col: string; sortCol: string; sortOrder: string }) {
  if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  return sortOrder === 'asc'
    ? <ChevronUp className="w-3 h-3 text-accent" />
    : <ChevronDown className="w-3 h-3 text-accent" />;
}

/* ── Main Page ── */

export default function SitesPage() {
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

  // Categorization modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [mistralKey, setMistralKey] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catProgress, setCatProgress] = useState('');
  const [catDone, setCatDone] = useState(false);

  /* ── Load country list for the filter dropdown once ── */
  useEffect(() => {
    getSiteCountries().then(setCountries).catch(console.error);
  }, []);

  /* ── Bulk categorize ── */
  const handleCategorize = async () => {
    if (!mistralKey.trim()) return;
    setCatLoading(true);
    setCatProgress('');
    setCatDone(false);

    try {
      // Get all uncategorized domain IDs
      const allRes = await getSites({ per_page: 500 });
      const uncategorized = allRes.sites.filter((s) => !s.category_iab);
      if (uncategorized.length === 0) {
        setCatProgress('Tous les sites sont deja categorises !');
        setCatDone(true);
        setCatLoading(false);
        return;
      }

      setCatProgress(`Categorisation de ${uncategorized.length} sites en cours...`);

      // Process in batches of 10 to show progress
      const batchSize = 10;
      let processed = 0;
      let errors = 0;
      for (let i = 0; i < uncategorized.length; i += batchSize) {
        const batch = uncategorized.slice(i, i + batchSize);
        const ids = batch.map((s) => s.id);
        try {
          const res = await categorizeDomains(ids, mistralKey.trim());
          processed += res.processed;
          errors += res.errors;
        } catch (e) {
          errors += batch.length;
        }
        setCatProgress(`${Math.min(i + batchSize, uncategorized.length)} / ${uncategorized.length} sites traites...`);
      }

      setCatProgress(`Termine ! ${processed} categorises, ${errors} erreurs.`);
      setCatDone(true);

      // Refresh the table to show the new categories
      setPage(1);
    } catch (e) {
      setCatProgress(`Erreur: ${e instanceof Error ? e.message : 'Inconnue'}`);
    } finally {
      setCatLoading(false);
    }
  };

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

      {/* ── Sites list ── */}
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
                          {site.editorial_status === 'to_review' ? (
                            <span className="font-label text-[10px] uppercase tracking-wider text-warning border border-warning/30 rounded px-2 py-0.5">
                              À valider
                            </span>
                          ) : (
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
                          )}
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

      {/* ── Site Detail Modal ── */}
      {selectedSite && (
        <SiteDetailModal site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}

      {/* ── Categorization Modal ── */}
      {showCatModal && (
        <CategorizeModal
          mistralKey={mistralKey} onKeyChange={setMistralKey}
          loading={catLoading} progress={catProgress} done={catDone}
          onClose={() => { setShowCatModal(false); setCatDone(false); setCatProgress(''); }}
          onRun={handleCategorize}
        />
      )}
    </div>
  );
}
