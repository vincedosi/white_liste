'use client';

import { useState } from 'react';
import { PlayCircle, Eye, FileText, Globe, Brain, Camera, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
  const [domains, setDomains] = useState('');
  const [client, setClient] = useState('');
  const [mistralKey, setMistralKey] = useState('');
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(() =>
    Object.fromEntries(MODULES.map((m) => [m.key, m.defaultOn])) as Record<ModuleKey, boolean>,
  );

  const domainCount = domains
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;

  const toggleModule = (key: ModuleKey) => {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
              placeholder="Nom du client..."
              className={clsx(
                'w-full bg-surface-deepest border border-outline/20 rounded-lg',
                'px-4 py-2.5 text-sm text-on-surface font-sans',
                'placeholder:text-dim/50',
                'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                'transition-colors',
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
                placeholder="sk-..."
                className={clsx(
                  'w-full bg-surface-deepest border border-outline/20 rounded-lg',
                  'px-4 py-2.5 text-sm text-on-surface font-mono',
                  'placeholder:text-dim/50',
                  'focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20',
                  'transition-colors',
                )}
              />
              <p className="mt-2 text-[11px] text-dim">
                Requis pour la categorisation IAB via Mistral AI.
              </p>
            </Card>
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
                    className={clsx(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left',
                      'transition-all duration-150',
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
            disabled={domainCount === 0}
          >
            <PlayCircle size={18} />
            Lancer l&apos;audit
          </Button>

          {domainCount > 0 && (
            <p className="text-center text-xs font-mono text-dim">
              {domainCount} domaine{domainCount > 1 ? 's' : ''} &middot;{' '}
              {Object.values(modules).filter(Boolean).length} module{Object.values(modules).filter(Boolean).length > 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
