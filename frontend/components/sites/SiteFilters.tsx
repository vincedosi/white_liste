'use client';
import { Search } from 'lucide-react';
import { FilterChip } from '@/components/ui/FilterChip';
import type { SiteStats } from '@/lib/types';
import type { FilterKey } from '@/hooks/useSitesList';

export function SiteFilters({
  filter, onFilter, search, onSearch, stats,
}: {
  filter: FilterKey; onFilter: (f: FilterKey) => void;
  search: string; onSearch: (v: string) => void;
  stats: SiteStats | null;
}) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <FilterChip active={filter === 'all'} count={stats?.total} onClick={() => onFilter('all')}>
        Tous
      </FilterChip>
      <FilterChip active={filter === 'problematic'} count={stats?.problematic} onClick={() => onFilter('problematic')}>
        🔴 Problématiques
      </FilterChip>
      <FilterChip active={filter === 'stale'} count={stats?.stale} onClick={() => onFilter('stale')}>
        À ré-analyser
      </FilterChip>
      <div className="w-px h-5 bg-outline/30 mx-1" />
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Rechercher un site ou une URL…"
          className="w-full pl-9 pr-3 py-2 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none"
        />
      </div>
    </div>
  );
}
