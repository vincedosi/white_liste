import { useState, useEffect, useCallback } from 'react';
import { getSites } from '@/lib/api';
import type { SiteEntry } from '@/lib/types';

export type FilterKey = 'all' | 'problematic' | 'stale';

const PER_PAGE = 100;

export function useSitesList({
  page, sortCol, sortOrder, filter, search,
}: {
  page: number; sortCol: string; sortOrder: 'asc' | 'desc';
  filter: FilterKey; search: string;
}) {
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setLoading(true);
    getSites({
      page,
      per_page: PER_PAGE,
      sort: sortCol,
      order: sortOrder,
      search: search || undefined,
      ad_pct_min: filter === 'problematic' ? 50 : undefined,
      stale_days: filter === 'stale' ? 14 : undefined,
    })
      .then((res) => {
        setSites(res.sites);
        setTotal(res.total);
        setPages(res.pages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, sortCol, sortOrder, filter, search, tick]);

  return { sites, total, pages, loading, reload };
}
