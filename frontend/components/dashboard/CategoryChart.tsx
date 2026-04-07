'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';

interface CategoryChartProps { data: Record<string, number>; }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-lg px-3 py-2">
      <p className="font-label text-xs text-on-surface font-light">{label}</p>
      <p className="font-label text-xs font-medium text-accent">{payload[0].value} site{payload[0].value > 1 ? 's' : ''}</p>
    </div>
  );
}

export function CategoryChart({ data }: CategoryChartProps) {
  const chartData = useMemo(() =>
    Object.entries(data).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 12),
  [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Categories IAB</span>
        <div className="flex items-center justify-center py-10">
          <p className="font-label text-xs text-on-surface-variant font-extralight">Aucune donnee disponible.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Categories IAB</span>
      <div className="w-full mt-4" style={{ height: Math.max(160, chartData.length * 32 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#909090', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fill: '#909090', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,102,255,0.04)' }} />
            <Bar dataKey="count" fill="#0066ff" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
