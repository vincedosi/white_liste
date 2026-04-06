'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface AdTechRow {
  domain: string;
  adtech: Record<string, boolean>;
  trackers: number;
}

interface AdTechTableProps {
  data: AdTechRow[];
  onDomainClick?: (domain: string) => void;
}

const ADTECH_COLS = ['GPT', 'Prebid', 'Amazon', 'Criteo', 'Teads', 'Taboola', 'Outbrain'];

export function AdTechTable({ data, onDomainClick }: AdTechTableProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-high">
              <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium">
                Domaine
              </th>
              {ADTECH_COLS.map((col) => (
                <th
                  key={col}
                  className="px-3 py-3 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium text-center"
                >
                  {col}
                </th>
              ))}
              <th className="px-3 py-3 font-mono text-[10px] uppercase tracking-[2px] text-dim font-medium text-center">
                Trackers
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.domain}
                className="border-t border-outline-light bg-white hover:bg-surface-mid transition-colors"
              >
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onDomainClick?.(row.domain)}
                    className="font-mono text-sm text-primary hover:text-primary-dim hover:underline transition-colors text-left"
                  >
                    {row.domain}
                  </button>
                </td>
                {ADTECH_COLS.map((col) => {
                  const key = col.toLowerCase();
                  const present = row.adtech[key] ?? false;
                  return (
                    <td key={col} className="px-3 py-2.5 text-center">
                      <Badge variant={present ? 'present' : 'absent'}>
                        {present ? 'Oui' : '--'}
                      </Badge>
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center font-mono text-sm text-muted">
                  {row.trackers}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={ADTECH_COLS.length + 2} className="px-4 py-8 text-center text-sm text-dim">
                  Aucune donnee ad-tech disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
