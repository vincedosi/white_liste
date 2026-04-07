'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { getWorkspace, getAudits, getActivity } from '@/lib/api';
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-label text-sm text-danger font-extralight">Workspace introuvable</p>
      </div>
    );
  }

  // Compute KPIs from latest audit
  const latestAudit = audits[0];
  const totalAudits = audits.length;
  const avgScore = latestAudit?.avg_attention_score ?? null;
  const sitesAlive = latestAudit?.sites_alive ?? 0;
  const sitesDead = latestAudit?.sites_dead ?? 0;

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-10 space-y-10">
      {/* Header */}
      <div>
        <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">
          Workspace
        </span>
        <h1 className="text-3xl font-extralight tracking-tight text-on-surface mt-1">
          {workspace.name}
        </h1>
        <div className="flex items-center gap-3 mt-2 font-label text-[9px] text-on-surface-variant/50 uppercase tracking-wider font-extralight">
          <span>{workspace.members?.length ?? 1} membres</span>
          <span className="w-0.5 h-0.5 rounded-full bg-on-surface-variant/30" />
          <span>{totalAudits} audits</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Audits', value: totalAudits, color: undefined },
          { label: 'Score Moyen', value: avgScore !== null ? avgScore.toFixed(1) : '--', color: avgScore && avgScore >= 7 ? '#00fc40' : avgScore && avgScore >= 4 ? '#F59E0B' : '#ff716c' },
          { label: 'Sites Actifs', value: sitesAlive, color: '#00fc40' },
          { label: 'Sites Morts', value: sitesDead, color: '#ff716c' },
        ].map((kpi) => (
          <div key={kpi.label} className="glass-card rounded-2xl p-5 glow-card">
            <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
              {kpi.label}
            </span>
            <p
              className="text-3xl font-extralight tracking-tighter text-on-surface mt-2 glow-blue"
              style={kpi.color ? { color: kpi.color } : undefined}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent audits */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">
            Derniers audits
          </span>
          <button
            onClick={() => router.push(`/workspaces/${wsId}/audit/new`)}
            className="font-label text-[9px] text-accent uppercase tracking-[0.2em] font-extralight hover:text-accent/70 transition-colors"
          >
            Nouvel audit
          </button>
        </div>

        {audits.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <p className="font-label text-xs text-on-surface-variant font-extralight">Aucun audit pour le moment.</p>
            <button
              onClick={() => router.push(`/workspaces/${wsId}/audit/new`)}
              className="mt-4 h-10 px-6 rounded-xl bg-primary-electric text-white font-label text-xs uppercase tracking-[0.15em] hover:shadow-glow-blue transition-all"
            >
              Lancer le premier audit
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.slice(0, 5).map((audit) => (
              <button
                key={audit.id}
                onClick={() => router.push(`/workspaces/${wsId}/audit/${audit.id}`)}
                className="w-full flex items-center justify-between p-4 glass-card rounded-2xl text-left hover:border-white/[0.08] transition-all group"
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
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      {activity.length > 0 && (
        <div>
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight mb-4 block">
            Activite recente
          </span>
          <div className="glass-card rounded-2xl p-5 space-y-3">
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
        </div>
      )}
    </div>
  );
}
