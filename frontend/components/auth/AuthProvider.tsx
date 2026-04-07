'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthContext } from './AuthContext';
import { login as apiLogin, getMe, getToken, setToken, clearToken, getWorkspaces as fetchWorkspaces } from '@/lib/api';
import type { User, Workspace } from '@/lib/types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
    const token = getToken();
    if (!token) {
      setLoading(false);
      if (pathname !== '/login') router.push('/login');
      return;
    }
    getMe()
      .then((data) => {
        setUser(data.user);
        setWorkspaces(data.workspaces);
        if (data.workspaces.length > 0 && !currentWorkspace) {
          setCurrentWorkspace(data.workspaces[0]);
        }
      })
      .catch(() => {
        clearToken();
        if (pathname !== '/login') router.push('/login');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setToken(data.access_token);
    setUser(data.user);
    const me = await getMe();
    setWorkspaces(me.workspaces);
    if (me.workspaces.length > 0) {
      setCurrentWorkspace(me.workspaces[0]);
    }
    router.push('/workspaces');
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    router.push('/login');
  };

  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [loading, user, pathname]);

  return (
    <AuthContext.Provider value={{ user, workspaces, currentWorkspace, loading, login, logout, setCurrentWorkspace, refreshWorkspaces }}>
      {children}
    </AuthContext.Provider>
  );
}
