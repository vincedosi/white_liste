'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';

type Theme = 'dark' | 'light';

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove('light', 'dark');
  el.classList.add(theme);
  try {
    localStorage.setItem('mli-theme', theme);
  } catch {
    /* stockage indisponible — on garde juste le thème en mémoire */
  }
}

/**
 * Bascule clair / sombre. Le thème est appliqué sur <html> et persisté dans
 * localStorage (lu au boot par le script inline du layout, sans flash).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current: Theme = document.documentElement.classList.contains('light')
      ? 'light'
      : 'dark';
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={isDark ? 'Thème clair' : 'Thème sombre'}
      className={clsx(
        'group flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-150',
        'border border-outline/30 hover:border-accent/50',
        'text-on-surface-variant hover:text-on-surface',
        className,
      )}
    >
      {/* Avant le montage, on n'affiche pas d'icône pour éviter tout mismatch SSR. */}
      {mounted && (isDark ? <Moon size={14} /> : <Sun size={14} />)}
      <span className="font-label text-[9px] uppercase tracking-[0.15em] font-extralight">
        {mounted ? (isDark ? 'Sombre' : 'Clair') : 'Thème'}
      </span>
    </button>
  );
}
