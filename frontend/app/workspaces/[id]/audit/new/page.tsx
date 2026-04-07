'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Eye, FileText, Globe, Brain, Camera,
  ArrowRight, BarChart3,
} from 'lucide-react';
import { AuditProgress } from '@/components/audit/AuditProgress';
import { useAuditStream } from '@/hooks/useAuditStream';
import { getWhitelists, checkDomains } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import type { DomainCheckResult } from '@/lib/api';
import type { AuditModules, Whitelist } from '@/lib/types';
import clsx from 'clsx';
import { AlertTriangle, RefreshCw, CheckCircle2, X, Skull, List } from 'lucide-react';

const MODULES = [
  { key: 'attention', label: 'Attention', icon: Eye, defaultOn: true },
  { key: 'ads_txt', label: 'ads.txt', icon: FileText, defaultOn: true },
  { key: 'geo', label: 'Geo', icon: Globe, defaultOn: true },
  { key: 'categorization', label: 'IA', icon: Brain, defaultOn: false, requiresKey: true },
  { key: 'screenshots', label: 'Captures', icon: Camera, defaultOn: true },
] as const;

type ModuleKey = (typeof MODULES)[number]['key'];

export default function WorkspaceAuditNewPage() {
  const router = useRouter();
  const params = useParams();
  const wsId = params.id as string;
  const { currentWorkspace } = useAuth();

  const [domains, setDomains] = useState('');
  const [client, setClient] = useState('');
  const [mistralKey, setMistralKey] = useState('');
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(() =>
    Object.fromEntries(MODULES.map((m) => [m.key, m.defaultOn])) as Record<ModuleKey, boolean>,
  );
  const { logs, currentStep, isRunning, error, auditId, startAudit } = useAuditStream();

  // Whitelist state
  const [whitelists, setWhitelists] = useState<Whitelist[]>([]);
  const [selectedWhitelist, setSelectedWhitelist] = useState<string>('');

  // Duplicate check state
  const [checkResult, setCheckResult] = useState<DomainCheckResult | null>(null);
  const [forceRecrawl, setForceRecrawl] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);

  // Default client to workspace name
  useEffect(() => {
    if (currentWorkspace?.name && !client) {
      setClient(currentWorkspace.name);
    }
  }, [currentWorkspace]);

  // Fetch whitelists for this workspace
  useEffect(() => {
    if (!wsId) return;
    getWhitelists(wsId)
      .then(setWhitelists)
      .catch(() => {});
  }, [wsId]);

  // When a whitelist is selected, pre-fill domains
  const handleWhitelistChange = (wlId: string) => {
    setSelectedWhitelist(wlId);
    if (!wlId) return;
    const wl = whitelists.find((w) => w.id === wlId);
    if (wl) {
      setDomains(wl.domains.join('\n'));
    }
  };

  const domainCount = domains.split('\n').map((l) => l.trim()).filter(Boolean).length;
  const activeModuleCount = Object.values(modules).filter(Boolean).length;
  const toggleModule = (key: ModuleKey) => { if (!isRunning) setModules((p) => ({ ...p, [key]: !p[key] })); };

  // Step 1: Check for duplicates before launching
  const handleLaunch = async () => {
    const list = domains.split('\n').map((l) => l.trim()).filter(Boolean);
    if (list.length === 0) return;

    setChecking(true);
    try {
      const result = await checkDomains(list);
      if (result.already_crawled > 0 || result.known_dead_count > 0) {
        setCheckResult(result);
        setForceRecrawl(new Set());
      } else {
        launchAudit(result.new_domains);
      }
    } catch {
      launchAudit(list);
    } finally {
      setChecking(false);
    }
  };

  // Step 2: Launch with final domain list
  const launchAudit = (domainList: string[]) => {
    setCheckResult(null);
    startAudit({
      domains: domainList,
      client: client.trim() || currentWorkspace?.name || 'Sans nom',
      modules: modules as AuditModules,
      ...(modules.categorization && mistralKey ? { mistral_key: mistralKey } : {}),
      workspace_id: wsId,
    });
  };

  // Step 3: Confirm from duplicate review screen
  const handleConfirmLaunch = () => {
    if (!checkResult) return;
    const finalDomains = [
      ...checkResult.new_domains,
      ...Array.from(forceRecrawl),
    ];
    if (finalDomains.length === 0) return;
    launchAudit(finalDomains);
  };

  const toggleForceRecrawl = (domain: string) => {
    setForceRecrawl((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const selectAllDuplicates = () => {
    if (!checkResult) return;
    const allDups = Object.keys(checkResult.found);
    if (forceRecrawl.size === allDups.length) {
      setForceRecrawl(new Set());
    } else {
      setForceRecrawl(new Set(allDups));
    }
  };

  // Redirect to workspace-scoped audit result
  useEffect(() => {
    if (auditId && !isRunning && !error) {
      const t = setTimeout(() => router.push(`/workspaces/${wsId}/audit/${auditId}`), 1500);
      return () => clearTimeout(t);
    }
  }, [auditId, isRunning, error, router, wsId]);

  const canLaunch = domainCount > 0 && !isRunning && !checking && !checkResult;

  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 lg:px-10 pt-10 pb-6 space-y-12">

        {/* ═══ Hero header ═══ */}
        <div className="animate-fade-up space-y-2">
          <span className="font-label text-[9px] uppercase tracking-[0.3em] text-on-surface-variant font-extralight">
            {currentWorkspace?.name || 'Workspace'} · Whitelist Audit
          </span>
          <h1 className="text-4xl font-extralight tracking-tight text-on-surface">
            Nouvel <span className="text-gradient-fluid">Audit</span>
          </h1>
        </div>

        {/* ═══ Main grid ═══ */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8">

          {/* ─── LEFT: Input ─── */}
          <div className="space-y-6 animate-fade-up delay-1">

            {/* Client row */}
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight mb-2 block">
                  Client
                </label>
                <input
                  type="text"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  disabled={isRunning}
                  placeholder="Nom du client"
                  className={clsx(
                    'w-full h-10 bg-surface-container border border-outline-variant rounded-xl',
                    'px-4 text-sm text-on-surface font-extralight tracking-wide',
                    'placeholder:text-on-surface-variant/40',
                    'focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20',
                    'transition-all disabled:opacity-30',
                  )}
                />
              </div>
              {domainCount > 0 && (
                <div className="flex items-center gap-2 h-10 px-4 glass-card rounded-xl animate-scale-in">
                  <span className="font-label text-sm font-extralight text-accent tabular-nums">{domainCount}</span>
                  <span className="font-label text-[9px] text-on-surface-variant uppercase tracking-widest font-extralight">
                    site{domainCount > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Whitelist selector */}
            {whitelists.length > 0 && (
              <div className="animate-scale-in">
                <label className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight mb-2 block">
                  Whitelist
                </label>
                <div className="relative">
                  <List size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 pointer-events-none" />
                  <select
                    value={selectedWhitelist}
                    onChange={(e) => handleWhitelistChange(e.target.value)}
                    disabled={isRunning}
                    className={clsx(
                      'w-full h-10 bg-surface-container border border-outline-variant rounded-xl',
                      'pl-9 pr-4 text-sm text-on-surface font-extralight tracking-wide',
                      'focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20',
                      'transition-all disabled:opacity-30 appearance-none cursor-pointer',
                    )}
                  >
                    <option value="">— Saisie manuelle —</option>
                    {whitelists.map((wl) => (
                      <option key={wl.id} value={wl.id}>
                        {wl.name} ({wl.domains.length} domaines)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Textarea */}
            <div className="glass-card rounded-2xl glow-card overflow-hidden transition-all duration-300 focus-within:border-accent/20">
              {/* Tab bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-danger/40" />
                    <div className="w-2 h-2 rounded-full bg-warning/40" />
                    <div className="w-2 h-2 rounded-full bg-secondary/40" />
                  </div>
                  <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-[0.15em] font-extralight">
                    domaines.txt
                  </span>
                </div>
                <span className="font-label text-[9px] text-on-surface-variant/30 font-extralight tracking-wider">
                  {domainCount > 0 ? `${domainCount} lignes` : 'vide'}
                </span>
              </div>
              <textarea
                value={domains}
                onChange={(e) => { setDomains(e.target.value); setSelectedWhitelist(''); }}
                disabled={isRunning}
                placeholder={'lemonde.fr\nlequipe.fr\nboursorama.com\nmarmiton.org\nleboncoin.fr'}
                rows={16}
                className={clsx(
                  'w-full bg-transparent border-none',
                  'px-5 py-4 text-[13px] text-on-surface font-label font-light leading-7 tracking-wide',
                  'placeholder:text-white/10',
                  'caret-accent',
                  'focus:outline-none resize-none',
                  'disabled:opacity-30',
                )}
              />
            </div>

            {/* Mistral key */}
            {modules.categorization && (
              <div className="animate-scale-in">
                <label className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight mb-2 block">
                  Cle API Mistral
                </label>
                <input
                  type="password"
                  value={mistralKey}
                  onChange={(e) => setMistralKey(e.target.value)}
                  disabled={isRunning}
                  placeholder="sk-..."
                  className={clsx(
                    'w-full h-10 bg-surface-container border border-outline-variant rounded-xl',
                    'px-4 text-sm text-on-surface font-label font-light tracking-wider',
                    'placeholder:text-on-surface-variant/40',
                    'focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20',
                    'transition-all disabled:opacity-30',
                  )}
                />
                <p className="mt-1.5 font-label text-[9px] text-warning/70 uppercase tracking-wider font-extralight">
                  Requis pour la categorisation IAB
                </p>
              </div>
            )}
          </div>

          {/* ─── RIGHT: Config ─── */}
          <div className="space-y-6 animate-fade-up delay-2">

            {/* Modules */}
            <div className="glass-card rounded-2xl p-5 glow-card">
              <div className="flex items-center justify-between mb-5">
                <span className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-extralight">
                  Modules
                </span>
                <span className="font-label text-[9px] text-on-surface-variant/50 font-extralight tracking-wider">
                  {activeModuleCount}/5
                </span>
              </div>

              <div className="space-y-1">
                {MODULES.map((mod) => {
                  const Icon = mod.icon;
                  const active = modules[mod.key];
                  return (
                    <button
                      key={mod.key}
                      onClick={() => toggleModule(mod.key)}
                      disabled={isRunning}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
                        'transition-all duration-200',
                        'disabled:opacity-30 disabled:cursor-not-allowed',
                        active
                          ? 'bg-white/[0.04] border border-white/[0.06]'
                          : 'border border-transparent hover:bg-white/[0.02]',
                      )}
                    >
                      <div className={clsx(
                        'w-8 h-8 rounded-lg flex items-center justify-center border transition-colors',
                        active
                          ? 'bg-primary-electric/10 border-primary-electric/20 text-accent'
                          : 'bg-white/[0.02] border-white/[0.05] text-on-surface-variant',
                      )}>
                        <Icon size={14} />
                      </div>
                      <span className={clsx(
                        'flex-1 text-[12px] font-extralight tracking-wide',
                        active ? 'text-on-surface' : 'text-on-surface-variant',
                      )}>
                        {mod.label}
                      </span>
                      {/* Toggle */}
                      <div className={clsx(
                        'w-8 h-[18px] rounded-full relative transition-colors duration-200 flex-shrink-0',
                        active ? 'bg-gradient-fluid' : 'bg-white/[0.06]',
                      )}>
                        <div className={clsx(
                          'absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200',
                          active ? 'left-[17px] bg-white' : 'left-[3px] bg-on-surface-variant',
                        )} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleLaunch}
              disabled={!canLaunch}
              className={clsx(
                'w-full h-14 rounded-2xl',
                'flex items-center justify-center gap-3',
                'font-label text-xs uppercase tracking-[0.2em]',
                'transition-all duration-200',
                'disabled:opacity-20 disabled:cursor-not-allowed',
                canLaunch
                  ? 'bg-primary-electric text-white font-medium shadow-glow-blue hover:shadow-[0_0_60px_rgba(0,102,255,0.4)] active:scale-[0.97] animate-glow'
                  : 'bg-white/[0.03] text-on-surface-variant font-extralight',
              )}
            >
              {isRunning ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Audit en cours
                </>
              ) : checking ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verification...
                </>
              ) : (
                <>
                  Lancer l&apos;audit
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {domainCount > 0 && !isRunning && (
              <p className="text-center font-label text-[9px] text-on-surface-variant/50 uppercase tracking-[0.2em] font-extralight">
                {domainCount} domaine{domainCount > 1 ? 's' : ''} · {activeModuleCount} module{activeModuleCount > 1 ? 's' : ''}
              </p>
            )}

            {/* Back to workspace */}
            <button
              onClick={() => router.push(`/workspaces/${wsId}`)}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[10px] font-extralight uppercase tracking-[0.2em] text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <BarChart3 size={12} />
              Tableau de bord
            </button>
          </div>
        </div>

        {/* ═══ Duplicate review panel ═══ */}
        {checkResult && !isRunning && (
          <div className="animate-scale-in glass-card rounded-2xl p-6 border-l-4 border-l-amber-400">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle size={18} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">
                    {checkResult.already_crawled + checkResult.known_dead_count} site{(checkResult.already_crawled + checkResult.known_dead_count) > 1 ? 's' : ''} connu{(checkResult.already_crawled + checkResult.known_dead_count) > 1 ? 's' : ''}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {checkResult.already_crawled > 0 && <>{checkResult.already_crawled} deja analyse{checkResult.already_crawled > 1 ? 's' : ''}. </>}
                    {checkResult.known_dead_count > 0 && <>{checkResult.known_dead_count} connu{checkResult.known_dead_count > 1 ? 's' : ''} comme mort{checkResult.known_dead_count > 1 ? 's' : ''}. </>}
                    {checkResult.new_count > 0 && <>{checkResult.new_count} nouveau{checkResult.new_count > 1 ? 'x' : ''}.</>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCheckResult(null)}
                className="text-dim hover:text-on-surface transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>

            {/* New domains summary */}
            {checkResult.new_count > 0 && (
              <div className="mb-4 px-4 py-3 bg-green-500/5 border border-green-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-xs font-medium text-green-700">
                    {checkResult.new_count} nouveau{checkResult.new_count > 1 ? 'x' : ''} — partiront en analyse
                  </span>
                </div>
                <p className="text-[10px] text-green-600/70 ml-[22px]">
                  {checkResult.new_domains.slice(0, 5).join(', ')}
                  {checkResult.new_domains.length > 5 && ` + ${checkResult.new_domains.length - 5} autres`}
                </p>
              </div>
            )}

            {/* Duplicate list with checkboxes */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                  Doublons detectes
                </span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forceRecrawl.size === Object.keys(checkResult.found).length}
                    onChange={selectAllDuplicates}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 accent-amber-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted font-medium">Tout re-analyser</span>
                </label>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {Object.entries(checkResult.found).map(([domain, info]) => (
                  <label
                    key={domain}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all',
                      forceRecrawl.has(domain)
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={forceRecrawl.has(domain)}
                      onChange={() => toggleForceRecrawl(domain)}
                      className="w-4 h-4 rounded border-slate-300 text-amber-500 accent-amber-500 cursor-pointer flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-on-surface">{domain}</span>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-muted">
                          Client: {info.client_name}
                        </span>
                        {info.score != null && (
                          <span className="text-[10px] text-muted">
                            Score: <span className={info.score >= 7 ? 'text-green-500' : info.score >= 4 ? 'text-amber-500' : 'text-red-500'}>{info.score.toFixed(1)}</span>
                          </span>
                        )}
                        {info.has_screenshots && (
                          <span className="text-[10px] text-green-500">screenshots ok</span>
                        )}
                      </div>
                    </div>
                    {forceRecrawl.has(domain) && (
                      <RefreshCw size={12} className="text-amber-500 flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Known dead domains */}
            {checkResult.known_dead_count > 0 && (
              <div className="mb-4 px-4 py-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Skull size={14} className="text-red-500" />
                  <span className="text-xs font-medium text-red-700">
                    {checkResult.known_dead_count} site{checkResult.known_dead_count > 1 ? 's' : ''} mort{checkResult.known_dead_count > 1 ? 's' : ''} connu{checkResult.known_dead_count > 1 ? 's' : ''} — exclus automatiquement
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {Object.entries(checkResult.known_dead).map(([domain, info]) => (
                    <div key={domain} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-red-500/5">
                      <span className="text-red-700 font-medium">{domain}</span>
                      <span className="text-red-500/70">
                        vu mort {info.times_seen_dead}x — {info.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCheckResult(null)}
                className="flex-1 h-10 rounded-xl text-xs font-medium uppercase tracking-wider bg-white/[0.03] text-muted border border-white/[0.06] hover:bg-white/[0.06] transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmLaunch}
                disabled={checkResult.new_count === 0 && forceRecrawl.size === 0}
                className={clsx(
                  'flex-1 h-10 rounded-xl text-xs font-medium uppercase tracking-wider transition-all',
                  'disabled:opacity-30 disabled:cursor-not-allowed',
                  'bg-primary-electric text-white shadow-glow-blue hover:shadow-[0_0_40px_rgba(0,102,255,0.3)]',
                )}
              >
                Lancer ({checkResult.new_count + forceRecrawl.size} site{(checkResult.new_count + forceRecrawl.size) > 1 ? 's' : ''})
              </button>
            </div>
          </div>
        )}

        {/* ═══ Progress ═══ */}
        {(isRunning || logs.length > 0) && (
          <div className="animate-scale-in">
            <AuditProgress isRunning={isRunning} currentStep={currentStep} logs={logs} error={error} />
          </div>
        )}

        {auditId && !isRunning && !error && (
          <div className="text-center py-4 animate-fade-in">
            <span className="font-label text-[10px] text-secondary uppercase tracking-[0.2em] font-extralight animate-pulse">
              Audit termine — redirection
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
