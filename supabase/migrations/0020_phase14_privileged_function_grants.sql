-- Phase 14 database-security hardening.
-- Restrict direct execution of privileged SECURITY DEFINER functions to the
-- server-side service role. The DO block keeps this migration as one prepared
-- statement for Supabase CLI 2.81.3 clean replay while still using explicit
-- REVOKE, GRANT and COMMENT commands.

DO $phase14_privileged_function_grants$
BEGIN
  EXECUTE 'revoke execute on function public.check_rate_limit(text, integer, integer) from public';
  EXECUTE 'revoke execute on function public.check_rate_limit(text, integer, integer) from anon';
  EXECUTE 'revoke execute on function public.check_rate_limit(text, integer, integer) from authenticated';
  EXECUTE 'grant execute on function public.check_rate_limit(text, integer, integer) to service_role';

  EXECUTE 'revoke execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) from public';
  EXECUTE 'revoke execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) from anon';
  EXECUTE 'revoke execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) from authenticated';
  EXECUTE 'grant execute on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) to service_role';

  EXECUTE 'revoke execute on function public.current_admin_role() from public';
  EXECUTE 'revoke execute on function public.current_admin_role() from anon';
  EXECUTE 'revoke execute on function public.current_admin_role() from authenticated';
  EXECUTE 'grant execute on function public.current_admin_role() to service_role';

  EXECUTE 'revoke execute on function public.is_admin_role(public.admin_role[]) from public';
  EXECUTE 'revoke execute on function public.is_admin_role(public.admin_role[]) from anon';
  EXECUTE 'revoke execute on function public.is_admin_role(public.admin_role[]) from authenticated';
  EXECUTE 'grant execute on function public.is_admin_role(public.admin_role[]) to service_role';

  EXECUTE 'comment on function public.check_rate_limit(text, integer, integer) is ''Atomic fixed-window rate limiter. Direct execution is restricted to the service role; application calls must go through trusted server-side code.''';
  EXECUTE 'comment on function public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb) is ''Atomic score-run persistence RPC. Direct execution is restricted to the service role; assessment scoring must go through trusted server-side code.''';
  EXECUTE 'comment on function public.current_admin_role() is ''Admin-role helper for trusted server-side and RLS evaluation. Direct client execution is revoked from public, anon and authenticated roles.''';
  EXECUTE 'comment on function public.is_admin_role(public.admin_role[]) is ''Admin-role predicate for trusted server-side and RLS evaluation. Direct client execution is revoked from public, anon and authenticated roles.''';
END
$phase14_privileged_function_grants$;
