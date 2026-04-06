'use client';

import { Menu } from 'lucide-react';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className="lg:hidden flex items-center justify-between h-14 px-4 bg-sidebar border-b border-white/10">
      <button
        onClick={onMenuToggle}
        className="p-2 text-white/70 hover:text-white transition-colors rounded-lg"
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
        <span className="font-sans font-extrabold text-sm tracking-tight text-white">
          ML
        </span>
        <span className="font-sans font-extrabold text-sm tracking-tight text-primary-lighter">
          I
        </span>
        <span className="text-[10px] font-mono text-white/50 font-medium ml-1">
          v1.0
        </span>
      </div>

      {/* Right spacer for centering */}
      <div className="w-9" />
    </header>
  );
}
