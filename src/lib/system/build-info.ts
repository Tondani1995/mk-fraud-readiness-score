// Server-only shared source of operational build metadata.
// Used by both /api/health and /api/system/build-info so the two routes
// cannot drift out of sync on fallback values (Platform Runtime and Database
// Hardening, PR #19).
//
// Deliberately exposes only non-sensitive, low-cardinality operational
// labels. Never add secrets, keys, connection strings, or environment
// variable inventories to this module.

export const CURRENT_BUILD_PHASE =
  process.env.MK_BUILD_PHASE ?? 'phase-13-customer-commercial-conversion';

export const CURRENT_RELEASE_CHANNEL =
  process.env.MK_RELEASE_CHANNEL ??
  process.env.VERCEL_ENV ??
  process.env.NODE_ENV ??
  'local';
