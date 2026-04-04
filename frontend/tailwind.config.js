/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0e141d',
        surface: {
          DEFAULT: '#0e141d',
          low: '#161c25',
          mid: '#1a2029',
          high: '#252a34',
          deepest: '#090e17',
        },
        primary: {
          DEFAULT: '#4edea3',
          dim: '#10B981',
        },
        'on-surface': '#dee2f0',
        muted: '#94a3b8',
        dim: '#64748b',
        outline: '#3c4a42',
        danger: '#EF4444',
        warning: '#F97316',
        info: '#818CF8',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
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
    },
  },
  plugins: [],
};
