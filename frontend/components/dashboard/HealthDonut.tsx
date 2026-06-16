'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/Card';

interface HealthDonutProps {
  healthy: number;
  flagged: number;
  mfa: number;
  dead: number;
}

const COLORS_MAP = {
  Sains: '#00fc40',
  Suspects: '#00e5ff',
  MFA: '#F59E0B',
  Dead: '#ff716c',
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="glass-card rounded-lg px-3 py-2">
      <p className="font-label text-xs text-on-surface flex items-center gap-2 font-light">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.payload.fill }} />
        {item.name}: <span className="font-medium">{item.value}</span>
      </p>
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
          {entry.value}
        </span>
      ))}
    </div>
  );
}

export function HealthDonut({ healthy, flagged, mfa, dead }: HealthDonutProps) {
  const data = [
    { name: 'Sains', value: healthy },
    { name: 'Suspects', value: flagged },
    { name: 'MFA', value: mfa },
    { name: 'Dead', value: dead },
  ].filter((d) => d.value > 0);

  const total = healthy + flagged + mfa + dead;

  return (
    <Card>
      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
        Sante des sites
      </span>
      <div className="w-full h-[250px] relative mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="45%" innerRadius="55%" outerRadius="80%" paddingAngle={2} dataKey="value" stroke="none">
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS_MAP[entry.name as keyof typeof COLORS_MAP]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginBottom: 30 }}>
          <span className="text-3xl font-extralight tracking-tighter text-on-surface glow-blue">{total}</span>
          <span className="font-label text-[8px] text-on-surface-variant uppercase tracking-[0.2em] font-extralight">Sites</span>
        </div>
      </div>
    </Card>
  );
}
