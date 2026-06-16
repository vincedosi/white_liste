# Sites Intelligence — Design Spec

## Goal
Single-page "Sites Intelligence" view that shows ALL crawled domains in a rich dashboard (KPIs, map, charts) + sortable/filterable table. Replaces workspace-centric navigation as the primary demo view.

## Architecture
- New page at `/sites` (top-level, no workspace dependency)
- Two tabs: **Dashboard** (KPIs + map + charts) and **Sites** (full table)
- New backend endpoint `GET /api/sites` (authenticated, no admin required) returns all domains from `domains` table with pagination/sort/filter
- New backend endpoint `GET /api/sites/stats` returns aggregate KPIs
- Backfill script to populate missing domains from audit results_json into the domains table

## Data Source
The `domains` table (53 rows currently, 104 unique across audits) is the single source of truth. Each row has: score, trend, health, ads_txt, ad_count, load_time, trackers, adtech stack (JSON), country, lang, TLD, category, brand_safety, audit_count.

## Tab 1: Dashboard
**KPI Cards (top row):**
- Total sites crawled
- Score moyen d'attention
- Sites MFA (score < 4)
- ads.txt coverage (%)
- Sites alive vs dead
- Ad count moyen
- Top pays
- Stack adtech (% Prebid, GPT, etc.)

**Map:** ServerMap choropleth with all domains plotted by country

**Charts:**
- Score distribution histogram
- Health status donut (alive/dead/redirect/error)
- Top 10 countries bar chart
- Category IAB distribution bar chart
- Adtech stack presence bar chart

## Tab 2: Sites List
- Full table of all domains with all columns, sortable/filterable
- Search bar + filters (health, score range, country, ads_txt, category)
- Click row to open SiteModal with full detail + screenshot

## Navigation
- `/sites` becomes the post-login landing page
- Added to Sidebar as top-level item (above workspace items)
- Workspaces remain accessible but secondary
