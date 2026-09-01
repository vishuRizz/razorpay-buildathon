/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        status: {
          approved: 'var(--status-approved)',
          pending: 'var(--status-pending)',
          blocked: 'var(--status-blocked)',
        },
        // Deep Learning High-Tech palette from design.md
        bg: {
          base: '#0D0D0D',       // Preto Profundo
          surface: '#141414',
          elevated: '#1E1E1E',
          border: '#2A2A2A',     // Carvão
          muted: '#333333',
        },
        green: {
          primary: '#76B900',    // Verde Vibrante — NVIDIA green
          circuit: '#6EFA5F',    // Verde Circuito — success
          dim: '#4A7A00',
          glow: 'rgba(118,185,0,0.15)',
        },
        blue: {
          electric: '#00BFFF',   // Azul Elétrico
          dim: 'rgba(0,191,255,0.15)',
        },
        gray: {
          cold: '#BDBDBD',       // Cinza Claro
          mid: '#4A4A4A',        // Cinza Frio
          dark: '#2A2A2A',
        },
        status: {
          approved: '#6EFA5F',
          pending: '#F59E0B',
          blocked: '#FF3B3B',
        },
      },
      fontFamily: {
        sans: ['Instrument Sans', 'system-ui', 'sans-serif'],
        display: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fadeIn 0.54s ease-out',
        'fade-up': 'fadeUp 0.54s ease-out',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'data-flow': 'dataFlow 3s linear infinite',
        'scan-line': 'scanLine 4s linear infinite',
        'count-up': 'fadeUp 0.4s ease-out',
        'slide-down': 'slideDown 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        slideIn: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(118,185,0,0.2), 0 0 24px rgba(118,185,0,0.08)' },
          '50%': { boxShadow: '0 0 16px rgba(118,185,0,0.4), 0 0 48px rgba(118,185,0,0.15)' },
        },
        dataFlow: {
          from: { strokeDashoffset: '100' },
          to: { strokeDashoffset: '0' },
        },
        scanLine: {
          '0%': { top: '0%' },
          '100%': { top: '100%' },
        },
      },
      boxShadow: {
        'green': '0 0 20px rgba(118,185,0,0.2)',
        'green-strong': '0 0 40px rgba(118,185,0,0.35)',
        'blue': '0 0 20px rgba(0,191,255,0.2)',
        'card': '0 2px 12px rgba(0,0,0,0.4)',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
};
