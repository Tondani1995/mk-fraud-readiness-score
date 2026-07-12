// Server-only shared source of operational build metadata.
// Used by both /api/health and /api/system/build-info so the routes cannot drift.
// Deliberately exposes only non-sensitive, low-cardinality labels.

export const CURRENT_BUILD_PHASE = 'phase-14-autonomous-premium-report-engine';

export const CURRENT_RELEASE_CHANNEL =
  process.env.VERCEL_ENV ??
  process.env.MK_RELEASE_CHANNEL ??
  process.env.NODE_ENV ??
  'local';
