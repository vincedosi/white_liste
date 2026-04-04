import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover = false }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-surface-low rounded-xl',
        'border border-outline/15',
        'border-t border-t-white/[0.04]',
        'p-5',
        hover && [
          'transition-all duration-200',
          'hover:border-primary/20',
          'hover:shadow-[0_0_20px_-8px_rgba(78,222,163,0.1)]',
        ],
        className,
      )}
    >
      {children}
    </div>
  );
}
