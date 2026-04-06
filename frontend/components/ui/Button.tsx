import clsx from 'clsx';
import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: clsx(
    'bg-gradient-to-r from-primary-dim to-primary',
    'text-white font-bold',
    'shadow-cta',
    'hover:shadow-cta-hover hover:brightness-105',
    'active:scale-[0.98]',
  ),
  secondary: clsx(
    'bg-white border border-outline',
    'text-muted font-medium',
    'shadow-card',
    'hover:border-primary/30 hover:text-primary hover:shadow-card-hover',
    'active:bg-surface-high',
  ),
  ghost: clsx(
    'bg-transparent',
    'text-muted font-medium',
    'hover:text-on-surface hover:bg-surface-high/60',
    'active:bg-surface-high',
  ),
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-[13px] rounded-xl gap-2',
  lg: 'h-12 px-6 text-sm rounded-xl gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', loading, children, className, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          'inline-flex items-center justify-center',
          'tracking-wide uppercase',
          'transition-all duration-150',
          'disabled:opacity-40 disabled:pointer-events-none',
          'select-none',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
