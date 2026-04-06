'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/Card';

interface SspChartProps {
  data: Array<{ name: string; count: number }>;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-outline rounded-lg px-3 py-2 shadow-lg">
      <p className="font-mono text-xs text-on-surface">
        {label}: <span className="font-bold text-primary">{payload[0].value}</span>
      </p>
    </div>
  );
}

export function SspChart({ data }: SspChartProps) {
  return (
    <Card>
      <h3 className="font-sans text-[11px] font-medium uppercase tracking-[1.5px] text-dim mb-4">
        Top SSPs (ads.txt)
      </h3>
      <div className="w-full" style={{ height: Math.max(160, data.length * 32 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
            <XAxis
              type="number"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
            <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
