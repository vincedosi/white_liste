'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActivity } from '@/lib/api';
import type { ActivityEntry } from '@/lib/types';

export default function ActivityPage() {
  const params = useParams();
  const wsId = params.id as string;
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActivity(wsId, 100).then(setActivity).catch(() => {}).finally(() => setLoading(false));
  }, [wsId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background px-6 lg:px-10 pt-10 pb-10 space-y-8">
      <div>
        <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">Workspace</span>
        <h1 className="text-2xl font-extralight tracking-tight text-on-surface mt-1">Activite</h1>
      </div>

      {activity.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center glow-card">
          <p className="text-sm font-extralight text-on-surface-variant">Aucune activite enregistree.</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6 glow-card">
          <div className="space-y-0">
            {activity.map((a, i) => (
              <div key={a.id} className="flex items-start gap-4 py-3 border-b border-white/[0.03] last:border-0">
                <div className="flex flex-col items-center mt-1">
                  <div className="w-2 h-2 rounded-full bg-accent/40" />
                  {i < activity.length - 1 && <div className="w-px flex-1 bg-white/[0.04] mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-extralight text-on-surface">{a.user_name || 'System'}</span>
                    <span className="font-label text-[9px] text-accent/60 font-extralight">{a.action.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="font-label text-[9px] text-on-surface-variant/40 font-extralight">
                    {new Date(a.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
