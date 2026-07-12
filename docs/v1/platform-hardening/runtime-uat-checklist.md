# Platform Runtime and Database Hardening - Runtime Preview Checklist

Use this checklist against the exact-head Vercel preview before merge.

## Runtime

- [ ] Vercel preview build for the PR head reaches `READY`.
- [ ] Vercel preview metadata SHA matches the PR head exactly.
- [ ] Build/runtime evidence confirms Node.js 20 is retained.
- [ ] The known Vercel Node 20 deprecation warning is documented, not treated as fixed.
- [ ] No `Found lockfile missing swc dependencies` warning appears in the build log.
- [ ] Build completes without errors.

## Operational endpoints

- [ ] `GET /score/start` returns HTTP 200.
- [ ] `GET /score/api/health` returns HTTP 200.
- [ ] Health response matches the current phase:

```json
{
  "ok": true,
  "service": "mk-fraud-readiness-score-v1",
  "phase": "phase-13-customer-commercial-conversion"
}
```

- [ ] `GET /score/api/system/build-info` returns HTTP 200.
- [ ] Preview build-info response reports `releaseChannel: "preview"`.
- [ ] Neither endpoint exposes Supabase keys, JWT secrets, token peppers, URLs, token values or environment inventories.

## Application smoke

- [ ] Header/footer and first-viewport brand treatment still render.
- [ ] No error or fatal-level runtime log entries appear during the smoke pass.
- [ ] Existing customer R5/R50/report-generation gates remain unchanged.

## Report generation boundary

- [ ] Phase 10 premium report test passes in CI under Node 20.
- [ ] `@sparticuz/chromium` still resolves.
- [ ] `puppeteer-core` still resolves.
- [ ] Chromium launch configuration and output tracing remain unchanged.
- [ ] Customer flows do not generate reports automatically.

## Database

- [ ] Migration `0016_platform_database_hardening.sql` is reviewed.
- [ ] Migration 0016 remains unapplied during PR review.
- [ ] Advisor inventory is current and separates implemented, parked and dashboard-configuration items.

## Sign-off

- [ ] All GitHub Actions checks pass on the exact PR head commit.
- [ ] PR remains draft.
- [ ] PR has not been merged.
