/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // TerriMind design system
        tm: {
          bg: '#0f1117',
          surface: '#1a1d27',
          panel: '#1e2130',
          border: '#2d3148',
          accent: '#4f6ef7',
          'accent-hover': '#6b85ff',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
          text: '#e2e8f0',
          muted: '#64748b',
          dim: '#94a3b8'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
