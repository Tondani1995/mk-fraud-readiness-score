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
          ink: '#01123A',
          charcoal: '#01123A',
          slate: '#47515A',
          brass: '#47515A',
          brassDark: '#01123A',
          cream: '#F6F7F9',
          paper: '#FFFFFF',
          line: '#D8DEE6',
          muted: '#47515A',
          danger: '#9B2C2C',
          success: '#2F6B4F'
        }
      },
      boxShadow: {
        soft: '0 18px 45px rgba(1, 18, 58, 0.10)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;
