'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface AdTechRow { domain: string; adtech: Record<string, boolean>; trackers: number; }
interface AdTechTableProps { data: AdTechRow[]; onDomainClick?: (domain: string) => void; }

const ADTECH_COLS = ['GPT', 'Prebid', 'Amazon', 'Criteo', 'Teads', 'Taboola', 'Outbrain'];

export function AdTechTable({ data, onDomainClick }: AdTechTableProps) {
  return (
    <Card className="p-0 overflow-hidden" glow="none">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-high border-b border-white/[0.03]">
              <th className="px-4 py-3 font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Domaine</th>
              {ADTECH_COLS.map((col) => (
                <th key={col} className="px-3 py-3 font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight text-center">{col}</th>
              ))}
              <th className="px-3 py-3 font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight text-center">Trackers</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.domain} className="border-t border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5">
                  <button type="button" onClick={() => onDomainClick?.(row.domain)} className="font-label text-[12px] text-accent font-light hover:text-accent/70 transition-colors text-left tracking-wide">
                    {row.domain}
                  </button>
                </td>
                {ADTECH_COLS.map((col) => {
                  const present = row.adtech[col.toLowerCase()] ?? false;
                  return (
                    <td key={col} className="px-3 py-2.5 text-center">
                      <Badge variant={present ? 'present' : 'absent'}>{present ? 'OUI' : '--'}</Badge>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center font-label text-xs text-on-surface-variant font-extralight">{row.trackers}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={ADTECH_COLS.length + 2} className="px-4 py-8 text-center font-label text-xs text-on-surface-variant font-extralight">Aucune donnee disponible.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
