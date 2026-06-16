import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MLI — Media-List Intelligence',
  description: 'Audit de whitelists programmatiques — Dentsu Programmatic Intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`light ${manrope.variable} ${jetbrains.variable}`}>
      <head>
        {/* Applique le thème stocké avant le paint pour éviter le flash de bascule. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('mli-theme');if(t!=='light'&&t!=='dark')t='light';var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);}catch(e){}})();",
          }}
        />
      </head>
      <body className="bg-background text-on-surface font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
