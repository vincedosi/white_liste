'use client';

import { useState, useMemo } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface ServerLocation {
  domain: string;
  country: string;
  countryCode?: string;
  city: string;
  ip: string;
  isp: string;
  score?: number;
  action?: string;
}

interface ServerMapProps {
  data: ServerLocation[];
  hideTable?: boolean;
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  FR: [46.6, 2.2], US: [39.8, -98.6], DE: [51.2, 10.4], GB: [55.4, -3.4], NL: [52.1, 5.3],
  CA: [56.1, -106.3], IE: [53.4, -8.2], BE: [50.5, 4.5], CH: [46.8, 8.2], IT: [41.9, 12.5],
  ES: [40.5, -3.7], PT: [39.4, -8.2], SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5],
  FI: [61.9, 25.7], PL: [51.9, 19.1], CZ: [49.8, 15.5], AT: [47.5, 14.6], JP: [36.2, 138.3],
  AU: [-25.3, 133.8], SG: [1.4, 103.8], HK: [22.4, 114.1], IN: [20.6, 79.0], BR: [-14.2, -51.9],
  RU: [61.5, 105.3], ZA: [-30.6, 22.9], CN: [35.9, 104.2], KR: [35.9, 127.8], MX: [23.6, -102.5],
  AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.3], TH: [15.9, 100.5], ID: [-0.8, 113.9],
  MY: [4.2, 101.9], PH: [12.9, 121.8], VN: [14.1, 108.3], TW: [23.7, 121.0], IL: [31.0, 34.8],
  AE: [23.4, 53.8], SA: [23.9, 45.1], TR: [38.9, 35.2], EG: [26.8, 30.8], NG: [9.1, 8.7],
  KE: [-0.0, 37.9], GH: [7.9, -1.0], MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.5],
  UA: [48.4, 31.2], RO: [45.9, 24.9], HU: [47.2, 19.5], BG: [42.7, 25.5], GR: [39.1, 21.8],
  HR: [45.1, 15.2], LU: [49.8, 6.1], LT: [55.2, 23.9], LV: [56.9, 24.1], EE: [58.6, 25.0],
  NZ: [-40.9, 174.9], CY: [35.1, 33.4], MT: [35.9, 14.4], IS: [64.9, -19.0], SK: [48.7, 19.7], SI: [46.2, 14.8],
};

interface CountryCluster {
  cc: string;
  country: string;
  lat: number;
  lon: number;
  sites: ServerLocation[];
  count: number;
  avgScore: number;
}

/** Density color: more sites → more intense */
function densityColor(count: number, maxCount: number): string {
  const ratio = Math.min(count / Math.max(maxCount, 1), 1);
  // From dim cyan to bright electric blue
  if (ratio > 0.6) return '#0066FF';
  if (ratio > 0.3) return '#339dff';
  return '#00e5ff';
}

/** Bubble radius: log scale so France doesn't dwarf others */
function bubbleSize(count: number): number {
  return Math.max(20, Math.min(60, 14 + Math.log2(count + 1) * 10));
}

const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const PREVIEW_COUNT = 5;

