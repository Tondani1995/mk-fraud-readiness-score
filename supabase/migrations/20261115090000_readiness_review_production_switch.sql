-- Production mode for the revised review (release step, 15 November 2026). The commercial bridge binds a completed
-- review session only when this database's own switch says so. Until now the only accepted value was
-- 'restricted_test'; a production database is switched on with 'production'. This migration never inserts the flag:
-- it is set by hand on the one database that should accept binding, as part of an approved release:
--   insert into readiness_review.environment_flags (flag_key, flag_value, set_by)
--   values ('commercial_bridge', 'production', '<owner, date>');
-- The application adds its own production-mode checks (commercial-environment.ts, reviewProductionStatus).
create or replace function public.review_commercial_bridge_enabled()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from readiness_review.environment_flags
    where flag_key = 'commercial_bridge' and flag_value in ('restricted_test', 'production')
  );
$$;

revoke all on function public.review_commercial_bridge_enabled() from public, anon, authenticated;
grant execute on function public.review_commercial_bridge_enabled() to service_role;
