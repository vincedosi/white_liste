'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, PlusCircle, List, Activity, Settings, LogOut, Menu, X, ChevronDown, Layers, Shield, Globe } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import clsx from 'clsx';

export function Sidebar() {
  const pathname = usePathname();
  const { user, workspaces, currentWorkspace, setCurrentWorkspace, logout, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);

  const wsId = currentWorkspace?.id;

  const NAV_ITEMS = [
    { href: '/sites', label: 'Sites Intelligence', icon: Globe },
    ...(wsId ? [
      { href: `/workspaces/${wsId}`, label: 'Dashboard', icon: BarChart3 },
      { href: `/workspaces/${wsId}/audit/new`, label: 'Nouvel Audit', icon: PlusCircle },
      { href: `/workspaces/${wsId}/whitelists`, label: 'Whitelists', icon: List },
      { href: `/workspaces/${wsId}/activity`, label: 'Activite', icon: Activity },
      { href: `/workspaces/${wsId}/settings`, label: 'Parametres', icon: Settings },
    ] : []),
  ];

  if (loading || !user) return null;

  // Client role: no workspace switcher
  const isClient = currentWorkspace?.member_role === 'client';

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 bg-background/60 backdrop-blur-2xl border-b border-white/[0.03]">
        <button onClick={() => setMobileOpen(true)} className="text-on-surface-variant hover:text-accent transition-colors">
          <Menu size={20} />
        </button>
        <span className="text-lg font-extralight tracking-[0.25em] text-on-surface">ML<span className="text-accent">I</span></span>
        <div className="w-5" />
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
          <Link href="/workspaces" className="block">
            <span className="text-lg font-extralight tracking-[0.3em] text-on-surface hover:text-accent transition-colors">
              ML<span className="text-accent">I</span>
            </span>
          </Link>
          <p className="font-label text-[8px] uppercase tracking-[0.2em] text-on-surface-variant/50 font-extralight mt-1">
            Media-List Intelligence
          </p>
        </div>

        <div className="mx-5 h-px bg-white/[0.04]" />

        {/* Workspace switcher */}
        {!isClient && workspaces.length > 0 && (
          <div className="px-4 py-3 relative">
            <button
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left',
                'bg-white/[0.03] border border-white/[0.05]',
                'hover:border-accent/20 transition-all',
              )}
            >
              <Layers size={13} className="text-accent/60 flex-shrink-0" />
              <span className="flex-1 text-[11px] font-extralight text-on-surface truncate">
                {currentWorkspace?.name || 'Select'}
              </span>
              <ChevronDown size={12} className={clsx('text-on-surface-variant transition-transform', wsDropdownOpen && 'rotate-180')} />
            </button>

            {wsDropdownOpen && (
              <div className="absolute left-4 right-4 top-full mt-1 glass-card rounded-xl overflow-hidden z-50 border border-white/[0.08]">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => { setCurrentWorkspace(ws); setWsDropdownOpen(false); }}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-[11px] font-extralight transition-colors',
                      ws.id === currentWorkspace?.id
                        ? 'text-accent bg-white/[0.04]'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.03]',
                    )}
                  >
                    {ws.name}
                  </button>
                ))}
                <div className="border-t border-white/[0.04]">
                  <Link
                    href="/workspaces"
                    onClick={() => setWsDropdownOpen(false)}
                    className="block px-3 py-2 text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant/50 hover:text-accent transition-colors font-extralight"
                  >
                    Tous les workspaces
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {isClient && currentWorkspace && (
          <div className="px-5 py-3">
            <span className="text-[11px] font-extralight text-on-surface">{currentWorkspace.name}</span>
          </div>
        )}

        <div className="mx-5 h-px bg-white/[0.04]" />

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== `/workspaces/${wsId}` && pathname.startsWith(item.href));
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

        {/* Admin section — only for admin users */}
        {user.role === 'admin' && (
          <>
            <div className="mx-5 h-px bg-white/[0.04]" />
            <div className="px-3 py-3">
              <Link
                href="/admin/domains"
                onClick={() => setMobileOpen(false)}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-extralight tracking-wide',
                  'transition-all duration-150',
                  pathname.startsWith('/admin')
                    ? 'bg-white/[0.04] text-on-surface border-l-2 border-warning'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/[0.02]',
                )}
              >
                <Shield size={15} className={pathname.startsWith('/admin') ? 'text-warning' : 'text-on-surface-variant'} />
                <span>Admin</span>
              </Link>
            </div>
          </>
        )}

        <div className="mx-5 h-px bg-white/[0.04]" />

        {/* User + logout */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-[11px] font-extralight text-on-surface truncate">{user.name}</p>
            <p className="font-label text-[9px] text-on-surface-variant/50 font-extralight truncate">{user.email}</p>
          </div>
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
