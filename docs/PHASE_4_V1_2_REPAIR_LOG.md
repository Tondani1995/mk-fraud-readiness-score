# Phase 4 v1.2 Repair Log

## Repair objective

Close every remaining gap and deferred item from the v1.1 package and its v1.2 merge review,
per explicit instruction not to carry technical debt into Phase 5. Where a v1.1 repair claim
was checked and held up, it's noted as confirmed rather than redone.

## Repairs completed

| Item | Repair completed |
|---|---|
| Empty methodology shell (reintroduced from pre-fix Phase 2/3 branch) | Replaced with the full, previously-verified Phase 1 seed (10 domains, 68 questions, response scale, exposure model, recommendation rules), merged with the v1.1 package's own Phase-4-specific settings, made idempotent. |
| `.env.example` bucket name and token TTLs (reintroduced) | Reapplied the same fixes as the Phase 2/3 v1.2 pass: `SUPABASE_BUCKET_REPORTS=generated-reports`; explicit resume/snapshot/report-request TTL variables matching the approved 14-day/7-day policy. |
| `npm run phase3:smoke` regression | Fixed the exclusion logic so Phase-N guardrail scripts don't flag their own denylists as violations. |
| `.env.example` placeholder tripping its own secret-leak check | Shortened `ASSESSMENT_TOKEN_PEPPER` placeholder so it no longer coincidentally matches the 32+ character heuristic. |
| Resume-token page view consuming a limited resource | `/assessment/[assessmentRef]` now calls `validateResumeToken(..., { consume: false })` - viewing a draft is read-only. |
| Raw error text returned from a public endpoint | `/api/assessments/start` now logs full detail server-side only and returns a generic message to the client (except the one deliberate, safe dev-setup message). |
| No rate limiting anywhere (Blueprint section 6/7 requirement) | Implemented a Postgres-backed atomic rate limiter (`supabase/migrations/0004_phase4_v1_2_rate_limiting.sql`, `src/lib/security/rate-limit.ts`) and wired it into admin login (per-IP + per-email), assessment start (per-IP + per-email), and both resume-token validation paths - the API route and the page itself, since the page is the one respondents actually use (per-IP + per-reference on each). |
| `exposure_factors.input_type` placeholder | Real decision: `banded_scale_0_4` for all 8 factors, consistent with the existing 0-5 readiness scale pattern. Documented as amendable in the seed's own comments. |
| `question_applicability_rules` "pending_definition" placeholders | Real decision: all 11 Conditional N/A questions now reference an evaluable `exposure_factor_threshold` condition against the specific exposure factor each question's topic maps to (e.g. third-party due-diligence questions gate on EXP-02). Documented as amendable. |
| `recommendation_rules.action_30/60/90` left null | Real decision: all 10 rules now have 30/60/90-day action text, organised directly from the sheet's own `action_logic` column rather than invented from scratch. Documented as amendable. |
| Smoke check didn't guard the new rate-limit files | Added `src/lib/security/rate-limit.ts` and `supabase/migrations/0004_phase4_v1_2_rate_limiting.sql` to the required-files list, and added a static check that all three rate-limited routes plus the resume page still call `checkRateLimits()`. |

## What was checked and already held up (not re-done)

- Admin-before-query ordering across every admin page - genuinely correct.
- `/admin` redirects to `/admin/login` without ever touching Supabase on an unauthenticated request.
- Resume-token hashing (HMAC-SHA256 with a server-only pepper), expiry, revocation, and max-use checks.
- Admin login flow (Supabase Auth password grant, active-role check, HttpOnly cookies).

## Verification evidence

```bash
npm install
npm run phase3:smoke   # passes
npm run phase4:smoke   # passes (v1.2 message, including rate-limit wiring check)
npm run typecheck      # passes
npm run lint            # no warnings or errors
npm run build            # succeeds, all routes render
```

SQL: `0001_phase2_v1_1_schema_rls.sql` → `0002_phase4_dev_seed.sql` → `0004_phase4_v1_2_rate_limiting.sql`
run in sequence against a fresh Postgres database (with a stubbed Supabase `auth` schema) with
no errors. `0002` was run twice in a row to confirm idempotency (no duplicate rows). The rate
limiter was exercised directly: `select public.check_rate_limit('test:demo', 3, 60)` returns
`true` for the first 3 calls and `false` for the 4th/5th within the same window, with
independent counters per key.

## Remaining approval dependency

Same as v1.1: this repair does not replace running the app locally against a real Supabase
development project and completing the Phase 4 v1.2 test plan, which now includes explicit
repeat-view and rate-limit test cases.
