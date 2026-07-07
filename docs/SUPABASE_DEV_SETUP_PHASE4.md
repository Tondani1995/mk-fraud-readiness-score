# Supabase Dev Setup - Phase 4 v1.1

Phase 4 requires a Supabase development project. Do not run these steps against production.

## 1. Create or open Supabase dev project

Create a dev project for `mk-fraud-readiness-score-v1`.

## 2. Run migrations

Open the Supabase SQL editor and run:

1. `supabase/migrations/0001_phase2_v1_1_schema_rls.sql`
2. `supabase/migrations/0002_phase4_dev_seed.sql`

The first file creates the approved Phase 2 schema and RLS baseline. The second creates a minimal active methodology shell required for Phase 4 start-assessment testing.

## 3. Create MK admin user

In Supabase Auth, create the first MK admin user with email/password.

Then copy the user's `auth.users.id` and run `supabase/admin-bootstrap-template.sql` after replacing the placeholders.

## 4. Configure local environment

Create `.env.local` from `.env.example` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ASSESSMENT_TOKEN_PEPPER`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- `MK_BUILD_PHASE=phase-6-consolidated-scoring`

Never paste the service role key into chat and never commit `.env.local`.

## 5. Phase 4 test sequence

1. Run `npm install`.
2. Run `npm run phase4:smoke` and confirm the v1.1 smoke check passes, including duplicate SQL column and admin-before-query checks.
3. Run `npm run dev`.
4. Visit `/admin` and confirm it redirects to `/admin/login`.
5. Sign in with the MK admin user and confirm `/admin` loads.
6. Visit `/start`, submit respondent and organisation details.
7. Confirm an assessment reference and resume link are generated.
8. Open the resume link and confirm it shows the correct organisation and respondent.
9. Try opening `/assessment/<ref>` without a token and confirm access is blocked.
10. In a clean browser session, open `/admin`, `/admin/assessments` and `/admin/methodology`; confirm each redirects to `/admin/login` before any admin data is shown.

Phase 4 does not send emails, store assessment answers, calculate scores, generate snapshots, process payments or generate reports.
