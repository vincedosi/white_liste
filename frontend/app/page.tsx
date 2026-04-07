'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';

export default function RootPage() {
  const router = useRouter();
  const { user, workspaces, currentWorkspace, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (currentWorkspace) {
      router.replace(`/workspaces/${currentWorkspace.id}`);
    } else if (workspaces.length > 0) {
      router.replace(`/workspaces/${workspaces[0].id}`);
    } else {
      router.replace('/workspaces');
    }
  }, [loading, user, workspaces, currentWorkspace, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  );
}
