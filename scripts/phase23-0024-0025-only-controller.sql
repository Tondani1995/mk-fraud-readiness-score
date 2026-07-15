\set ON_ERROR_STOP on
lock table supabase_migrations.schema_migrations in exclusive mode;

do $phase23_preflight$
begin
  if exists(select 1 from supabase_migrations.schema_migrations where version between '0017' and '0022' or lower(name) ~ 'phase[ _-]?14') then raise exception 'phase23_refused_prohibited_history'; end if;
  if not exists(select 1 from supabase_migrations.schema_migrations where version='0023' and name='phase1_manual_fulfilment_recovery') then raise exception 'phase23_refused_0023_boundary_not_confirmed'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version in ('0024','0025') or name in ('phase23_payment_automation','phase23_assessment_resume')) then raise exception 'phase23_refused_already_recorded'; end if;
  if to_regclass('public.orders') is null or to_regclass('public.assessments') is null or to_regclass('public.manual_report_generation_attempts') is null
     or to_regprocedure('public.phase1_manual_fulfilment_capability()') is null then raise exception 'phase23_refused_base_precondition_missing'; end if;
  if to_regclass('public.phase14_security_gates') is not null or to_regclass('public.phase14_feature_policies') is not null
     or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'phase14%')
     or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'phase14%') then raise exception 'phase23_refused_phase14_state'; end if;
  if to_regclass('public.payment_automation_records') is not null or to_regclass('public.payment_transition_events') is not null
     or to_regclass('public.payment_sessions') is not null or to_regclass('public.assessment_resume_events') is not null
     or to_regprocedure('public.payment_automation_capability()') is not null or to_regprocedure('public.assessment_resume_capability()') is not null
     or exists(select 1 from information_schema.columns where table_schema='public' and table_name='assessments'
       and column_name in ('active_domain_key','active_question_id','completion_percentage','last_answer_saved_at'))
     or exists(select 1 from public.app_settings where setting_key in ('v2_phase23_payment_automation','v2_phase23_assessment_resume'))
  then raise exception 'phase23_refused_unexpected_or_partial_state'; end if;
end;
$phase23_preflight$;

\if :phase23_readiness_only
  \echo 'Phase 2-3 0024/0025 preconditions passed; no changes made.'
  \quit
\endif

\ir ../supabase/migrations/0024_phase23_payment_automation.sql
\if :phase23_controlled_failure
  do $$ begin raise exception 'phase23_controlled_failure_between_migrations'; end $$;
\endif
\ir ../supabase/migrations/0025_phase23_assessment_resume.sql

do $phase23_verify$
declare v_payment jsonb; v_resume jsonb;
begin
  v_payment:=public.payment_automation_capability(); v_resume:=public.assessment_resume_capability();
  if coalesce((v_payment->>'available')::boolean,false) is not true or v_payment->>'schema_version'<>'0024' then raise exception 'phase23_payment_postcondition_failed'; end if;
  if coalesce((v_resume->>'available')::boolean,false) is not true or v_resume->>'schema_version'<>'0025' then raise exception 'phase23_resume_postcondition_failed'; end if;
  if to_regclass('public.phase14_security_gates') is not null then raise exception 'phase23_phase14_postcondition_failed'; end if;
end;
$phase23_verify$;

insert into supabase_migrations.schema_migrations(version,name,statements) values
  ('0024','phase23_payment_automation',array['exact reviewed migration sha256=' || :'phase23_payment_sha256']),
  ('0025','phase23_assessment_resume',array['exact reviewed migration sha256=' || :'phase23_resume_sha256']);
select version,name,statements from supabase_migrations.schema_migrations where version in ('0024','0025') order by version;
