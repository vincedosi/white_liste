'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '@/components/ui/Card';

interface AttentionBarData { domain: string; atf: number; mid: number; deep: number; footer: number; sticky: number; }
interface AttentionBarProps { data: AttentionBarData[]; }

const ZONE_COLORS = { atf: '#ff716c', mid: '#F59E0B', deep: '#00e5ff', footer: '#404040', sticky: '#a855f6' };
const ZONE_LABELS: Record<string, string> = { atf: 'ATF', mid: 'Mid', deep: 'Deep', footer: 'Footer', sticky: 'Sticky' };

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-lg px-3 py-2">
      <p className="font-label text-xs text-on-surface font-medium mb-1">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="font-label text-[10px] text-on-surface-variant flex items-center gap-2 font-extralight">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
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
        <span key={entry.value} className="flex items-center gap-1.5 font-label text-[9px] text-on-surface-variant font-extralight tracking-wider">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {ZONE_LABELS[entry.value] || entry.value}
        </span>
      ))}
    </div>
  );
}

export function AttentionBar({ data }: AttentionBarProps) {
  const chartData = data.map((d) => ({ ...d, domain: d.domain.length > 20 ? d.domain.slice(0, 18) + '...' : d.domain }));
  return (
    <Card>
      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
        Pression publicitaire par zone
      </span>
      <div className="w-full mt-4" style={{ height: Math.max(200, data.length * 36 + 60) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#909090', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="domain" width={140} tick={{ fill: '#909090', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,102,255,0.04)' }} />
            <Legend content={<CustomLegend />} />
            <Bar dataKey="atf" stackId="a" fill={ZONE_COLORS.atf} />
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
