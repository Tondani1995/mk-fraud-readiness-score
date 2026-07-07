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
          ink: '#12100D',
          charcoal: '#1D1A16',
          slate: '#2A2722',
          brass: '#B08A44',
          brassDark: '#7C5F2A',
          cream: '#F7F1E6',
          paper: '#FFFDF8',
          line: '#E6D8BF',
          muted: '#746B5C',
          danger: '#9B2C2C',
          success: '#2F6B4F'
        }
      },
      boxShadow: {
        soft: '0 20px 60px rgba(18, 16, 13, 0.12)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;
