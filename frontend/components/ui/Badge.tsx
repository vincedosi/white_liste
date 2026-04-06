import clsx from 'clsx';

type BadgeVariant = 'ok' | 'dead' | 'mfa' | 'flag' | 'present' | 'absent';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  ok: 'bg-emerald-50 text-emerald-600 ring-emerald-200/60',
  dead: 'bg-red-50 text-red-600 ring-red-200/60',
  mfa: 'bg-amber-50 text-amber-600 ring-amber-200/60',
  flag: 'bg-violet-50 text-violet-600 ring-violet-200/60',
  present: 'bg-sky-50 text-sky-600 ring-sky-200/60',
  absent: 'bg-slate-50 text-slate-400 ring-slate-200/60',
};

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-[10px] font-mono font-semibold leading-none',
        'rounded-md ring-1',
        'select-none whitespace-nowrap',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
