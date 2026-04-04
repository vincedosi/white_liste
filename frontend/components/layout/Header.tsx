'use client';

import { Menu } from 'lucide-react';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="lg:hidden flex items-center justify-between h-14 px-4 bg-background border-b border-outline/20">
      <button
        onClick={onMenuToggle}
        className="p-2 text-muted hover:text-on-surface transition-colors rounded-lg"
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <span className="font-sans font-extrabold text-sm tracking-tight text-on-surface">
          MLI
        </span>
        <span className="text-[10px] font-mono text-primary font-medium">
          v1.0
        </span>
      </div>

      {/* Right spacer for centering */}
      <div className="w-9" />
    </header>
  );
}
