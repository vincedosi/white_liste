# Sites Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-page "Sites Intelligence" with Dashboard tab (KPIs + map + charts) and Sites tab (full sortable table) showing ALL crawled domains.

**Architecture:** New `GET /api/sites` + `GET /api/sites/stats` endpoints (no admin, no workspace). New `/sites` page with tab switcher. Backfill missing domains from audit history. Reuse existing dashboard components (ServerMap, KpiCard, HealthDonut, CategoryChart, SiteModal).

**Tech Stack:** FastAPI, SQLite, Next.js 14, Recharts, MapLibre GL, Tailwind CSS

---

### Task 1: Backend — Sites Endpoints

**Files:**
- Create: `backend/routers/sites.py`
- Modify: `backend/main.py:54-64` (register router)

- [ ] **Step 1: Create `backend/routers/sites.py`**

```python
"""Public (authenticated) endpoints for the global domains/sites view."""

import json
import math

from fastapi import APIRouter, Query, Depends
from db import fetch_one, fetch_all
from routers.auth import get_current_user

router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("")
async def list_sites(
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    sort: str = Query("domain"),
    order: str = Query("asc"),
    search: str = Query(""),
    health: str = Query(""),
    country: str = Query(""),
    ads_txt: str = Query(""),     # "1" or "0"
    score_min: float = Query(None),
    score_max: float = Query(None),
    category: str = Query(""),
    user: dict = Depends(get_current_user),
):
    allowed_sorts = {
        "domain", "last_score", "last_health", "last_ads_txt",
        "last_ad_count", "last_load_time_ms", "last_country",
        "category_iab", "audit_count", "last_audit_date",
    }
    sort_col = sort if sort in allowed_sorts else "domain"
    sort_order = "DESC" if order.lower() == "desc" else "ASC"

    conditions: list[str] = []
    params: list = []

    if search:
        conditions.append("domain LIKE ?")
        params.append(f"%{search}%")
    if health:
        conditions.append("last_health = ?")
        params.append(health)
    if country:
        conditions.append("last_country = ?")
        params.append(country)
    if ads_txt in ("0", "1"):
        conditions.append("last_ads_txt = ?")
        params.append(int(ads_txt))
    if score_min is not None:
        conditions.append("last_score >= ?")
        params.append(score_min)
    if score_max is not None:
        conditions.append("last_score <= ?")
        params.append(score_max)
    if category:
        conditions.append("category_iab = ?")
        params.append(category)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count_row = await fetch_one(
        f"SELECT COUNT(*) as total FROM domains {where}", tuple(params)
    )
    total = count_row["total"] if count_row else 0
    pages = max(1, math.ceil(total / per_page))

    offset = (page - 1) * per_page
    rows = await fetch_all(
        f"SELECT * FROM domains {where} ORDER BY {sort_col} {sort_order} LIMIT ? OFFSET ?",
        tuple(params) + (per_page, offset),
    )

    for r in rows:
        r["tags"] = json.loads(r.get("tags_json") or "[]")
        r["adtech"] = json.loads(r.get("last_adtech_json") or "{}")

    return {"sites": rows, "total": total, "page": page, "per_page": per_page, "pages": pages}


@router.get("/stats")
async def site_stats(user: dict = Depends(get_current_user)):
    total = await fetch_one("SELECT COUNT(*) as c FROM domains")
    alive = await fetch_one("SELECT COUNT(*) as c FROM domains WHERE last_health = 'ok'")
    dead = await fetch_one("SELECT COUNT(*) as c FROM domains WHERE last_health IN ('dns_error','timeout','connection_error','ssl_error')")
    redirect = await fetch_one("SELECT COUNT(*) as c FROM domains WHERE last_health = 'redirect'")
    error = await fetch_one("SELECT COUNT(*) as c FROM domains WHERE last_health IN ('client_error','server_error')")
    mfa = await fetch_one("SELECT COUNT(*) as c FROM domains WHERE last_score IS NOT NULL AND last_score < 4.0")
    ads_txt_ok = await fetch_one("SELECT COUNT(*) as c FROM domains WHERE last_ads_txt = 1")
    avg_score = await fetch_one("SELECT AVG(last_score) as avg FROM domains WHERE last_score IS NOT NULL")
    avg_ads = await fetch_one("SELECT AVG(last_ad_count) as avg FROM domains WHERE last_ad_count IS NOT NULL")

    # Country distribution
    countries = await fetch_all(
        "SELECT last_country as country, COUNT(*) as count FROM domains WHERE last_country IS NOT NULL GROUP BY last_country ORDER BY count DESC"
    )

    # Category distribution
    categories = await fetch_all(
        "SELECT category_iab as category, COUNT(*) as count FROM domains WHERE category_iab IS NOT NULL AND category_iab != '' GROUP BY category_iab ORDER BY count DESC"
    )

    # Adtech presence — count domains with each tech enabled
    adtech_keys = ["gpt", "prebid", "amazon_tam", "criteo", "teads", "taboola", "outbrain", "smart", "pubmatic", "appnexus", "magnite", "index"]
    adtech_stats = {}
    all_with_adtech = await fetch_all("SELECT last_adtech_json FROM domains WHERE last_adtech_json IS NOT NULL AND last_adtech_json != '{}'")
    for key in adtech_keys:
        count = 0
        for row in all_with_adtech:
            try:
                data = json.loads(row["last_adtech_json"])
                if data.get(key):
                    count += 1
            except Exception:
                pass
        adtech_stats[key] = count

    # Score distribution — buckets 0-1, 1-2, ..., 9-10
    score_buckets = []
    for i in range(10):
        low, high = i, i + 1
        row = await fetch_one(
            "SELECT COUNT(*) as c FROM domains WHERE last_score >= ? AND last_score < ?",
            (low, high if i < 9 else 11),
        )
        score_buckets.append({"range": f"{low}-{high}", "count": row["c"] if row else 0})

    return {
        "total": total["c"] if total else 0,
        "alive": alive["c"] if alive else 0,
        "dead": dead["c"] if dead else 0,
        "redirect": redirect["c"] if redirect else 0,
        "error": error["c"] if error else 0,
        "mfa": mfa["c"] if mfa else 0,
        "ads_txt_ok": ads_txt_ok["c"] if ads_txt_ok else 0,
        "avg_score": round(avg_score["avg"], 1) if avg_score and avg_score["avg"] else 0,
        "avg_ad_count": round(avg_ads["avg"], 1) if avg_ads and avg_ads["avg"] else 0,
        "countries": [dict(r) for r in countries],
        "categories": [dict(r) for r in categories],
        "adtech": adtech_stats,
        "score_buckets": score_buckets,
    }


@router.get("/countries")
async def site_countries(user: dict = Depends(get_current_user)):
    """Distinct countries for filter dropdowns."""
    rows = await fetch_all(
        "SELECT DISTINCT last_country as country FROM domains WHERE last_country IS NOT NULL ORDER BY last_country"
    )
    return {"countries": [r["country"] for r in rows]}
```

