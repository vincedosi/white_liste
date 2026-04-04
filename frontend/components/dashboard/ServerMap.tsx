'use client';

import { useState, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/Card';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Country coordinates (lat, lon)                                      */
/* ------------------------------------------------------------------ */

const COUNTRY_COORDS: Record<string, [number, number]> = {
  FR: [46.6, 2.2], US: [39.8, -98.6], DE: [51.2, 10.4],
  GB: [55.4, -3.4], NL: [52.1, 5.3], CA: [56.1, -106.3],
  IE: [53.4, -8.2], BE: [50.5, 4.5], CH: [46.8, 8.2],
  IT: [41.9, 12.5], ES: [40.5, -3.7], PT: [39.4, -8.2],
  SE: [60.1, 18.6], NO: [60.5, 8.5], DK: [56.3, 9.5],
  FI: [61.9, 25.7], PL: [51.9, 19.1], CZ: [49.8, 15.5],
  AT: [47.5, 14.6], JP: [36.2, 138.3], AU: [-25.3, 133.8],
  SG: [1.4, 103.8], HK: [22.4, 114.1], IN: [20.6, 79.0],
  BR: [-14.2, -51.9], RU: [61.5, 105.3], ZA: [-30.6, 22.9],
  CN: [35.9, 104.2], KR: [35.9, 127.8], MX: [23.6, -102.5],
  AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.3],
  TH: [15.9, 100.5], ID: [-0.8, 113.9], MY: [4.2, 101.9],
  PH: [12.9, 121.8], VN: [14.1, 108.3], TW: [23.7, 121.0],
  IL: [31.0, 34.8], AE: [23.4, 53.8], SA: [23.9, 45.1],
  TR: [38.9, 35.2], EG: [26.8, 30.8], NG: [9.1, 8.7],
  KE: [-0.0, 37.9], GH: [7.9, -1.0], MA: [31.8, -7.1],
  DZ: [28.0, 1.7], TN: [33.9, 9.5], UA: [48.4, 31.2],
  RO: [45.9, 24.9], HU: [47.2, 19.5], BG: [42.7, 25.5],
  GR: [39.1, 21.8], HR: [45.1, 15.2], LU: [49.8, 6.1],
  LT: [55.2, 23.9], LV: [56.9, 24.1], EE: [58.6, 25.0],
  NZ: [-40.9, 174.9], CY: [35.1, 33.4], MT: [35.9, 14.4],
  IS: [64.9, -19.0], SK: [48.7, 19.7], SI: [46.2, 14.8],
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function latLonToXY(lat: number, lon: number, width: number, height: number) {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

function getDotColor(action?: string): string {
  if (!action) return '#4edea3';
  switch (action) {
    case 'remove': return '#EF4444';
    case 'flag': return '#F97316';
    default: return '#4edea3';
  }
}

function getDotSize(score?: number): number {
  if (score == null) return 5;
  return Math.max(4, score * 2 + 4);
}

/* ------------------------------------------------------------------ */
/* Tooltip component                                                   */
/* ------------------------------------------------------------------ */

interface TooltipInfo {
  x: number;
  y: number;
  domain: string;
  country: string;
  ip: string;
  isp: string;
  score?: number;
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function ServerMap({ data }: ServerMapProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const MAP_W = 800;
  const MAP_H = 400;

  /* Group by country code → aggregate dots (offset slightly if same country) */
  const dots = useMemo(() => {
    const result: Array<{
      x: number;
      y: number;
      size: number;
      color: string;
      loc: ServerLocation;
    }> = [];

    // Track count per country code for offset
    const countByCC: Record<string, number> = {};

    for (const loc of data) {
      const cc = loc.countryCode?.toUpperCase() ?? '';
      const coords = COUNTRY_COORDS[cc];
      if (!coords) continue;

      countByCC[cc] = (countByCC[cc] || 0) + 1;
      const offset = (countByCC[cc] - 1) * 3;

      const { x, y } = latLonToXY(coords[0], coords[1], MAP_W, MAP_H);

      result.push({
        x: x + offset,
        y: y + (offset % 2 === 0 ? offset : -offset),
        size: getDotSize(loc.score),
        color: getDotColor(loc.action),
        loc,
      });
    }

    return result;
  }, [data]);

  const handleMouseEnter = (
    e: React.MouseEvent<SVGCircleElement>,
    loc: ServerLocation,
    dotX: number,
    dotY: number,
  ) => {
    setTooltip({
      x: dotX,
      y: dotY,
      domain: loc.domain,
      country: loc.country,
      ip: loc.ip,
      isp: loc.isp,
      score: loc.score,
    });
  };

  const handleMouseLeave = () => setTooltip(null);

  /* Grid lines */
  const latLines = [-60, -30, 0, 30, 60];
  const lonLines = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim">
          Localisation des serveurs
        </h3>
      </div>

      <div className="relative w-full" style={{ maxHeight: 440 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="w-full h-auto"
          style={{ background: '#090e17' }}
        >
          {/* Grid lines — longitude */}
          {lonLines.map((lon) => {
            const { x } = latLonToXY(0, lon, MAP_W, MAP_H);
            return (
              <line
                key={`lon-${lon}`}
                x1={x}
                y1={0}
                x2={x}
                y2={MAP_H}
                stroke="#3c4a42"
                strokeOpacity={0.12}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Grid lines — latitude */}
          {latLines.map((lat) => {
            const { y } = latLonToXY(lat, 0, MAP_W, MAP_H);
            return (
              <line
                key={`lat-${lat}`}
                x1={0}
                y1={y}
                x2={MAP_W}
                y2={y}
                stroke="#3c4a42"
                strokeOpacity={0.12}
                strokeWidth={0.5}
              />
            );
          })}

          {/* Equator highlight */}
          <line
            x1={0}
            y1={MAP_H / 2}
            x2={MAP_W}
            y2={MAP_H / 2}
            stroke="#3c4a42"
            strokeOpacity={0.25}
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />

          {/* Prime meridian highlight */}
          <line
            x1={MAP_W / 2}
            y1={0}
            x2={MAP_W / 2}
            y2={MAP_H}
            stroke="#3c4a42"
            strokeOpacity={0.25}
            strokeWidth={0.5}
            strokeDasharray="4,4"
          />

          {/* Dots — glow layer */}
          {dots.map((dot, i) => (
            <circle
              key={`glow-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={dot.size + 4}
              fill={dot.color}
              opacity={0.15}
            />
          ))}

          {/* Dots — main layer */}
          {dots.map((dot, i) => (
            <circle
              key={`dot-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={dot.size}
              fill={dot.color}
              opacity={0.9}
              stroke={dot.color}
              strokeWidth={1}
              strokeOpacity={0.4}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={(e) => handleMouseEnter(e, dot.loc, dot.x, dot.y)}
              onMouseLeave={handleMouseLeave}
            />
          ))}
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: `${(tooltip.x / MAP_W) * 100}%`,
              top: `${(tooltip.y / MAP_H) * 100}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="bg-surface-high border border-outline/30 rounded-lg px-3 py-2.5 shadow-xl min-w-[180px]">
              <p className="font-mono text-xs text-primary font-semibold mb-1">
                {tooltip.domain}
              </p>
              <div className="space-y-0.5 text-[11px] font-mono text-muted">
                <p>{tooltip.country}</p>
                <p className="text-dim">{tooltip.ip}</p>
                {tooltip.isp && tooltip.isp !== '--' && (
                  <p className="text-dim">{tooltip.isp}</p>
                )}
                {tooltip.score != null && (
                  <p className="text-on-surface mt-1">
                    Score: <span className="text-primary font-bold">{tooltip.score.toFixed(1)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 right-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-mono text-[9px] text-dim">Conserver</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span className="font-mono text-[9px] text-dim">Surveiller</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-danger" />
            <span className="font-mono text-[9px] text-dim">Supprimer</span>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {data.length === 0 && (
        <div className="px-5 pb-6 pt-2 text-center">
          <p className="text-sm text-dim font-mono">
            Aucune donnee de geolocalisation disponible.
          </p>
        </div>
      )}

      {/* Summary table below map */}
      {data.length > 0 && (
        <div className="overflow-x-auto border-t border-outline/10">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-high">
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium">
                  Domaine
                </th>
                <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium">
                  Pays
                </th>
                <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium">
                  IP
                </th>
                <th className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium">
                  ISP
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.domain}
                  className="border-t border-outline/10 bg-surface-low hover:bg-surface-mid transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-sm text-primary">{row.domain}</td>
                  <td className="px-3 py-2.5 font-mono text-sm text-on-surface">{row.country}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-dim">{row.ip}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-dim">{row.isp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
