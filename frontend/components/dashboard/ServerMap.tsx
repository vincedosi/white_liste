'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import Map, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import { Card } from '@/components/ui/Card';
import clsx from 'clsx';

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

function getDotColor(action?: string): string {
  if (action === 'remove' || action === 'remove_dead') return '#ff716c';
  if (action === 'flag') return '#F59E0B';
  return '#00fc40';
}

function getDotSize(score?: number): number {
  return score == null ? 8 : Math.max(6, score * 1.5 + 4);
}

// Dark map style — free tiles from CartoCDN
const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export function ServerMap({ data }: ServerMapProps) {
  const [selectedMarker, setSelectedMarker] = useState<ServerLocation | null>(null);

  const markers = useMemo(() => {
    const countByCC: Record<string, number> = {};
    return data
      .map((loc) => {
        const cc = loc.countryCode?.toUpperCase() ?? '';
        const coords = COUNTRY_COORDS[cc];
        if (!coords) return null;
        countByCC[cc] = (countByCC[cc] || 0) + 1;
        const offset = (countByCC[cc] - 1) * 0.5;
        return {
          loc,
          lat: coords[0] + offset * 0.3,
          lon: coords[1] + offset * 0.5,
          size: getDotSize(loc.score),
          color: getDotColor(loc.action),
        };
      })
      .filter(Boolean) as Array<{ loc: ServerLocation; lat: number; lon: number; size: number; color: string }>;
  }, [data]);

  if (data.length === 0) {
    return (
      <Card className="p-0 overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight">
            Localisation des serveurs
          </span>
        </div>
        <div className="px-6 pb-8 pt-4 text-center">
          <p className="font-label text-xs text-on-surface-variant font-extralight">
            Aucune donnee de geolocalisation disponible.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight">
          Localisation des serveurs
        </span>
        <div className="flex items-center gap-4">
          {[
            { color: 'bg-[#00fc40]', label: 'Conserver' },
            { color: 'bg-[#F59E0B]', label: 'Surveiller' },
            { color: 'bg-[#ff716c]', label: 'Supprimer' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${l.color}`} />
              <span className="font-label text-[8px] text-on-surface-variant/50 font-extralight uppercase tracking-wider">
                {l.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 450 }}>
        <Map
          initialViewState={{
            longitude: 10,
            latitude: 35,
            zoom: 1.8,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle={DARK_MAP_STYLE}
          attributionControl={false}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {markers.map((m, i) => (
            <Marker
              key={i}
              longitude={m.lon}
              latitude={m.lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedMarker(m.loc);
              }}
            >
              <div className="relative cursor-pointer group">
                {/* Glow ring */}
                <div
                  className="absolute inset-0 rounded-full opacity-30 animate-pulse"
                  style={{
                    backgroundColor: m.color,
                    width: m.size + 12,
                    height: m.size + 12,
                    marginLeft: -(m.size + 12) / 2,
                    marginTop: -(m.size + 12) / 2,
                    filter: 'blur(4px)',
                  }}
                />
                {/* Dot */}
                <div
                  className="rounded-full border-2 border-white/20 group-hover:border-white/50 transition-all group-hover:scale-125"
                  style={{
                    backgroundColor: m.color,
                    width: m.size,
                    height: m.size,
                    boxShadow: `0 0 12px ${m.color}60`,
                  }}
                />
              </div>
            </Marker>
          ))}

          {selectedMarker && (() => {
            const cc = selectedMarker.countryCode?.toUpperCase() ?? '';
            const coords = COUNTRY_COORDS[cc];
            if (!coords) return null;
            return (
              <Popup
                longitude={coords[1]}
                latitude={coords[0]}
                anchor="bottom"
                onClose={() => setSelectedMarker(null)}
                closeButton={true}
                closeOnClick={false}
              >
                <div className="min-w-[200px]">
                  <p className="font-label text-sm text-accent font-medium mb-2">
                    {selectedMarker.domain}
                  </p>
                  <div className="space-y-1 font-label text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant/60">Pays</span>
                      <span className="text-on-surface">{selectedMarker.country || '—'}</span>
                    </div>
                    {selectedMarker.city && selectedMarker.city !== '--' && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant/60">Ville</span>
                        <span className="text-on-surface">{selectedMarker.city}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant/60">IP</span>
                      <span className="text-on-surface font-mono text-[10px]">{selectedMarker.ip || '—'}</span>
                    </div>
                    {selectedMarker.isp && selectedMarker.isp !== '--' && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant/60">ISP</span>
                        <span className="text-on-surface">{selectedMarker.isp}</span>
                      </div>
                    )}
                    {selectedMarker.score != null && (
                      <div className="flex justify-between pt-1 border-t border-white/[0.06]">
                        <span className="text-on-surface-variant/60">Score</span>
                        <span className={clsx(
                          'font-medium',
                          selectedMarker.score >= 7 ? 'text-[#00fc40]' : selectedMarker.score >= 4 ? 'text-[#F59E0B]' : 'text-[#ff716c]',
                        )}>
                          {selectedMarker.score.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            );
          })()}
        </Map>
      </div>

      {/* Summary table */}
      <div className="overflow-x-auto border-t border-white/[0.03]">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-high">
              {['Domaine', 'Pays', 'Ville', 'IP', 'ISP', 'Score'].map((c) => (
                <th key={c} className="px-4 py-2.5 font-label text-[9px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.domain}
                className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => setSelectedMarker(row)}
              >
                <td className="px-4 py-2.5 font-label text-[12px] text-accent font-light">{row.domain}</td>
                <td className="px-3 py-2.5 font-label text-xs text-on-surface font-extralight">{row.country || '—'}</td>
                <td className="px-3 py-2.5 font-label text-xs text-on-surface-variant font-extralight">{row.city || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[10px] text-on-surface-variant font-extralight">{row.ip || '—'}</td>
                <td className="px-3 py-2.5 font-label text-[10px] text-on-surface-variant font-extralight">{row.isp || '—'}</td>
                <td className="px-3 py-2.5">
                  <span className={clsx(
                    'font-label text-xs font-medium',
                    row.score && row.score >= 7 ? 'text-[#00fc40]' : row.score && row.score >= 4 ? 'text-[#F59E0B]' : row.score ? 'text-[#ff716c]' : 'text-on-surface-variant/40',
                  )}>
                    {row.score?.toFixed(1) || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
