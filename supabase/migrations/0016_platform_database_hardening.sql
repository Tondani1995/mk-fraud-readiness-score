-- 0016_platform_database_hardening.sql
--
-- Platform Runtime and Database Hardening (PR #19).
--
-- Scope is deliberately narrow. This migration makes ONLY the changes that
-- passed the PR #19 audit with concrete evidence of safety and equivalence:
--
--   1. Give set_updated_at() an explicit, controlled search_path. It is the
--      one application-owned function that had none (every other trigger/
--      helper in this schema already sets search_path=public). The function
--      body only assigns NEW.updated_at = now() and returns NEW; there are
--      no schema-qualified table/function references to requalify, and
--      now() resolves via pg_catalog regardless of search_path, so this is
--      a pure hardening change with no behavioural difference.
--
--   2. Wrap the auth.uid() call in admin_profiles_select's USING clause in
--      a scalar subquery, per Supabase's documented auth_rls_initplan
--      guidance. auth.uid() is STABLE, so (select auth.uid()) returns the
--      exact same value for every row in a single statement execution -
--      this changes only *when* Postgres evaluates it (once via InitPlan
--      instead of once per row), not which rows match. is_admin_role(...)
--      is intentionally left untouched: the advisor flag is specific to
--      current_setting()/auth.<function>() calls, not this function.
--
--   3. Two additive, IF NOT EXISTS indexes on foreign keys that the PR #19
--      audit confirmed are actually queried/joined on in application code
--      (reports.order_id is filtered directly in the admin report-
--      generation route; assessment_answers.question_id is joined via
--      PostgREST's embedded-resource syntax in assemble-report-data.ts).
--      The remaining ~28 unindexed-foreign-key advisor findings are NOT
--      addressed here - they were not individually source-verified with
--      sufficient confidence in this pass and are documented as parked in
--      docs/v1/platform-hardening/supabase-advisor-inventory.md.
--
-- Explicitly NOT included, and why:
--   - No RLS policy consolidation for the "multiple permissive policies"
--     findings. Every instance follows the same intentional pattern (a
--     broad "*_admin_select" read policy for several admin roles, plus a
--     "*_platform_admin_manage" policy with polcmd='*' for platform_admin
--     full CRUD). Consolidating ~15 tables' worth of these without a
--     dedicated regression pass is out of scope for this narrow PR.
--   - No change to current_admin_role() or is_admin_role(...). Both are
--     SECURITY DEFINER and callable by `authenticated`, which the advisor
--     flags - but in this application only real Supabase Auth sessions
--     (i.e. admin users; respondents are accountless per the V1 product
--     constraints) ever hold the `authenticated` role, and these two
--     functions are the callers behind essentially every admin-facing RLS
--     policy in the schema. Changing their ownership, security mode, or
--     grants without a full caller/route regression pass is too risky for
--     this PR. Audited and parked.
--   - No move of the citext extension out of public. Audited and parked.
--   - No change to Supabase Auth leaked-password-protection settings -
--     that is dashboard configuration, not a migration.
--
-- This migration is transactional, additive-only, and does not touch RLS
-- enablement, scoring, weighting, maturity bands/caps, exposure
-- calculation, critical-control rules, or any customer-facing behaviour.

begin;

-- 1. set_updated_at(): add explicit, controlled search_path.
--    Behaviour is unchanged - same trigger body, same return value.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- 2. admin_profiles_select: wrap auth.uid() in a scalar subquery so the
--    planner evaluates it once per statement instead of once per row.
--    Semantically identical to the previous USING clause.
alter policy admin_profiles_select
  on public.admin_profiles
  using ((id = (select auth.uid())) or is_admin_role(array['platform_admin'::admin_role]));

-- 3. Evidence-backed foreign-key indexes only.
create index if not exists reports_order_id_idx
  on public.reports (order_id);

create index if not exists assessment_answers_question_id_idx
  on public.assessment_answers (question_id);

commit;
