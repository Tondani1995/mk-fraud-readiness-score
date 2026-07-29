-- RC1 canonical service-role privilege contract.
--
-- This migration is intentionally limited to explicit CRUD grants proven by active server-side
-- application call sites. Storage and Auth Admin operations are governed by their APIs, and RPC
-- EXECUTE privileges are verified but not changed here.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'rc1_service_role_contract_missing_role: service_role';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'rc1_service_role_contract_missing_role: anon';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'rc1_service_role_contract_missing_role: authenticated';
  end if;
end;
$$;

create temporary table rc1_service_role_contract_targets (
  schema_name text not null,
  table_name text not null,
  allow_select boolean not null,
  allow_insert boolean not null,
  allow_update boolean not null,
  allow_delete boolean not null,
  primary key (schema_name, table_name)
) on commit drop;

insert into rc1_service_role_contract_targets values
  ('public','admin_profiles',true,false,false,false),
  ('public','app_settings',true,false,false,false),
  ('public','assessment_answers',true,true,true,true),
  ('public','assessment_events',true,true,true,false),
  ('public','assessment_tokens',true,true,true,false),
  ('public','assessments',true,true,true,true),
  ('public','audit_logs',true,true,false,false),
  ('public','customer_report_access_tokens',true,false,true,false),
  ('public','data_requests',true,true,true,false),
  ('public','domains',true,false,false,false),
  ('public','eft_settings',true,false,false,false),
  ('public','email_events',true,true,true,false),
  ('public','exposure_answers',true,true,true,false),
  ('public','exposure_factors',true,false,false,false),
  ('public','manual_report_delivery_attempts',true,false,false,false),
  ('public','manual_report_generation_attempts',true,false,false,false),
  ('public','maturity_cap_events',true,false,false,false),
  ('public','methodology_versions',true,false,false,false),
  ('public','order_events',true,true,false,false),
  ('public','orders',true,true,true,false),
  ('public','organisations',true,true,false,true),
  ('public','payment_automation_records',true,false,true,false),
  ('public','payment_sessions',true,true,false,false),
  ('public','payment_transition_events',true,false,false,false),
  ('public','phase14_ai_route_policies',true,false,false,false),
  ('public','phase14_feature_policies',true,false,false,false),
  ('public','phase14_operational_alerts',true,false,false,false),
  ('public','phase14_security_gates',true,false,false,false),
  ('public','products',true,false,false,false),
  ('public','questions',true,false,false,false),
  ('public','recommendation_rules',true,false,false,false),
  ('public','report_ai_attempts',true,false,false,false),
  ('public','report_content_blocks',true,false,false,false),
  ('public','report_delivery_authorizations',true,false,false,false),
  ('public','report_events',false,true,false,false),
  ('public','report_fulfilments',true,false,false,false),
  ('public','report_generation_runs',true,false,false,false),
  ('public','report_templates',true,false,false,false),
  ('public','reports',true,false,true,false),
  ('public','respondents',true,true,false,true),
  ('public','response_scale',true,false,false,false),
  ('public','score_domain_results',true,false,false,false),
  ('public','score_question_traces',true,false,false,false),
  ('public','score_runs',true,false,false,false);

do $$
declare
  target record;
  relation_oid oid;
  relation_kind "char";
  relation_owner text;
begin
  if (select count(*) from rc1_service_role_contract_targets) <> 44 then
    raise exception 'rc1_service_role_contract_target_count_mismatch';
  end if;

  for target in select * from rc1_service_role_contract_targets loop
    select c.oid, c.relkind, owner_role.rolname
      into relation_oid, relation_kind, relation_owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles owner_role on owner_role.oid = c.relowner
    where n.nspname = target.schema_name
      and c.relname = target.table_name;

    if relation_oid is null then
      raise exception 'rc1_service_role_contract_missing_table: %.%',
        target.schema_name, target.table_name;
    end if;
    if relation_kind not in ('r', 'p') then
      raise exception 'rc1_service_role_contract_wrong_relation_kind: %.% (%)',
        target.schema_name, target.table_name, relation_kind;
    end if;
    if relation_owner <> 'postgres' then
      raise exception 'rc1_service_role_contract_wrong_table_owner: %.% (%)',
        target.schema_name, target.table_name, relation_owner;
    end if;
  end loop;
