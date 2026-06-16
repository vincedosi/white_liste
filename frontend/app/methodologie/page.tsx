'use client';

import { ScoreDonut } from '@/components/ui/ScoreDonut';

/* ── petits composants de mise en page ── */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-medium text-on-surface">{title}</h2>
        {subtitle && <p className="font-label text-[11px] text-on-surface-variant mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-surface-high rounded-xl p-5 border border-white/[0.06] ${className}`}>{children}</div>;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[12px] text-accent bg-surface-container rounded-lg px-4 py-2.5 border border-white/[0.05] overflow-x-auto">
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-label text-[9px] uppercase tracking-[0.2em] text-on-surface-variant mb-2">{children}</p>;
}

const IAB_SIZES = ['728×90', '970×90', '970×250', '300×250', '336×280', '300×600', '160×600', '120×600', '320×50', '320×100', '468×60', '250×250', '180×150', '300×50'];

export default function MethodologiePage() {
  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <header>
        <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Référence</p>
        <h1 className="text-xl font-medium text-on-surface mt-1">Méthodologie — définitions & calculs</h1>
        <p className="font-label text-[12px] text-on-surface-variant mt-2 leading-relaxed">
          Comment MLI mesure la pression publicitaire d&apos;un site. Chaque site reçoit <strong className="text-on-surface">3 notes sur 10</strong> :
          plus la note est basse, plus le site est chargé en publicité.
        </p>
      </header>

      {/* ── Les 3 notes ── */}
      <Section title="Les 3 notes /10" subtitle="Affichées en donut sur chaque site — rouge = mauvais, vert = bon.">
        <div className="grid md:grid-cols-3 gap-3">
          <Card>
            <div className="flex items-center gap-4">
              <ScoreDonut value={2.2} size={64} stroke={6} />
              <div>
                <p className="text-sm font-medium text-on-surface">Détection pub</p>
                <p className="font-label text-[11px] text-on-surface-variant mt-1 leading-snug">
                  Quantité de pub détectée (DOM + réseau). 0 = saturé, 10 = aucune pub.
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <ScoreDonut value={5.8} size={64} stroke={6} />
              <div>
                <p className="text-sm font-medium text-on-surface">Encombrement</p>
                <p className="font-label text-[11px] text-on-surface-variant mt-1 leading-snug">
                  Part de l&apos;écran couverte par la pub (surface visible).
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <ScoreDonut value={9.0} size={64} stroke={6} />
              <div>
                <p className="text-sm font-medium text-on-surface">Note finale</p>
                <p className="font-label text-[11px] text-on-surface-variant mt-1 leading-snug">
                  La plus pénalisante des deux. C&apos;est la note de référence du site.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* ── Calcul ── */}
      <Section title="Détail des calculs">
        <Card>
          <Label>Encombrement (clutter)</Label>
          <p className="text-[13px] text-on-surface-variant leading-relaxed mb-3">
            On mesure la <strong className="text-on-surface">surface pub visible / surface de l&apos;écran</strong> à 3 positions de scroll, puis on
            pondère : haut de page (ATF) 50 %, milieu 30 %, profondeur 20 %. La surface est l&apos;<strong className="text-on-surface">aire d&apos;union</strong> des
            zones pub (les chevauchements wrapper/iframe ne comptent qu&apos;une fois), plafonnée à 100 %.
          </p>
          <Formula>encombrement = 10 × (1 − [ ratio_ATF×0.5 + ratio_MID×0.3 + ratio_DEEP×0.2 ])</Formula>
        </Card>

        <Card>
          <Label>Détection pub (v4)</Label>
          <p className="text-[13px] text-on-surface-variant leading-relaxed mb-3">
            Combine deux signaux et garde le plus fort : les pubs <strong className="text-on-surface">visibles dans le DOM</strong> et les
            <strong className="text-on-surface"> requêtes pub interceptées sur le réseau</strong> (le réseau est primordial car le DOM sous-compte souvent).
            On ajoute des pénalités pour les scripts ad-tech (Prebid, GPT…) et les formats collants (sticky), puis on convertit en note /10
            (courbe saturante : beaucoup de pub → proche de 0).
          </p>
          <Formula>pénalité = max(pub_DOM, requêtes_réseau × 0.25) + scripts + sticky → note /10</Formula>
        </Card>

        <Card>
          <Label>Note finale</Label>
          <p className="text-[13px] text-on-surface-variant leading-relaxed mb-3">
            On garde la note la <strong className="text-on-surface">plus pénalisante</strong> (la plus basse) entre l&apos;encombrement et la
            détection pub, après pénalité vidéo (chaque pub vidéo in-stream coûte 1,5 point — plus lourd qu&apos;une bannière).
          </p>
          <Formula>note_finale = min( encombrement , détection_pub − 1.5 × nb_pubs_vidéo )</Formula>
          <p className="font-label text-[11px] text-on-surface-variant mt-3">
            Seuil <strong className="text-warning">MFA</strong> : note &lt; 4,0 → site « Made For Advertising » (conçu pour la pub).
          </p>
        </Card>
      </Section>

      {/* ── Détection ── */}
      <Section title="Comment les pubs sont détectées" subtitle="Détection multi-couche, par comportement puis par sélecteurs.">
        <Card>
          <ul className="space-y-2.5 text-[13px] text-on-surface-variant">
            {[
              ['Iframes', 'régie connue, taille IAB, « friendly » (about:blank, créa injectée en JS), ou grande iframe cross-origin.'],
              ['Conteneurs IAB', 'élément de taille IAB contenant une iframe, une image de régie, ou dans un conteneur classé pub.'],
              ['Conteneurs classés', 'id/classe évoquant la pub (actirise, ads, gpt, dfp, adunit…).'],
              ['Slots vides IAB', 'emplacement exactement de taille IAB mais vide : la créa se charge plus tard (async) — on l’encadre quand même.'],
              ['Sélecteurs connus', 'liste de sélecteurs CSS publicitaires haute/moyenne confiance.'],
              ['Re-encadrement agressif', '3 passages scroll → attente → ré-encadrement avant la capture, pour boxer les pubs chargées tardivement.'],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <span className="text-accent mt-0.5">▸</span>
                <span><strong className="text-on-surface">{k}</strong> — {v}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-white/[0.05]">
            <Label>Tailles IAB reconnues</Label>
            <div className="flex flex-wrap gap-1.5">
              {IAB_SIZES.map((s) => (
                <span key={s} className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-white/[0.05]">{s}</span>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      {/* ── Autres indicateurs ── */}
      <Section title="Autres indicateurs">
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <Label>% Aire pub</Label>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">Moyenne des 3 ratios de surface (ATF/MID/DEEP), plafonnée à 100 %. Indicateur direct de couverture visuelle.</p>
          </Card>
          <Card>
            <Label>Pubs détectées</Label>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">Le plus grand entre le nombre d&apos;éléments pub dans le DOM et une estimation réseau (requêtes visuelles ÷ 3).</p>
          </Card>
          <Card>
            <Label>Santé</Label>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">Check HTTP : <span className="font-mono text-[11px]">ok</span>, <span className="font-mono text-[11px]">dead</span>, erreurs 4xx/5xx, DNS. Une page non chargée → <strong className="text-on-surface">load_error</strong>, note nulle (<em>exclue des moyennes</em>).</p>
          </Card>
          <Card>
            <Label>ads.txt</Label>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">Nombre de vendeurs autorisés déclarés dans le fichier <span className="font-mono text-[11px]">ads.txt</span> du site (direct / revendeurs).</p>
          </Card>
        </div>
      </Section>

      {/* ── Fiabilité ── */}
      <Section title="Garde-fous & fiabilité" subtitle="Pour éviter les faux « 10/10 » et les faux négatifs.">
        <Card>
          <ul className="space-y-2.5 text-[13px] text-on-surface-variant">
            {[
              ['Re-scan non-headless auto', 'un site en load_error est ré-audité avec navigateur visible (débloque anti-bot type DataDome et apps SPA).'],
              ['Re-scan multi-scénarios', 'si de l’ad-tech est présent mais 0 pub visible (faux négatif probable), escalade (locale FR patiente, puis headful) et on garde le résultat qui voit le plus de pub.'],
              ['Page d’erreur navigateur', 'une page d’erreur Chrome (connexion refusée…) est détectée et classée load_error, jamais notée 10/10.'],
              ['0 requête + ad-tech présent', 'signe d’un chargement bloqué en cours de scan → site marqué « à valider » manuellement plutôt que noté « propre ».'],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <span className="text-success mt-0.5">✓</span>
                <span><strong className="text-on-surface">{k}</strong> — {v}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <p className="font-label text-[10px] text-on-surface-variant/50 pt-2">
        Les notes sont recalculées à chaque audit. Une note ajustée manuellement passe le site en statut « validé ».
      </p>
    </div>
  );
}
