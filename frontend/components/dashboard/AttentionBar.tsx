'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/Card';

interface AttentionBarData {
  domain: string;
  atf: number;
  mid: number;
  deep: number;
  footer: number;
  sticky: number;
}

interface AttentionBarProps {
  data: AttentionBarData[];
}

const ZONE_COLORS = {
  atf: '#EF4444',
  mid: '#F97316',
  deep: '#EAB308',
  footer: '#CBD5E1',
  sticky: '#8B5CF6',
};

const ZONE_LABELS: Record<string, string> = {
  atf: 'ATF',
  mid: 'Mid',
  deep: 'Deep',
  footer: 'Footer',
  sticky: 'Sticky',
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-outline rounded-lg px-3 py-2 shadow-lg">
      <p className="font-mono text-xs text-on-surface font-bold mb-1">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="font-mono text-[11px] text-muted flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          {ZONE_LABELS[item.name] || item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload) return null;
  return (
    <div className="flex items-center justify-center gap-4 mt-2">
      {payload.map((entry) => (
        <span key={entry.value} className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {ZONE_LABELS[entry.value] || entry.value}
        </span>
      ))}
    </div>
  );
}

export function AttentionBar({ data }: AttentionBarProps) {
  const chartData = data.map((d) => ({
    ...d,
    domain: d.domain.length > 20 ? d.domain.slice(0, 18) + '...' : d.domain,
  }));

  return (
    <Card>
      <h3 className="font-sans text-[11px] font-medium uppercase tracking-[1.5px] text-dim mb-4">
        Pression publicitaire par zone
      </h3>
      <div className="w-full" style={{ height: Math.max(200, data.length * 36 + 60) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
            <XAxis
              type="number"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="domain"
              width={140}
              tick={{ fill: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
            <Legend content={<CustomLegend />} />
            <Bar dataKey="atf" stackId="a" fill={ZONE_COLORS.atf} radius={[0, 0, 0, 0]} />
            <Bar dataKey="mid" stackId="a" fill={ZONE_COLORS.mid} />
            <Bar dataKey="deep" stackId="a" fill={ZONE_COLORS.deep} />
            <Bar dataKey="footer" stackId="a" fill={ZONE_COLORS.footer} />
            <Bar dataKey="sticky" stackId="a" fill={ZONE_COLORS.sticky} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