export function ServerMap({ data, hideTable }: ServerMapProps) {
  const [selectedCluster, setSelectedCluster] = useState<CountryCluster | null>(null);
  const [panelCluster, setPanelCluster] = useState<CountryCluster | null>(null);

  /** Group sites by country code → one cluster per country */
  const { clusters, maxCount } = useMemo(() => {
    const byCC: Record<string, { country: string; sites: ServerLocation[] }> = {};
    for (const loc of data) {
      const cc = loc.countryCode?.toUpperCase() ?? '';
      if (!cc || !COUNTRY_COORDS[cc]) continue;
      if (!byCC[cc]) byCC[cc] = { country: loc.country, sites: [] };
      byCC[cc].sites.push(loc);
    }

    let mx = 0;
    const arr: CountryCluster[] = Object.entries(byCC).map(([cc, { country, sites }]) => {
      const coords = COUNTRY_COORDS[cc];
      const scores = sites.filter((s) => s.score != null).map((s) => s.score!);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      if (sites.length > mx) mx = sites.length;
      return { cc, country, lat: coords[0], lon: coords[1], sites, count: sites.length, avgScore: avg };
    });

    return { clusters: arr, maxCount: mx };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card className="p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <span className="font-label text-[10px] uppercase tracking-[0.15em] text-white/80 font-extralight">
            Localisation des serveurs
          </span>
        </div>
        <div className="px-6 pb-8 pt-4 text-center">
          <p className="font-label text-xs text-white/80 font-extralight">
            Aucune donnee de geolocalisation disponible.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <span className="font-label text-[10px] uppercase tracking-[0.15em] text-white/80 font-extralight">
          Densite par pays
        </span>
        <span className="font-label text-[9px] text-white/60 font-extralight">
          {clusters.length} pays &middot; {data.length} sites
        </span>
      </div>

      <div style={{ height: 450 }} className="overflow-hidden relative">
        <Map
          initialViewState={{ longitude: 10, latitude: 35, zoom: 1.8 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={DARK_MAP_STYLE}
          attributionControl={false}
          onClick={() => setSelectedCluster(null)}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {clusters.map((cluster) => {
            const size = bubbleSize(cluster.count);
            const color = densityColor(cluster.count, maxCount);
            return (
              <Marker
                key={cluster.cc}
                longitude={cluster.lon}
                latitude={cluster.lat}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedCluster(cluster);
                }}
              >
                <div
                  className="cursor-pointer group flex items-center justify-center"
                  style={{ width: size, height: size }}
                >
                  {/* Glow */}
                  <div
                    className="absolute rounded-full opacity-20"
                    style={{
                      backgroundColor: color,
                      width: size,
                      height: size,
                      filter: 'blur(6px)',
                    }}
                  />
                  {/* Bubble */}
                  <div
                    className="relative rounded-full border border-white/20 group-hover:border-white/40 transition-all group-hover:scale-110 flex items-center justify-center"
                    style={{
                      backgroundColor: `${color}30`,
                      width: size,
                      height: size,
                      boxShadow: `0 0 20px ${color}40`,
                    }}
                  >
                    <span className="font-label text-xs font-medium text-white drop-shadow-lg">
                      {cluster.count}
                    </span>
                  </div>
                </div>
              </Marker>
            );
          })}

          {/* Popup on click: country name, top 5 sites, "see all" button */}
          {selectedCluster && (
            <Popup
              longitude={selectedCluster.lon}
              latitude={selectedCluster.lat}
              anchor="bottom"
              onClose={() => setSelectedCluster(null)}
              closeButton={true}
              closeOnClick={false}
              maxWidth="280px"
            >
              <div className="min-w-[240px]">
                {/* Country header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="font-label text-sm text-accent font-medium">
                    {selectedCluster.country}
                  </p>
                  <span className="font-label text-[10px] text-white/80">
                    {selectedCluster.count} site{selectedCluster.count > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Average score */}
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/[0.08]">
                  <span className="font-label text-[10px] text-white/70">Score moyen</span>
                  <span className={clsx(
                    'font-label text-xs font-medium',
                    selectedCluster.avgScore >= 7 ? 'text-[#00fc40]' :
                    selectedCluster.avgScore >= 4 ? 'text-[#F59E0B]' : 'text-[#ff716c]',
                  )}>
                    {selectedCluster.avgScore.toFixed(1)}
                  </span>
                </div>

                {/* Top N sites */}
                <div className="space-y-1.5">
                  {selectedCluster.sites.slice(0, PREVIEW_COUNT).map((site) => (
                    <div key={site.domain} className="flex items-center justify-between">
                      <span className="font-label text-[11px] text-white truncate max-w-[160px]">
                        {site.domain}
                      </span>
                      <span className={clsx(
                        'font-label text-[10px] font-medium ml-2',
                        (site.score ?? 0) >= 7 ? 'text-[#00fc40]' :
                        (site.score ?? 0) >= 4 ? 'text-[#F59E0B]' : 'text-[#ff716c]',
                      )}>
                        {site.score?.toFixed(1) ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* "See all" button if more than preview */}
                {selectedCluster.count > PREVIEW_COUNT && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPanelCluster(selectedCluster);
                      setSelectedCluster(null);
                    }}
                    className="mt-3 w-full py-1.5 rounded-lg text-[11px] font-label text-accent border border-accent/30 hover:bg-accent/10 transition-colors"
                  >
                    Voir les {selectedCluster.count} sites
                  </button>
                )}
              </div>
            </Popup>
          )}
        </Map>

        {/* ── Side panel: full site list for a country ── */}
        {panelCluster && (
          <div className="absolute top-0 right-0 h-full w-80 bg-surface-container/95 backdrop-blur-xl border-l border-white/[0.06] z-10 flex flex-col animate-slide-right">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div>
                <p className="font-label text-sm text-accent font-medium">{panelCluster.country}</p>
                <p className="font-label text-[10px] text-white/80">
                  {panelCluster.count} sites &middot; score moyen {panelCluster.avgScore.toFixed(1)}
                </p>
              </div>
              <button
                onClick={() => setPanelCluster(null)}
                className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/80 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable site list */}
            <div className="flex-1 overflow-y-auto">
              {[...panelCluster.sites]
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((site) => (
                  <div
                    key={site.domain}
                    className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-label text-[11px] text-white truncate">{site.domain}</p>
                      {site.city && site.city !== '--' && (
                        <p className="font-label text-[9px] text-white/60">{site.city}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className={clsx(
                        'font-label text-xs font-medium',
                        (site.score ?? 0) >= 7 ? 'text-[#00fc40]' :
                        (site.score ?? 0) >= 4 ? 'text-[#F59E0B]' : 'text-[#ff716c]',
                      )}>
                        {site.score?.toFixed(1) ?? '—'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary table (legacy, hidden via prop) */}
      {!hideTable && (
        <div className="overflow-x-auto border-t border-white/[0.03]">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-high">
                {['Domaine', 'Pays', 'Score'].map((c) => (
                  <th key={c} className="px-4 py-2.5 font-label text-[9px] uppercase tracking-[0.15em] text-white/80 font-extralight">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clusters.map((cl) =>
                cl.sites.map((row) => (
                  <tr
                    key={row.domain}
                    className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-label text-[12px] text-accent font-light">{row.domain}</td>
                    <td className="px-3 py-2.5 font-label text-xs text-white font-extralight">{row.country || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={clsx(
                        'font-label text-xs font-medium',
                        (row.score ?? 0) >= 7 ? 'text-[#00fc40]' : (row.score ?? 0) >= 4 ? 'text-[#F59E0B]' : 'text-[#ff716c]',
                      )}>
                        {row.score?.toFixed(1) || '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
