'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Search,
  Inbox,
  Trash2,
  ArrowUpRight,
  Upload,
  AlertTriangle,
  X,
  CheckCircle,
  BarChart3,
  Globe,
} from 'lucide-react';
import clsx from 'clsx';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getAudits, deleteAudit } from '@/lib/api';
import type { AuditSummary } from '@/lib/types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: AuditSummary['status']) {
  switch (status) {
    case 'completed':
      return <Badge variant="ok">Termine</Badge>;
    case 'running':
      return <Badge variant="flag">En cours</Badge>;
    case 'failed':
      return <Badge variant="dead">Echoue</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/* Delete confirmation dialog                                          */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  loading,
  count,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  count?: number;
}) {
  if (!open) return null;
  const plural = (count ?? 1) > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="glass-card rounded-2xl p-6 max-w-sm w-full mx-4 shadow-glow-blue">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-danger/10 border border-danger/20">
            <AlertTriangle size={18} className="text-danger" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-on-surface">
              Supprimer {plural ? `${count} audits` : 'cet audit'} ?
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Cette action est irreversible.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-6">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            Annuler
          </Button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'flex-1 h-8 px-3 text-xs font-medium tracking-wide uppercase rounded-lg',
              'bg-danger/10 text-danger border border-danger/20',
              'hover:bg-danger/20 transition-all',
              'disabled:opacity-40 disabled:pointer-events-none',
            )}
          >
            {loading ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export default function HistoryPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  /* Fetch audits */
  const fetchAudits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAudits();
      data.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setAudits(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  /* Filtered audits */
  const filtered = useMemo(() => {
    if (!search.trim()) return audits;
    const q = search.toLowerCase();
    return audits.filter(
      (a) =>
        a.client.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [audits, search]);

  /* Delete handler */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteAudit(deleteTarget);
      setAudits((prev) => prev.filter((a) => a.id !== deleteTarget));
      setDeleteTarget(null);
    } catch {
      // Keep dialog open on error
    } finally {
      setDeleteLoading(false);
    }
  };

  /* Bulk selection helpers */
  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id));
  const someSelected = selected.size > 0;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((a) => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map((id) => deleteAudit(id)));
      setAudits((prev) => prev.filter((a) => !selected.has(a.id)));
      setSelected(new Set());
    } catch {
      // partial failure — refresh
      fetchAudits();
    } finally {
      setBulkDeleting(false);
    }
  };

  /* Import JSON */
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data?.id) {
          router.push(`/audit/${data.id}`);
        }
      } catch {
        // Invalid JSON — ignore
      }
    };
    reader.readAsText(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen p-6 lg:p-10 lg:pt-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-electric/10 border border-primary-electric/20">
                <Clock size={16} className="text-accent" />
              </div>
              <h1 className="text-2xl font-sans font-extrabold tracking-tight text-on-surface">
                Historique des audits
              </h1>
            </div>
            <p className="text-sm text-muted ml-11">
              Retrouvez et comparez vos audits passes.
            </p>
          </div>

          {/* Import button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              Importer JSON
            </Button>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <Card className="mb-6">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-dim"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par client..."
            className="w-full bg-transparent pl-10 pr-10 py-2 text-sm text-on-surface placeholder:text-dim/50 focus:outline-none font-mono"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-on-surface transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-sm text-muted font-mono">Chargement...</p>
        </Card>
      )}

      {/* Error state */}
      {!loading && error && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-danger/10 mb-5">
            <AlertTriangle size={24} className="text-danger" />
          </div>
          <h2 className="text-base font-semibold text-on-surface mb-1.5">
            Erreur de chargement
          </h2>
          <p className="text-sm text-muted max-w-sm mb-4">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchAudits}>
            Reessayer
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-high mb-5">
            <Inbox size={24} className="text-dim" />
          </div>
          <h2 className="text-base font-semibold text-on-surface mb-1.5">
            {search ? 'Aucun resultat' : 'Aucun audit'}
          </h2>
          <p className="text-sm text-muted max-w-sm">
            {search ? (
              <>
                Aucun audit ne correspond a{' '}
                <span className="text-accent font-medium">
                  &ldquo;{search}&rdquo;
                </span>
                .
              </>
            ) : (
              <>
                Lancez votre premier audit depuis la page{' '}
                <button
                  onClick={() => router.push('/')}
                  className="text-accent font-medium hover:underline"
                >
                  Nouvel Audit
                </button>{' '}
                pour voir les resultats ici.
              </>
            )}
          </p>
        </Card>
      )}

      {/* Audit list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {/* Bulk actions bar */}
          <div className="flex items-center gap-3 px-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-outline/30 text-primary accent-primary cursor-pointer"
              />
              <span className="text-xs font-medium text-muted">
                Tout selectionner
              </span>
            </label>
            {someSelected && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className={clsx(
                  'flex items-center gap-1.5 h-7 px-3 text-[11px] font-medium uppercase tracking-wide rounded-lg',
                  'bg-red-50 text-red-600 border border-red-200',
                  'hover:bg-red-100 transition-all',
                  'disabled:opacity-40 disabled:pointer-events-none',
                )}
              >
                <Trash2 size={12} />
                {bulkDeleting ? 'Suppression...' : `Supprimer (${selected.size})`}
              </button>
            )}
          </div>

          {filtered.map((audit) => (
            <Card
              key={audit.id}
              className={clsx(
                'group cursor-pointer p-0 overflow-hidden',
                selected.has(audit.id) && 'ring-2 ring-primary/30',
              )}
            >
              <div className="flex items-center gap-4 p-4 lg:p-5">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(audit.id)}
                  onChange={() => toggleSelect(audit.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-outline/30 text-primary accent-primary cursor-pointer flex-shrink-0"
                />

                {/* Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex-shrink-0">
                  <BarChart3 size={18} className="text-accent" />
                </div>

                {/* Info */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/audit/${audit.id}`)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-on-surface truncate">
                      {audit.client}
                    </h3>
                    {statusBadge(audit.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-dim">
                    <span>{formatDate(audit.created_at)}</span>
                    <span className="flex items-center gap-1">
                      <Globe size={10} />
                      {audit.domain_count} site
                      {audit.domain_count > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(audit.id);
                    }}
                    className={clsx(
                      'flex items-center justify-center w-8 h-8 rounded-lg',
                      'text-dim hover:text-danger hover:bg-danger/10',
                      'transition-all opacity-0 group-hover:opacity-100',
                    )}
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => router.push(`/audit/${audit.id}`)}
                    className={clsx(
                      'flex items-center justify-center w-8 h-8 rounded-lg',
                      'text-dim hover:text-accent hover:bg-accent/10',
                      'transition-all',
                    )}
                    title="Voir"
                  >
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}

          {/* Count footer */}
          <p className="text-center text-xs font-mono text-dim pt-2">
            {filtered.length} audit{filtered.length > 1 ? 's' : ''}
            {search && audits.length !== filtered.length && (
              <> sur {audits.length}</>
            )}
          </p>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