end;
$$;

create temporary table rc1_service_role_contract_before_table_acl on commit drop as
select
  c.oid as relation_oid,
  n.nspname as schema_name,
  c.relname as table_name,
  role_name,
  privilege_name,
  case
    when role_name = 'PUBLIC' then exists (
      select 1
      from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      where acl.grantee = 0
        and acl.privilege_type = privilege_name
    )
    else has_table_privilege(role_name, c.oid, privilege_name)
  end as allowed
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['PUBLIC','anon','authenticated','service_role']) role_name
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege_name
where n.nspname = 'public'
  and c.relkind in ('r','p');

create temporary table rc1_service_role_contract_rpc_targets (
  signature text primary key,
  security_definer boolean not null,
  expected_search_path text not null
) on commit drop;

insert into rc1_service_role_contract_rpc_targets values
  ('public.assessment_resume_capability()',false,'public, pg_temp'),
  ('public.authorize_manual_report_ai_action(uuid,text)',true,''),
  ('public.automatic_release_completed_fulfilment(uuid,uuid,text)',true,''),
  ('public.check_rate_limit(text,integer,integer)',true,'public'),
  ('public.claim_exact_delivery(uuid,uuid,text,integer)',true,''),
  ('public.claim_exact_fulfilment_job(uuid,text,integer)',true,''),
  ('public.claim_manual_report_ai_attempt(jsonb)',true,''),
  ('public.claim_manual_report_delivery(uuid,text,uuid,text,text,text)',true,'public, pg_temp'),
  ('public.claim_manual_report_generation(text,uuid,text,text,text)',true,'public, pg_temp'),
  ('public.claim_next_delivery(text,integer)',true,'public, pg_temp'),
  ('public.claim_next_fulfilment_job(text,integer)',true,'public, pg_temp'),
  ('public.claim_payment_report_generation(text,text,text)',true,'public, pg_temp'),
  ('public.complete_manual_report_delivery(uuid,text,text,text)',true,'public, pg_temp'),
  ('public.complete_manual_report_generation(uuid,uuid,report_type,text,text,text,text,bigint,text)',true,'public, pg_temp'),
  ('public.complete_score_run_atomic(uuid,uuid,score_run_type,text,uuid,jsonb,jsonb,jsonb,jsonb)',true,'public'),
  ('public.execute_phase14_worker_step(jsonb,text,text)',true,''),
  ('public.fail_delivery(uuid,uuid,text,text,text)',true,'public, pg_temp'),
  ('public.fail_fulfilment_job(uuid,text,text,text,text)',true,'public, pg_temp'),
  ('public.fail_manual_report_generation(uuid,text,text)',true,'public, pg_temp'),
  ('public.finalize_delivery(uuid,uuid,text)',true,'public, pg_temp'),
  ('public.get_phase14_worker_attestation_context(uuid)',true,''),
  ('public.ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text)',true,''),
  ('public.issue_customer_report_access_token(uuid,uuid,text,integer)',true,'public, pg_temp'),
  ('public.mark_delivery_dispatch_started(uuid,uuid)',true,'public, pg_temp'),
  ('public.mark_delivery_reconciliation_required(uuid,uuid,text,text)',true,''),
  ('public.payment_automation_capability()',false,'public, pg_temp'),
  ('public.phase1_manual_fulfilment_capability()',true,'public, pg_catalog, pg_temp'),
  ('public.rc1_freeze_status()',true,''),
  ('public.record_automatic_fulfilment_exception(uuid,uuid,text,text,text,text)',true,''),
  ('public.record_fulfilment_dispatch_result(uuid,uuid,text,integer,text)',true,''),
  ('public.record_manual_report_narrative_provenance(uuid,jsonb)',true,''),
  ('public.record_payment_transition(text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text)',true,''),
  ('public.record_phase14_operational_alert(text,text,uuid,uuid,jsonb,text)',true,''),
  ('public.record_phase14_provider_lookup_attestation(text,text,uuid,uuid,text,text,text,jsonb,bigint,uuid,text)',true,''),
  ('public.record_unmatched_payment_event(text,text,text,text,text,text)',true,'public, pg_temp'),
  ('public.recover_phase14_worker_capability_lease(jsonb,text)',true,''),
  ('public.save_assessment_resume_state(text,text,uuid,integer,text)',true,'public, pg_temp'),
  ('public.settle_manual_report_ai_attempt(uuid,jsonb)',true,''),
  ('public.start_manual_report_generation(uuid)',true,'public, pg_temp'),
  ('public.terminal_phase14_generation_publication(jsonb,text,text)',true,'');

