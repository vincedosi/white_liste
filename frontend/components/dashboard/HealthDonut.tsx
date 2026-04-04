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
  Sains: '#4edea3',
  Suspects: '#818CF8',
  MFA: '#F97316',
  Dead: '#EF4444',
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-surface-high border border-outline/30 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-mono text-xs text-on-surface flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: item.payload.fill }}
        />
        {item.name}: <span className="font-bold">{item.value}</span>
      </p>
    </div>
  );
}

function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload) return null;
  return (
    <div className="flex items-center justify-center gap-4 mt-2">
      {payload.map((entry) => (
        <span key={entry.value} className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
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
    <Card className="flex flex-col items-center">
      <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-4 self-start">
        Sante des sites
      </h3>
      <div className="w-full h-[250px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={COLORS_MAP[entry.name as keyof typeof COLORS_MAP]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ marginBottom: 30 }}>
          <span className="font-sans font-bold text-2xl text-on-surface">{total}</span>
          <span className="font-mono text-[10px] text-dim uppercase tracking-wider">Sites</span>
        </div>
      </div>
    </Card>
  );
}
