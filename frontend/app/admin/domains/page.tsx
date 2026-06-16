'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ChevronDown, ChevronUp, MoreHorizontal, Trash2, Tag, CheckCircle, XCircle, Brain, ArrowUp, ArrowDown, Minus, Columns3, X } from 'lucide-react';
import { getAdminDomains, updateDomain, deleteDomainEntry, categorizeDomains, bulkDomainAction } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import type { DomainEntry, DomainListResponse } from '@/lib/types';
import clsx from 'clsx';

const DEFAULT_COLUMNS = ['domain', 'brand_safety', 'editorial_status', 'category_iab', 'last_score', 'last_health', 'last_country', 'last_audit_date'];
const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: 'domain', label: 'Domaine' },
  { key: 'brand_safety', label: 'Brand Safety' },
  { key: 'editorial_status', label: 'Statut' },
  { key: 'category_iab', label: 'Categorie' },
  { key: 'last_score', label: 'Score' },
  { key: 'last_health', label: 'Health' },
  { key: 'last_country', label: 'Pays' },
  { key: 'last_lang', label: 'Langue' },
  { key: 'last_audit_date', label: 'Dernier audit' },
  { key: 'last_ad_count', label: 'Pubs' },
  { key: 'last_ads_txt', label: 'ads.txt' },
  { key: 'last_trackers', label: 'Trackers' },
  { key: 'last_load_time_ms', label: 'Chargement' },
  { key: 'last_tld', label: 'TLD' },
  { key: 'audit_count', label: 'Nb audits' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags_json', label: 'Tags' },
];

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === 'up') return <ArrowUp size={10} className="text-secondary" />;
  if (trend === 'down') return <ArrowDown size={10} className="text-danger" />;
  return <Minus size={10} className="text-on-surface-variant/40" />;
}

function BrandSafetyBadge({ value }: { value: string | null }) {
  if (!value) return <span className="font-label text-[9px] text-on-surface-variant/40 uppercase tracking-wider font-extralight">—</span>;
  const styles = {
    safe: 'text-secondary',
    moderate: 'text-warning',
    unsafe: 'text-danger',
  };
  return <span className={clsx('font-label text-[9px] uppercase tracking-[0.15em] font-medium', styles[value as keyof typeof styles])}>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'EN ATTENTE', cls: 'text-on-surface-variant' },
    validated: { label: 'VALIDE', cls: 'text-secondary' },
    blacklisted: { label: 'BLACKLISTE', cls: 'text-danger' },
  };
  const cfg = map[value] || map.pending;
  return <span className={clsx('font-label text-[9px] uppercase tracking-[0.15em] font-extralight', cfg.cls)}>{cfg.label}</span>;
}

function relativeDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'hier';
  if (diff < 30) return `il y a ${diff}j`;
  return d.toLocaleDateString('fr-FR');
}

