'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import clsx from 'clsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-electric/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extralight tracking-[0.3em] text-on-surface">
            ML<span className="text-accent">I</span>
          </h1>
          <p className="font-label text-[9px] uppercase tracking-[0.25em] text-on-surface-variant font-extralight mt-2">
            Media-List Intelligence
          </p>
        </div>

        {/* Glass card */}
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 glow-card space-y-6">
          <div>
            <label className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight mb-2 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dentsu.com"
              required
              autoFocus
              className={clsx(
                'w-full h-11 bg-surface-container border border-outline-variant rounded-xl',
                'px-4 text-sm text-on-surface font-extralight tracking-wide',
                'placeholder:text-on-surface-variant/40',
                'focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20',
                'transition-all',
              )}
            />
          </div>

          <div>
            <label className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight mb-2 block">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className={clsx(
                'w-full h-11 bg-surface-container border border-outline-variant rounded-xl',
                'px-4 text-sm text-on-surface font-extralight tracking-wide',
                'placeholder:text-on-surface-variant/40',
                'focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20',
                'transition-all',
              )}
            />
          </div>

          {error && (
            <div className="text-danger text-xs font-label font-extralight tracking-wider text-center py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className={clsx(
              'w-full h-12 rounded-2xl',
              'flex items-center justify-center gap-2',
              'font-label text-xs uppercase tracking-[0.2em]',
              'transition-all duration-200',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'bg-primary-electric text-white font-medium',
              'shadow-glow-blue hover:shadow-[0_0_60px_rgba(0,102,255,0.4)]',
              'active:scale-[0.97]',
            )}
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              'Connexion'
            )}
          </button>

          <p className="text-center font-label text-[8px] text-on-surface-variant/40 uppercase tracking-[0.2em] font-extralight">
            Dentsu Programmatic Intelligence
          </p>
        </form>
      </div>
    </div>
  );
}
