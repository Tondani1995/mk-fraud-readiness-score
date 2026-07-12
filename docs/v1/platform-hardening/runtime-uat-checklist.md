# Platform Runtime and Database Hardening - Runtime Preview Checklist

Runtime preview checked on deployment `dpl_8nqo3N7oVbxymaCNDdLt54urg9Hd` for PR head `1e6e20fe467268e88ccac0597d0be1a86fbc1048`.

## Runtime

- [x] Vercel preview build for the PR head reached `READY`.
- [x] Vercel preview metadata SHA matched the PR head exactly.
- [x] Build/runtime evidence confirms Node.js 20 is retained.
- [x] The known Vercel Node 20 deprecation warning is documented, not treated as fixed.
- [ ] No `Found lockfile missing swc dependencies` warning appears in the build log. The warning still appeared.
- [x] Build completed without errors.

## Operational endpoints

- [x] `GET /score/start` returned HTTP 200.
- [ ] `GET /score/api/health` returned HTTP 200. Connector fetches redirected through Vercel SSO on the protected preview, so JSON was not directly observed.
- [ ] Health response JSON observed as current phase. Not directly observed because of protected-preview SSO redirect.
- [ ] `GET /score/api/system/build-info` returned HTTP 200. Connector fetches redirected through Vercel SSO on the protected preview, so JSON was not directly observed.
- [ ] Preview build-info response reports `releaseChannel: "preview"`. Not directly observed because of protected-preview SSO redirect.
- [ ] Neither endpoint exposes Supabase keys, JWT secrets, token peppers, URLs, token values or environment inventories. Static source tests passed; live JSON was not directly observed.

## Application smoke

- [x] `/score/start` rendered the start page.
- [x] Runtime error/fatal log query for the deployment returned no matching logs.
- [ ] Existing customer R5/R50/report-generation gates were not manually retested in this platform-hardening pass.

## Report generation boundary

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

- [x] GitHub Actions V1 Verification run #458 passed on the exact PR head commit.
- [x] PR remains draft.
- [x] PR has not been merged.

## Result

Conditional Pass. Code-level checks passed and preview deployed, but the SWC lockfile warning remains and protected-preview API JSON needs direct verification.
