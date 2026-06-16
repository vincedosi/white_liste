'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';

interface SspChartProps { data: Array<{ name: string; count: number }>; }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-lg px-3 py-2">
      <p className="font-label text-xs text-on-surface font-light">
        {label}: <span className="font-medium text-accent">{payload[0].value}</span>
      </p>
    </div>
  );
}

export function SspChart({ data }: SspChartProps) {
  return (
    <Card>
      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Top SSPs (ads.txt)</span>
      <div className="w-full mt-4" style={{ height: Math.max(160, data.length * 32 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#909090', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#909090', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,102,255,0.04)' }} />
            <Bar dataKey="count" fill="#00e5ff" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
