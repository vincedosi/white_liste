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
    'bg-primary-electric text-white font-semibold',
    'shadow-glow-blue',
    'hover:brightness-110',
    'active:scale-[0.97]',
  ),
  secondary: clsx(
    'glass-card',
    'text-on-surface font-light',
    'hover:border-white/[0.1]',
    'active:bg-surface-high',
  ),
  ghost: clsx(
    'bg-transparent',
    'text-on-surface-variant font-extralight',
    'hover:text-on-surface hover:bg-white/[0.03]',
    'active:bg-white/[0.05]',
  ),
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[10px] rounded-lg gap-1.5 tracking-[0.15em]',
  md: 'h-10 px-5 text-xs rounded-xl gap-2 tracking-[0.1em]',
  lg: 'h-12 px-7 text-sm rounded-2xl gap-2.5 tracking-[0.1em]',
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
          'inline-flex items-center justify-center uppercase',
          'transition-all duration-200',
          'disabled:opacity-30 disabled:pointer-events-none',
          'select-none',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
