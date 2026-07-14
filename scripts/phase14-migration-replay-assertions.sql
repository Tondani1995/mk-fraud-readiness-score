\set ON_ERROR_STOP on

-- MK Fraud Readiness Score V1 - clean migration replay assertions.
-- Runs against a freshly reset local Supabase database in CI.

create temp table expected_tables(name text primary key);
insert into expected_tables(name) values
  ('admin_profiles'),
  ('app_settings'),
  ('assessment_answers'),
  ('assessment_events'),
  ('assessment_tokens'),
  ('assessments'),
  ('audit_logs'),
  ('data_requests'),
  ('domains'),
  ('eft_settings'),
  ('email_events'),
  ('email_provider_events'),
  ('email_templates'),
  ('exposure_answers'),
  ('exposure_factors'),
  ('maturity_cap_events'),
  ('methodology_versions'),
  ('order_events'),
  ('orders'),
  ('organisations'),
  ('payment_proofs'),
  ('products'),
  ('question_applicability_rules'),
  ('questions'),
  ('rate_limit_hits'),
  ('recommendation_rules'),
  ('report_content_blocks'),
  ('report_events'),
  ('report_fulfilments'),
  ('report_generation_runs'),
  ('report_generation_claims'),
  ('report_ai_attempts'),
  ('report_templates'),
  ('reports'),
  ('respondents'),
  ('response_scale'),
  ('score_domain_results'),
  ('score_question_traces'),
  ('score_runs');

do $$
declare missing text;
begin
  select string_agg(e.name, ', ' order by e.name)
    into missing
  from expected_tables e
  left join information_schema.tables t
    on t.table_schema = 'public'
   and t.table_name = e.name
   and t.table_type = 'BASE TABLE'
  where t.table_name is null;

  if missing is not null then
    raise exception 'Missing expected public tables: %', missing;
  end if;
end $$;

create temp table expected_enums(name text primary key);
insert into expected_enums(name) values
  ('admin_role'),
  ('assessment_status'),
  ('assessment_token_type'),
  ('audit_actor_type'),
  ('content_status'),
  ('exposure_band'),
  ('maturity_band'),
  ('methodology_status'),
  ('order_status'),
  ('payment_proof_status'),
  ('report_status'),
  ('report_template_status'),
  ('report_type'),
  ('score_run_status'),
  ('score_run_type'),
  ('user_status');

do $$
declare missing text;
begin
  select string_agg(e.name, ', ' order by e.name)
    into missing
  from expected_enums e
  left join pg_type ty on ty.typname = e.name
  left join pg_namespace n on n.oid = ty.typnamespace and n.nspname = 'public'
  where n.oid is null;

  if missing is not null then
    raise exception 'Missing expected public enum types: %', missing;
  end if;
end $$;

create temp table expected_functions(name text primary key);
insert into expected_functions(name) values
  ('assessment_exposure_value'),
  ('check_rate_limit'),
  ('complete_score_run_atomic'),
  ('current_admin_role'),
  ('guard_assessment_answer_write'),
  ('guard_assessment_current_score_run'),
  ('guard_exposure_answer_write'),
  ('guard_score_run_write'),
  ('guard_score_trace_identity'),
  ('guard_score_trace_write'),
  ('is_admin_role'),
  ('is_question_na_applicable'),
  ('prevent_methodology_mutation_after_use'),
  ('assert_premium_report_generation_entitlement'),
  ('claim_premium_report_generation'),
  ('commit_premium_report_draft'),
  ('publish_premium_report_generation'),
  ('release_premium_report_generation_claim'),
  ('assert_premium_report_delivery_entitlement'),
  ('recover_stale_premium_report_email_sends'),
  ('apply_email_provider_event_atomic'),
  ('set_updated_at');

do $$
declare missing text;
begin
  select string_agg(e.name, ', ' order by e.name)
    into missing
  from expected_functions e
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = e.name
  );

  if missing is not null then
    raise exception 'Missing expected public functions: %', missing;
  end if;
end $$;