export default function AdminDomainsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DomainListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('domain');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBs, setFilterBs] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLUMNS);
  const [showColPicker, setShowColPicker] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout>();

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminDomains({
        page, per_page: 50, sort, order,
        search: searchDebounced, status: filterStatus, brand_safety: filterBs, health: filterHealth,
      });
      setData(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page, sort, order, searchDebounced, filterStatus, filterBs, filterHealth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [searchDebounced, filterStatus, filterBs, filterHealth]);

  const toggleSort = (col: string) => {
    if (sort === col) setOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder('asc'); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggleAll = () => {
    if (!data) return;
    const allIds = data.domains.map(d => d.id);
    const allSelected = allIds.every(id => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    try {
      await updateDomain(id, updates);
      fetchData();
    } catch { /* ignore */ }
    setActiveMenu(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce domaine ?')) return;
    try { await deleteDomainEntry(id); fetchData(); } catch { /* ignore */ }
    setActiveMenu(null);
  };

  const handleCategorize = async (ids: string[]) => {
    setCategorizing(true);
    try { await categorizeDomains(ids); fetchData(); } catch { /* ignore */ }
    finally { setCategorizing(false); }
    setSelected(new Set());
  };

  const handleBulk = async (action: string, value?: string) => {
    setBulkLoading(true);
    try { await bulkDomainAction(Array.from(selected), action, value); fetchData(); } catch { /* ignore */ }
    finally { setBulkLoading(false); }
    setSelected(new Set());
  };

  if (user?.role !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-danger font-label text-sm">Acces refuse</p></div>;
  }

  const domains = data?.domains || [];

  function renderCell(d: DomainEntry, col: string) {
    switch (col) {
      case 'domain': return <span className="font-label text-[12px] text-accent font-light tracking-wide">{d.domain}</span>;
      case 'brand_safety': return <BrandSafetyBadge value={d.brand_safety} />;
      case 'editorial_status': return <StatusBadge value={d.editorial_status} />;
      case 'category_iab': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{d.category_iab || '—'}</span>;
      case 'last_score': return (
        <span className="flex items-center gap-1">
          <span className={clsx('font-label text-xs font-medium', d.last_score && d.last_score >= 7 ? 'text-secondary' : d.last_score && d.last_score >= 4 ? 'text-warning' : d.last_score ? 'text-danger' : 'text-on-surface-variant/40')}>
            {d.last_score?.toFixed(1) || '—'}
          </span>
          <TrendIcon trend={d.last_score_trend} />
        </span>
      );
      case 'last_health': return <span className={clsx('font-label text-[9px] uppercase tracking-wider font-extralight', d.last_health === 'ok' ? 'text-secondary' : d.last_health === 'dead' ? 'text-danger' : 'text-on-surface-variant/40')}>{d.last_health || '—'}</span>;
      case 'last_country': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{[d.last_country, d.last_lang].filter(Boolean).join(' · ') || '—'}</span>;
      case 'last_audit_date': return <span className="font-label text-[10px] text-on-surface-variant/50 font-extralight">{relativeDate(d.last_audit_date)}</span>;
      case 'last_ad_count': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{d.last_ad_count ?? '—'}</span>;
      case 'last_ads_txt': return <span className={clsx('font-label text-[9px] uppercase tracking-wider font-extralight', d.last_ads_txt ? 'text-secondary' : 'text-on-surface-variant/40')}>{d.last_ads_txt ? 'OUI' : '—'}</span>;
      case 'last_trackers': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{d.last_trackers ?? '—'}</span>;
      case 'last_load_time_ms': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{d.last_load_time_ms ? `${d.last_load_time_ms}ms` : '—'}</span>;
      case 'last_tld': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{d.last_tld || '—'}</span>;
      case 'audit_count': return <span className="font-label text-[10px] text-on-surface-variant font-extralight">{d.audit_count}</span>;
      case 'notes': return <span className="font-label text-[10px] text-on-surface-variant/50 font-extralight truncate max-w-[120px] block">{d.notes || '—'}</span>;
      case 'tags_json': return <span className="font-label text-[10px] text-accent/60 font-extralight">{(d.tags || []).join(', ') || '—'}</span>;
      default: return '—';
    }
  }

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">Admin</span>
          <h1 className="text-2xl font-extralight tracking-tight text-on-surface mt-1">Domain Database</h1>
          {data && <p className="font-label text-[9px] text-on-surface-variant/50 font-extralight mt-1">{data.total} domaines</p>}
        </div>
        <div className="relative">
          <button onClick={() => setShowColPicker(!showColPicker)} className="h-9 px-3 rounded-xl bg-white/[0.03] border border-white/[0.05] font-label text-[10px] text-on-surface-variant uppercase tracking-[0.15em] font-extralight hover:border-accent/20 transition-all flex items-center gap-2">
            <Columns3 size={13} /> Colonnes
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-2 glass-card rounded-xl p-3 z-50 min-w-[200px] space-y-1 border border-white/[0.08]">
              {ALL_COLUMNS.map(c => (
                <label key={c.key} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/[0.03] cursor-pointer">
                  <input type="checkbox" checked={visibleCols.includes(c.key)} onChange={() => setVisibleCols(prev => prev.includes(c.key) ? prev.filter(k => k !== c.key) : [...prev, c.key])} className="accent-accent" />
                  <span className="font-label text-[10px] text-on-surface-variant font-extralight">{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un domaine..."
            className="w-full h-9 bg-surface-container border border-outline-variant rounded-xl pl-9 pr-4 text-sm text-on-surface font-extralight placeholder:text-on-surface-variant/30 focus:outline-none focus:border-accent/40 transition-all"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Statut', value: filterStatus, setter: setFilterStatus, options: ['', 'pending', 'validated', 'blacklisted'] },
            { label: 'Brand Safety', value: filterBs, setter: setFilterBs, options: ['', 'safe', 'moderate', 'unsafe'] },
            { label: 'Health', value: filterHealth, setter: setFilterHealth, options: ['', 'ok', 'dead'] },
          ].map(f => (
            <select key={f.label} value={f.value} onChange={e => f.setter(e.target.value)}
              className="h-8 px-2 rounded-lg bg-surface-container border border-outline-variant text-[10px] text-on-surface-variant font-label font-extralight focus:outline-none focus:border-accent/40 transition-all">
              <option value="">{f.label}</option>
              {f.options.filter(Boolean).map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="glass-card rounded-xl px-4 py-3 flex items-center gap-3 border border-accent/10">
          <span className="font-label text-[10px] text-accent uppercase tracking-wider font-extralight">{selected.size} selectionne{selected.size > 1 ? 's' : ''}</span>
          <div className="h-4 w-px bg-white/[0.06]" />
          <button onClick={() => handleCategorize(Array.from(selected))} disabled={categorizing}
            className="h-7 px-3 rounded-lg bg-primary-electric/10 text-accent font-label text-[9px] uppercase tracking-[0.15em] font-extralight hover:bg-primary-electric/20 transition-all disabled:opacity-30 flex items-center gap-1.5">
            <Brain size={11} /> {categorizing ? 'En cours...' : 'Categoriser'}
          </button>
          <select onChange={e => { if (e.target.value) handleBulk('set_status', e.target.value); e.target.value = ''; }} disabled={bulkLoading}
            className="h-7 px-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-[9px] text-on-surface-variant font-label font-extralight">
            <option value="">Statut...</option>
            <option value="validated">Valider</option>
            <option value="blacklisted">Blacklister</option>
            <option value="pending">En attente</option>
          </select>
          <button onClick={() => { if (confirm(`Supprimer ${selected.size} domaines ?`)) handleBulk('delete'); }} disabled={bulkLoading}
            className="h-7 px-3 rounded-lg bg-danger/10 text-danger font-label text-[9px] uppercase tracking-[0.15em] font-extralight hover:bg-danger/20 transition-all flex items-center gap-1.5">
            <Trash2 size={11} /> Supprimer
          </button>
        </div>
      )}

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden glow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-high border-b border-white/[0.03]">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={domains.length > 0 && domains.every(d => selected.has(d.id))} onChange={toggleAll} className="accent-accent" />
                </th>
                {visibleCols.map(col => {
                  const label = ALL_COLUMNS.find(c => c.key === col)?.label || col;
                  const sortable = ['domain', 'last_score', 'editorial_status', 'brand_safety', 'category_iab', 'last_health', 'last_audit_date', 'audit_count'].includes(col);
                  return (
                    <th key={col} className="px-3 py-3">
                      <button onClick={() => sortable && toggleSort(col)} disabled={!sortable}
                        className={clsx('font-label text-[9px] uppercase tracking-[0.15em] font-extralight flex items-center gap-1', sortable ? 'hover:text-accent cursor-pointer' : 'cursor-default', sort === col ? 'text-accent' : 'text-on-surface-variant')}>
                        {label}
                        {sort === col && (order === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                      </button>
                    </th>
                  );
                })}
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleCols.length + 2} className="px-4 py-12 text-center"><div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" /></td></tr>
              ) : domains.length === 0 ? (
                <tr><td colSpan={visibleCols.length + 2} className="px-4 py-12 text-center font-label text-xs text-on-surface-variant font-extralight">Aucun domaine trouve.</td></tr>
              ) : domains.map(d => (
                <tr key={d.id} className={clsx(
                  'border-t border-white/[0.03] transition-colors',
                  d.brand_safety === 'unsafe' && 'bg-danger/[0.03]',
                  'hover:bg-white/[0.02]',
                )}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} className="accent-accent" />
                  </td>
                  {visibleCols.map(col => (
                    <td key={col} className={clsx('px-3 py-2.5', col === 'domain' && d.brand_safety === 'unsafe' && 'border-l-2 border-danger', col === 'domain' && d.brand_safety === 'moderate' && 'border-l-2 border-warning', col === 'domain' && d.brand_safety === 'safe' && 'border-l-2 border-secondary')}>
                      {renderCell(d, col)}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 relative">
                    <button onClick={() => setActiveMenu(activeMenu === d.id ? null : d.id)} className="text-on-surface-variant/40 hover:text-on-surface transition-colors">
                      <MoreHorizontal size={14} />
                    </button>
                    {activeMenu === d.id && (
                      <div className="absolute right-0 top-full mt-1 glass-card rounded-xl py-1 z-50 min-w-[180px] border border-white/[0.08]">
                        <button onClick={() => handleCategorize([d.id])} className="w-full text-left px-3 py-2 text-[11px] font-extralight text-on-surface-variant hover:text-accent hover:bg-white/[0.03] flex items-center gap-2"><Brain size={12} /> Categoriser (Mistral)</button>
                        <button onClick={() => handleUpdate(d.id, { editorial_status: 'validated' })} className="w-full text-left px-3 py-2 text-[11px] font-extralight text-on-surface-variant hover:text-secondary hover:bg-white/[0.03] flex items-center gap-2"><CheckCircle size={12} /> Valider</button>
                        <button onClick={() => handleUpdate(d.id, { editorial_status: 'blacklisted' })} className="w-full text-left px-3 py-2 text-[11px] font-extralight text-on-surface-variant hover:text-danger hover:bg-white/[0.03] flex items-center gap-2"><XCircle size={12} /> Blacklister</button>
                        <div className="my-1 mx-3 h-px bg-white/[0.04]" />
                        <button onClick={() => handleDelete(d.id)} className="w-full text-left px-3 py-2 text-[11px] font-extralight text-danger hover:bg-danger/[0.05] flex items-center gap-2"><Trash2 size={12} /> Supprimer</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.03]">
            <span className="font-label text-[9px] text-on-surface-variant/50 font-extralight">
              Page {data.page}/{data.pages} · {data.total} domaines
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="h-7 px-3 rounded-lg bg-white/[0.03] text-[10px] text-on-surface-variant font-label font-extralight disabled:opacity-20 hover:bg-white/[0.06] transition-all">Prec</button>
              <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages}
                className="h-7 px-3 rounded-lg bg-white/[0.03] text-[10px] text-on-surface-variant font-label font-extralight disabled:opacity-20 hover:bg-white/[0.06] transition-all">Suiv</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
