'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlayCircle, Clock, Settings, ChevronLeft, Menu, X } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Nouvel Audit',
    icon: PlayCircle,
  },
  {
    href: '/history',
    label: 'Historique',
    icon: Clock,
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 bg-background border-b border-outline/20">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-muted hover:text-on-surface transition-colors"
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="font-sans font-extrabold text-sm tracking-tight text-on-surface">MLI</span>
          <span className="text-[10px] font-mono text-primary">v1.0</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed lg:relative z-50 flex flex-col h-screen w-64 bg-background',
          'border-r border-outline/15',
          'transition-transform duration-200 ease-out',
          // Right border glow
          'shadow-[1px_0_12px_-4px_rgba(78,222,163,0.08)]',
          // Mobile: slide in/out
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span className="font-sans font-extrabold text-lg tracking-tight text-on-surface">
                MLI
              </span>
              <span className="font-mono text-[10px] text-primary/70 font-medium">v1.0</span>
            </div>
            <span className="text-[11px] font-sans font-medium text-muted leading-none mt-0.5">
              Media-List{' '}
              <span className="text-primary">Intelligence</span>
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-muted hover:text-on-surface transition-colors"
            aria-label="Fermer le menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-outline/30 via-primary/10 to-transparent" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                  'transition-all duration-150',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(78,222,163,0.15)]'
                    : 'text-muted hover:text-on-surface hover:bg-surface-high/50',
                )}
              >
                <Icon
                  size={18}
                  className={clsx(
                    'flex-shrink-0',
                    isActive ? 'text-primary' : 'text-dim',
                  )}
                />
                <span>{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-outline/30 via-primary/10 to-transparent" />

        {/* Status section */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
            <span className="text-[11px] font-mono text-muted">Systeme operationnel</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between text-[10px] font-mono text-dim/60">
            <span>MLI v1.0</span>
            <span>Dentsu</span>
          </div>
        </div>
      </aside>

      {/* Mobile spacer */}
      <div className="lg:hidden h-14" />
    </>
  );
}
