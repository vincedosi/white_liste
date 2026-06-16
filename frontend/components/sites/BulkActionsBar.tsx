'use client';
import { RefreshCw, Brain, Trash2, X } from 'lucide-react';

export function BulkActionsBar({
  count, onRescan, onCategorize, onRemove, onClear,
}: {
  count: number; onRescan: () => void; onCategorize: () => void;
  onRemove: () => void; onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface border border-outline/30 rounded-lg shadow-lg px-5 py-3 flex items-center gap-4 z-50">
      <span className="text-[13px] text-on-surface">
        <span className="num font-medium">{count}</span> site{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </span>
      <div className="w-px h-5 bg-outline/30" />
      <button onClick={onRescan} className="flex items-center gap-1.5 text-[13px] text-on-surface-variant hover:text-on-surface"><RefreshCw className="w-3.5 h-3.5" /> Ré-analyser</button>
      <button onClick={onCategorize} className="flex items-center gap-1.5 text-[13px] text-on-surface-variant hover:text-on-surface"><Brain className="w-3.5 h-3.5" /> Catégoriser</button>
      <button onClick={onRemove} className="flex items-center gap-1.5 text-[13px] text-danger hover:opacity-80"><Trash2 className="w-3.5 h-3.5" /> Retirer</button>
      <button onClick={onClear} className="text-on-surface-variant/50 hover:text-on-surface ml-2"><X className="w-4 h-4" /></button>
    </div>
  );
}
