\set ON_ERROR_STOP on

-- Local CI-only fixture for the payment DB contract. This is intentionally not a customer
-- journey: it creates only the minimum scored assessment needed by the existing RPC test and
-- is removed by phase23-payment-db-integration.mjs before the disposable database is stopped.
begin;

insert into public.organisations (id, legal_name, country)
values ('29000000-0000-0000-0000-000000000010', 'G29 Disposable Payment Fixture', 'South Africa')
on conflict (id) do nothing;

do $fixture$
declare
  v_methodology uuid;
  v_score uuid := '29000000-0000-0000-0000-000000000002';
begin
  select id into strict v_methodology
  from public.methodology_versions
  where status = 'active'
  order by created_at
  limit 1;

  insert into public.assessments (
    id, assessment_reference, organisation_id, methodology_version_id, status,
    submitted_at, locked_at
  ) values (
    '29000000-0000-0000-0000-000000000001', 'G29-DISPOSABLE-PAYMENT-FIXTURE',
    '29000000-0000-0000-0000-000000000010', v_methodology, 'scored', now(), now()
  ) on conflict (id) do nothing;

  insert into public.score_runs (
    id, assessment_id, methodology_version_id, run_number, run_type, status,
    overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band,
    coverage_pct, input_hash, locked_at
  ) values (
    v_score, '29000000-0000-0000-0000-000000000001', v_methodology, 1, 'test_fixture',
    'completed', 60, 'Developing', 'Developing', 40, 'High', 100, repeat('9', 64), now()
  ) on conflict (id) do nothing;

  update public.assessments
  set current_score_run_id = v_score
  where id = '29000000-0000-0000-0000-000000000001';
end
$fixture$;

commit;
