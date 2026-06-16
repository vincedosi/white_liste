'use client';

import { useState, useEffect } from 'react';
import { getAudit } from '@/lib/api';
import type { AuditResult } from '@/lib/types';

export function useAudit(id: string) {
  const [data, setData] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    getAudit(id)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { data, loading, error };
}
