'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Settings, Users, Trash2, Shield } from 'lucide-react';
import { getWorkspace, deleteWorkspace } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import type { WorkspaceDetail } from '@/lib/types';
import clsx from 'clsx';

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const wsId = params.id as string;
  const { refreshWorkspaces } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getWorkspace(wsId).then(setWorkspace).catch(() => {}).finally(() => setLoading(false));
  }, [wsId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWorkspace(wsId);
      await refreshWorkspaces();
      router.push('/workspaces');
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;
  }

  if (!workspace) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-danger font-extralight">Workspace introuvable</p></div>;
  }

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-10 space-y-8">
      <div>
        <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">Workspace</span>
        <h1 className="text-2xl font-extralight tracking-tight text-on-surface mt-1">Parametres</h1>
      </div>

      {/* Info */}
      <div className="glass-card rounded-2xl p-6 glow-card space-y-4">
        <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Informations</span>
        <div className="space-y-3">
          <div>
            <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wider font-extralight block mb-1">Nom</span>
            <p className="text-sm font-extralight text-on-surface">{workspace.name}</p>
          </div>
          <div>
            <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wider font-extralight block mb-1">Slug</span>
            <p className="text-sm font-label font-extralight text-on-surface-variant">{workspace.slug}</p>
          </div>
          <div>
            <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wider font-extralight block mb-1">Cree le</span>
            <p className="text-sm font-extralight text-on-surface-variant">{new Date(workspace.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="glass-card rounded-2xl p-6 glow-card space-y-4">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-accent/60" />
          <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Membres ({workspace.members?.length || 0})</span>
        </div>
        <div className="space-y-2">
          {(workspace.members || []).map(m => (
            <div key={m.user_id} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
              <div>
                <p className="text-[12px] font-extralight text-on-surface">{m.name}</p>
                <p className="font-label text-[9px] text-on-surface-variant/50 font-extralight">{m.email}</p>
              </div>
              <span className={clsx(
                'font-label text-[9px] uppercase tracking-[0.15em] font-extralight',
                m.role === 'owner' ? 'text-accent' : m.role === 'editor' ? 'text-secondary' : 'text-on-surface-variant',
              )}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="glass-card rounded-2xl p-6 border-danger/20 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-danger/60" />
          <span className="font-label text-[9px] uppercase tracking-[0.2em] text-danger/60 font-extralight">Zone dangereuse</span>
        </div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="h-9 px-4 rounded-xl bg-danger/10 text-danger text-xs font-label uppercase tracking-[0.15em] font-extralight border border-danger/20 hover:bg-danger/20 transition-all"
          >
            Supprimer ce workspace
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs font-extralight text-danger">Confirmer la suppression ?</span>
            <button onClick={() => setConfirmDelete(false)} className="h-8 px-3 rounded-lg bg-white/[0.03] text-on-surface-variant text-[10px] font-label uppercase tracking-[0.15em] font-extralight">Annuler</button>
            <button onClick={handleDelete} disabled={deleting} className="h-8 px-3 rounded-lg bg-danger text-white text-[10px] font-label uppercase tracking-[0.15em] disabled:opacity-30">{deleting ? '...' : 'Confirmer'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
