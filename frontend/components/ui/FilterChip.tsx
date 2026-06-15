export function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-label text-[11px] transition-colors border ${
        active
          ? 'bg-accent/10 border-accent/40 text-accent'
          : 'border-outline/30 text-on-surface-variant hover:text-on-surface hover:border-outline/60'
      }`}
    >
      {children}
      {count != null && <span className="num opacity-60">({count.toLocaleString('fr-FR')})</span>}
    </button>
  );
}
