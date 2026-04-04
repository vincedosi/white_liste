'use client';

import { Clock, Search, Inbox } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function HistoryPage() {
  return (
    <div className="min-h-screen p-6 lg:p-10 lg:pt-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
            <Clock size={16} className="text-primary" />
          </div>
          <h1 className="text-2xl font-sans font-bold tracking-tight text-on-surface">
            Historique des audits
          </h1>
        </div>
        <p className="text-sm text-muted ml-11">
          Retrouvez et comparez vos audits passes.
        </p>
      </div>

      {/* Search bar */}
      <Card className="mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            type="text"
            placeholder="Rechercher par client ou domaine..."
            className="w-full bg-transparent pl-10 pr-4 py-2 text-sm text-on-surface placeholder:text-dim/50 focus:outline-none"
          />
        </div>
      </Card>

      {/* Empty state */}
      <Card className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-high/60 mb-5">
          <Inbox size={24} className="text-dim" />
        </div>
        <h2 className="text-base font-semibold text-on-surface mb-1.5">
          Aucun audit
        </h2>
        <p className="text-sm text-muted max-w-sm">
          Lancez votre premier audit depuis la page{' '}
          <span className="text-primary font-medium">Nouvel Audit</span>{' '}
          pour voir les resultats ici.
        </p>
      </Card>
    </div>
  );
}
