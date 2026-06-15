import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

export function TrendArrow({ trend }: { trend: 'up' | 'down' | 'stable' | null }) {
  if (!trend || trend === 'stable') {
    return <Minus className="w-3 h-3 text-on-surface-variant/40" aria-label="stable" />;
  }
  // score "up" = plus propre (mieux) → vert ; "down" = plus de pub → rouge
  if (trend === 'up') {
    return <ArrowUp className="w-3 h-3 text-success" aria-label="en amélioration" />;
  }
  return <ArrowDown className="w-3 h-3 text-danger" aria-label="en dégradation" />;
}