-- Confirm the clean local migration ledger includes the full numeric chain.
create temp table expected_migration_versions(version text primary key);
insert into expected_migration_versions(version) values
  ('0001'),('0002'),('0003'),('0004'),('0005'),('0006'),('0007'),('0009'),
  ('0010'),('0011'),('0012'),('0013'),('0014'),('0015'),('0016'),('0017'),('0018'),('0019'),('0020'),('0021'),('0022');

do $$
declare missing text;
begin
  select string_agg(e.version, ', ' order by e.version)
    into missing
  from expected_migration_versions e
  left join supabase_migrations.schema_migrations m on m.version = e.version
  where m.version is null;

  if missing is not null then
    raise exception 'Missing expected local migration versions: %', missing;
  end if;
end $$;

-- RLS must be enabled on the application public tables.
do $$
declare missing text;
begin
  select string_agg(e.name, ', ' order by e.name)
    into missing
  from expected_tables e
  join pg_class c on c.relname = e.name
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'r'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS is not enabled on expected public tables: %', missing;
  end if;
end $$;

create temp table expected_policies(table_name text, policy_name text, primary key(table_name, policy_name));
insert into expected_policies(table_name, policy_name) values
  ('admin_profiles', 'admin_profiles_select'),
  ('orders', 'orders_admin_select'),
  ('orders', 'orders_finance_update'),
  ('assessment_events', 'assessment_events_admin_select'),
  ('assessment_events', 'assessment_events_admin_insert'),
  ('reports', 'reports_admin_select'),
  ('reports', 'reports_admin_manage'),
  ('report_fulfilments', 'report_fulfilments_admin_select'),
  ('report_generation_runs', 'report_generation_runs_admin_select'),
  ('report_ai_attempts', 'report_ai_attempts_admin_select'),
  ('email_provider_events', 'email_provider_events_admin_select');

do $$
declare missing text;
begin
  select string_agg(e.table_name || '.' || e.policy_name, ', ' order by e.table_name, e.policy_name)
    into missing
  from expected_policies e
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = e.table_name
   and p.policyname = e.policy_name
  where p.policyname is null;

  if missing is not null then
    raise exception 'Missing expected RLS policies: %', missing;
  end if;
end $$;

-- Grant posture for Phase 14 operational tables: anon has no direct table access,
-- authenticated may select only through admin-gated RLS policies.
do $$
begin
  if has_table_privilege('anon', 'public.report_fulfilments', 'select') then
    raise exception 'anon unexpectedly has SELECT on report_fulfilments';
  end if;
  if has_table_privilege('anon', 'public.report_generation_runs', 'select') then
    raise exception 'anon unexpectedly has SELECT on report_generation_runs';
  end if;
  if has_table_privilege('anon', 'public.email_provider_events', 'select') then
    raise exception 'anon unexpectedly has SELECT on email_provider_events';
  end if;
  if not has_table_privilege('authenticated', 'public.report_fulfilments', 'select') then
    raise exception 'authenticated should have SELECT grant on report_fulfilments for admin RLS';
  end if;
  if not has_table_privilege('authenticated', 'public.report_generation_runs', 'select') then
    raise exception 'authenticated should have SELECT grant on report_generation_runs for admin RLS';
  end if;
  if has_table_privilege('anon', 'public.report_ai_attempts', 'select') then
    raise exception 'anon unexpectedly has SELECT on report_ai_attempts';
  end if;
  if not has_table_privilege('authenticated', 'public.report_ai_attempts', 'select') then
    raise exception 'authenticated should have SELECT grant on report_ai_attempts for admin RLS';
  end if;
  if has_table_privilege('authenticated', 'public.report_generation_claims', 'select') then
    raise exception 'authenticated unexpectedly has SELECT on report_generation_claims';
  end if;
end $$;

