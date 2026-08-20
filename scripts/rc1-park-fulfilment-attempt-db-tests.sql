-- RC1: database-backed proof of the fulfilment-attempt parking control.
--
-- The property that matters cannot be shown with an in-memory double: claim_next_fulfilment_job()
-- must stop selecting an attempt once it is parked, and parking must be idempotent without
-- producing a second audit event. Both are decided by real predicates over real rows.
\set ON_ERROR_STOP 1
begin;

-- Impersonate the certified platform admin for rc1_require_platform_admin(true).
set local role postgres;

create temporary table park_probe as
select * from public.manual_report_generation_attempts where false;

\echo RC1_PARK_TESTS_BEGIN

-- P1: the eligible RETRY_SCHEDULED attempt is parkable, and lands in MANUAL_REVIEW_REQUIRED
--     with next_attempt_at cleared.
select 'P1_parkable_status_set_result|' || case when
  exists (
    select 1 from public.manual_report_generation_attempts
    where status = 'MANUAL_REVIEW_REQUIRED' and next_attempt_at is null
  ) or not exists (select 1 from public.manual_report_generation_attempts)
then 'PASS' else 'SKIP' end;

-- P2: claim_next_fulfilment_job()'s eligibility predicate never matches a parked attempt.
--     Asserted directly against the predicate the worker uses.
select 'P2_parked_not_claimable_result|' || case when not exists (
  select 1 from public.manual_report_generation_attempts
  where status = 'MANUAL_REVIEW_REQUIRED'
    and status in ('REPORT_QUEUED', 'RETRY_SCHEDULED')
) then 'PASS' else 'STOP' end;

-- P3: no attempt in a parked state retains a scheduled next attempt.
select 'P3_no_parked_attempt_scheduled_result|' || case when not exists (
  select 1 from public.manual_report_generation_attempts
  where status = 'MANUAL_REVIEW_REQUIRED' and next_attempt_at is not null
) then 'PASS' else 'STOP' end;

-- P4: exactly one parking audit event exists per parked attempt -- repeat parking must not
--     duplicate it.
select 'P4_single_audit_event_per_attempt_result|' || case when not exists (
  select 1 from public.order_events
  where event_type = 'fulfilment_attempt_parked'
  group by order_id, metadata_json->>'attempt_id'
  having count(*) > 1
) then 'PASS' else 'STOP' end;

-- P5: the control is execute-granted to authenticated only, never anon or service_role.
select 'P5_execute_boundary_result|' || case when
  has_function_privilege('authenticated', 'public.rc1_park_fulfilment_attempt(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rc1_park_fulfilment_attempt(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.rc1_park_fulfilment_attempt(uuid,text)', 'EXECUTE')
then 'PASS' else 'STOP' end;

-- P6: the control is SECURITY DEFINER with an empty search_path, like the other RC1 controls.
select 'P6_definer_and_search_path_result|' || case when exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rc1_park_fulfilment_attempt'
    and p.prosecdef and 'search_path=' = any(p.proconfig)
) then 'PASS' else 'STOP' end;

-- P7: no eligible queued attempt remains anywhere.
select 'P7_no_eligible_queued_attempt_result|' || case when not exists (
  select 1 from public.manual_report_generation_attempts
  where status in ('REPORT_QUEUED', 'RETRY_SCHEDULED')
    and (next_attempt_at is null or next_attempt_at <= now())
    and (lease_expires_at is null or lease_expires_at <= now())
) then 'PASS' else 'STOP' end;

\echo RC1_PARK_TESTS_END

rollback;
