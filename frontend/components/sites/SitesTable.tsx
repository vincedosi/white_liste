'use client';
import { useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { SiteRow } from './SiteRow';
import type { SiteEntry } from '@/lib/types';

const COLS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'domain', label: 'Site', sortable: true },
  { key: 'last_ad_surface_pct', label: '% Aire pub', sortable: true },
  { key: 'last_ad_count', label: 'Pubs', sortable: true },
  { key: 'last_health', label: 'Santé', sortable: true },
  { key: 'last_audit_date', label: 'MAJ', sortable: true },
];

export function SitesTable({
  sites, loading, sortCol, sortOrder, onSort,
  selectedIds, onToggle, onToggleAll, onOpen, rowAction, scanningIds,
}: {
  sites: SiteEntry[]; loading: boolean;
  sortCol: string; sortOrder: 'asc' | 'desc'; onSort: (c: string) => void;
  selectedIds: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void;
  onOpen: (s: SiteEntry) => void;
  rowAction: (action: 'rescan' | 'validate' | 'remove', s: SiteEntry) => void;
  scanningIds: Set<string>;
}) {
  const allRef = useRef<HTMLInputElement>(null);
  const allChecked = sites.length > 0 && selectedIds.size === sites.length;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = selectedIds.size > 0 && selectedIds.size < sites.length;
  }, [selectedIds, sites.length]);

  const icon = (c: string) =>
    sortCol !== c ? <ArrowUpDown className="w-3 h-3 opacity-30" />
      : sortOrder === 'asc' ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />;

  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-background z-10">
        <tr className="border-b border-outline/30">
          <th className="px-3 py-3 w-10">
            <input ref={allRef} type="checkbox" checked={allChecked} onChange={onToggleAll} />
          </th>
          {COLS.map((c) => (
            <th key={c.key} onClick={() => c.sortable && onSort(c.key)}
              className="px-3 py-3 text-left font-label text-[9px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight cursor-pointer hover:text-on-surface select-none">
              <span className="flex items-center gap-1">{c.label}{c.sortable && icon(c.key)}</span>
            </th>
          ))}
          <th className="px-3 py-3 w-10" />
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-outline/20">
                <td colSpan={7} className="px-3 py-4"><div className="h-6 rounded bg-surface-high animate-pulse" /></td>
              </tr>
            ))
          : sites.length === 0
          ? <tr><td colSpan={7} className="px-3 py-12 text-center text-[13px] text-on-surface-variant">Aucun site ne correspond aux filtres actuels.</td></tr>
          : sites.map((s) => (
              <SiteRow
                key={s.id} site={s}
                selected={selectedIds.has(s.id)}
                scanning={scanningIds.has(s.id)}
                onToggle={() => onToggle(s.id)}
                onOpen={() => onOpen(s)}
                onRescan={() => rowAction('rescan', s)}
                onValidate={() => rowAction('validate', s)}
                onRemove={() => rowAction('remove', s)}
              />
            ))}
      </tbody>
    </table>
  );
}
