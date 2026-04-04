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
    'bg-gradient-to-r from-primary to-primary-dim',
    'text-background font-semibold',
    'shadow-[0_0_20px_-6px_rgba(78,222,163,0.3)]',
    'hover:shadow-[0_0_28px_-4px_rgba(78,222,163,0.45)]',
    'hover:brightness-110',
    'active:brightness-95',
  ),
  secondary: clsx(
    'bg-surface-low border border-outline/30',
    'text-on-surface',
    'hover:bg-surface-high hover:border-outline/50',
    'active:bg-surface-mid',
  ),
  ghost: clsx(
    'bg-transparent',
    'text-muted',
    'hover:text-on-surface hover:bg-surface-high/50',
    'active:bg-surface-high/70',
  ),
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
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
          'font-medium tracking-wide uppercase',
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
          <svg
            className="animate-spin -ml-0.5 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
