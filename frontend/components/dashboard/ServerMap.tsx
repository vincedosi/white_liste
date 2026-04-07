'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
// @ts-expect-error — no types for this package
import countriesRaw from 'world-map-country-shapes';

interface CountryShape { id: string; shape: string; }
const countries: CountryShape[] = countriesRaw.default || countriesRaw;

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
interface ServerMapProps { data: ServerLocation[]; }

// Map country codes to action colors
function getActionColor(action?: string): string {
  if (action === 'remove' || action === 'remove_dead') return '#fecaca'; // red-200
  if (action === 'flag') return '#fde68a'; // amber-200
  return '#bbf7d0'; // green-200
}

function getActionBorder(action?: string): string {
  if (action === 'remove' || action === 'remove_dead') return '#ef4444';
  if (action === 'flag') return '#f59e0b';
  return '#22c55e';
}

// Density: more domains in same country = darker shade
const DENSITY_GREENS = ['#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a'];
const DENSITY_REDS   = ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626'];
const DENSITY_AMBERS = ['#fef9c3', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b', '#d97706'];

function getDensityColor(count: number, action: string): string {
  const idx = Math.min(count - 1, 5);
  if (action === 'remove' || action === 'remove_dead') return DENSITY_REDS[idx];
  if (action === 'flag') return DENSITY_AMBERS[idx];
  return DENSITY_GREENS[idx];
}

interface TooltipInfo {
  x: number;
  y: number;
  countryCode: string;
  country: string;
  domains: ServerLocation[];
}

export function ServerMap({ data }: ServerMapProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // Build country -> domains mapping
  const countryMap = useMemo(() => {
    const map: Record<string, ServerLocation[]> = {};
    for (const loc of data) {
      const cc = loc.countryCode?.toUpperCase() ?? '';
      if (!cc) continue;
      if (!map[cc]) map[cc] = [];
      map[cc].push(loc);
    }
    return map;
  }, [data]);

  // Determine dominant action per country (worst case wins)
  const countryAction = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [cc, locs] of Object.entries(countryMap)) {
      if (locs.some((l) => l.action === 'remove' || l.action === 'remove_dead')) {
        result[cc] = 'remove';
      } else if (locs.some((l) => l.action === 'flag')) {
        result[cc] = 'flag';
      } else {
        result[cc] = 'keep';
      }
    }
    return result;
  }, [countryMap]);

  const handleMouseEnter = (cc: string, e: React.MouseEvent) => {
    const locs = countryMap[cc];
    if (!locs) return;
    const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      countryCode: cc,
      country: locs[0]?.country || cc,
      domains: locs,
    });
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center justify-between">
        <span className="font-label text-[10px] uppercase tracking-[0.15em] text-muted font-semibold">
          Localisation des serveurs
        </span>
        <div className="flex items-center gap-4">
          {[
            { color: 'bg-green-300', label: 'Conserver' },
            { color: 'bg-amber-300', label: 'Surveiller' },
            { color: 'bg-red-300', label: 'Supprimer' },
            { color: 'bg-slate-100 border border-slate-200', label: 'Pas de donnees' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
              <span className="text-[9px] text-muted font-medium">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative w-full px-4 pb-4">
        <svg
          viewBox="100 200 1800 900"
          className="w-full h-auto"
          style={{ background: '#f8fafc', borderRadius: 8 }}
        >
          {countries.map((c) => {
            const cc = c.id.toUpperCase();
            const locs = countryMap[cc];
            const hasData = !!locs;
            const count = locs?.length ?? 0;
            const action = countryAction[cc] ?? 'none';

            const fill = hasData ? getDensityColor(count, action) : '#f1f5f9';
            const stroke = hasData ? getActionBorder(action) : '#cbd5e1';
            const strokeWidth = hasData ? 0.8 : 0.3;

            return (
              <path
                key={cc}
                d={c.shape}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                className={hasData ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}
                onMouseEnter={hasData ? (e) => handleMouseEnter(cc, e) : undefined}
                onMouseLeave={hasData ? () => setTooltip(null) : undefined}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-20"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -110%)',
            }}
          >
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-3 min-w-[200px]">
              <p className="text-xs font-bold text-slate-800 mb-1.5">
                {tooltip.country}
                <span className="text-slate-400 font-normal ml-1">({tooltip.countryCode})</span>
              </p>
              <p className="text-[10px] text-slate-500 mb-2">
                {tooltip.domains.length} serveur{tooltip.domains.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {tooltip.domains.map((d) => (
                  <div key={d.domain} className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="text-primary font-medium truncate">{d.domain}</span>
                    <span className="text-slate-400 font-mono flex-shrink-0">{d.ip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {data.length === 0 && (
        <div className="px-6 pb-6 text-center">
          <p className="text-xs text-muted">Aucune donnee de geolocalisation disponible.</p>
        </div>
      )}

      {/* Table below */}
      {data.length > 0 && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50">
                {['Domaine', 'Pays', 'Ville', 'IP', 'ISP'].map((c) => (
                  <th key={c} className="px-4 py-2.5 text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.domain} className="border-t border-slate-50 hover:bg-primary/[0.02] transition-colors">
                  <td className="px-4 py-2.5 text-xs text-primary font-medium">{row.domain}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700">{row.country || '--'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{row.city || '--'}</td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-slate-400">{row.ip || '--'}</td>
                  <td className="px-3 py-2.5 text-[10px] text-slate-400">{row.isp || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