-- Methodology state and seed coverage.
do $$
declare active_count integer;
declare v11_status text;
declare v10_status text;
declare question_count integer;
declare domain_count integer;
declare exposure_count integer;
begin
  select count(*) into active_count from public.methodology_versions where status = 'active';
  select status::text into v11_status from public.methodology_versions where version_code = 'MFRS-V1.1';
  select status::text into v10_status from public.methodology_versions where version_code = 'MFRS-V1.0';
  select count(*) into question_count
  from public.questions q
  join public.methodology_versions mv on mv.id = q.methodology_version_id
  where mv.version_code = 'MFRS-V1.1' and q.active;
  select count(*) into domain_count
  from public.domains d
  join public.methodology_versions mv on mv.id = d.methodology_version_id
  where mv.version_code = 'MFRS-V1.1';
  select count(*) into exposure_count
  from public.exposure_factors ef
  join public.methodology_versions mv on mv.id = ef.methodology_version_id
  where mv.version_code = 'MFRS-V1.1';

  if active_count <> 1 or v11_status <> 'active' or v10_status <> 'retired' then
    raise exception 'Unexpected methodology status: active_count %, V1.1 %, V1.0 %', active_count, v11_status, v10_status;
  end if;
  if question_count <> 68 then
    raise exception 'Expected 68 active MFRS-V1.1 questions, found %', question_count;
  end if;
  if domain_count <> 10 then
    raise exception 'Expected 10 MFRS-V1.1 domains, found %', domain_count;
  end if;
  if exposure_count <> 8 then
    raise exception 'Expected 8 MFRS-V1.1 exposure factors, found %', exposure_count;
  end if;
end $$;

-- Product/pricing and disabled automation flags.
do $$
declare essential_price integer;
declare advisory_price integer;
declare flags jsonb;
declare delivery_policy jsonb;
begin
  select price_cents into essential_price
  from public.products
  where product_code = 'essential_self_assessment'
    and currency = 'ZAR'
    and requires_payment_verification = true
    and delivery_mode = 'mk_controlled_pdf';

  select price_cents into advisory_price
  from public.products
  where product_code = 'mk_validated_assessment'
    and currency = 'ZAR'
    and requires_payment_verification = true
    and delivery_mode = 'mk_led_validated_engagement';

  select value_json into flags
  from public.app_settings
  where setting_key = 'phase14_autonomous_report_engine';
  select value_json into delivery_policy
  from public.app_settings
  where setting_key = 'phase14_delivery_policy';

  if essential_price <> 500000 then
    raise exception 'Unexpected essential report price_cents: %', essential_price;
  end if;
  if advisory_price <> 5000000 then
    raise exception 'Unexpected MK validated advisory price_cents: %', advisory_price;
  end if;
  if coalesce((flags->>'premium_report_auto_fulfilment_enabled')::boolean, true) <> false then
    raise exception 'premium_report_auto_fulfilment_enabled must be false';
  end if;
  if coalesce((flags->>'premium_report_ai_narrative_enabled')::boolean, true) <> false then
    raise exception 'premium_report_ai_narrative_enabled must be false';
  end if;
  if coalesce((flags->>'premium_report_auto_email_enabled')::boolean, true) <> false then
    raise exception 'premium_report_auto_email_enabled must be false';
  end if;
  if coalesce((flags->>'r50000_automation_enabled')::boolean, true) <> false then
    raise exception 'r50000_automation_enabled must be false';
  end if;
  if coalesce((delivery_policy->>'premium_report_manual_delivery_enabled')::boolean, true) <> false then
    raise exception 'premium_report_manual_delivery_enabled must be false';
  end if;
  if coalesce((delivery_policy->>'premium_report_test_recipient_override_enabled')::boolean, true) <> false then
    raise exception 'premium_report_test_recipient_override_enabled must be false';
  end if;
end $$;

-- Storage bucket verification.
do $$
declare generated_reports_public boolean;
begin
  select public into generated_reports_public
  from storage.buckets
  where id = 'generated-reports' and name = 'generated-reports';

  if generated_reports_public is distinct from false then
    raise exception 'generated-reports storage bucket must exist and be private';
  end if;
end $$;

select 'migration_replay_assertions_passed' as result;

select version, name, cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
order by version;

select setting_key, value_json
from public.app_settings
where setting_key = 'phase14_autonomous_report_engine';

select product_code, price_cents, currency, requires_payment_verification, delivery_mode
from public.products
where product_code in ('free_snapshot', 'essential_self_assessment', 'mk_validated_assessment')
order by display_order;

select version_code, status
from public.methodology_versions
order by version_code;

select id, name, public
from storage.buckets
where id in ('generated-reports')
order by id;
