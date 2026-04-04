'use client';

import { useParams } from 'next/navigation';
import { BarChart3, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export default function AuditResultPage() {
  const params = useParams();
  const auditId = params.id as string;

  return (
    <div className="min-h-screen p-6 lg:p-10 lg:pt-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
            <BarChart3 size={16} className="text-primary" />
          </div>
          <h1 className="text-2xl font-sans font-bold tracking-tight text-on-surface">
            Resultats de l&apos;audit
          </h1>
        </div>
        <p className="text-sm text-muted ml-11 font-mono">
          ID: {auditId}
        </p>
      </div>

      {/* Loading state */}
      <Card className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 size={28} className="text-primary animate-spin mb-5" />
        <h2 className="text-base font-semibold text-on-surface mb-1.5">
          Chargement...
        </h2>
        <p className="text-sm text-muted max-w-sm">
          Recuperation des resultats de l&apos;audit en cours.
        </p>
      </Card>
    </div>
  );
}
