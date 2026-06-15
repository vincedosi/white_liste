'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { getMe, getWorkspaces as fetchWorkspaces } from '@/lib/api';
import type { User, Workspace } from '@/lib/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const data = await fetchWorkspaces();
      setWorkspaces(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function loadDefaultUser() {
      try {
        const data = await getMe();
        setUser(data.user);
        setWorkspaces(data.workspaces || []);
        if (data.workspaces?.length > 0) {
          setCurrentWorkspace(data.workspaces[0]);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    loadDefaultUser();
  }, []);

  const login = async (_email: string, _password: string) => {
    /* auth disabled */
  };

  const logout = () => {
    /* auth disabled */
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, workspaces, currentWorkspace, loading, login, logout, setCurrentWorkspace, refreshWorkspaces }}>
      {children}
    </AuthContext.Provider>
  );
}
