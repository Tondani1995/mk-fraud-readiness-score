# Platform Runtime and Database Hardening - Runtime Preview Checklist

Runtime preview checked on deployment `dpl_DFfLTVx5qBRq9mFaJDCZrnZcMrL4` for corrected PR head `22bff91a13f65bd61d97742822674df232bfb331`.

## Runtime

- [x] Vercel preview build for the corrected PR head reached `READY`.
- [x] Vercel preview metadata SHA matched the corrected PR head exactly.
- [x] Build/runtime evidence confirms Node.js 20 is retained.
- [x] The known Vercel Node 20 deprecation warning is documented, not treated as fixed.
- [x] No `Found lockfile missing swc dependencies` warning appears in the exact-head build log.
- [x] Build completed without errors.

## Operational Endpoints

Checked through a Vercel temporary access URL and local cookie jar, not by accepting an SSO redirect.

- [x] `GET /score/start` returned HTTP 200.
- [x] `/score/start` rendered current MK assessment start content.
- [x] `/score/start` did not redirect loop.
- [x] `/score/start` did not contain `/score/score/` duplication.
- [x] `/score/start` did not escape to the production host.
- [x] `GET /score/api/health` returned HTTP 200.
- [x] Health response JSON: `{"ok":true,"service":"mk-fraud-readiness-score-v1","phase":"phase-13-customer-commercial-conversion"}`.
- [x] `GET /score/api/system/build-info` returned HTTP 200.
- [x] Build-info response JSON: `{"app":"MK Fraud Readiness Score V1","phase":"phase-13-customer-commercial-conversion","releaseChannel":"preview"}`.
- [x] Neither endpoint exposed Supabase keys, JWT secrets, token peppers, URLs, token values or environment inventories.

## Application Smoke

- [x] `/score/start` rendered the start page.
- [x] Runtime error/fatal log query for the deployment returned no matching logs.
- [ ] Existing customer R5/R50/report-generation gates were not manually retested in this platform-hardening pass.

## Report Generation Boundary

- [x] Phase 10 premium report test passed in CI under Node 20.
- [x] `@sparticuz/chromium` static/report tests still passed.
- [x] `puppeteer-core` static/report tests still passed.
- [x] Chromium launch configuration and output tracing remained unchanged.
- [x] Customer flows do not generate reports automatically per unchanged Phase 10/13 regression tests.

## Database

- [x] Migration `0016_platform_database_hardening.sql` reviewed.
- [x] Migration 0016 remains unapplied during PR review.
- [x] Advisor inventory is current and separates implemented, parked and dashboard-configuration items.

## Sign-off

- [x] GitHub Actions V1 Verification run #476 passed on the corrected PR head commit.
- [x] PR remains draft.
- [x] PR has not been merged.

## Result

Code-level and preview Pass; migration and production assurance outstanding.
