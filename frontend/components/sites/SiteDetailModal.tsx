'use client';

import { useState, useMemo } from 'react';
import type { SiteEntry } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { ScoreDonut } from '@/components/ui/ScoreDonut';
import Link from 'next/link';
import { Globe, Loader2, HelpCircle } from 'lucide-react';

/* ── helpers ── */

function healthVariant(h: string | null): 'ok' | 'dead' | 'mfa' | 'flag' | 'present' | 'absent' {
  if (!h) return 'absent';
  if (h === 'ok') return 'ok';
  if (h === 'dead') return 'dead';
  if (h === 'redirect' || h === 'timeout') return 'flag';
  return 'absent';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return '—';
  }
}

function domainToScreenshotFile(domain: string, type: 'viewport' | 'full'): string {
  const sanitized = domain.replace(/\./g, '_');
  return `/api/screenshots/${sanitized}_${type}.png`;
}

export function SiteDetailModal({
  site,
  onClose,
}: {
  site: SiteEntry;
  onClose: () => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [bust, setBust] = useState(0);
  const [liveScore, setLiveScore] = useState<number | null>(site.last_score);
  const [liveClutter, setLiveClutter] = useState<number | null>(site.last_clutter_score);
  const [liveV4, setLiveV4] = useState<number | null>(site.last_v4_score);
  const [liveStatus, setLiveStatus] = useState<string>(site.editorial_status);
  const [noteInput, setNoteInput] = useState('');
  const [validating, setValidating] = useState(false);
  const score = liveScore;
  const toReview = liveStatus === 'to_review';
  const adtechEntries = useMemo(() => Object.entries(site.adtech ?? {}).filter(([, v]) => v), [site]);

  const handleRescan = async () => {
    setRescanning(true);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(site.domain)}/rescan`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.score === 'number' || data.score === null) setLiveScore(data.score);
        if (data.clutter_score !== undefined) setLiveClutter(data.clutter_score);
        if (data.v4_score !== undefined) setLiveV4(data.v4_score);
        if (data.editorial_status) setLiveStatus(data.editorial_status);
        setImgError(false);
        setShowFull(false);
        setBust(Date.now()); // cache-bust the screenshot so the new capture loads
      }
    } catch {
      /* ignore — keep showing previous state */
    } finally {
      setRescanning(false);
    }
  };

  const handleValidate = async () => {
    const n = parseFloat(noteInput.replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 10) return;
    setValidating(true);
    try {
      const res = await fetch(`/api/sites/${encodeURIComponent(site.domain)}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: n }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiveScore(data.score);
        setLiveStatus('validated');
        setNoteInput('');
      }
    } catch {
      /* ignore */
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="glass-card rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-1">
              Site Intelligence
            </p>
            <h2 className="text-2xl font-extralight tracking-tight text-on-surface flex items-center gap-2">
              <Globe className="w-5 h-5 text-accent/60" />
              {site.domain}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="font-label text-[10px] uppercase tracking-widest text-accent hover:text-on-surface transition-colors px-3 py-1.5 border border-accent/30 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {rescanning && <Loader2 className="w-3 h-3 animate-spin" />}
              {rescanning ? 'Rescan…' : 'Rescanner'}
            </button>
            <button
              onClick={onClose}
              className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors px-3 py-1.5 border border-outline/30 rounded-lg"
            >
              Fermer
            </button>
          </div>
        </div>

        {/* Les 3 notes /10 en donut (rouge = mauvais → vert = bon) */}
        <div className="bg-surface-high rounded-xl p-5 mb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">Notes /10</p>
              <Link
                href="/methodologie"
                className="flex items-center gap-1 font-label text-[9px] text-accent/70 hover:text-accent transition-colors"
                title="Comment ces notes sont calculées"
              >
                <HelpCircle className="w-3 h-3" />
                Comment c&apos;est calculé&nbsp;?
              </Link>
            </div>
            {toReview && (
              <span className="font-label text-[10px] uppercase tracking-wider text-warning">À valider</span>
            )}
          </div>
          <div className="flex items-end justify-around gap-3">
            <ScoreDonut value={liveV4} size={78} stroke={7} label="Propreté pub" />
            <ScoreDonut value={liveClutter} size={78} stroke={7} label="Aération" />
            <ScoreDonut value={score} size={96} stroke={8} label="Note finale" />
          </div>
          <p className="font-label text-[9px] text-on-surface-variant/60 text-center mt-3">
            10 = propre · 0 = saturé de pub
          </p>
        </div>

        {/* Santé · Pubs · ads.txt */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Sante</p>
            <Badge variant={healthVariant(site.last_health)}>
              {site.last_health ?? 'N/A'}
            </Badge>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Pubs detectees</p>
            <span className="text-3xl font-extralight tracking-tighter text-on-surface">
              {site.last_ad_count ?? '—'}
            </span>
          </div>
          <div className="bg-surface-high rounded-xl p-4">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">ads.txt</p>
            <Badge variant={site.last_ads_txt != null && site.last_ads_txt > 0 ? 'present' : 'absent'}>
              {site.last_ads_txt != null && site.last_ads_txt > 0 ? `${site.last_ads_txt} vendeurs` : 'Absent'}
            </Badge>
          </div>
        </div>

        {/* Validation manuelle de la note */}
        <div className={`mb-6 rounded-xl p-4 border ${toReview ? 'border-warning/40 bg-warning/[0.04]' : 'border-white/[0.06] bg-surface-high'}`}>
          <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-1">
            {toReview ? 'À valider — 0 pub détectée, vérifie la capture' : 'Ajuster la note manuellement'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="0-10"
              className="w-24 px-3 py-2 bg-surface-container border border-outline/30 rounded-lg text-sm text-on-surface focus:outline-none focus:border-accent/50"
            />
            <button
              onClick={handleValidate}
              disabled={validating || noteInput.trim() === ''}
              className="px-4 py-2 rounded-lg bg-primary-electric text-white text-xs font-medium uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-30 flex items-center gap-1.5"
            >
              {validating && <Loader2 className="w-3 h-3 animate-spin" />}
              {validating ? 'Validation…' : 'Valider'}
            </button>
            {liveStatus === 'validated' && (
              <span className="font-label text-[10px] uppercase tracking-wider text-success">✓ Validé</span>
            )}
          </div>
        </div>

        {/* Key-value pairs */}
        <div className="space-y-2.5 mb-6">
          {[
            { label: 'Pays', value: site.last_country ?? '—' },
            { label: 'Langue', value: site.last_lang ?? '—' },
            { label: 'TLD', value: site.last_tld ?? '—' },
            { label: 'Categorie IAB', value: site.category_iab ?? '—' },
            { label: 'Temps de chargement', value: site.last_load_time_ms != null ? `${site.last_load_time_ms} ms` : '—' },
            { label: 'Nb audits', value: String(site.audit_count) },
            { label: 'Dernier audit', value: fmtDate(site.last_audit_date) },
            {
              label: 'Tendance',
              value: site.last_score_trend === 'up'
                ? '▲ Amelioration'
                : site.last_score_trend === 'down'
                ? '▼ Degradation'
                : site.last_score_trend === 'stable'
                ? '— Stable'
                : '—',
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
              <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
                {label}
              </span>
              <span className="font-label text-xs text-on-surface font-light">{value}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        {site.tags?.length > 0 && (
          <div className="mb-5">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {site.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full text-[10px] font-label font-extralight text-accent border border-accent/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Adtech */}
        {adtechEntries.length > 0 && (
          <div className="mb-5">
            <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">
              Adtech detecte
            </p>
            <div className="flex flex-wrap gap-2">
              {adtechEntries.map(([k]) => (
                <span
                  key={k}
                  className="px-2.5 py-1 rounded-full text-[10px] font-label font-extralight text-warning border border-warning/20"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Screenshot */}
        {!imgError && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">
                Capture d&apos;ecran
              </p>
              <button
                onClick={() => setShowFull((v) => !v)}
                className="font-label text-[9px] uppercase tracking-wider text-accent hover:text-on-surface transition-colors"
              >
                {showFull ? 'Viewport' : 'Page complete'}
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-surface-high">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={domainToScreenshotFile(site.domain, showFull ? 'full' : 'viewport') + (bust ? `?t=${bust}` : '')}
                alt={`Capture ${site.domain}`}
                className="w-full h-auto"
                onError={() => setImgError(true)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
