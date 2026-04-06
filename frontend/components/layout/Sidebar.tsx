'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlayCircle, Clock, Menu, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/', label: 'Nouvel Audit', icon: PlayCircle },
  { href: '/history', label: 'Historique', icon: Clock },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 bg-sidebar">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-white/60 hover:text-white transition-colors"
          aria-label="Menu"
        >
          <Menu size={20} />
        </button>
        <span className="font-sans font-extrabold text-sm tracking-tight text-white">
          ML<span className="text-accent">I</span>
        </span>
        <div className="w-9" />
      </div>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={clsx(
          'fixed lg:relative z-50 flex flex-col h-screen w-[220px] bg-sidebar',
          'transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 pt-7 pb-6">
          <div>
            <div className="flex items-baseline">
              <span className="font-sans font-extrabold text-xl tracking-tight text-white">
                ML<span className="text-accent">I</span>
              </span>
            </div>
            <p className="text-[10px] font-mono text-white/30 mt-1 tracking-wider uppercase">
              Media-List Intelligence
            </p>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-white/40 hover:text-white"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mx-5 h-px bg-white/[0.06]" />

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium',
                  'transition-all duration-150',
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]',
                )}
              >
                <Icon size={16} className={isActive ? 'text-accent' : 'text-white/30'} />
                <span>{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1 h-1 rounded-full bg-accent animate-pulse-dot" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mx-5 h-px bg-white/[0.06]" />

        {/* Status */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span className="text-[10px] font-mono text-white/30">Operationnel</span>
          </div>
        </div>

        <div className="px-5 pb-5">
          <p className="text-[9px] font-mono text-white/20 tracking-wider">
            DENTSU PROGRAMMATIC
          </p>
        </div>
      </aside>

      <div className="lg:hidden h-14" />
    </>
  );
}
