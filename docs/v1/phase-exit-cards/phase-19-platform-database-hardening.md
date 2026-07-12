# PR #19 Exit Card - Platform and Database Hardening

## Phase Result

**Code-level Pass; migration and production assurance outstanding.**

## Source

- Repository: `Tondani1995/mk-fraud-readiness-score`
- Base branch: `main`
- Expected/confirmed base SHA: `7ecc0916feb9c8acb08c844a8ca22b1551becdb2`
- Working branch: `platform/runtime-database-hardening`
- Draft PR title: `Platform runtime and database hardening`

## Runtime Decision

Node remains pinned to Node 20:

- `package.json` keeps `engines.node = 20.x`.
- `.nvmrc` contains `20`.
- GitHub Actions uses Node 20.
- The Phase 10 premium-report test still asserts the Node 20 runtime guard for Vercel Chromium compatibility.

The Vercel Node 20 deprecation warning remains unresolved. Node 24 is not claimed incompatible; it is deferred until a separate compatibility spike proves live Vercel PDF generation.

## Implemented

- Added `.nvmrc`.
- Updated stale package metadata while preserving dependency versions.
- Added `platform:test-hardening`.
- Wired platform hardening tests into V1 Verification.
- Added shared operational metadata source: `src/lib/system/build-info.ts`.
- Updated health/build-info API routes to use shared metadata.
- Removed dead `next.config.ts`; `next.config.mjs` remains authoritative.
- Prepared migration `0016_platform_database_hardening.sql`.
- Added platform hardening docs, advisor inventory, migration note, runtime preview checklist and Node 24 spike note.

## Database Migration

Migration prepared:

- `supabase/migrations/0016_platform_database_hardening.sql`

Included:

- `public.set_updated_at()` explicit `search_path = public`.
- `admin_profiles_select` auth init-plan optimization using `(select auth.uid())`.
- `reports(order_id)` FK index.
- `assessment_answers(question_id)` FK index.

Migration status:

- Not applied to production.
- Not applied to a Supabase branch by this task.

## Supabase Advisor Result

Security advisors refreshed on production project `jvjxlphdyzerrhwcgkup`:

- `assessment_tokens` and `rate_limit_hits` have RLS enabled with no policies: documented as intentional service-role-only tables.
- `set_updated_at()` mutable search path: fixed in prepared migration 0016.
- `citext` in public: parked for controlled extension migration.
- `current_admin_role()` / `is_admin_role(...)` security-definer execution: audited and parked.
- leaked-password protection disabled: dashboard configuration, parked.

Performance advisors refreshed:

- unindexed FKs: two evidence-backed indexes prepared; remaining findings parked.
- admin-profile auth init-plan: fixed in prepared migration 0016.
- multiple permissive policies: grouped, audited and parked.
- unused indexes: parked, no drops.

## Local Dependency Evidence

Official Node `v20.20.2` and npm `10.8.2` were downloaded locally for dependency-only verification.

Results:

- clean `npm install` completed;
- generated `package-lock.json` had `lockfileVersion: 3`;
- all 9 platform-specific `@next/swc-*` optional packages were present;
- clean `npm ci` completed after removing `node_modules`.

Local full app tests were not possible from a normal checkout because this workspace has no GitHub credentials for `git clone`; full-source verification must be GitHub Actions on the branch/PR head.

## Code-Level Checks Required

GitHub Actions must pass on the exact PR head:

- `npm run phase7:test-snapshot`
- `npm run phase8:test-admin`
- `npm run methodology:copy-test`
- `npm run phase9:test-orders`
- `npm run phase10:test-report`
- `npm run phase11:test-security`
- `npm run phase13:test-events`
- `npm run phase13:test-conversion`
- `npm run platform:test-hardening`
- `npm run typecheck`
- `npm run build`

## Exact Preview Requirements

Before merge, verify a READY Vercel preview for the exact PR head:

- deployment metadata SHA matches PR head;
- Node 20 is used;
- Node 20 deprecation warning is documented;
- missing-SWC warning is absent;
- `/score/start` returns 200;
- `/score/api/health` returns 200 and reports `phase-13-customer-commercial-conversion`;
- `/score/api/system/build-info` returns 200 and reports `releaseChannel: preview`;
- no fatal/error runtime logs appear.

## No-Go Confirmation

PR #19 does not:

- upgrade Node;
- weaken the Phase 10 Node guard;
- upgrade Next.js;
- upgrade React;
- change scoring;
- change methodology;
- change R5/R50 journeys;
- change EFT details;
- change report content or gates;
- broadly rewrite RLS;
- add permissive policies;
- relocate `citext`;
- change password settings;
- apply migration 0016;
- merge or mark ready.

## Remaining Risks

- Vercel Node 20 deprecation warning remains.
- Migration 0016 is prepared but unapplied.
- Post-migration advisor results are not available until controlled application.
- Several Supabase advisor findings remain intentionally parked.
- Exact-head Vercel preview verification must still be completed after PR creation.
