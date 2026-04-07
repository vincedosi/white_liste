import clsx from 'clsx';

type BadgeVariant = 'ok' | 'dead' | 'mfa' | 'flag' | 'present' | 'absent';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  ok: 'text-secondary',
  dead: 'text-danger',
  mfa: 'text-warning',
  flag: 'text-accent',
  present: 'text-accent',
  absent: 'text-on-surface-variant',
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'font-label text-[9px] font-extralight uppercase tracking-[0.15em]',
        'select-none whitespace-nowrap',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
