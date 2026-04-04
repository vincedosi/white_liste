'use client';

import { Card } from '@/components/ui/Card';

interface ServerLocation {
  domain: string;
  country: string;
  city: string;
  ip: string;
  isp: string;
}

interface ServerMapProps {
  data: ServerLocation[];
}

export function ServerMap({ data }: ServerMapProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim">
          Localisation des serveurs
        </h3>
      </div>
      <div className="overflow-x-auto">
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
                Ville
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
                <td className="px-3 py-2.5 font-mono text-sm text-muted">{row.city}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-dim">{row.ip}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-dim">{row.isp}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-dim">
                  Aucune donnee de geolocalisation disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
