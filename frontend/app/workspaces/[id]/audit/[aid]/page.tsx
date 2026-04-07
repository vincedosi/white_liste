'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function WorkspaceAuditPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params.aid as string;

  // Redirect to the existing /audit/[id] page which handles everything
  useEffect(() => {
    router.replace(`/audit/${auditId}`);
  }, [auditId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  );
}
