import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        mk: {
          ink: '#001030',
          charcoal: '#001030',
          slate: '#405050',
          brass: '#1d3658',
          brassDark: '#1d3658',
          cream: '#F8FAFC',
          paper: '#FFFFFF',
          line: '#E2E8F0',
          muted: '#475569',
          danger: '#9B2C2C',
          success: '#2F6B4F'
        }
      },
      boxShadow: {
        soft: '0 18px 45px rgba(0, 16, 48, 0.10)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;
