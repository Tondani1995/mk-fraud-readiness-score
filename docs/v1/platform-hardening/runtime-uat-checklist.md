# Platform Runtime and Database Hardening — Runtime UAT Checklist

Use this checklist against the exact-head Vercel preview before merge.

## Runtime

- [ ] Vercel preview build for the PR head reaches `READY`
- [ ] Vercel build log shows Node.js 24 in use
- [ ] No Node.js 20 deprecation warning appears in the build log
- [ ] No "Found lockfile missing swc dependencies" warning appears in the build log
- [ ] Build completes without errors

## Operational endpoints

- [ ] `GET /score/api/health` returns HTTP 200 with a `phase` value other than `phase-6-consolidated-scoring`
- [ ] `GET /score/api/system/build-info` returns HTTP 200 with `releaseChannel: "preview"` on the preview deployment
- [ ] Neither endpoint's response body contains any Supabase key, JWT secret, token pepper, or connection string

## Application smoke

- [ ] `GET /score/start` returns HTTP 200
- [ ] No error or fatal-level runtime log entries appear during the smoke pass
- [ ] Header/footer and first-viewport brand treatment (from the merged Phase 12 polish) still render correctly — confirms this PR did not regress it

## Report generation (Chromium/Puppeteer)

- [ ] Phase 10 premium report test passes in CI under Node 24
- [ ] If feasible, generate one report against the preview/production-equivalent flow and confirm the PDF renders without error

## Database (informational only — migration is NOT applied as part of this checklist)

- [ ] Migration 0016 file reviewed for correctness (search_path fix, RLS initplan wrap, 2 indexes)
- [ ] Confirmed migration 0016 has not been run against any environment as part of this PR

## Sign-off

- [ ] All GitHub Actions checks green on the exact PR head commit
- [ ] PR remains in draft state
- [ ] PR has not been merged
