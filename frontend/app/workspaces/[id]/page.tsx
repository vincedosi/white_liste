'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, ArrowRight, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { getWorkspace, getAudits, getActivity, deleteAudit } from '@/lib/api';
import type { WorkspaceDetail, AuditSummary, ActivityEntry } from '@/lib/types';
import clsx from 'clsx';

export default function WorkspaceDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const wsId = params.id as string;
  const { setCurrentWorkspace } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async (id: string) => {
    setDeleteLoading(true);
    try {
      await deleteAudit(id);
      setAudits((prev) => prev.filter((a) => a.id !== id));
      setDeleteTarget(null);
    } catch { /* keep dialog open */ }
    finally { setDeleteLoading(false); }
  };

  useEffect(() => {
    async function load() {
      try {
        const [ws, auditList, activityList] = await Promise.all([
          getWorkspace(wsId),
          getAudits(wsId),
          getActivity(wsId, 5),
        ]);
        setWorkspace(ws);
        setCurrentWorkspace(ws);
        setAudits(auditList);
        setActivity(activityList);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, [wsId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="font-label text-sm text-danger font-extralight">Workspace introuvable</p>
      </div>
    );
  }

  const latest = audits[0];
  const totalAudits = audits.length;
  const avgScore = latest?.avg_attention_score ?? 0;
  const sitesAlive = latest?.sites_alive ?? 0;
  const sitesDead = latest?.sites_dead ?? 0;
  const sitesMfa = latest?.sites_mfa ?? 0;
  const totalSites = (latest?.total_sites || latest?.domain_count) ?? 0;
  const healthyPct = totalSites > 0 ? Math.round(((sitesAlive - sitesMfa) / totalSites) * 100) : 0;
  const mfaPct = totalSites > 0 ? Math.round((sitesMfa / totalSites) * 100) : 0;
  const deadPct = totalSites > 0 ? Math.round((sitesDead / totalSites) * 100) : 0;

  // Score history for histogram (last 7 audits, chronological order)
  const scoreHistory = audits.slice(0, 7).map(a => a.avg_attention_score ?? 0).reverse();
  const maxScore = Math.max(...scoreHistory, 1);

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-16 space-y-12">

      {/* ═══ Hero KPI ═══ */}
      <section className="space-y-8 animate-fade-up">
        <div className="flex flex-col space-y-2">
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">
            {workspace.name} · Score moyen
          </span>
          <div className="relative inline-block">
            <div className="absolute -inset-10 bg-primary-electric/10 blur-[80px] rounded-full" />
            <div className="flex items-baseline relative">
              <span className="text-[6rem] font-extralight leading-none tracking-tighter text-on-surface glow-blue">
                {avgScore > 0 ? avgScore.toFixed(1) : '—'}
              </span>
              <span className="text-accent text-xl font-extralight align-top ml-2 tracking-widest">/10</span>
            </div>
          </div>
          <div className="flex items-center gap-3 font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wider font-extralight">
            <span>{workspace.members?.length ?? 1} membres</span>
            <span className="w-0.5 h-0.5 rounded-full bg-on-surface-variant/30" />
            <span>{totalAudits} audits</span>
            <span className="w-0.5 h-0.5 rounded-full bg-on-surface-variant/30" />
            <span>{totalSites} sites</span>
          </div>
        </div>

        {/* Big number comparison */}
        <div className="grid grid-cols-2 gap-8 pt-4">
          <div className="space-y-1">
            <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Sites Actifs</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extralight tracking-tight text-on-surface">{sitesAlive}</span>
              <span className="text-secondary text-[10px] font-extralight tracking-widest">{healthyPct}%</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">Sites Morts</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-extralight tracking-tight text-on-surface">{sitesDead}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-danger shadow-[0_0_15px_rgba(255,113,108,0.6)]" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Bento Grid ═══ */}
      <section className="grid grid-cols-2 gap-4 animate-fade-up delay-1">

        {/* Donut card */}
        <div className="glass-card rounded-2xl p-5 flex flex-col items-center justify-center space-y-4 glow-card">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="40" fill="none"
                stroke="url(#gradient-donut)" strokeWidth="8"
                strokeDasharray={`${healthyPct * 2.51} ${251 - healthyPct * 2.51}`}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="gradient-donut" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0066ff" />
                  <stop offset="50%" stopColor="#00e5ff" />
                  <stop offset="100%" stopColor="#00fc40" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-label text-[10px] font-extralight tracking-widest text-on-surface">{healthyPct}%</span>
            </div>
          </div>
          <span className="font-label text-[8px] uppercase tracking-[0.2em] text-on-surface-variant text-center leading-relaxed font-extralight">
            Sites<br />Sains
          </span>
        </div>

        {/* Mini bar chart — Sains / MFA / Morts */}
        <div className="glass-card rounded-2xl p-5 space-y-4 glow-card">
          <div className="h-20 flex items-end gap-3 px-2">
            {[
              { label: 'Sains', pct: healthyPct, color: '#00fc40' },
              { label: 'MFA',   pct: mfaPct,     color: '#F59E0B' },
              { label: 'Morts', pct: deadPct,     color: '#ff716c' },
            ].map(b => (
              <div
                key={b.label}
                className="flex-1 bg-white/[0.03] rounded-t-full overflow-hidden relative"
                style={{ height: `${Math.max(b.pct, 5)}%` }}
              >
                <div
                  className="absolute bottom-0 w-full rounded-t-full"
                  style={{ height: '100%', backgroundColor: b.color, opacity: 0.6 }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-around">
            {['Sains', 'MFA', 'Morts'].map(l => (
              <span key={l} className="font-label text-[7px] uppercase tracking-[0.15em] text-on-surface-variant font-extralight">{l}</span>
            ))}
          </div>
        </div>

        {/* Full-width — Infrastructure Health progress bars */}
        <div className="col-span-2 glass-card rounded-2xl p-6 space-y-8 glow-card">
          <div className="flex justify-between items-center">
            <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
              Sante de la whitelist
            </span>
            {totalAudits > 0 && (
              <span className="text-accent text-[9px] font-label font-extralight px-3 py-0.5 border border-accent/20 rounded-full tracking-widest">
                {totalAudits} AUDITS
              </span>
            )}
          </div>
          <div className="space-y-6">
            {[
              { label: 'Score Moyen',  value: `${avgScore > 0 ? avgScore.toFixed(1) : '—'}/10`, pct: avgScore * 10 },
              { label: 'Sites Sains',  value: `${healthyPct}%`,                                  pct: healthyPct  },
              { label: 'Taux MFA',     value: `${mfaPct}%`,                                       pct: mfaPct      },
            ].map(bar => (
              <div key={bar.label} className="space-y-3">
                <div className="flex justify-between font-label text-[9px] text-on-surface-variant uppercase tracking-[0.1em] font-extralight">
                  <span>{bar.label}</span>
                  <span className="text-on-surface">{bar.value}</span>
                </div>
                <div className="h-[3px] w-full bg-white/[0.03] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-fluid rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(bar.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Recent audits feed ═══ */}
      <section className="space-y-6 animate-fade-up delay-2">
        <div className="flex justify-between items-end px-1">
          <span className="font-label text-[10px] font-extralight tracking-[0.3em] uppercase text-on-surface">
            Derniers Audits
          </span>
          <button
            onClick={() => router.push(`/workspaces/${wsId}/audit/new`)}
            className="text-accent text-[10px] font-label uppercase tracking-widest font-extralight flex items-center gap-1"
          >
            <Plus size={12} /> Nouveau
          </button>
        </div>

        {audits.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center glow-card">
            <p className="font-label text-xs text-on-surface-variant font-extralight mb-4">Aucun audit pour le moment.</p>
            <button
              onClick={() => router.push(`/workspaces/${wsId}/audit/new`)}
              className="h-10 px-6 rounded-xl bg-primary-electric text-white font-label text-xs uppercase tracking-[0.15em] hover:shadow-glow-blue transition-all"
            >
              Lancer le premier audit
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.slice(0, 5).map((audit) => (
              <div
                key={audit.id}
                className={clsx(
                  'flex items-center gap-2 glass-card rounded-2xl transition-all group',
                  audit.status === 'completed' ? 'border-l border-l-accent/40' : 'border-l border-l-white/10',
                )}
              >
                <button
                  className="flex items-center justify-between flex-1 p-4 text-left"
                  onClick={() => router.push(`/workspaces/${wsId}/audit/${audit.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.02] flex items-center justify-center border border-white/[0.05]">
                      <BarChart3 size={16} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-extralight tracking-wide text-on-surface">{audit.client}</p>
                      <p className="font-label text-[9px] text-on-surface-variant tracking-wider font-extralight">
                        {audit.domain_count} sites · {new Date(audit.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      'font-label text-[9px] tracking-[0.15em] font-extralight uppercase',
                      audit.status === 'completed' ? 'text-secondary' : audit.status === 'failed' ? 'text-danger' : 'text-on-surface-variant',
                    )}>
                      {audit.status === 'completed' ? 'SUCCESS' : audit.status === 'failed' ? 'ERREUR' : 'PENDING'}
                    </span>
                    <ArrowRight size={12} className="text-on-surface-variant/30 group-hover:text-accent/50 transition-colors" />
                  </div>
                </button>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(audit.id); }}
                  className="flex items-center justify-center w-8 h-8 mr-3 rounded-lg text-on-surface-variant/30 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Score histogram ═══ */}
      {scoreHistory.length > 1 && (
        <section className="glass-card rounded-2xl p-6 space-y-8 overflow-hidden glow-card animate-fade-up delay-3">
          <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
            Historique des scores ({scoreHistory.length} audits)
          </span>
          <div className="flex items-end justify-between h-32 gap-3">
            {scoreHistory.map((score, i) => {
              const height = maxScore > 0 ? (score / maxScore) * 100 : 0;
              const isMax = score === maxScore;
              return (
                <div
                  key={i}
                  className="w-full bg-white/[0.03] rounded-t-full relative overflow-hidden"
                  style={{ height: `${Math.max(height, 8)}%` }}
                >
                  <div className="absolute inset-0 bg-primary-electric opacity-5 rounded-t-full" />
                  <div
                    className={clsx(
                      'absolute bottom-0 w-full rounded-t-full transition-all',
                      isMax
                        ? 'bg-gradient-fluid shadow-[0_-10px_25px_rgba(0,102,255,0.4)]'
                        : 'bg-primary-electric/40',
                    )}
                    style={{ height: `${Math.max(height, 10)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between font-label text-[8px] text-white/20 uppercase tracking-[0.2em] font-extralight">
            {scoreHistory.map((s, i) => <span key={i}>{s.toFixed(1)}</span>)}
          </div>
        </section>
      )}

      {/* ═══ Activity feed ═══ */}
      {activity.length > 0 && (
        <section className="space-y-4 animate-fade-up delay-4">
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">
            Activite recente
          </span>
          <div className="glass-card rounded-2xl p-5 space-y-3 glow-card">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-[11px] font-extralight">
                <div className="w-1 h-1 rounded-full bg-accent/40 flex-shrink-0" />
                <span className="text-on-surface-variant">{a.user_name}</span>
                <span className="text-on-surface-variant/50">{a.action.replace(/_/g, ' ')}</span>
                <span className="ml-auto font-label text-[9px] text-on-surface-variant/30 font-extralight">
                  {new Date(a.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ Delete confirmation dialog ═══ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Supprimer cet audit ?</h3>
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  Le rapport, les screenshots et les donnees seront supprimes definitivement.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="flex-1 h-9 rounded-xl text-xs font-medium bg-white/[0.03] text-on-surface-variant border border-white/[0.06] hover:bg-white/[0.06] transition-all"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleteLoading}
                className="flex-1 h-9 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-40"
              >
                {deleteLoading ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
