'use client';

import { Menu } from 'lucide-react';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="lg:hidden fixed top-0 w-full z-50 bg-background/60 backdrop-blur-2xl border-b border-white/[0.03]">
      <div className="flex items-center justify-between px-6 h-16">
        <button
          onClick={onMenuToggle}
          className="text-on-surface-variant hover:text-accent transition-colors"
          aria-label="Menu"
        >
          <Menu size={20} />
        </button>
        <span className="text-xl font-extralight tracking-[0.25em] text-on-surface">MLI</span>
        <div className="w-5" />
      </div>
    </header>
  );
}
