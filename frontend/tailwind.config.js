/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        shell: '#0b0e14',
        background: '#10131a',
        surface: '#151923',
        'surface-2': '#1b202b',
        'surface-3': '#232b38',
        'surface-4': '#2f3948',
        line: '#394253',
        muted: '#8c97ad',
        text: '#e1e8f5',
        primary: '#7ab7ff',
        'primary-2': '#4d86ff',
        'primary-soft': 'rgba(122, 183, 255, 0.14)',
        success: '#63d2a0',
        warning: '#f5c46a',
        danger: '#f38da3',
      },
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 30px 80px rgba(4, 10, 22, 0.35)',
        glow: '0 24px 48px rgba(77, 134, 255, 0.16)',
      },
      backgroundImage: {
        'hero-grid':
          'linear-gradient(rgba(140, 151, 173, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(140, 151, 173, 0.08) 1px, transparent 1px)',
        'electric-blue': 'linear-gradient(135deg, #9cd7ff 0%, #4d86ff 52%, #2f56d8 100%)',
      },
    },
  },
  plugins: [],
};
