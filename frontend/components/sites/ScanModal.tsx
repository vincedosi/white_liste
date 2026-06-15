'use client';

import { useState } from 'react';
import { ScanLine, UploadCloud, Loader2, X } from 'lucide-react';
import { useAuditStream } from '@/hooks/useAuditStream';
import { parseScanInput, type ScanInputResult } from '@/lib/api';
import { AuditLog } from '@/components/audit/AuditLog';

export function ScanModal({
  open, onClose, onDone,
}: {
  open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ScanInputResult | null>(null);
  const [phase, setPhase] = useState<'input' | 'running'>('input');
  const [succeeded, setSucceeded] = useState(false);

  const { logs, currentStep, isRunning, error: streamError, startAudit } = useAuditStream();

  if (!open) return null;

  const canLaunch = (text.trim().length > 0 || file !== null) && !preparing;

  const reset = () => {
    setText(''); setFile(null); setError(null); setSummary(null);
    setPhase('input'); setSucceeded(false);
  };

  const handleClose = () => {
    if (isRunning) return; // pas de fermeture pendant le scan
    const didScan = succeeded;
    reset();
    onClose();
    if (didScan) onDone();
  };

  const launch = async () => {
    setError(null); setSummary(null); setPreparing(true);
    try {
      const res = await parseScanInput(text, file);
      setSummary(res);
      if (res.to_scan.length === 0) {
        setError('Aucun nouveau site à scanner (tous déjà présents ou aucune URL valide).');
        return;
      }
      setPhase('running');
      setSucceeded(true);
      startAudit({
        domains: res.to_scan,
        client: 'Scan manuel',
        modules: { attention: true, ads_txt: true, geo: true, categorization: false, screenshots: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="glass-card rounded-2xl p-8 max-w-lg w-full mx-4 glow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ScanLine size={22} className="text-accent" />
            <h2 className="text-xl font-extralight text-on-surface">Scanner des sites</h2>
          </div>
          {!isRunning && (
            <button onClick={handleClose} className="text-on-surface-variant hover:text-on-surface">
              <X size={18} />
            </button>
          )}
        </div>

        {phase === 'input' ? (
          <>
            <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
              Coller des URLs
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'lemonde.fr\nbild.de\njeuxvideo.com'}
              rows={5}
              className="w-full px-4 py-3 bg-surface-high rounded-lg text-sm text-on-surface border border-outline/30 focus:border-accent/50 outline-none resize-none font-mono"
            />

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-outline/20" />
              <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">ou</span>
              <div className="flex-1 h-px bg-outline/20" />
            </div>

            <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-lg border border-dashed border-outline/40 cursor-pointer hover:border-accent/50 text-sm text-on-surface-variant">
              <UploadCloud size={16} />
              {file ? file.name : 'Importer un fichier CSV ou Excel (.xlsx)'}
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <button
                onClick={() => setFile(null)}
                className="mt-1 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-danger"
              >
                Retirer le fichier
              </button>
            )}

            {summary && (
              <p className="mt-4 text-sm text-on-surface-variant">
                <span className="text-accent">{summary.to_scan.length}</span> à scanner ·{' '}
                {summary.duplicates.length} doublons ignorés · {summary.invalid_count} entrées ignorées
              </p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface">
                Annuler
              </button>
              <button
                onClick={launch}
                disabled={!canLaunch}
                className="px-5 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all disabled:opacity-30 flex items-center gap-2"
              >
                {preparing ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                {preparing ? 'Analyse...' : 'Lancer le scan'}
              </button>
            </div>
          </>
        ) : (
          <>
            {summary && (
              <p className="mb-3 text-sm text-on-surface-variant">
                {isRunning ? 'Scan en cours' : 'Scan terminé'} —{' '}
                <span className="text-accent">{summary.to_scan.length}</span> sites
                {currentStep && isRunning ? ` · ${currentStep}` : ''}
              </p>
            )}
            <AuditLog logs={logs} isRunning={isRunning} />
            {streamError && <p className="mt-3 text-sm text-danger">{streamError}</p>}
            <div className="flex gap-3 justify-end mt-6">
              {!isRunning && (
                <>
                  <button onClick={reset} className="px-4 py-2 rounded-lg text-sm text-on-surface-variant hover:text-on-surface">
                    Nouveau scan
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-5 py-2 rounded-lg bg-primary-electric text-white text-sm font-light hover:brightness-110 transition-all"
                  >
                    Fermer
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
