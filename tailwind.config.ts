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
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: '#ffffff' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        // MK brand palette.
        //
        // Derived from the two authoritative sources, not from taste: the canonical logo.svg
        // (exactly two fills, #01123A and #47515A) and the approved live website (#001030,
        // #1D3658, slate greys, white). There is NO gold or brass in either source, and no
        // cream. Owner decision for V1.2: retain #001030 as the runtime product navy.
        //
        // `brass`, `brassDark`, `cream` and `charcoal` are semantic naming debt -- the values
        // are right for this brand, the names are not. They are retained as aliases of the
        // correctly named tokens so 27 unrelated website files do not need a cosmetic rewrite.
        // New and corrected Snapshot/order code uses the correct names only.
        mk: {
          navy: '#001030',
          accent: '#1D3658',
          surface: '#F8FAFC',
          ink: '#001030',
          slate: '#47515A',
          paper: '#FFFFFF',
          line: '#E2E8F0',
          muted: '#475569',
          danger: '#9B2C2C',
          success: '#2F6B4F',
          // Deprecated aliases. Do not use in new code.
          charcoal: '#001030',
          brass: '#1D3658',
          brassDark: '#1D3658',
          cream: '#F8FAFC'
        }
      },
      boxShadow: {
        soft: '0 18px 45px rgba(0, 16, 48, 0.10)',
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl2: '1.25rem',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: []
};

export default config;
