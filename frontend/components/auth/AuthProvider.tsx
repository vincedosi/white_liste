'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthContext } from './AuthContext';
import {
  getMe, getWorkspaces as fetchWorkspaces,
  login as apiLogin, getToken, setToken, clearToken,
} from '@/lib/api';
import type { User, Workspace } from '@/lib/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshWorkspaces = useCallback(async () => {
    try {
      const data = await fetchWorkspaces();
      setWorkspaces(data);
    } catch { /* ignore */ }
  }, []);

  // Au montage : si un token existe, on récupère l'utilisateur.
  useEffect(() => {
    async function load() {
      if (!getToken()) { setLoading(false); return; }
      try {
        const data = await getMe();
        setUser(data.user);
        setWorkspaces(data.workspaces || []);
        if (data.workspaces?.length > 0) setCurrentWorkspace(data.workspaces[0]);
      } catch {
        clearToken();
      }
      setLoading(false);
    }
    load();
  }, []);

  // Garde-fou de routes : pas connecté -> /login ; connecté sur /login -> /sites.
  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') router.replace('/login');
    if (user && pathname === '/login') router.replace('/sites');
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setToken(data.access_token);
    const me = await getMe();
    setUser(me.user);
    setWorkspaces(me.workspaces || []);
    if (me.workspaces?.length > 0) setCurrentWorkspace(me.workspaces[0]);
    router.replace('/sites');
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    router.replace('/login');
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
