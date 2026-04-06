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
        'bg-white rounded-2xl',
        'border border-outline',
        'p-5',
        'shadow-card',
        hover && [
          'transition-all duration-200',
          'hover:shadow-card-hover hover:-translate-y-0.5',
        ],
        className,
      )}
    >
      {children}
    </div>
  );
}
