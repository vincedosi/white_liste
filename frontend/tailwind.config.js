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
        background: '#080808',
        surface: {
          DEFAULT: '#080808',
          dim: '#080808',
          low: '#0d0d0d',
          container: '#121212',
          high: '#181818',
          highest: '#1c1c1c',
          bright: '#1a1a1a',
        },
        primary: {
          DEFAULT: '#339dff',
          electric: '#0066ff',
        },
        accent: '#00e5ff',
        secondary: '#00fc40',
        'on-surface': '#ffffff',
        'on-surface-variant': '#909090',
        muted: '#909090',
        dim: '#606060',
        outline: {
          DEFAULT: '#404040',
          variant: '#2a2a2a',
        },
        danger: '#ff716c',
        warning: '#F59E0B',
        success: '#00fc40',
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
