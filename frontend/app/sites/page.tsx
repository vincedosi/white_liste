'use client';
import { useState, useEffect } from 'react';
import { getSiteStats, categorizeDomains } from '@/lib/api';
import type { SiteEntry, SiteStats } from '@/lib/types';
import { useSitesList, type FilterKey } from '@/hooks/useSitesList';
import { SitesKpis } from '@/components/sites/SitesKpis';
import { SiteFilters } from '@/components/sites/SiteFilters';
import { SitesTable } from '@/components/sites/SitesTable';
import { BulkActionsBar } from '@/components/sites/BulkActionsBar';
import { SiteDetailModal } from '@/components/sites/SiteDetailModal';
import { CategorizeModal } from '@/components/sites/CategorizeModal';

export default function SitesPage() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('last_ad_surface_pct');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<SiteEntry | null>(null);

  const [showCat, setShowCat] = useState(false);
  const [mistralKey, setMistralKey] = useState('');
  const [catLoading, setCatLoading] = useState(false);
  const [catProgress, setCatProgress] = useState('');
  const [catDone, setCatDone] = useState(false);

  const { sites, total, pages, loading, reload } = useSitesList({ page, sortCol, sortOrder, filter, search });

  const loadStats = () => { getSiteStats().then(setStats).catch(console.error); };
  useEffect(loadStats, []);

  const onSort = (c: string) => {
    if (c === sortCol) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(c); setSortOrder('desc'); }
    setPage(1);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected((s) => (s.size === sites.length ? new Set() : new Set(sites.map((x) => x.id))));
  const refreshAll = () => { reload(); loadStats(); };

  const markScan = (ids: string[], on: boolean) =>
    setScanning((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  const rowAction = async (action: 'rescan' | 'validate' | 'remove', s: SiteEntry) => {
    if (action === 'rescan') {
      markScan([s.id], true);
      await fetch(`/api/sites/${encodeURIComponent(s.domain)}/rescan`, { method: 'POST' }).catch(() => {});
      markScan([s.id], false);
      refreshAll();
    } else if (action === 'remove') {
      // Pas d'endpoint de suppression côté backend en V1 — action honnête plutôt que 404 silencieux.
      alert('La suppression de sites n’est pas encore disponible (V1).');
    } else {
      setDetail(s); // la validation se fait dans la modale détail existante
    }
  };

  const bulkRescan = async () => {
    const targets = sites.filter((x) => selected.has(x.id));
    markScan(targets.map((x) => x.id), true);
    setSelected(new Set());
    for (const s of targets) {
      await fetch(`/api/sites/${encodeURIComponent(s.domain)}/rescan`, { method: 'POST' }).catch(() => {});
      markScan([s.id], false);
    }
    refreshAll();
  };

  const runCategorize = async () => {
    if (!mistralKey.trim()) return;
    setCatLoading(true); setCatProgress(''); setCatDone(false);
    try {
      const ids = sites.filter((x) => selected.has(x.id)).map((x) => x.id);
      const target = ids.length > 0 ? ids : sites.filter((x) => !x.category_iab).map((x) => x.id);
      const res = await categorizeDomains(target, mistralKey.trim());
      setCatProgress(`Terminé ! ${res.processed} catégorisés, ${res.errors} erreurs.`);
      setCatDone(true);
      refreshAll();
    } catch (e) {
      setCatProgress(`Erreur: ${e instanceof Error ? e.message : 'Inconnue'}`);
    } finally { setCatLoading(false); }
  };

  const closeCat = () => { setShowCat(false); setCatDone(false); setCatProgress(''); };

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Inventaire des sites</p>
            <h1 className="text-xl font-medium text-on-surface mt-1">Analyse de placement publicitaire</h1>
          </div>
        </div>
        <SitesKpis stats={stats} />
      </header>

      <SiteFilters
        filter={filter}
        onFilter={(f) => { setFilter(f); setPage(1); }}
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        stats={stats}
      />

      <div className="overflow-x-auto">
        <SitesTable
          sites={sites} loading={loading}
          sortCol={sortCol} sortOrder={sortOrder} onSort={onSort}
          selectedIds={selected} onToggle={toggle} onToggleAll={toggleAll}
          onOpen={setDetail} rowAction={rowAction} scanningIds={scanning}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="font-label text-sm text-on-surface-variant">{total.toLocaleString('fr-FR')} sites — page {page}/{pages}</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest border border-outline/30 text-on-surface-variant hover:text-on-surface disabled:opacity-30">Précédent</button>
          <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="px-4 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest border border-outline/30 text-on-surface-variant hover:text-on-surface disabled:opacity-30">Suivant</button>
        </div>
      </div>

      <BulkActionsBar
        count={selected.size}
        onRescan={bulkRescan}
        onCategorize={() => setShowCat(true)}
        onRemove={() => alert('La suppression de sites n’est pas encore disponible (V1).')}
        onClear={() => setSelected(new Set())}
      />

      {detail && <SiteDetailModal site={detail} onClose={() => { setDetail(null); refreshAll(); }} />}
      {showCat && (
        <CategorizeModal
          mistralKey={mistralKey} onKeyChange={setMistralKey}
          loading={catLoading} progress={catProgress} done={catDone}
          onClose={closeCat} onRun={runCategorize}
        />
      )}
    </div>
  );
}
