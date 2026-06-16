'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Globe, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import clsx from 'clsx';

// UX réduite : un seul onglet pour l'instant. On enrichira la nav plus tard.
const NAV_ITEMS = [
  { href: '/sites', label: 'Sites', icon: Globe },
  { href: '/methodologie', label: 'Méthodologie', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading || !user) return null;

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 bg-background/60 backdrop-blur-2xl border-b border-white/[0.03]">
        <button onClick={() => setMobileOpen(true)} className="text-on-surface-variant hover:text-accent transition-colors">
          <Menu size={20} />
        </button>
        <span className="text-lg font-extralight tracking-[0.25em] text-on-surface">ML<span className="text-accent">I</span></span>
        <ThemeToggle />
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={clsx(
        'fixed lg:relative z-50 flex flex-col h-screen w-[220px]',
        'bg-surface-low border-r border-white/[0.03]',
        'transition-transform duration-200 ease-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        {/* Logo */}
        <div className="px-5 pt-7 pb-4">
          <Link href="/sites" className="block">
            <span className="text-lg font-extralight tracking-[0.3em] text-on-surface hover:text-accent transition-colors">
              ML<span className="text-accent">I</span>
            </span>
          </Link>
          <p className="font-label text-[8px] uppercase tracking-[0.2em] text-on-surface-variant/50 font-extralight mt-1">
            Media-List Intelligence
          </p>
        </div>

        <div className="mx-5 h-px bg-white/[0.04]" />

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-extralight tracking-wide',
                  'transition-all duration-150',
                  isActive
                    ? 'bg-white/[0.04] text-on-surface border-l-2 border-accent'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.02]',
                )}
              >
                <Icon size={15} className={isActive ? 'text-accent' : 'text-on-surface-variant'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mx-5 h-px bg-white/[0.04]" />

        {/* User + theme + logout */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-[11px] font-extralight text-on-surface truncate">{user.name}</p>
            <p className="font-label text-[9px] text-on-surface-variant/50 font-extralight truncate">{user.email}</p>
          </div>
          <ThemeToggle className="w-full justify-center" />
          <button
            onClick={logout}
            className="flex items-center gap-2 text-on-surface-variant hover:text-danger transition-colors"
          >
            <LogOut size={13} />
            <span className="font-label text-[9px] uppercase tracking-[0.15em] font-extralight">Deconnexion</span>
          </button>
        </div>
      </aside>

      <div className="lg:hidden h-16" />
    </>
  );
}
