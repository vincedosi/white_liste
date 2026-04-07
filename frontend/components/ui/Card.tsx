import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'blue' | 'cyan' | 'green' | 'none';
}

export function Card({ children, className, glow = 'blue' }: CardProps) {
  return (
    <div
      className={clsx(
        'glass-card rounded-2xl p-6',
        'transition-all duration-300',
        'hover:border-white/[0.08]',
        glow === 'blue' && 'glow-card',
        glow === 'cyan' && 'shadow-glow-cyan',
        className,
      )}
    >
      {children}
    </div>
  );
}
