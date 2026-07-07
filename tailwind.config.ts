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
          ink: '#111827',
          charcoal: '#121A2F',
          slate: '#46525E',
          brass: '#A9B3BE',
          brassDark: '#344155',
          cream: '#F6F7F9',
          paper: '#FFFFFF',
          line: '#D8DEE6',
          muted: '#5F6B78',
          danger: '#9B2C2C',
          success: '#2F6B4F'
        }
      },
      boxShadow: {
        soft: '0 18px 45px rgba(17, 24, 39, 0.10)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;
