/**
 * MK Premium Product design tokens.
 *
 * Templates must consume these names rather than introducing local colour literals. The
 * exported values are also used by the binary colour-purity gate, so the token file is the one
 * deliberate home for the palette.
 */
export const MK_TOKENS = {
  navy900: '#0B1B33',
  navy700: '#142F4C',
  navy500: '#2C4A6B',
  ink: '#1A2634',
  muted: '#5A6B7C',
  rule: '#D9E1E7',
  cream: '#FBF9F5',
  white: '#FFFFFF',
  brass: '#C9A227',
  brassSoft: '#F0E6C8',
  critical: '#A32020',
  criticalBg: '#FBEDED',
  major: '#B8761F',
  majorBg: '#FDF4E7',
  confirmed: '#1F6B4A',
  confirmedBg: '#EDF5F0',
  neutral: '#142F4C',
  neutralBg: '#FBF9F5'
} as const;

export const MK_CSS_VARIABLES = `
  --mk-navy-900: ${MK_TOKENS.navy900};
  --mk-navy-700: ${MK_TOKENS.navy700};
  --mk-navy-500: ${MK_TOKENS.navy500};
  --mk-ink: ${MK_TOKENS.ink};
  --mk-muted: ${MK_TOKENS.muted};
  --mk-rule: ${MK_TOKENS.rule};
  --mk-cream: ${MK_TOKENS.cream};
  --mk-white: ${MK_TOKENS.white};
  --mk-brass: ${MK_TOKENS.brass};
  --mk-brass-soft: ${MK_TOKENS.brassSoft};
  --mk-critical: ${MK_TOKENS.critical};
  --mk-critical-bg: ${MK_TOKENS.criticalBg};
  --mk-major: ${MK_TOKENS.major};
  --mk-major-bg: ${MK_TOKENS.majorBg};
  --mk-confirmed: ${MK_TOKENS.confirmed};
  --mk-confirmed-bg: ${MK_TOKENS.confirmedBg};
  --mk-neutral: var(--mk-navy-700);
  --mk-neutral-bg: var(--mk-cream);
  --mk-white-25: rgba(255, 255, 255, .25);
  --mk-white-35: rgba(255, 255, 255, .35);
  --mk-navy-grid: rgba(16, 46, 87, .06);
  --mk-navy-rule: rgba(20, 47, 76, .18);
`;

export type MkSeverity = 'critical' | 'major' | 'confirmed' | 'neutral';

export function severityToken(severity: MkSeverity): string {
  return {
    critical: 'var(--mk-critical)',
    major: 'var(--mk-major)',
    confirmed: 'var(--mk-confirmed)',
    neutral: 'var(--mk-neutral)'
  }[severity];
}

export function severityBackgroundToken(severity: MkSeverity): string {
  return {
    critical: 'var(--mk-critical-bg)',
    major: 'var(--mk-major-bg)',
    confirmed: 'var(--mk-confirmed-bg)',
    neutral: 'var(--mk-neutral-bg)'
  }[severity];
}