- [ ] **Step 2: Register router in `backend/main.py`**

Add after the existing router imports (around line 18):

```python
from routers.sites import router as sites_router
```

Add after line ~63 (where other routers are included):

```python
app.include_router(sites_router)
```

- [ ] **Step 3: Verify endpoints work**

```bash
TOKEN=$(curl -s http://localhost:8010/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@dentsu.com","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s "http://localhost:8010/api/sites?per_page=5" -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -20
curl -s "http://localhost:8010/api/sites/stats" -H "Authorization: Bearer $TOKEN" | python -m json.tool | head -40
```

Expected: JSON with `sites` array and `stats` object.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/sites.py backend/main.py
git commit -m "feat: add /api/sites and /api/sites/stats endpoints for Sites Intelligence"
```

---

### Task 2: Backfill Missing Domains

**Files:**
- Modify: `backend/db.py` (add backfill function)
- Modify: `backend/main.py` (call at startup)

52 domains are in the `domains` table but 104 unique domains exist across audit results. We need to backfill the missing 51.

- [ ] **Step 1: Add backfill function to `backend/db.py`**

Add after the `migrate_json_audits` function (after line ~277):

```python
async def backfill_domains_from_audits() -> None:
    """Populate domains table from audit results_json for any domains not yet tracked."""
    import json as json_mod

    db = await get_db()
    cursor = await db.execute("SELECT key FROM _migrations WHERE key = 'backfill_domains_v1'")
    if await cursor.fetchone():
        return

    rows = await fetch_all("SELECT id, results_json, created_at FROM audits WHERE results_json IS NOT NULL ORDER BY created_at ASC")
    backfilled = 0
    for row in rows:
        try:
            results = json_mod.loads(row["results_json"])
        except Exception:
            continue
        for site in results:
            domain_name = site.get("domain", "")
            if not domain_name:
                continue
            # Check if already exists
            existing = await fetch_one("SELECT id FROM domains WHERE domain = ?", (domain_name,))
            if existing:
                continue

            # Build audit_data dict from the site result
            health = site.get("health", {})
            attention = site.get("attention", {})
            geo = site.get("geo", {})
            ads_txt = site.get("ads_txt", {})
            adtech = site.get("adtech", {})

            health_status = health.get("status", "") if isinstance(health, dict) else ""
            score = attention.get("score") if isinstance(attention, dict) else None
            ad_count = attention.get("raw_ad_count") or attention.get("ad_count", 0) if isinstance(attention, dict) else 0

            audit_data = {
                "score": score,
                "health": health_status,
                "ads_txt": 1 if (isinstance(ads_txt, dict) and ads_txt.get("present")) else 0,
                "ad_count": ad_count,
                "load_time_ms": health.get("response_time_ms", 0) if isinstance(health, dict) else 0,
                "trackers": 0,
                "adtech": adtech if isinstance(adtech, dict) else {},
                "country": geo.get("country", "") if isinstance(geo, dict) else "",
                "lang": geo.get("content_lang", "") if isinstance(geo, dict) else "",
                "tld": geo.get("tld", "") if isinstance(geo, dict) else "",
                "audit_id": row["id"],
                "audit_date": row["created_at"],
            }
            await upsert_domain(domain_name, audit_data)
            backfilled += 1

    await db.execute("INSERT INTO _migrations (key, done_at) VALUES (?, ?)", ("backfill_domains_v1", _now()))
    await db.commit()
    print(f"[MLI] Backfilled {backfilled} domains from audit results")
