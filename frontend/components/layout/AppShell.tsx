'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Sidebar } from '@/components/layout/Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <AuthProvider>
      {isLoginPage ? (
        <main className="min-h-screen">{children}</main>
      ) : (
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )}
    </AuthProvider>
  );
}
