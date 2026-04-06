/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#F8FAFC',
        surface: {
          DEFAULT: '#FFFFFF',
          low: '#FFFFFF',
          mid: '#F8FAFF',
          high: '#F1F5F9',
          deepest: '#E8ECF4',
        },
        sidebar: {
          DEFAULT: '#0F172A',
          active: '#1E293B',
        },
        primary: {
          DEFAULT: '#2563EB',
          dim: '#1D4ED8',
          light: '#3B82F6',
          lighter: '#60A5FA',
          50: '#EFF6FF',
          100: '#DBEAFE',
        },
        accent: '#0EA5E9',
        'on-surface': '#0F172A',
        muted: '#64748B',
        dim: '#94A3B8',
        outline: '#E2E8F0',
        'outline-light': '#F1F5F9',
        danger: '#EF4444',
        'danger-light': '#FEE2E2',
        warning: '#F59E0B',
        'warning-light': '#FEF3C7',
        info: '#6366F1',
        'info-light': '#E0E7FF',
        success: '#10B981',
        'success-light': '#D1FAE5',
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'Plus Jakarta Sans', 'sans-serif'],
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
      boxShadow: {
        'card': '0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(15,23,42,0.06)',
        'elevated': '0 8px 30px rgba(15,23,42,0.08)',
        'cta': '0 4px 14px rgba(37,99,235,0.25)',
        'cta-hover': '0 6px 20px rgba(37,99,235,0.35)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.8)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [],
};