```

- [ ] **Step 2: Call backfill at startup in `backend/main.py`**

In the `startup` event handler, add after `migrate_json_audits()`:

```python
from db import backfill_domains_from_audits
await backfill_domains_from_audits()
```

- [ ] **Step 3: Restart backend and verify**

```bash
# Kill existing backend
kill $(lsof -t -i:8010) 2>/dev/null
cd C:/MLI/mli_crawler/backend && nohup python -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload > /tmp/mli_backend.log 2>&1 &
sleep 3
# Check domain count
TOKEN=$(curl -s http://localhost:8010/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@dentsu.com","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s "http://localhost:8010/api/sites/stats" -H "Authorization: Bearer $TOKEN" | python -c "import sys,json; d=json.load(sys.stdin); print(f'Total domains: {d[\"total\"]}')"
```

Expected: `Total domains: ~104`

- [ ] **Step 4: Commit**

```bash
git add backend/db.py backend/main.py
git commit -m "feat: backfill domains table from audit history results"
```

---

### Task 3: Frontend — API Client Functions

**Files:**
- Modify: `frontend/lib/api.ts` (add getSites, getSiteStats, getSiteCountries)
- Modify: `frontend/lib/types.ts` (add SiteEntry, SiteStats types)

- [ ] **Step 1: Add types to `frontend/lib/types.ts`**

Add at the end of the file:

```typescript
/* ── Sites Intelligence ── */

export interface SiteEntry {
  id: string;
  domain: string;
  editorial_status: 'pending' | 'validated' | 'blacklisted';
  brand_safety: 'safe' | 'moderate' | 'unsafe' | null;
  category_iab: string | null;
  notes: string | null;
  tags: string[];
  adtech: Record<string, boolean>;
  last_score: number | null;
  last_score_trend: 'up' | 'down' | 'stable' | null;
  last_health: string | null;
  last_ads_txt: number | null;
  last_ad_count: number | null;
  last_load_time_ms: number | null;
  last_trackers: number | null;
  last_country: string | null;
  last_lang: string | null;
  last_tld: string | null;
  last_audit_id: string | null;
  last_audit_date: string | null;
  audit_count: number;
  created_at: string;
  updated_at: string;
}

export interface SiteListResponse {
  sites: SiteEntry[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface SiteStats {
  total: number;
  alive: number;
  dead: number;
  redirect: number;
  error: number;
  mfa: number;
  ads_txt_ok: number;
  avg_score: number;
  avg_ad_count: number;
  countries: Array<{ country: string; count: number }>;
  categories: Array<{ category: string; count: number }>;
  adtech: Record<string, number>;
  score_buckets: Array<{ range: string; count: number }>;
}
```

- [ ] **Step 2: Add API functions to `frontend/lib/api.ts`**

Add at the end of the file (before any closing braces):

```typescript
/* ── Sites Intelligence ── */

export async function getSites(params: {
  page?: number;
  per_page?: number;
  sort?: string;
  order?: string;
  search?: string;
  health?: string;
  country?: string;
  ads_txt?: string;
  score_min?: number;
  score_max?: number;
  category?: string;
} = {}): Promise<SiteListResponse> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const res = await fetchWithAuth(`${API_BASE}/sites?${qs.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch sites: ${res.status}`);
  return res.json();
}

export async function getSiteStats(): Promise<SiteStats> {
  const res = await fetchWithAuth(`${API_BASE}/sites/stats`);
  if (!res.ok) throw new Error(`Failed to fetch site stats: ${res.status}`);
  return res.json();
}

export async function getSiteCountries(): Promise<string[]> {
  const res = await fetchWithAuth(`${API_BASE}/sites/countries`);
  if (!res.ok) throw new Error(`Failed to fetch countries: ${res.status}`);
  const data = await res.json();
  return data.countries;
}
```

Also add the imports at the top of the types import in api.ts:

```typescript
import type { SiteListResponse, SiteStats } from './types';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/types.ts
git commit -m "feat: add Sites Intelligence API client and types"
```

---

### Task 4: Frontend — Sites Intelligence Page (Dashboard Tab)

**Files:**
- Create: `frontend/app/sites/page.tsx`
- Create: `frontend/app/sites/layout.tsx`

- [ ] **Step 1: Create layout at `frontend/app/sites/layout.tsx`**

```tsx
export default function SitesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Create the main page at `frontend/app/sites/page.tsx`**

This is the main file. It contains both tabs. Build Dashboard tab first:

```tsx
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
import { SiteModal } from '@/components/dashboard/SiteModal';
import { COLORS } from '@/lib/constants';
import {
  Globe, Shield, BarChart3, Eye, Radio, Search,
  ChevronUp, ChevronDown, Minus, ArrowUpDown, Filter, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';

type Tab = 'dashboard' | 'sites';

export default function SitesIntelligencePage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);

  // Table state
  const [page, setPage] = useState(1);
  const [perPage] = useState(100);
  const [sortCol, setSortCol] = useState('domain');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [filterHealth, setFilterHealth] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterAdsTxt, setFilterAdsTxt] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Modal
  const [selectedSite, setSelectedSite] = useState<SiteEntry | null>(null);

  // Load stats + countries once
  useEffect(() => {
    Promise.all([getSiteStats(), getSiteCountries()])
      .then(([s, c]) => { setStats(s); setCountries(c); })
      .catch(console.error);
  }, []);

  // Load sites (when filters/sort/page change)
  useEffect(() => {
    setLoading(true);
    getSites({
      page, per_page: perPage, sort: sortCol, order: sortOrder,
      search, health: filterHealth, country: filterCountry,
      ads_txt: filterAdsTxt, category: filterCategory,
    })
      .then((res) => {
        setSites(res.sites);
        setTotal(res.total);
        setPages(res.pages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, perPage, sortCol, sortOrder, search, filterHealth, filterCountry, filterAdsTxt, filterCategory]);

  // Map data from sites
  const mapData = useMemo(() => {
    return sites
      .filter((s) => s.last_country)
      .map((s) => ({
        domain: s.domain,
        country: s.last_country || '',
        countryCode: '',
        city: '',
        ip: '',
        isp: '',
        score: s.last_score ?? undefined,
        action: s.last_score !== null && s.last_score < 4 ? 'remove' : s.last_score !== null && s.last_score < 7 ? 'flag' : undefined,
      }));
  }, [sites]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-16">
      {/* Header */}
      <div className="mb-10 animate-fade-up">
        <p className="font-label text-[11px] uppercase tracking-[0.2em] text-accent mb-2">
          Sites Intelligence
        </p>
        <h1 className="text-4xl md:text-5xl font-extralight text-on-surface tracking-tight">
          Tous les sites
        </h1>
        <p className="text-on-surface-variant text-sm mt-2">
          {stats ? `${stats.total} domaines crawles` : 'Chargement...'}
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-10 bg-surface-container rounded-xl p-1 w-fit animate-fade-up delay-1">
        {(['dashboard', 'sites'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-light transition-all ${
              tab === t
                ? 'bg-white/[0.08] text-on-surface'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t === 'dashboard' ? 'Dashboard' : 'Liste Sites'}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && stats && (
        <div className="space-y-8">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-up delay-2">
            <KpiCard label="Sites crawles" value={stats.total} color={COLORS.accent} />
            <KpiCard label="Score moyen" value={stats.avg_score} color={stats.avg_score >= 7 ? COLORS.success : stats.avg_score >= 4 ? COLORS.warning : COLORS.danger} />
            <KpiCard label="Sites MFA" value={stats.mfa} color={COLORS.danger} subtitle={`${stats.total ? Math.round((stats.mfa / stats.total) * 100) : 0}%`} />
            <KpiCard label="ads.txt OK" value={`${stats.total ? Math.round((stats.ads_txt_ok / stats.total) * 100) : 0}%`} color={COLORS.success} subtitle={`${stats.ads_txt_ok} / ${stats.total}`} />
            <KpiCard label="Sites alive" value={stats.alive} color={COLORS.success} subtitle={`${stats.dead} dead`} />
          </div>

          {/* Second KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-up delay-3">
            <KpiCard label="Ad count moyen" value={stats.avg_ad_count} color={COLORS.primary} />
            <KpiCard label="Top pays" value={stats.countries[0]?.country || 'N/A'} color={COLORS.accent} subtitle={`${stats.countries[0]?.count || 0} sites`} />
            <KpiCard label="Redirections" value={stats.redirect} color={COLORS.warning} />
            <KpiCard label="Erreurs" value={stats.error} color={COLORS.danger} />
          </div>

          {/* Map */}
          <div className="animate-fade-up delay-4">
            <Card>
              <p className="font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-4">
                Carte des serveurs
              </p>
              <ServerMap data={mapData} />
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up delay-5">
            {/* Score Distribution */}
            <Card>
              <p className="font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-4">
                Distribution des scores
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.score_buckets}>
                    <XAxis dataKey="range" tick={{ fill: '#909090', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#909090', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#121212', border: '1px solid #404040', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {stats.score_buckets.map((entry, i) => {
                        const mid = i + 0.5;
                        const color = mid >= 7 ? COLORS.success : mid >= 4 ? COLORS.warning : COLORS.danger;
                        return <Cell key={i} fill={color} fillOpacity={0.7} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Health Donut */}
            <Card>
              <p className="font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-4">
                Sante des sites
              </p>
              <HealthDonut
                healthy={stats.alive}
                flagged={stats.redirect + stats.error}
                mfa={stats.mfa}
                dead={stats.dead}
              />
            </Card>

            {/* Top Countries */}
            <Card>
              <p className="font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-4">
                Top pays
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.countries.slice(0, 10)} layout="vertical">
                    <XAxis type="number" tick={{ fill: '#909090', fontSize: 11 }} />
                    <YAxis dataKey="country" type="category" width={100} tick={{ fill: '#909090', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#121212', border: '1px solid #404040', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" fill={COLORS.accent} fillOpacity={0.7} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Categories */}
            <Card>
              <p className="font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-4">
                Categories IAB
              </p>
              <CategoryChart data={Object.fromEntries(stats.categories.map((c) => [c.category, c.count]))} />
            </Card>

            {/* Adtech Stack */}
            <Card className="lg:col-span-2">
              <p className="font-label text-[11px] uppercase tracking-[0.15em] text-on-surface-variant mb-4">
                Stack AdTech detectee
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(stats.adtech)
                      .map(([name, count]) => ({ name: name.toUpperCase(), count }))
                      .sort((a, b) => b.count - a.count)}
                    layout="vertical"
                  >
                    <XAxis type="number" tick={{ fill: '#909090', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#909090', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#121212', border: '1px solid #404040', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" fill={COLORS.primary} fillOpacity={0.7} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Sites Tab */}
      {tab === 'sites' && (
        <div className="space-y-6">
          {/* Filters */}
          <Card className="animate-fade-up delay-1">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
                <input
                  type="text"
                  placeholder="Rechercher un domaine..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none"
                />
              </div>
              <select
                value={filterHealth}
                onChange={(e) => { setFilterHealth(e.target.value); setPage(1); }}
                className="bg-surface-high rounded-lg px-3 py-2 text-sm text-on-surface border border-outline/30"
              >
                <option value="">Sante: Tous</option>
                <option value="ok">OK</option>
                <option value="redirect">Redirect</option>
                <option value="client_error">Client Error</option>
                <option value="server_error">Server Error</option>
                <option value="timeout">Timeout</option>
                <option value="dns_error">DNS Error</option>
              </select>
              <select
                value={filterCountry}
                onChange={(e) => { setFilterCountry(e.target.value); setPage(1); }}
                className="bg-surface-high rounded-lg px-3 py-2 text-sm text-on-surface border border-outline/30"
              >
                <option value="">Pays: Tous</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={filterAdsTxt}
                onChange={(e) => { setFilterAdsTxt(e.target.value); setPage(1); }}
                className="bg-surface-high rounded-lg px-3 py-2 text-sm text-on-surface border border-outline/30"
              >
                <option value="">ads.txt: Tous</option>
                <option value="1">Present</option>
                <option value="0">Absent</option>
              </select>
            </div>
          </Card>

          {/* Table */}
          <Card className="animate-fade-up delay-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {[
                    { key: 'domain', label: 'Domaine' },
                    { key: 'last_score', label: 'Score' },
                    { key: 'last_health', label: 'Sante' },
                    { key: 'last_ads_txt', label: 'ads.txt' },
                    { key: 'last_ad_count', label: 'Pubs' },
                    { key: 'last_load_time_ms', label: 'Temps (ms)' },
                    { key: 'last_country', label: 'Pays' },
                    { key: 'last_lang', label: 'Langue' },
                    { key: 'category_iab', label: 'Categorie' },
                    { key: 'audit_count', label: 'Audits' },
                    { key: 'last_audit_date', label: 'Dernier audit' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left py-3 px-3 font-label text-[10px] uppercase tracking-wider text-on-surface-variant cursor-pointer hover:text-accent transition-colors whitespace-nowrap"
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortCol === col.key ? (
                          sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr
                    key={site.id}
                    onClick={() => setSelectedSite(site)}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 text-on-surface font-medium">{site.domain}</td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1">
                        <span className={`font-label ${
                          (site.last_score ?? 0) >= 7 ? 'text-success' :
                          (site.last_score ?? 0) >= 4 ? 'text-warning' : 'text-danger'
                        }`}>
                          {site.last_score?.toFixed(1) ?? '—'}
                        </span>
                        {site.last_score_trend === 'up' && <ChevronUp size={12} className="text-success" />}
                        {site.last_score_trend === 'down' && <ChevronDown size={12} className="text-danger" />}
                        {site.last_score_trend === 'stable' && <Minus size={12} className="text-dim" />}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={site.last_health === 'ok' ? 'ok' : site.last_health === 'redirect' ? 'flag' : 'dead'}>
                        {site.last_health || '—'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={site.last_ads_txt === 1 ? 'present' : 'absent'}>
                        {site.last_ads_txt === 1 ? 'Oui' : 'Non'}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-on-surface-variant">{site.last_ad_count ?? '—'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{site.last_load_time_ms ?? '—'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{site.last_country || '—'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{site.last_lang || '—'}</td>
                    <td className="py-3 px-3 text-on-surface-variant text-xs">{site.category_iab || '—'}</td>
                    <td className="py-3 px-3 text-on-surface-variant">{site.audit_count}</td>
                    <td className="py-3 px-3 text-on-surface-variant text-xs">
                      {site.last_audit_date ? new Date(site.last_audit_date).toLocaleDateString('fr-FR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] mt-2">
                <span className="text-xs text-on-surface-variant">
                  {total} sites — page {page}/{pages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 rounded-lg text-xs bg-surface-high text-on-surface-variant disabled:opacity-30 hover:bg-white/[0.08]"
                  >
                    Precedent
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="px-3 py-1 rounded-lg text-xs bg-surface-high text-on-surface-variant disabled:opacity-30 hover:bg-white/[0.08]"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Site Detail Modal */}
      {selectedSite && (
        <SiteDetailModal site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}
    </div>
  );
}

/* ── Site Detail Modal (adapted for SiteEntry from domains table) ── */

function SiteDetailModal({ site, onClose }: { site: SiteEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-card rounded-2xl p-8 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto glow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extralight text-on-surface">{site.domain}</h2>
          <button onClick={onClose} className="text-dim hover:text-on-surface transition-colors">&times;</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Score</p>
            <p className={`text-2xl font-extralight ${
              (site.last_score ?? 0) >= 7 ? 'text-success' : (site.last_score ?? 0) >= 4 ? 'text-warning' : 'text-danger'
            }`}>{site.last_score?.toFixed(1) ?? '—'}</p>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Sante</p>
            <Badge variant={site.last_health === 'ok' ? 'ok' : 'dead'}>{site.last_health || '—'}</Badge>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Pubs</p>
            <p className="text-2xl font-extralight text-on-surface">{site.last_ad_count ?? '—'}</p>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">ads.txt</p>
            <Badge variant={site.last_ads_txt === 1 ? 'present' : 'absent'}>
              {site.last_ads_txt === 1 ? 'Present' : 'Absent'}
            </Badge>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Pays</span>
            <span className="text-on-surface">{site.last_country || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Langue</span>
            <span className="text-on-surface">{site.last_lang || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">TLD</span>
            <span className="text-on-surface">{site.last_tld || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Categorie</span>
            <span className="text-on-surface">{site.category_iab || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Temps de chargement</span>
            <span className="text-on-surface">{site.last_load_time_ms ? `${site.last_load_time_ms} ms` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Nombre d'audits</span>
            <span className="text-on-surface">{site.audit_count}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Dernier audit</span>
            <span className="text-on-surface">
              {site.last_audit_date ? new Date(site.last_audit_date).toLocaleDateString('fr-FR') : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Tendance</span>
            <span className="flex items-center gap-1">
              {site.last_score_trend === 'up' && <><ChevronUp size={14} className="text-success" /> <span className="text-success">Hausse</span></>}
              {site.last_score_trend === 'down' && <><ChevronDown size={14} className="text-danger" /> <span className="text-danger">Baisse</span></>}
              {site.last_score_trend === 'stable' && <><Minus size={14} className="text-dim" /> <span className="text-dim">Stable</span></>}
              {!site.last_score_trend && <span className="text-dim">—</span>}
            </span>
          </div>
          {site.tags && site.tags.length > 0 && (
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Tags</span>
              <span className="flex gap-1 flex-wrap justify-end">
                {site.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded bg-surface-container text-accent">{t}</span>
                ))}
              </span>
            </div>
          )}
          {site.adtech && Object.keys(site.adtech).some((k) => site.adtech[k]) && (
            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-on-surface-variant mb-2">AdTech detecte</p>
              <div className="flex gap-1 flex-wrap">
                {Object.entries(site.adtech)
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <span key={k} className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {k.toUpperCase()}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/sites/
git commit -m "feat: add Sites Intelligence page with Dashboard and Sites tabs"
```

---

### Task 5: Frontend — Sidebar Navigation + Default Redirect

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx:18-24` (add nav item)
- Modify: `frontend/app/page.tsx` (redirect to /sites)

- [ ] **Step 1: Add "Sites Intelligence" nav item to Sidebar**

In `frontend/components/layout/Sidebar.tsx`, add the Globe import at line 5:

Change:
```typescript
import { BarChart3, PlusCircle, List, Activity, Settings, LogOut, Menu, X, ChevronDown, Layers, Shield } from 'lucide-react';
```
To:
```typescript
import { BarChart3, PlusCircle, List, Activity, Settings, LogOut, Menu, X, ChevronDown, Layers, Shield, Globe } from 'lucide-react';
```

Then add the Sites Intelligence item BEFORE the workspace-scoped items. Change the NAV_ITEMS block (lines 18-24):

```typescript
  const NAV_ITEMS = [
    { href: '/sites', label: 'Sites Intelligence', icon: Globe },
    ...(wsId ? [
      { href: `/workspaces/${wsId}`, label: 'Dashboard', icon: BarChart3 },
      { href: `/workspaces/${wsId}/audit/new`, label: 'Nouvel Audit', icon: PlusCircle },
      { href: `/workspaces/${wsId}/whitelists`, label: 'Whitelists', icon: List },
      { href: `/workspaces/${wsId}/activity`, label: 'Activite', icon: Activity },
      { href: `/workspaces/${wsId}/settings`, label: 'Parametres', icon: Settings },
    ] : []),
  ];
```

- [ ] **Step 2: Update root page redirect to `/sites`**

Read `frontend/app/page.tsx` and change the redirect target from the current workspace redirect to `/sites`.

In the useEffect that redirects after auth, change the redirect destination to:

```typescript
router.push('/sites');
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx frontend/app/page.tsx
git commit -m "feat: add Sites Intelligence to sidebar nav and set as default landing"
```

---

### Task 6: Verify Everything Works End-to-End

**Files:** None (testing only)

- [ ] **Step 1: Restart backend**

```bash
kill $(lsof -t -i:8010) 2>/dev/null
cd C:/MLI/mli_crawler/backend && nohup python -m uvicorn main:app --host 0.0.0.0 --port 8010 --reload > /tmp/mli_backend.log 2>&1 &
sleep 3
curl -s http://localhost:8010/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 2: Verify backfill ran**

```bash
TOKEN=$(curl -s http://localhost:8010/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@dentsu.com","password":"admin123"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s "http://localhost:8010/api/sites/stats" -H "Authorization: Bearer $TOKEN" | python -c "import sys,json; d=json.load(sys.stdin); print(f'Total: {d[\"total\"]}, Alive: {d[\"alive\"]}, MFA: {d[\"mfa\"]}, ads.txt: {d[\"ads_txt_ok\"]}')"
```

Expected: Total ~100+

- [ ] **Step 3: Verify frontend compiles**

Check `http://localhost:3010/sites` loads without errors.

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: Sites Intelligence page complete — dashboard + sites list"
```
