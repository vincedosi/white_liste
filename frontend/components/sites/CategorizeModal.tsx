'use client';

import { Brain, Loader2 } from 'lucide-react';

export function CategorizeModal({
  mistralKey, onKeyChange, loading, progress, done, onClose, onRun,
}: {
  mistralKey: string; onKeyChange: (v: string) => void;
  loading: boolean; progress: string; done: boolean;
  onClose: () => void; onRun: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !loading && onClose()}>
      <div className="glass-card rounded-2xl p-8 max-w-md w-full mx-4 glow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-6">
          <Brain size={24} className="text-accent" />
          <h2 className="text-xl font-extralight text-on-surface">Categorisation IA</h2>
        </div>

        {!done ? (
          <>
            <p className="text-sm text-on-surface-variant mb-4">
              Categorise tous les sites via Mistral AI.<br />
              Votre cle n&apos;est pas stockee.
            </p>
            <input
              type="password"
              placeholder="Cle API Mistral..."
              value={mistralKey}
              onChange={(e) => onKeyChange(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none mb-4"
            />
            {progress && (
              <div className="flex items-center gap-2 mb-4 text-sm text-accent">
                {loading && <Loader2 size={14} className="animate-spin" />}
                <span>{progress}</span>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-30"
              >
                Annuler
              </button>
              <button
                onClick={onRun}
                disabled={loading || !mistralKey.trim()}
                className="px-5 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all disabled:opacity-30 flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                {loading ? 'En cours...' : 'Lancer'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-success mb-6">{progress}</p>
            <button
              onClick={() => { onClose(); }}
              className="px-5 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
