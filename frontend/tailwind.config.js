/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tokens sémantiques pilotés par des variables CSS (cf. globals.css).
        // rgb(var(--x) / <alpha-value>) -> les utilitaires d'opacité Tailwind
        // (bg-surface-high/40, etc.) continuent de fonctionner.
        background: 'rgb(var(--c-background) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          dim: 'rgb(var(--c-surface-dim) / <alpha-value>)',
          low: 'rgb(var(--c-surface-low) / <alpha-value>)',
          container: 'rgb(var(--c-surface-container) / <alpha-value>)',
          high: 'rgb(var(--c-surface-high) / <alpha-value>)',
          highest: 'rgb(var(--c-surface-highest) / <alpha-value>)',
          bright: 'rgb(var(--c-surface-bright) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          electric: 'rgb(var(--c-primary-electric) / <alpha-value>)',
        },
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        secondary: 'rgb(var(--c-secondary) / <alpha-value>)',
        'on-surface': 'rgb(var(--c-on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--c-on-surface-variant) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        dim: 'rgb(var(--c-dim) / <alpha-value>)',
        outline: {
          DEFAULT: 'rgb(var(--c-outline) / <alpha-value>)',
          variant: 'rgb(var(--c-outline-variant) / <alpha-value>)',
        },
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Manrope', 'sans-serif'],
        label: ['var(--font-label)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        'glow-blue': '0 0 40px rgba(0, 102, 255, 0.3), 0 0 80px rgba(0, 102, 255, 0.1)',
        'glow-cyan': '0 0 40px rgba(0, 229, 255, 0.3), 0 0 80px rgba(0, 229, 255, 0.1)',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.8)' },
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [],
};
