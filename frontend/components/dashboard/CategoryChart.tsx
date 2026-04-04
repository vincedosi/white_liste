'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/Card';

interface CategoryChartProps {
  data: Record<string, number>;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-high border border-outline/30 rounded-lg px-3 py-2 shadow-xl">
      <p className="font-mono text-xs text-on-surface mb-0.5">{label}</p>
      <p className="font-mono text-xs font-bold text-primary">
        {payload[0].value} site{payload[0].value > 1 ? 's' : ''}
      </p>
    </div>
  );
}

export function CategoryChart({ data }: CategoryChartProps) {
  const chartData = useMemo(
    () =>
      Object.entries(data)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12),
    [data],
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-4">
          Categories IAB
        </h3>
        <div className="flex items-center justify-center py-10">
          <p className="text-sm text-dim font-mono">
            Aucune donnee de categorisation disponible.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-dim mb-4">
        Categories IAB
      </h3>
      <div
        className="w-full"
        style={{ height: Math.max(160, chartData.length * 32 + 40) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 10, top: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              tick={{
                fill: '#64748b',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
              }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={160}
              tick={{
                fill: '#94a3b8',
                fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(78,222,163,0.04)' }}
            />
            <Bar
              dataKey="count"
              fill="#4edea3"
              radius={[0, 4, 4, 0]}
              barSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
