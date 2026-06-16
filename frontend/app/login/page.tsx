'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { Loader2, LogIn } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      // succès -> AuthProvider redirige vers /sites
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-extralight tracking-[0.3em] text-on-surface">
            ML<span className="text-accent">I</span>
          </span>
          <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/60 mt-1">
            Media-List Intelligence
          </p>
        </div>

        <form onSubmit={submit} className="glass-card rounded-2xl p-7 space-y-4">
          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
              Email
            </label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none"
            />
          </div>
          <div>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1.5">
              Mot de passe
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
