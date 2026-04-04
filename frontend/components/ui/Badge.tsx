import clsx from 'clsx';

type BadgeVariant = 'ok' | 'dead' | 'mfa' | 'flag' | 'present' | 'absent';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  ok: 'bg-[rgba(78,222,163,0.12)] text-primary border-primary/20',
  dead: 'bg-[rgba(239,68,68,0.12)] text-danger border-danger/20',
  mfa: 'bg-[rgba(249,115,22,0.12)] text-warning border-warning/20',
  flag: 'bg-[rgba(249,115,22,0.12)] text-warning border-warning/20',
  present: 'bg-[rgba(78,222,163,0.12)] text-primary border-primary/20',
  absent: 'bg-[rgba(100,116,139,0.12)] text-dim border-dim/20',
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-[11px] font-mono font-medium leading-none',
        'rounded border',
        'select-none whitespace-nowrap',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
