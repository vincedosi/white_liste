'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlayCircle, Eye, FileText, Globe, Brain, Camera, Sparkles, Clock, ArrowUpRight, BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AuditProgress } from '@/components/audit/AuditProgress';
import { useAuditStream } from '@/hooks/useAuditStream';
import { getAudits } from '@/lib/api';
import type { AuditModules, AuditSummary } from '@/lib/types';
import clsx from 'clsx';

const MODULES = [
  { key: 'attention', label: "Score d'attention", icon: Eye, defaultOn: true },
  { key: 'ads_txt', label: 'ads.txt', icon: FileText, defaultOn: true },
  { key: 'geo', label: 'Geolocalisation', icon: Globe, defaultOn: true },
  { key: 'categorization', label: 'Categorisation IA', icon: Brain, defaultOn: false, requiresKey: true },
  { key: 'screenshots', label: 'Screenshots', icon: Camera, defaultOn: true },
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

  /* Fetch recent audits */
  useEffect(() => {
    getAudits()
      .then((data) => {
        data.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setRecentAudits(data.slice(0, 3));
      })
      .catch(() => {
        // Silently fail — recent audits are optional
      });
  }, []);

  const domainCount = domains
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;

  const toggleModule = (key: ModuleKey) => {
    if (isRunning) return;
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLaunch = () => {
    const domainList = domains
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (domainList.length === 0) return;

    startAudit({
      domains: domainList,
      client: client.trim() || 'Sans nom',
      modules: modules as AuditModules,
      ...(modules.categorization && mistralKey ? { mistral_key: mistralKey } : {}),
    });
  };

  // Redirect to audit results page once audit completes with an ID
  useEffect(() => {
    if (auditId && !isRunning && !error) {
      const timer = setTimeout(() => {
        router.push(`/audit/${auditId}`);
      }, 1500); // Brief delay so user can see the final logs
      return () => clearTimeout(timer);
    }
  }, [auditId, isRunning, error, router]);

  const formDisabled = isRunning;

  return (
    <div className="min-h-screen p-6 lg:p-10 lg:pt-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20">
            <Sparkles size={16} className="text-primary" />
          </div>
          <h1 className="text-2xl font-sans font-bold tracking-tight text-on-surface">
            Nouvel Audit
          </h1>
        </div>
        <p className="text-sm text-muted ml-11">
          Collez vos domaines pour lancer l&apos;audit de votre whitelist programmatique.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Domain input */}
        <div className="xl:col-span-2 space-y-5">
          {/* Client name */}
          <Card>
            <label className="block text-xs font-mono font-medium text-muted uppercase tracking-wider mb-2">
              Client
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={formDisabled}
              placeholder="Nom du client..."
              className={clsx(
                'w-full bg-surface-deepest border border-outline/20 rounded-lg',
                'px-4 py-2.5 text-sm text-on-surface font-sans',
                'placeholder:text-dim/50',
                'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                'transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            />
          </Card>

          {/* Domains textarea */}
          <Card>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-mono font-medium text-muted uppercase tracking-wider">
                Domaines
              </label>
              {domainCount > 0 && (
                <span className="text-xs font-mono text-primary/80">
                  {domainCount} domaine{domainCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <textarea
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              disabled={formDisabled}
              placeholder={[
                'example.com',
                'lemonde.fr',
                'nytimes.com',
                '...',
              ].join('\n')}
              rows={14}
              className={clsx(
                'w-full bg-surface-deepest border border-outline/20 rounded-lg',
                'px-4 py-3 text-sm text-on-surface font-mono leading-relaxed',
                'placeholder:text-dim/30',
                'caret-primary',
                'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                'transition-colors resize-none',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            />
            <p className="mt-2 text-[11px] text-dim">
              Un domaine par ligne. Les protocoles (http/https) et chemins seront ignores.
            </p>
          </Card>

          {/* Mistral API Key */}
          {modules.categorization && (
            <Card>
              <label className="block text-xs font-mono font-medium text-muted uppercase tracking-wider mb-2">
                Cle API Mistral
              </label>
              <input
                type="password"
                value={mistralKey}
                onChange={(e) => setMistralKey(e.target.value)}
                disabled={formDisabled}
                placeholder="sk-..."
                className={clsx(
                  'w-full bg-surface-deepest border border-outline/20 rounded-lg',
                  'px-4 py-2.5 text-sm text-on-surface font-mono',
                  'placeholder:text-dim/50',
                  'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                  'transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              />
              <p className="mt-2 text-[11px] text-dim">
                Requis pour la categorisation IAB via Mistral AI.
              </p>
            </Card>
          )}

          {/* Progress section — shown when audit is running or has logs */}
          {(isRunning || logs.length > 0) && (
            <AuditProgress
              isRunning={isRunning}
              currentStep={currentStep}
              logs={logs}
              error={error}
            />
          )}

          {/* Redirect notice */}
          {auditId && !isRunning && !error && (
            <div className="text-center py-3">
              <p className="text-sm font-mono text-primary animate-pulse">
                Audit termine — redirection en cours...
              </p>
            </div>
          )}
        </div>

        {/* Right: Modules + CTA */}
        <div className="space-y-5">
          <Card>
            <h2 className="text-xs font-mono font-medium text-muted uppercase tracking-wider mb-4">
              Modules
            </h2>
            <div className="space-y-2">
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                const active = modules[mod.key];
                return (
                  <button
                    key={mod.key}
                    onClick={() => toggleModule(mod.key)}
                    disabled={formDisabled}
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left',
                      'transition-all duration-150',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      active
                        ? 'bg-primary/8 border border-primary/20 text-on-surface'
                        : 'bg-surface-mid/50 border border-transparent text-muted hover:text-on-surface hover:bg-surface-high/50',
                    )}
                  >
                    <div
                      className={clsx(
                        'flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0',
                        active
                          ? 'bg-primary/15 text-primary'
                          : 'bg-surface-high text-dim',
                      )}
                    >
                      <Icon size={14} />
                    </div>
                    <span className="text-sm font-medium flex-1">{mod.label}</span>
                    <div
                      className={clsx(
                        'w-8 h-[18px] rounded-full relative transition-colors duration-200',
                        active ? 'bg-primary/30' : 'bg-surface-high',
                      )}
                    >
                      <div
                        className={clsx(
                          'absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200',
                          active
                            ? 'left-[calc(100%-18px)] bg-primary'
                            : 'left-0.5 bg-dim',
                        )}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            {modules.categorization && (
              <p className="mt-3 text-[11px] text-warning/80 font-mono">
                * Necessite une cle API Mistral
              </p>
            )}
          </Card>

          {/* Launch button */}
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={domainCount === 0 || isRunning}
            loading={isRunning}
            onClick={handleLaunch}
          >
            <PlayCircle size={18} />
            {isRunning ? 'Audit en cours...' : "Lancer l'audit"}
          </Button>

          {domainCount > 0 && !isRunning && (
            <p className="text-center text-xs font-mono text-dim">
              {domainCount} domaine{domainCount > 1 ? 's' : ''} &middot;{' '}
              {Object.values(modules).filter(Boolean).length} module{Object.values(modules).filter(Boolean).length > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {/* Recent audits section */}
      {recentAudits.length > 0 && !isRunning && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Clock size={14} className="text-dim" />
              <h2 className="text-xs font-mono font-medium text-muted uppercase tracking-wider">
                Derniers audits
              </h2>
            </div>
            <button
              onClick={() => router.push('/history')}
              className="text-xs font-mono text-dim hover:text-primary transition-colors flex items-center gap-1"
            >
              Voir tout
              <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recentAudits.map((audit) => (
              <Card
                key={audit.id}
                hover
                className="cursor-pointer p-4"
              >
                <div
                  onClick={() => router.push(`/audit/${audit.id}`)}
                  className="flex items-start gap-3"
                >
                  <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-high flex-shrink-0 mt-0.5">
                    <BarChart3 size={15} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-on-surface truncate">
                        {audit.client}
                      </h3>
                      <Badge variant={audit.status === 'completed' ? 'ok' : audit.status === 'running' ? 'flag' : 'dead'}>
                        {audit.status === 'completed' ? 'OK' : audit.status === 'running' ? 'En cours' : 'Echoue'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-dim">
                      <span>
                        {new Date(audit.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                      <span>{audit.domain_count} site{audit.domain_count > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
