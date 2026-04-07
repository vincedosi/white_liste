'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, BarChart3, Users, Clock } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { createWorkspace } from '@/lib/api';
import clsx from 'clsx';

export default function WorkspacesPage() {
  const router = useRouter();
  const { workspaces, refreshWorkspaces, user, loading } = useAuth();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      const ws = await createWorkspace(newName.trim());
      await refreshWorkspaces();
      router.push(`/workspaces/${ws.id}`);
    } catch {
      // ignore
    } finally {
      setCreateLoading(false);
      setCreating(false);
      setNewName('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-10">
      {/* Header */}
      <div className="mb-10">
        <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">
          Espaces de travail
        </span>
        <h1 className="text-3xl font-extralight tracking-tight text-on-surface mt-1">
          Workspaces
        </h1>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Create button */}
        <button
          onClick={() => setCreating(true)}
          className={clsx(
            'glass-card rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[160px]',
            'border-dashed border-white/10',
            'hover:border-accent/20 hover:bg-white/[0.02] transition-all',
            'group cursor-pointer',
          )}
        >
          <div className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center border border-white/[0.05] group-hover:border-accent/20 transition-colors">
            <Plus size={18} className="text-on-surface-variant group-hover:text-accent transition-colors" />
          </div>
          <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight group-hover:text-on-surface transition-colors">
            Nouveau workspace
          </span>
        </button>

        {/* Workspace cards */}
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => router.push(`/workspaces/${ws.id}`)}
            className="glass-card rounded-2xl p-6 text-left glow-card hover:border-white/[0.08] transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-light tracking-wide text-on-surface group-hover:text-accent transition-colors">
                  {ws.name}
                </h3>
                <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-[0.15em] font-extralight">
                  {ws.member_role || 'member'}
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center border border-white/[0.05]">
                <BarChart3 size={14} className="text-accent/60" />
              </div>
            </div>

            <div className="flex items-center gap-4 font-label text-[9px] text-on-surface-variant/60 uppercase tracking-wider font-extralight">
              <span className="flex items-center gap-1.5">
                <Users size={10} />
                {ws.member_count ?? 1}
              </span>
              <span className="flex items-center gap-1.5">
                <BarChart3 size={10} />
                {ws.audit_count ?? 0} audits
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setCreating(false)}>
          <div className="glass-card rounded-2xl p-8 w-full max-w-sm mx-4 glow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-extralight tracking-wide text-on-surface mb-6">
              Nouveau workspace
            </h3>
            <label className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight mb-2 block">
              Nom du client
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              placeholder="L'Oreal, Renault..."
              className={clsx(
                'w-full h-11 bg-surface-container border border-outline-variant rounded-xl',
                'px-4 text-sm text-on-surface font-extralight tracking-wide',
                'placeholder:text-on-surface-variant/40',
                'focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20',
                'transition-all',
              )}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCreating(false)}
                className="flex-1 h-10 rounded-xl bg-white/[0.03] text-on-surface-variant text-xs font-label uppercase tracking-[0.15em] font-extralight hover:bg-white/[0.06] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createLoading}
                className={clsx(
                  'flex-1 h-10 rounded-xl bg-primary-electric text-white text-xs font-label uppercase tracking-[0.15em]',
                  'disabled:opacity-30 disabled:cursor-not-allowed',
                  'hover:shadow-glow-blue transition-all',
                )}
              >
                {createLoading ? 'Creation...' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
