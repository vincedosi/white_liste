'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye, FileText, Globe, Brain, Camera,
  ArrowRight, Clock, ArrowUpRight, BarChart3,
  Zap, Shield, Check,
} from 'lucide-react';
import { AuditProgress } from '@/components/audit/AuditProgress';
import { useAuditStream } from '@/hooks/useAuditStream';
import { getAudits } from '@/lib/api';
import type { AuditModules, AuditSummary } from '@/lib/types';
import clsx from 'clsx';

/* ─── Module config ─── */
const MODULES = [
  { key: 'attention', label: 'Attention', desc: 'Score publicitaire', icon: Eye, defaultOn: true },
  { key: 'ads_txt', label: 'ads.txt', desc: 'Verification SSP', icon: FileText, defaultOn: true },
  { key: 'geo', label: 'Geo', desc: 'Localisation', icon: Globe, defaultOn: true },
  { key: 'categorization', label: 'IA', desc: 'Categorisation', icon: Brain, defaultOn: false, requiresKey: true },
  { key: 'screenshots', label: 'Captures', desc: 'Screenshots', icon: Camera, defaultOn: true },
] as const;

type ModuleKey = (typeof MODULES)[number]['key'];

export default function HomePage() {
  const router = useRouter();
  const [domains, setDomains] = useState('');
  const [client, setClient] = useState('');
  const [mistralKey, setMistralKey] = useState('');
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(() =>
    Object.fromEntries(MODULES.map((m) => [m.key, m.defaultOn])) as Record<ModuleKey, boolean>,
  );
  const [recentAudits, setRecentAudits] = useState<AuditSummary[]>([]);
  const { logs, currentStep, isRunning, error, auditId, startAudit } = useAuditStream();

  useEffect(() => {
    getAudits()
      .then((data) => {
        data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentAudits(data.slice(0, 3));
      })
      .catch(() => {});
  }, []);

  const domainCount = domains.split('\n').map((l) => l.trim()).filter(Boolean).length;
  const activeModuleCount = Object.values(modules).filter(Boolean).length;

  const toggleModule = (key: ModuleKey) => {
    if (isRunning) return;
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLaunch = () => {
    const domainList = domains.split('\n').map((l) => l.trim()).filter(Boolean);
    if (domainList.length === 0) return;
    startAudit({
      domains: domainList,
      client: client.trim() || 'Sans nom',
      modules: modules as AuditModules,
      ...(modules.categorization && mistralKey ? { mistral_key: mistralKey } : {}),
    });
  };

  useEffect(() => {
    if (auditId && !isRunning && !error) {
      const timer = setTimeout(() => router.push(`/audit/${auditId}`), 1500);
      return () => clearTimeout(timer);
    }
  }, [auditId, isRunning, error, router]);

  const formDisabled = isRunning;
  const canLaunch = domainCount > 0 && !isRunning;

  return (
    <div className="min-h-screen bg-background">
      {/* ═══ Top section with dot grid ═══ */}
      <div className="relative overflow-hidden">
        {/* Dot grid background */}
        <div className="absolute inset-0 dot-grid opacity-40" />
        {/* Gradient fade at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

        <div className="relative px-6 lg:px-10 pt-8 lg:pt-10 pb-4">
          {/* ─── Header ─── */}
          <div className="animate-fade-up mb-10">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">
                <Zap size={14} className="text-primary" />
              </div>
              <h1 className="text-[22px] font-sans font-extrabold tracking-tight text-on-surface">
                Nouvel audit
              </h1>
            </div>
            <p className="text-[13px] text-muted ml-[38px]">
              Analysez votre whitelist programmatique en quelques secondes.
            </p>
          </div>

          {/* ═══ Main layout ═══ */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8">

            {/* ─── LEFT: Input zone ─── */}
            <div className="space-y-5 animate-fade-up delay-1">
              {/* Client + Domain count — inline row */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-[11px] font-sans font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Client
                  </label>
                  <input
                    type="text"
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    disabled={formDisabled}
                    placeholder="Nom du client"
                    className={clsx(
                      'w-full h-10 bg-white border border-outline rounded-xl',
                      'px-3.5 text-sm text-on-surface font-sans',
                      'placeholder:text-dim/40',
                      'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/8',
                      'shadow-inner-glow transition-all',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  />
                </div>
                {domainCount > 0 && (
                  <div className="flex items-center gap-1.5 h-10 px-3 bg-primary/5 border border-primary/10 rounded-xl animate-scale-in">
                    <Shield size={12} className="text-primary" />
                    <span className="text-xs font-mono font-semibold text-primary tabular-nums">
                      {domainCount}
                    </span>
                    <span className="text-[11px] text-primary/60">
                      site{domainCount > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* ─── Textarea: the hero ─── */}
              <div className="relative group">
                <div className={clsx(
                  'bg-white rounded-2xl border transition-all duration-200',
                  'shadow-card group-focus-within:shadow-elevated',
                  'group-focus-within:border-primary/30 border-outline',
                  formDisabled && 'opacity-40 pointer-events-none',
                )}>
                  {/* Fake header bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-light">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-400/50" />
                        <div className="w-2 h-2 rounded-full bg-amber-400/50" />
                        <div className="w-2 h-2 rounded-full bg-emerald-400/50" />
                      </div>
                      <span className="text-[10px] font-mono text-dim/60 ml-1">domaines.txt</span>
                    </div>
                    <span className="text-[10px] font-mono text-dim/40">
                      {domainCount > 0 ? `${domainCount} lignes` : 'vide'}
                    </span>
                  </div>
                  <textarea
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                    disabled={formDisabled}
                    placeholder={'lemonde.fr\nlequipe.fr\nboursorama.com\nmarmiton.org\nleboncoin.fr'}
                    rows={16}
                    className={clsx(
                      'w-full bg-transparent border-none',
                      'px-4 py-3 text-[13px] text-on-surface font-mono leading-7',
                      'placeholder:text-dim/25',
                      'caret-primary',
                      'focus:outline-none resize-none',
                      'textarea-lines',
                    )}
                  />
                </div>
                <p className="mt-2 text-[11px] text-dim/60 ml-1">
                  Un domaine par ligne — les protocoles et www seront retires automatiquement.
                </p>
              </div>

              {/* Mistral key — only when categorization is on */}
              {modules.categorization && (
                <div className="animate-scale-in">
                  <label className="block text-[11px] font-sans font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Cle API Mistral
                  </label>
                  <input
                    type="password"
                    value={mistralKey}
                    onChange={(e) => setMistralKey(e.target.value)}
                    disabled={formDisabled}
                    placeholder="sk-..."
                    className={clsx(
                      'w-full h-10 bg-white border border-outline rounded-xl',
                      'px-3.5 text-sm text-on-surface font-mono',
                      'placeholder:text-dim/40',
                      'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/8',
                      'shadow-inner-glow transition-all',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  />
                  <p className="mt-1.5 text-[11px] text-warning/80 font-mono ml-1">
                    Requis pour la categorisation IAB via Mistral AI.
                  </p>
                </div>
              )}
            </div>

            {/* ─── RIGHT: Config panel ─── */}
            <div className="space-y-5 animate-fade-up delay-2">
              {/* Module selector */}
              <div className="bg-white rounded-2xl border border-outline shadow-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[11px] font-sans font-bold text-on-surface uppercase tracking-wider">
                    Modules
                  </h2>
                  <span className="text-[10px] font-mono text-dim">
                    {activeModuleCount}/5 actifs
                  </span>
                </div>

                <div className="space-y-1.5">
                  {MODULES.map((mod, i) => {
                    const Icon = mod.icon;
                    const active = modules[mod.key];
                    return (
                      <button
                        key={mod.key}
                        onClick={() => toggleModule(mod.key)}
                        disabled={formDisabled}
                        className={clsx(
                          'w-full flex items-center gap-3 pl-3 pr-2 py-2 rounded-xl text-left',
                          'transition-all duration-200 group/mod',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                          active
                            ? 'bg-primary/[0.04] ring-1 ring-primary/15'
                            : 'hover:bg-surface-high/60',
                        )}
                        style={{ animationDelay: `${180 + i * 50}ms` }}
                      >
                        {/* Icon */}
                        <div className={clsx(
                          'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'bg-surface-high text-dim group-hover/mod:text-muted',
                        )}>
                          <Icon size={15} />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <span className={clsx(
                            'text-[13px] font-semibold block',
                            active ? 'text-on-surface' : 'text-muted',
                          )}>
                            {mod.label}
                          </span>
                          <span className="text-[10px] text-dim block">{mod.desc}</span>
                        </div>

                        {/* Toggle */}
                        <div className={clsx(
                          'relative w-9 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
                          active ? 'bg-primary' : 'bg-surface-deepest',
                        )}>
                          <div className={clsx(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm',
                            'transition-all duration-200',
                            active ? 'left-[18px]' : 'left-0.5',
                          )} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ─── CTA ─── */}
              <button
                onClick={handleLaunch}
                disabled={!canLaunch}
                className={clsx(
                  'w-full relative overflow-hidden',
                  'flex items-center justify-center gap-2.5',
                  'h-14 rounded-2xl',
                  'text-sm font-bold tracking-wide uppercase',
                  'transition-all duration-200',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none',
                  canLaunch
                    ? 'bg-gradient-to-r from-primary-dim via-primary to-accent text-white shadow-cta hover:shadow-cta-hover active:scale-[0.98] animate-glow'
                    : 'bg-surface-deepest text-dim',
                )}
              >
                {isRunning ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Audit en cours...
                  </>
                ) : (
                  <>
                    Lancer l&apos;audit
                    <ArrowRight size={16} className={canLaunch ? 'group-hover:translate-x-0.5 transition-transform' : ''} />
                  </>
                )}
                {/* Shine effect */}
                {canLaunch && !isRunning && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]" />
                )}
              </button>

              {domainCount > 0 && !isRunning && (
                <p className="text-center text-[11px] font-mono text-dim animate-fade-in">
                  {domainCount} domaine{domainCount > 1 ? 's' : ''} · {activeModuleCount} module{activeModuleCount > 1 ? 's' : ''}
                </p>
              )}

              {/* Summary stats when idle */}
              {!isRunning && domainCount === 0 && (
                <div className="bg-surface-high/50 rounded-xl p-4 space-y-3 animate-fade-up delay-4">
                  <p className="text-[11px] font-sans font-semibold text-muted uppercase tracking-wider">
                    Que fait MLI ?
                  </p>
                  {[
                    { icon: Shield, text: 'Verifie la sante HTTP de chaque site' },
                    { icon: Eye, text: 'Mesure l\'encombrement publicitaire' },
                    { icon: Globe, text: 'Localise les serveurs et detecte la langue' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <item.icon size={13} className="text-primary/60 mt-0.5 flex-shrink-0" />
                      <span className="text-[12px] text-muted leading-snug">{item.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Progress (when running) ═══ */}
      {(isRunning || logs.length > 0) && (
        <div className="px-6 lg:px-10 pb-6 animate-scale-in">
          <AuditProgress
            isRunning={isRunning}
            currentStep={currentStep}
            logs={logs}
            error={error}
          />
        </div>
      )}

      {/* Redirect notice */}
      {auditId && !isRunning && !error && (
        <div className="text-center py-6 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-success-light rounded-full">
            <Check size={14} className="text-success" />
            <span className="text-sm font-medium text-success">
              Audit termine — redirection...
            </span>
          </div>
        </div>
      )}

      {/* ═══ Recent audits ═══ */}
      {recentAudits.length > 0 && !isRunning && (
        <div className="px-6 lg:px-10 pb-10 animate-fade-up delay-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-dim" />
              <h2 className="text-[11px] font-sans font-bold text-muted uppercase tracking-wider">
                Recents
              </h2>
            </div>
            <button
              onClick={() => router.push('/history')}
              className="text-[11px] font-mono text-dim hover:text-primary transition-colors flex items-center gap-1"
            >
              Tout voir
              <ArrowUpRight size={11} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recentAudits.map((audit, i) => (
              <button
                key={audit.id}
                onClick={() => router.push(`/audit/${audit.id}`)}
                className={clsx(
                  'text-left bg-white rounded-xl border border-outline p-4',
                  'shadow-card hover:shadow-card-hover',
                  'transition-all duration-200 hover:-translate-y-0.5',
                  'group',
                )}
                style={{ animationDelay: `${300 + i * 60}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/5 flex-shrink-0">
                    <BarChart3 size={14} className="text-primary/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                      {audit.client}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-dim">
                      <span>
                        {new Date(audit.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </span>
                      <span className="w-0.5 h-0.5 rounded-full bg-dim/40" />
                      <span>{audit.domain_count} sites</span>
                      <span className="w-0.5 h-0.5 rounded-full bg-dim/40" />
                      <span className={clsx(
                        audit.status === 'completed' ? 'text-success' : audit.status === 'failed' ? 'text-danger' : 'text-warning',
                      )}>
                        {audit.status === 'completed' ? 'OK' : audit.status === 'failed' ? 'Erreur' : 'En cours'}
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="text-dim/30 group-hover:text-primary/50 transition-colors flex-shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
