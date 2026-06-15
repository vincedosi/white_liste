'use client';
import { useState, useRef, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';

export function SiteKebabMenu({
  onRescan, onValidate, onOpenSite, onOpenDetail, onRemove,
}: {
  onRescan: () => void; onValidate: () => void; onOpenSite: () => void;
  onOpenDetail: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const item = 'block w-full text-left px-3 py-2 text-[12px] hover:bg-surface-high transition-colors';
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="p-1 rounded hover:bg-surface-high text-on-surface-variant">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-outline/30 bg-surface shadow-lg py-1">
          <button className={item} onClick={run(onRescan)}>Ré-analyser maintenant</button>
          <button className={item} onClick={run(onValidate)}>Valider un score</button>
          <button className={item} onClick={run(onOpenSite)}>Ouvrir le site</button>
          <button className={item} onClick={run(onOpenDetail)}>Voir le détail</button>
          <div className="my-1 border-t border-outline/20" />
          <button className={`${item} text-danger`} onClick={run(onRemove)}>Retirer de la liste</button>
        </div>
      )}
    </div>
  );
}