create temporary table rc1_service_role_contract_before_function_acl on commit drop as
select
  target.signature,
  role_name,
  case
    when role_name = 'PUBLIC' then exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where p.oid = to_regprocedure(target.signature)
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    else has_function_privilege(role_name, target.signature, 'EXECUTE')
  end as allowed
from rc1_service_role_contract_rpc_targets target
cross join unnest(array['PUBLIC','anon','authenticated','service_role']) role_name;

do $$
declare
  target record;
  function_oid oid;
  actual_security_definer boolean;
  actual_search_path text;
begin
  if (select count(*) from rc1_service_role_contract_rpc_targets) <> 40 then
    raise exception 'rc1_service_role_contract_rpc_count_mismatch';
  end if;

  for target in select * from rc1_service_role_contract_rpc_targets loop
    function_oid := to_regprocedure(target.signature);
    if function_oid is null then
      raise exception 'rc1_service_role_contract_missing_rpc: %', target.signature;
    end if;

    select
      p.prosecdef,
      coalesce((
        select case
          when replace(setting, 'search_path=', '') = '""' then ''
          else replace(setting, 'search_path=', '')
        end
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      ), 'DEFAULT')
      into actual_security_definer, actual_search_path
    from pg_proc p
    where p.oid = function_oid;

    if actual_security_definer <> target.security_definer then
      raise exception 'rc1_service_role_contract_rpc_security_mode_mismatch: %',
        target.signature;
    end if;
    if actual_search_path <> target.expected_search_path then
      raise exception 'rc1_service_role_contract_rpc_search_path_mismatch: % (% <> %)',
        target.signature, actual_search_path, target.expected_search_path;
    end if;
    if not has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'rc1_service_role_contract_rpc_execute_missing: %', target.signature;
    end if;
  end loop;
end;
$$;

grant select on table
  public.admin_profiles,
  public.app_settings,
  public.assessment_answers,
  public.assessment_events,
  public.assessment_tokens,
  public.assessments,
  public.audit_logs,
  public.customer_report_access_tokens,
  public.data_requests,
  public.domains,
  public.eft_settings,
  public.email_events,
  public.exposure_answers,
  public.exposure_factors,
  public.manual_report_delivery_attempts,
  public.manual_report_generation_attempts,
  public.maturity_cap_events,
  public.methodology_versions,
  public.order_events,
  public.orders,
  public.organisations,
  public.payment_automation_records,
  public.payment_sessions,
  public.payment_transition_events,
  public.phase14_ai_route_policies,
  public.phase14_feature_policies,
  public.phase14_operational_alerts,
  public.phase14_security_gates,
  public.products,
  public.questions,
  public.recommendation_rules,
  public.report_ai_attempts,
  public.report_content_blocks,
  public.report_delivery_authorizations,
  public.report_fulfilments,
  public.report_generation_runs,
  public.report_templates,
  public.reports,
  public.respondents,
  public.response_scale,
  public.score_domain_results,
  public.score_question_traces,
  public.score_runs
to service_role;

grant insert on table
  public.assessment_answers,
  public.assessment_events,
  public.assessment_tokens,
  public.assessments,
  public.audit_logs,
  public.data_requests,
  public.email_events,
  public.exposure_answers,
  public.order_events,
  public.orders,
  public.organisations,
  public.payment_sessions,
  public.report_events,
  public.respondents
