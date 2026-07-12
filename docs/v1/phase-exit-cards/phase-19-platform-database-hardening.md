# PR #19 Exit Card - Platform and Database Hardening

## Phase Result

**Conditional Pass.** Code-level checks pass, migration remains unapplied, and the Vercel preview for the validated PR head is READY, but the Vercel build still reports the missing-SWC lockfile warning.

## Source

- Repository: `Tondani1995/mk-fraud-readiness-score`
- PR: `#19`
- Base branch: `main`
- Expected/confirmed base SHA: `7ecc0916feb9c8acb08c844a8ca22b1551becdb2`
- Working branch: `platform/runtime-database-hardening`
- Validated PR head: `2cc4c1bd0cbb5f4d769718064539ca7e4ce09013`
- Draft PR title: `Platform runtime and database hardening`

This exit-card refresh is documentation-only and does not change runtime code, schema, scoring, methodology, report gates, EFT flow or customer/admin behaviour.

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

Local full app tests were not possible from a normal checkout because this workspace has no GitHub credentials for `git clone`; full-source verification was provided by GitHub Actions on the PR head.

## GitHub Actions Evidence

V1 Verification run `#463` passed on `2cc4c1bd0cbb5f4d769718064539ca7e4ce09013`.

Passed steps:

- checkout
- Node 20 setup
- dependency install
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

## Exact Preview Evidence

Vercel deployment:

- Deployment ID: `dpl_5mt5aewgqQMKAtxGVMnYQXfWAEx1`
- URL: `https://mk-fraud-readiness-score-9sjgb2oag-tondanis-projects.vercel.app`
- State: `READY`
- Metadata SHA: `2cc4c1bd0cbb5f4d769718064539ca7e4ce09013`
- Exact commit match: yes

Preview build evidence:

- Vercel used Node 20 because of `engines.node = 20.x`.
- Vercel emitted the expected Node 20 deprecation warning.
- Next.js remained `14.2.35`.
- Build completed successfully.
- `/score/start` returned HTTP 200.
- Runtime error/fatal log query for the deployment returned no matching logs.

Unresolved preview evidence:

- Vercel still emitted `Found lockfile missing swc dependencies, run next locally to automatically patch`.
- Protected preview API fetches for `/score/api/health` and `/score/api/system/build-info` returned Vercel SSO redirects through the connector, so their JSON bodies were not directly observed in this run.

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

- Vercel missing-SWC warning remains unresolved because `package-lock.json` is not committed to the branch.
- Vercel Node 20 deprecation warning remains by design for this PR.
- Migration 0016 is prepared but unapplied.
- Post-migration advisor results are not available until controlled application.
- Several Supabase advisor findings remain intentionally parked.
- Health/build-info JSON needs direct browser or unprotected-preview verification.
