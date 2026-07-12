# Database Migration Note - 0016 Platform Database Hardening

Migration file:

- `supabase/migrations/0016_platform_database_hardening.sql`

Status:

- Prepared in PR #19.
- Not applied to production.
- Not applied to a Supabase branch by this task.

## Purpose

The migration addresses only narrow, evidenced Supabase advisor findings.

## Included Changes

1. Recreates `public.set_updated_at()` with the same trigger signature and body, adding `set search_path = public`.
2. Alters `admin_profiles_select` so `auth.uid()` is evaluated as `(select auth.uid())` while preserving the same row boundary.
3. Adds two `CREATE INDEX IF NOT EXISTS` indexes:
   - `reports_order_id_idx` on `public.reports(order_id)`.
   - `assessment_answers_question_id_idx` on `public.assessment_answers(question_id)`.

## Safety Boundary

The migration does not:

- drop tables;
- drop columns;
- delete or rewrite data;
- grant broad public access;
- add permissive RLS policies;
- change admin helper function ownership/security mode/grants;
- relocate `citext`;
- change Supabase Auth settings;
- mutate methodology, questions, responses, scoring, exposure, maturity, orders, report content, generated reports, score runs or existing assessment outcomes.

## Review Requirements Before Application

Before applying migration 0016, the controller should confirm:

- the PR head and migration file match the reviewed version;
- the migration remains additive/idempotent where practical;
- admin profile access still blocks logged-out users;
- authorized admin access still works;
- report generation still gates on manual payment confirmation;
- post-migration Supabase advisors are rerun and recorded.