to service_role;

grant update on table
  public.assessment_answers,
  public.assessment_events,
  public.assessment_tokens,
  public.assessments,
  public.customer_report_access_tokens,
  public.data_requests,
  public.email_events,
  public.exposure_answers,
  public.orders,
  public.payment_automation_records,
  public.reports
to service_role;

grant delete on table
  public.assessment_answers,
  public.assessments,
  public.organisations,
  public.respondents
to service_role;

do $$
declare
  target record;
  changed record;
begin
  for target in select * from rc1_service_role_contract_targets loop
    if target.allow_select
       and not has_table_privilege('service_role', format('%I.%I',target.schema_name,target.table_name), 'SELECT') then
      raise exception 'rc1_service_role_contract_postflight_missing: %.% SELECT',
        target.schema_name, target.table_name;
    end if;
    if target.allow_insert
       and not has_table_privilege('service_role', format('%I.%I',target.schema_name,target.table_name), 'INSERT') then
      raise exception 'rc1_service_role_contract_postflight_missing: %.% INSERT',
        target.schema_name, target.table_name;
    end if;
    if target.allow_update
       and not has_table_privilege('service_role', format('%I.%I',target.schema_name,target.table_name), 'UPDATE') then
      raise exception 'rc1_service_role_contract_postflight_missing: %.% UPDATE',
        target.schema_name, target.table_name;
    end if;
    if target.allow_delete
       and not has_table_privilege('service_role', format('%I.%I',target.schema_name,target.table_name), 'DELETE') then
      raise exception 'rc1_service_role_contract_postflight_missing: %.% DELETE',
        target.schema_name, target.table_name;
    end if;
  end loop;

  for changed in
    select before.*
    from rc1_service_role_contract_before_table_acl before
    where before.allowed is distinct from
      case
        when before.role_name = 'PUBLIC' then exists (
          select 1
          from pg_class relation
          cross join lateral aclexplode(
            coalesce(relation.relacl, acldefault('r', relation.relowner))
          ) acl
          where relation.oid = before.relation_oid
            and acl.grantee = 0
            and acl.privilege_type = before.privilege_name
        )
        else has_table_privilege(
          before.role_name, before.relation_oid, before.privilege_name
        )
      end
      and not (
        before.role_name = 'service_role'
        and before.allowed = false
        and case before.privilege_name
          when 'SELECT' then coalesce((
            select allow_select from rc1_service_role_contract_targets contract_target
            where contract_target.schema_name=before.schema_name and contract_target.table_name=before.table_name
          ),false)
          when 'INSERT' then coalesce((
            select allow_insert from rc1_service_role_contract_targets contract_target
            where contract_target.schema_name=before.schema_name and contract_target.table_name=before.table_name
          ),false)
          when 'UPDATE' then coalesce((
            select allow_update from rc1_service_role_contract_targets contract_target
            where contract_target.schema_name=before.schema_name and contract_target.table_name=before.table_name
          ),false)
          when 'DELETE' then coalesce((
            select allow_delete from rc1_service_role_contract_targets contract_target
            where contract_target.schema_name=before.schema_name and contract_target.table_name=before.table_name
          ),false)
          else false
        end
      )
  loop
    raise exception 'rc1_service_role_contract_unapproved_acl_change: %.% % %',
      changed.schema_name, changed.table_name, changed.role_name, changed.privilege_name;
  end loop;

  for changed in
    select before.*
    from rc1_service_role_contract_before_function_acl before
    where before.allowed is distinct from
      case
        when before.role_name = 'PUBLIC' then exists (
          select 1
          from pg_proc function_row
          cross join lateral aclexplode(
            coalesce(function_row.proacl, acldefault('f', function_row.proowner))
          ) acl
          where function_row.oid = to_regprocedure(before.signature)
            and acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        )
        else has_function_privilege(before.role_name, before.signature, 'EXECUTE')
      end
  loop
    raise exception 'rc1_service_role_contract_unapproved_function_acl_change: % %',
      changed.signature, changed.role_name;
  end loop;
end;
$$;

commit;
