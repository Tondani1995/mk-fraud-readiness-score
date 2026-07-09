# Phase 11 Exit Card - Security and QA Hardening

## Status

`PASS WITH CONDITIONS`

Phase 11 ZIP-mode static/local assurance passed for the narrowed security patch. This patch intentionally keeps the application on Next.js 14.x and does not include the separate framework-upgrade work.

## Source

- ZIP received: `/Users/tondani/Downloads/mk-fraud-readiness-score-main.zip`
- Expected main head: `ee198f4bdcf6c637ac8c7e4e3c434a4f9419dbb9`
- Git metadata available: no
- Detected head: not available from ZIP metadata; treated as uploaded source for expected main head
- Project root found: yes, under `phase11-next14-narrow/mk-fraud-readiness-score-main`
- Required folders found: `package.json`, `src`, `scripts`, `supabase`, `docs`

## Scope Kept Narrow

- Next remains `^14.2.13` in `package.json`; local install resolved Next `14.2.35`.
- `eslint-config-next` remains `^14.2.13` in `package.json`.
- React and TypeScript versions were not changed.
- `next.config.mjs` remains in the Next 14 `experimental.outputFileTracingIncludes` shape.
- App Router `params` and `searchParams` signatures remain Next 14-compatible.
- `getAdminAccessTokenFromCookies()` remains synchronous.

## Fixes Made

- Added `scripts/phase11-security-qa-tests.mjs`.
- Added `phase11:test-security` package script.
- Added `docs/v1/security/route-access-control-matrix.md`.
- Hardened the legacy snapshot result route so it no longer renders by assessment reference alone.
- Hardened detailed-report request creation so a valid snapshot token is required before a customer order can be created or reused.
- Updated `FreeSnapshot` to send the private snapshot token when requesting the detailed report.
- Hardened admin read pages so `requireAdmin` succeeds before service-role reads on orders, order detail, reports, audit log, content config, product config and question config.
- Added Phase 9 and Phase 11 static assertions for the token boundary and auth-before-read ordering.

## Commands Run

The ZIP workspace did not expose `npm`; checks were run with the bundled `pnpm` runtime. The local runtime warned that Node `v24.14.0` was used while the project declares Node `20.x`.

- `CI=true pnpm install` - first run stopped on pnpm build-script approval for `unrs-resolver`.
- `pnpm approve-builds --all` - passed.
- `CI=true pnpm install` - passed after approval.
- `pnpm run phase7:test-snapshot` - passed.
- `pnpm run phase8:test-admin` - passed.
- `pnpm run methodology:copy-test` - passed.
- `pnpm run phase9:test-orders` - passed.
- `pnpm run phase10:test-report` - passed.
- `pnpm run phase11:test-security` - passed.
- `pnpm run typecheck` - passed.
- `pnpm run build` - passed with safe dummy environment values. Build warnings were limited to existing `<img>` lint warnings in `Header.tsx` and `Footer.tsx`.
- `pnpm audit --audit-level=high` - failed with known high-severity advisories in Next 14 and `glob` via `eslint-config-next`.

## Audit Result

Dependency security issue remains because framework upgrade was intentionally split into a separate controlled upgrade PR.

Observed high findings:

- `glob` via `eslint-config-next`.
- Multiple `next` advisories requiring Next 15.x patched versions.

## Access Control Result

- Route matrix completed: yes, `docs/v1/security/route-access-control-matrix.md`.
- Logged-out admin blocked by static review: yes.
- Logged-out admin APIs blocked by static review: yes.
- Respondent premium report access blocked by static review: yes.
- Report generation admin-only by static review: yes.
- Admin page service reads occur after auth: yes, covered by Phase 11 static assertions.

## Payment and Report Gates

- `awaiting_payment` blocked by static review.
- `cancelled` blocked by static review.
- `expired` blocked by static review.
- `payment_received` required by static review.
- Automatic generation absent by static review.
- Version supersession reviewed in Phase 10 path and preserved.

## Storage and Download

- Bucket intended private: yes, migration expects `generated-reports` with `public = false`.
- Signed URL used: yes.
- Signed URL TTL: 300 seconds.
- Admin route required: yes.
- Public URL avoided: yes.

## Leakage and Error Hygiene

- Internal code scan: passed for customer-facing snapshot/report template paths.
- Raw JSON/stack trace scan: passed for public paths covered by static checks.
- `null`/`undefined`/`NaN` scan: passed for customer-facing text checks.
- Customer-facing phase-label scan: passed for public paths covered by static checks.
- Controlled errors reviewed: yes.

## Audit Events

- Payment marking audited: static review confirms order events and audit logs.
- Generation audited: static review confirms report events and audit logs.
- Regeneration audited: static review confirms supersession/event path remains in report generation.
- Download audited: static review confirms `download_requested` event and audit log path.
- Rejected/failed attempts audited: static review confirms report generation writes failed/rejected events.

## Live Checks Not Run In ZIP Mode

- Unpaid order live block.
- Logged-out download against deployed/current app.
- Direct storage access.
- Authenticated admin signed download.
- Vercel preview.
- Supabase production runtime reconciliation.

## Remaining Risks

- ZIP mode cannot prove deployed Vercel behaviour, production Supabase RLS/storage behaviour or authenticated admin signed downloads.
- High-severity dependency audit findings remain because the requested patch intentionally excludes the Next.js major-version upgrade.
- Local verification used bundled Node 24 despite the project declaring Node 20; CI/Vercel should run on Node 20.

## Recommendation

Safe to apply as the Phase 11 security PR. Run the remaining live checks on a current Vercel deployment with approved Supabase credentials before merge, and handle the Next.js security advisories in a separate controlled framework-upgrade PR.
