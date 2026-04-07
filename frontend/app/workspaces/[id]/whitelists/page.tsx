'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus, Trash2, List, X } from 'lucide-react';
import { getWhitelists, createWhitelist } from '@/lib/api';
import type { Whitelist } from '@/lib/types';
import clsx from 'clsx';

export default function WhitelistsPage() {
  const params = useParams();
  const wsId = params.id as string;
  const [whitelists, setWhitelists] = useState<Whitelist[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomains, setNewDomains] = useState('');

  useEffect(() => {
    getWhitelists(wsId).then(setWhitelists).catch(() => {}).finally(() => setLoading(false));
  }, [wsId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const domains = newDomains.split('\n').map(d => d.trim()).filter(Boolean);
    try {
      const wl = await createWhitelist(wsId, newName.trim(), domains);
      setWhitelists(prev => [wl, ...prev]);
      setCreating(false);
      setNewName('');
      setNewDomains('');
    } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">Workspace</span>
          <h1 className="text-2xl font-extralight tracking-tight text-on-surface mt-1">Whitelists</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="h-9 px-4 rounded-xl bg-primary-electric text-white font-label text-[10px] uppercase tracking-[0.15em] hover:shadow-glow-blue transition-all flex items-center gap-2"
        >
          <Plus size={14} /> Nouvelle
        </button>
      </div>

      {whitelists.length === 0 && !creating && (
        <div className="glass-card rounded-2xl p-12 text-center glow-card">
          <List size={32} className="text-on-surface-variant/30 mx-auto mb-4" />
          <p className="text-sm font-extralight text-on-surface-variant">Aucune whitelist pour le moment.</p>
        </div>
      )}

      {creating && (
        <div className="glass-card rounded-2xl p-6 glow-card space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Nouvelle whitelist</span>
            <button onClick={() => setCreating(false)} className="text-on-surface-variant hover:text-on-surface"><X size={16} /></button>
          </div>
          <input
            type="text" value={newName} onChange={e => setNewName(e.target.value)} autoFocus placeholder="Nom (ex: Q1 2026)"
            className="w-full h-10 bg-surface-container border border-outline-variant rounded-xl px-4 text-sm text-on-surface font-extralight placeholder:text-on-surface-variant/40 focus:outline-none focus:border-accent/40 transition-all"
          />
          <textarea
            value={newDomains} onChange={e => setNewDomains(e.target.value)} rows={8} placeholder="Un domaine par ligne..."
            className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface font-label font-light leading-7 placeholder:text-on-surface-variant/20 focus:outline-none focus:border-accent/40 resize-none transition-all"
          />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setCreating(false)} className="h-9 px-4 rounded-xl bg-white/[0.03] text-on-surface-variant text-xs font-label uppercase tracking-[0.15em] font-extralight">Annuler</button>
            <button onClick={handleCreate} disabled={!newName.trim()} className="h-9 px-4 rounded-xl bg-primary-electric text-white text-xs font-label uppercase tracking-[0.15em] disabled:opacity-30 hover:shadow-glow-blue transition-all">Creer</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {whitelists.map(wl => (
          <div key={wl.id} className="glass-card rounded-2xl p-5 hover:border-white/[0.08] transition-all">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-light text-on-surface">{wl.name}</h3>
              <span className="font-label text-[9px] text-on-surface-variant/50 font-extralight">{new Date(wl.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            <p className="font-label text-[10px] text-on-surface-variant/60 font-extralight">
              {(wl.domains?.length || 0)} domaines
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
