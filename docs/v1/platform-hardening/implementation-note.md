# Platform and Database Hardening Implementation Note

## Scope

PR #19 is a narrow platform/runtime/database hardening PR. It does not change customer journeys, scoring, methodology, pricing, EFT details, report content, report-generation gates, or admin product behaviour.

## Implemented

- Added `.nvmrc` with `20`.
- Kept `package.json` `engines.node` at `20.x`.
- Kept GitHub Actions on Node 20.
- Added `npm run platform:test-hardening`.
- Wired `platform:test-hardening` into the V1 Verification workflow.
- Updated stale package metadata so it no longer describes Phase 11 as the current product state.
- Added shared server-only build metadata in `src/lib/system/build-info.ts`.
- Updated `/score/api/health` and `/score/api/system/build-info` to use the shared metadata source.
- Removed dead `next.config.ts` after confirming `next.config.mjs` is authoritative and retains `/score` plus Chromium/Puppeteer output tracing.
- Prepared migration `0016_platform_database_hardening.sql` with narrow database hardening fixes.
- Documented Supabase advisor findings and parking decisions.
- Documented the separate Node 24 compatibility spike.

## Node Runtime Decision

Node 20 is temporarily retained because Phase 10 premium PDF generation depends on deployed Chromium/Puppeteer behaviour. The Phase 10 regression suite intentionally asserts the Node 20 runtime pin.

The Vercel Node 20 deprecation warning remains unresolved in this PR. Node 24 is not claimed incompatible; it is simply not yet proven to the required standard for this app's live PDF-generation path.

## Lockfile/SWC Evidence

A clean dependency-only install was run locally with official Node `v20.20.2` and npm `10.8.2`.

Result:

- `npm install` completed successfully.
- Generated lockfile version: `3`.
- All 9 platform-specific `@next/swc-*` optional packages appeared in the generated lockfile.
- `npm ci` completed successfully from the generated lockfile after deleting `node_modules`.

Exact-head Vercel preview still emitted `Found lockfile missing swc dependencies, run next locally to automatically patch` because the generated `package-lock.json` is not committed to this branch. This remains an unresolved condition.

## Database Hardening Decision

Migration `0016_platform_database_hardening.sql` is included because it contains only narrow, reviewable changes:

- explicit `search_path` for `public.set_updated_at()`;
- `admin_profiles_select` init-plan optimization with `(select auth.uid())`;
- two evidence-backed FK indexes.

It does not add public grants, does not add permissive policies, does not rewrite existing data, and does not touch methodology/scoring/report result tables.

## Not Implemented

- No Node 24 upgrade.
- No Next.js upgrade.
- No React upgrade.
- No broad RLS rewrite.
- No `citext` relocation.
- No password setting change.
- No migration application.
- No customer feature changes.
- No Phase 14 work.
- No committed lockfile repair yet.
