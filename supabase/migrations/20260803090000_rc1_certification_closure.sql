-- RC1: close the audited synthetic-certification cleanup over the healthy commercial path.
--
-- This is a replacement of the existing four-argument cleanup function only. The dependency
-- graph is intentionally explicit: every selected child is proven to belong to the marked
-- organisation before any delete is attempted, and restricted children are removed before their
-- parents. Products, configuration, freeze state and global operational/audit records remain
-- outside the journey-owned set.

begin;

-- The freeze trigger remains authoritative for every ordinary mutation. Its only additional
-- branch is the same transaction-local, row-provenance DELETE allowance used by the existing RC1
-- score/event guards, needed for guarded journey children such as customer access tokens.
create or replace function public.rc1_guard_authoritative_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surface text;
  v_old jsonb;
  v_new jsonb;
  v_expected_backfill timestamptz;
  v_marker text;
  v_cleanup_ref text;
  v_synthetic_ref text;
  v_marker_fingerprint text;
  v_secret_fingerprint text;
  v_actor jsonb;
  v_token public.rc1_certification_secret_write_tokens%rowtype;
  v_freeze public.rc1_operation_freeze_state%rowtype;
begin
  v_surface := public.rc1_surface_for_relation(tg_table_schema, tg_table_name);
  if v_surface is null then
    raise exception 'rc1_operation_frozen:unknown_surface';
  end if;

  -- Preserve the exact certification-secret capability consumed by the certified freeze
  -- control. The cleanup allowance below does not change this path.
  if tg_table_schema = 'phase14_private'
     and tg_table_name = 'runtime_secrets'
     and tg_op in ('INSERT', 'UPDATE') then
    v_new := pg_catalog.to_jsonb(new);
    if v_new->>'secret_key' not in ('provider_webhook_db_hmac','provider_lookup_db_hmac') then
      perform public.rc1_require_operation_open(v_surface);
    end if;
    v_marker := coalesce(pg_catalog.current_setting('rc1.certification_secret_write_marker', true), '');
    if v_marker <> '' then
      v_marker_fingerprint := pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(v_marker, 'UTF8'), 'sha256'), 'hex');
      v_secret_fingerprint := pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(v_new->>'secret_value', 'UTF8'), 'sha256'), 'hex');
      v_actor := public.rc1_require_platform_admin(true);
      select * into v_freeze from public.rc1_operation_freeze_state where singleton = true for share;
      if found and v_freeze.state = 'FROZEN' and v_freeze.freeze_epoch > 0
         and v_freeze.active_canary_authorization_hash is null
         and v_freeze.active_canary_expires_at is null then
        delete from public.rc1_certification_secret_write_tokens
        where transaction_id = pg_catalog.pg_current_xact_id()
          and marker_fingerprint = v_marker_fingerprint
          and secret_key = v_new->>'secret_key'
          and secret_fingerprint = v_secret_fingerprint
          and expected_freeze_epoch = v_freeze.freeze_epoch
          and actor_fingerprint = v_actor->>'actor_fingerprint'
        returning * into v_token;
        if found then
          if tg_op = 'UPDATE' then
            v_old := pg_catalog.to_jsonb(old);
            if v_old->>'secret_key' is distinct from v_new->>'secret_key' then
              raise exception 'rc1_certification_secret:key_immutable';
            end if;
          end if;
          return new;
        end if;
      end if;
    end if;
  end if;

  if tg_op in ('DELETE','UPDATE') then
    v_cleanup_ref := nullif(pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true), '');
    if v_cleanup_ref is not null then
      v_old := pg_catalog.to_jsonb(old);
      if tg_op = 'UPDATE' then v_new := pg_catalog.to_jsonb(new); end if;
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.organisations o
      where o.id in (
        select o2.id from public.organisations o2 where o2.id = nullif(v_old->>'id','')::uuid
        union
        select r.organisation_id from public.respondents r where r.id = nullif(v_old->>'id','')::uuid
          or r.organisation_id = nullif(v_old->>'organisation_id','')::uuid
        union
        select a.organisation_id from public.assessments a where a.id = nullif(v_old->>'id','')::uuid
        union
        select a.organisation_id from public.assessments a where a.id = nullif(v_old->>'assessment_id','')::uuid
        union
        select a.organisation_id from public.reports r join public.assessments a on a.id=r.assessment_id
          where r.id = nullif(v_old->>'report_id','')::uuid
        union
        select a.organisation_id from public.orders ord join public.assessments a on a.id=ord.assessment_id
          where ord.id = nullif(v_old->>'order_id','')::uuid
        union
        select a.organisation_id from public.report_fulfilments f join public.assessments a on a.id=f.assessment_id
          where f.id = nullif(v_old->>'fulfilment_id','')::uuid
        union
        select a.organisation_id from public.score_runs sr join public.assessments a on a.id=sr.assessment_id
          where sr.id = nullif(v_old->>'score_run_id','')::uuid
        union
        select a.organisation_id from public.email_events e join public.assessments a on a.id=e.assessment_id
          where e.id = nullif(v_old->>'email_event_id','')::uuid
        union
        select a.organisation_id from public.report_delivery_authorizations d join public.assessments a on a.id=d.assessment_id
          where d.id = nullif(v_old->>'authorization_id','')::uuid
      ) and o.synthetic_certification_ref = v_cleanup_ref limit 1;
      if (v_synthetic_ref is not null
         and (tg_op = 'DELETE' or (
           tg_table_name = 'reports'
           and (v_new - 'fulfilment_id' - 'generation_run_id') = (v_old - 'fulfilment_id' - 'generation_run_id')
           and ((v_old->>'fulfilment_id') is not null and (v_new->>'fulfilment_id') is null
             or (v_old->>'generation_run_id') is not null and (v_new->>'generation_run_id') is null)
         ) or (
           tg_table_name = 'phase14_worker_capabilities'
           and (v_new - 'order_id' - 'assessment_id' - 'score_run_id' - 'fulfilment_id' - 'report_id')
             = (v_old - 'order_id' - 'assessment_id' - 'score_run_id' - 'fulfilment_id' - 'report_id')
           and ((v_old->>'order_id') is not null and (v_new->>'order_id') is null
             or (v_old->>'assessment_id') is not null and (v_new->>'assessment_id') is null
             or (v_old->>'score_run_id') is not null and (v_new->>'score_run_id') is null
             or (v_old->>'fulfilment_id') is not null and (v_new->>'fulfilment_id') is null
             or (v_old->>'report_id') is not null and (v_new->>'report_id') is null)
         ) or (
           tg_table_name = 'assessments'
           and (v_new - 'current_score_run_id' - 'updated_at') = (v_old - 'current_score_run_id' - 'updated_at')
           and (v_old->>'current_score_run_id') is not null
           and (v_new->>'current_score_run_id') is null
         )))
         or (tg_op = 'DELETE'
           and tg_table_name = 'phase14_worker_capabilities'
           and v_old->>'id' = any(pg_catalog.string_to_array(
             pg_catalog.current_setting('rc1.synthetic_cleanup_caps', true), ','))) then
        return case when tg_op = 'DELETE' then old else new end;
      end if;
    end if;
  end if;

  -- Preserve the exact accepted lifecycle backfill exception used before the transition RPC
  -- exists. All other writes continue through the normal open/frozen gate.
  if tg_table_schema = 'public'
     and tg_table_name = 'phase14_operational_alerts'
     and tg_op = 'UPDATE'
     and pg_catalog.to_regprocedure('public.transition_phase14_operational_alert(uuid,text,text)') is null then
    v_old := pg_catalog.to_jsonb(old);
    v_new := pg_catalog.to_jsonb(new);
    begin
      v_expected_backfill := coalesce(nullif(v_old->>'resolved_at','')::timestamptz, nullif(v_old->>'created_at','')::timestamptz);
    exception when others then
      v_expected_backfill := null;
    end;
    if (v_new - 'last_status_changed_at') = (v_old - 'last_status_changed_at')
       and nullif(v_new->>'last_status_changed_at','')::timestamptz is not distinct from v_expected_backfill then
      return new;
    end if;
  end if;

  perform public.rc1_require_operation_open(v_surface);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.guard_customer_contact_verification_immutable()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_op = 'DELETE'
     and nullif(pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true), '') is not null
     and exists (
       select 1
       from public.organisations o
       join public.assessments a on a.organisation_id = o.id
       where o.synthetic_certification_ref = current_setting('rc1.synthetic_cleanup_ref', true)
         and (a.id = old.assessment_id or exists (
           select 1 from public.orders ord where ord.id = old.order_id and ord.assessment_id = a.id
         ))
     ) then
    return old;
  end if;
  if tg_op = 'DELETE' then raise exception 'customer_contact_verification_immutable'; end if;
  if old.status = 'verified' and new.status = 'consumed'
     and old.id = new.id and old.order_id = new.order_id
     and old.assessment_id = new.assessment_id
     and old.customer_identity = new.customer_identity
     and old.previous_email = new.previous_email
     and old.corrected_email = new.corrected_email
     and old.verification_method = new.verification_method
     and old.evidence_reference = new.evidence_reference
     and old.verified_at = new.verified_at
     and old.verified_by_actor is not distinct from new.verified_by_actor
     and old.verified_by_system is not distinct from new.verified_by_system
     and old.expires_at = new.expires_at
     and new.consumed_at is not null and new.consumed_by_remediation_id is not null
     and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='authorize_bounced_report_redelivery'
       order by p.oid desc limit 1) then
    return new;
  end if;
  raise exception 'customer_contact_verification_immutable';
end;
$$;

create or replace function public.rc1_cleanup_synthetic_certification(
  p_reference text,
  p_reason text,
  p_expected_target_fingerprint text,
  p_expected_target_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_reason_fingerprint text;
  v_enabled boolean;
  v_org_ids uuid[];
  v_assessment_ids uuid[];
  v_order_ids uuid[];
  v_score_run_ids uuid[];
  v_report_ids uuid[];
  v_fulfilment_ids uuid[];
  v_generation_run_ids uuid[];
  v_generation_claim_ids uuid[];
  v_ai_attempt_ids uuid[];
  v_manual_generation_attempt_ids uuid[];
  v_manual_delivery_attempt_ids uuid[];
  v_authorization_ids uuid[];
  v_email_event_ids uuid[];
  v_provider_attestation_ids uuid[];
  v_worker_capability_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
  v_freeze_epoch bigint;
  v_actual_count integer;
  v_actual_fingerprint text;
  v_remaining integer;
begin
  -- Authority: platform admin at AAL2, exactly as the RC1 control plane requires.
  v_actor := public.rc1_require_platform_admin(true);

  if p_reference is null or p_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$' then
    raise exception 'rc1_synthetic_cleanup:reference_not_synthetic';
  end if;
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_synthetic_cleanup:meaningful_reason_required';
  end if;
  if p_expected_target_fingerprint is null
     or p_expected_target_fingerprint !~ '^[0-9a-f]{64}$'
     or p_expected_target_count is null
     or p_expected_target_count < 0 then
    raise exception 'rc1_synthetic_cleanup:storage_proof_required';
  end if;

  -- The migration never inserts this setting. Production and every other environment remain
  -- inert unless an existing, deliberate control enables this certification-only mechanism.
  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s
  where s.setting_key = 'rc1_synthetic_certification_cleanup';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_synthetic_cleanup:not_enabled_in_this_environment';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex'
  );

  -- Resolve the journey from the marked organisation and carry its identity through every
  -- relation. No table below is scanned by a customer-controlled reference or deleted broadly.
  select pg_catalog.array_agg(o.id) into v_org_ids
  from public.organisations o
  where o.synthetic_certification_ref = p_reference;
  v_org_ids := coalesce(v_org_ids, array[]::uuid[]);

  select pg_catalog.array_agg(a.id) into v_assessment_ids
  from public.assessments a where a.organisation_id = any(v_org_ids);
  v_assessment_ids := coalesce(v_assessment_ids, array[]::uuid[]);

  select pg_catalog.array_agg(o.id) into v_order_ids
  from public.orders o where o.assessment_id = any(v_assessment_ids);
  v_order_ids := coalesce(v_order_ids, array[]::uuid[]);

  select pg_catalog.array_agg(s.id) into v_score_run_ids
  from public.score_runs s where s.assessment_id = any(v_assessment_ids);
  v_score_run_ids := coalesce(v_score_run_ids, array[]::uuid[]);

  select pg_catalog.array_agg(r.id) into v_report_ids
  from public.reports r where r.assessment_id = any(v_assessment_ids);
  v_report_ids := coalesce(v_report_ids, array[]::uuid[]);

  select pg_catalog.array_agg(f.id) into v_fulfilment_ids
  from public.report_fulfilments f where f.assessment_id = any(v_assessment_ids);
  v_fulfilment_ids := coalesce(v_fulfilment_ids, array[]::uuid[]);

  select pg_catalog.array_agg(g.id) into v_generation_run_ids
  from public.report_generation_runs g
  where g.fulfilment_id = any(v_fulfilment_ids)
     or g.report_id = any(v_report_ids);
  v_generation_run_ids := coalesce(v_generation_run_ids, array[]::uuid[]);

  select pg_catalog.array_agg(g.claim_token) into v_generation_claim_ids
  from public.report_generation_claims g
  where g.assessment_id = any(v_assessment_ids)
     or g.order_id = any(v_order_ids)
     or g.score_run_id = any(v_score_run_ids)
     or g.fulfilment_id = any(v_fulfilment_ids)
     or g.report_id = any(v_report_ids);
  v_generation_claim_ids := coalesce(v_generation_claim_ids, array[]::uuid[]);

  select pg_catalog.array_agg(g.id) into v_manual_generation_attempt_ids
  from public.manual_report_generation_attempts g
  where g.order_id = any(v_order_ids);
  v_manual_generation_attempt_ids := coalesce(v_manual_generation_attempt_ids, array[]::uuid[]);

  select pg_catalog.array_agg(d.id) into v_manual_delivery_attempt_ids
  from public.manual_report_delivery_attempts d
  where d.order_id = any(v_order_ids) or d.report_id = any(v_report_ids);
  v_manual_delivery_attempt_ids := coalesce(v_manual_delivery_attempt_ids, array[]::uuid[]);

  select pg_catalog.array_agg(a.id) into v_ai_attempt_ids
  from public.report_ai_attempts a
  where a.fulfilment_id = any(v_fulfilment_ids)
     or a.manual_generation_attempt_id = any(v_manual_generation_attempt_ids)
     or a.manual_order_id = any(v_order_ids)
     or a.manual_assessment_id = any(v_assessment_ids)
     or a.manual_score_run_id = any(v_score_run_ids);
  v_ai_attempt_ids := coalesce(v_ai_attempt_ids, array[]::uuid[]);

  select pg_catalog.array_agg(d.id) into v_authorization_ids
  from public.report_delivery_authorizations d
  where d.assessment_id = any(v_assessment_ids)
     or d.order_id = any(v_order_ids)
     or d.report_id = any(v_report_ids);
  v_authorization_ids := coalesce(v_authorization_ids, array[]::uuid[]);

  -- Include all journey-owned notification records, including the four external messages and
  -- internal placeholders. Healthy provider callbacks therefore follow the same proof boundary.
  select pg_catalog.array_agg(e.id) into v_email_event_ids
  from public.email_events e
  where e.assessment_id = any(v_assessment_ids)
     or e.order_id = any(v_order_ids)
     or e.report_id = any(v_report_ids)
     or e.id in (select d.email_event_id from public.report_delivery_authorizations d where d.id = any(v_authorization_ids));
  v_email_event_ids := coalesce(v_email_event_ids, array[]::uuid[]);

  select pg_catalog.array_agg(a.id) into v_provider_attestation_ids
  from public.phase14_provider_attestations a
  where a.authorization_id = any(v_authorization_ids)
     or a.email_event_id = any(v_email_event_ids);
  v_provider_attestation_ids := coalesce(v_provider_attestation_ids, array[]::uuid[]);

  -- A capability is journey-owned only when it names at least one resolved journey row. This
  -- deliberately leaves global worker policy and capability rows untouched.
  select pg_catalog.array_agg(c.id) into v_worker_capability_ids
  from public.phase14_worker_capabilities c
  where c.order_id = any(v_order_ids)
     or c.assessment_id = any(v_assessment_ids)
     or c.score_run_id = any(v_score_run_ids)
     or c.fulfilment_id = any(v_fulfilment_ids)
     or c.report_id = any(v_report_ids);
  v_worker_capability_ids := coalesce(v_worker_capability_ids, array[]::uuid[]);

  -- Refuse a malformed or cross-linked graph before setting the cleanup allowance. A marked
  -- parent must never make an unrelated child deletable by accident.
  if exists (select 1 from public.report_fulfilments f where f.id = any(v_fulfilment_ids)
    and (not (f.order_id = any(v_order_ids)) or not (f.score_run_id = any(v_score_run_ids))
      or (f.report_id is not null and not (f.report_id = any(v_report_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.reports r where r.id = any(v_report_ids)
    and (r.score_run_id is null or not (r.score_run_id = any(v_score_run_ids))
      or (r.order_id is not null and not (r.order_id = any(v_order_ids)))
      or (r.fulfilment_id is not null and not (r.fulfilment_id = any(v_fulfilment_ids)))
      or (r.generation_run_id is not null and not (r.generation_run_id = any(v_generation_run_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.report_generation_runs g where g.id = any(v_generation_run_ids)
    and (not (g.fulfilment_id = any(v_fulfilment_ids))
      or (g.report_id is not null and not (g.report_id = any(v_report_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.report_generation_claims g where g.claim_token = any(v_generation_claim_ids)
    and ((g.assessment_id is not null and not (g.assessment_id = any(v_assessment_ids)))
      or (g.order_id is not null and not (g.order_id = any(v_order_ids)))
      or (g.score_run_id is not null and not (g.score_run_id = any(v_score_run_ids)))
      or (g.fulfilment_id is not null and not (g.fulfilment_id = any(v_fulfilment_ids)))
      or (g.report_id is not null and not (g.report_id = any(v_report_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.report_ai_attempts a where a.id = any(v_ai_attempt_ids)
    and ((a.fulfilment_id is not null and not (a.fulfilment_id = any(v_fulfilment_ids)))
      or (a.manual_generation_attempt_id is not null and not (a.manual_generation_attempt_id = any(v_manual_generation_attempt_ids)))
      or (a.manual_order_id is not null and not (a.manual_order_id = any(v_order_ids)))
      or (a.manual_assessment_id is not null and not (a.manual_assessment_id = any(v_assessment_ids)))
      or (a.manual_score_run_id is not null and not (a.manual_score_run_id = any(v_score_run_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.report_delivery_authorizations d where d.id = any(v_authorization_ids)
    and (not (d.report_id = any(v_report_ids)) or not (d.order_id = any(v_order_ids))
      or not (d.assessment_id = any(v_assessment_ids)) or not (d.score_run_id = any(v_score_run_ids)))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.phase14_provider_attestations a where a.id = any(v_provider_attestation_ids)
    and ((a.authorization_id is not null and not (a.authorization_id = any(v_authorization_ids)))
      or (a.email_event_id is not null and not (a.email_event_id = any(v_email_event_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;
  if exists (select 1 from public.phase14_worker_capabilities c where c.id = any(v_worker_capability_ids)
    and ((c.order_id is not null and not (c.order_id = any(v_order_ids)))
      or (c.assessment_id is not null and not (c.assessment_id = any(v_assessment_ids)))
      or (c.score_run_id is not null and not (c.score_run_id = any(v_score_run_ids)))
      or (c.fulfilment_id is not null and not (c.fulfilment_id = any(v_fulfilment_ids)))
      or (c.report_id is not null and not (c.report_id = any(v_report_ids))))) then
    raise exception 'rc1_synthetic_cleanup:unrelated_dependency';
  end if;

  -- Re-derive the caller's Storage proof from surviving report rows.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(pg_catalog.string_agg(t.bucket || E'\n' || t.path, E'\n' order by t.bucket, t.path), ''),
          'UTF8'
        ), 'sha256'
      ), 'hex'
    )
  into v_actual_count, v_actual_fingerprint
  from (
    select r.storage_bucket as bucket, r.storage_path as path
    from public.reports r
    where r.id = any(v_report_ids) and r.storage_bucket is not null and r.storage_path is not null
  ) t;

  if v_actual_count <> p_expected_target_count or v_actual_fingerprint <> p_expected_target_fingerprint then
    raise exception 'rc1_synthetic_cleanup:storage_target_mismatch';
  end if;

  -- Storage deletion remains an external Storage API action. The database independently verifies
  -- absence and never disables storage triggers or foreign-key enforcement.
  select pg_catalog.count(*)::integer into v_remaining
  from storage.objects so
  join public.reports r on so.bucket_id = r.storage_bucket and so.name = r.storage_path
  where r.id = any(v_report_ids);
  if coalesce(v_remaining, 0) > 0 then
    raise exception 'rc1_synthetic_cleanup:storage_objects_remaining';
  end if;

  -- Exact idempotent retry: the marked organisation is gone, but the proof contract still applies.
  if pg_catalog.array_length(v_org_ids, 1) is null then
    if not exists (
      select 1 from public.rc1_synthetic_cleanup_audit a
      where a.synthetic_reference = p_reference
    ) then
      raise exception 'rc1_synthetic_cleanup:unmarked_or_missing';
    end if;
    insert into public.rc1_synthetic_cleanup_audit(
      synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, deleted_counts,
      storage_target_count, storage_verified_absent_count, storage_target_fingerprint
    ) values (
      p_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', null,
      jsonb_build_object('organisations', 0, 'already_clean', true),
      v_actual_count, v_actual_count, v_actual_fingerprint
    );
    return jsonb_build_object('reference', p_reference, 'already_clean', true, 'deleted', '{}'::jsonb);
  end if;

  perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', p_reference, true);
  v_counts := v_counts || jsonb_build_object('storage_targets_verified_absent', v_actual_count);

  -- Child rows of reports, delivery and provider evidence.
  delete from public.customer_report_access_tokens where report_id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('customer_report_access_tokens', v_deleted);

  delete from public.phase14_storage_cleanup_queue
  where report_id = any(v_report_ids) or owner_capability_id = any(v_worker_capability_ids)
     or lease_owner_capability_id = any(v_worker_capability_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_storage_cleanup_queue', v_deleted);

  delete from public.phase14_workflow_start_outbox
  where fulfilment_id = any(v_fulfilment_ids) or capability_id = any(v_worker_capability_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_workflow_start_outbox', v_deleted);

  delete from phase14_private.worker_attestation_nonces
  where capability_id = any(v_worker_capability_ids);
  delete from phase14_private.worker_recovery_nonces
  where capability_id = any(v_worker_capability_ids);

  delete from public.report_delivery_finalizations
  where authorization_id = any(v_authorization_ids)
     or email_event_id = any(v_email_event_ids) or report_id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_delivery_finalizations', v_deleted);

  delete from public.phase14_provider_attestation_consumptions
  where authorization_id = any(v_authorization_ids)
     or attestation_id = any(v_provider_attestation_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestation_consumptions', v_deleted);

  delete from public.phase14_provider_attestations
  where id = any(v_provider_attestation_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestations', v_deleted);

  delete from public.report_delivery_remediations
  where report_id = any(v_report_ids) or prior_email_event_id = any(v_email_event_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_delivery_remediations', v_deleted);

  delete from public.customer_contact_verifications
  where order_id = any(v_order_ids) or assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('customer_contact_verifications', v_deleted);

  -- Generation evidence must go before its fulfilment and manual parent rows.
  delete from public.report_quality_diagnostics
  where attempt_id in (select id from public.manual_report_generation_attempts where id = any(v_manual_generation_attempt_ids));
  delete from public.report_ai_attempts where id = any(v_ai_attempt_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_ai_attempts', v_deleted);

  delete from public.report_generation_runs where id = any(v_generation_run_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_generation_runs', v_deleted);

  delete from public.report_generation_claims where claim_token = any(v_generation_claim_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_generation_claims', v_deleted);

  delete from public.manual_report_delivery_attempts where id = any(v_manual_delivery_attempt_ids);
  delete from public.manual_report_generation_attempts where id = any(v_manual_generation_attempt_ids);

  -- Clear the capability's restricted parent references before removing those parents. This is
  -- limited to the resolved synthetic capability set and only those five FK columns.
  update public.phase14_worker_capabilities
  set order_id = null, assessment_id = null, score_run_id = null, fulfilment_id = null, report_id = null
  where id = any(v_worker_capability_ids);
  perform pg_catalog.set_config(
    'rc1.synthetic_cleanup_caps',
    pg_catalog.array_to_string(v_worker_capability_ids, ','), true
  );

  -- Remove delivery authorisations and messages only after every restricted evidence row is gone.
  delete from public.report_delivery_authorizations where id = any(v_authorization_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_delivery_authorizations', v_deleted);

  delete from public.email_provider_events where email_event_id = any(v_email_event_ids);
  delete from public.email_events where id = any(v_email_event_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_events', v_deleted);

  -- Fulfilment is deleted before reports and orders; report_id/generation_run_id are nullable
  -- links, while score_run_id/order_id/assessment_id are restricted or cascade links.
  delete from public.report_fulfilments where id = any(v_fulfilment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_fulfilments', v_deleted);

  -- Capability references are now gone through the ordered parent deletes; removing the
  -- capability itself can therefore remain a plain DELETE under the existing freeze guard.
  delete from public.phase14_worker_capabilities where id = any(v_worker_capability_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_worker_capabilities', v_deleted);

  delete from public.report_events where report_id = any(v_report_ids);
  delete from public.backlog_reconciliation_records
  where order_id = any(v_order_ids) or report_id = any(v_report_ids);
  delete from public.reports where id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('reports', v_deleted);

  -- Score children stay present until their parent score run is still available to the existing
  -- provenance-aware immutability allowance.
  delete from public.score_question_traces
  where score_run_id = any(v_score_run_ids);
  delete from public.maturity_cap_events where score_run_id = any(v_score_run_ids);
  delete from public.score_domain_results where score_run_id = any(v_score_run_ids);
  update public.assessments set current_score_run_id = null where id = any(v_assessment_ids);
  delete from public.score_runs where id = any(v_score_run_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('score_runs', v_deleted);

  -- Payment and order evidence.
  delete from public.payment_proofs where order_id = any(v_order_ids);
  delete from public.payment_transition_events where order_id = any(v_order_ids);
  delete from public.payment_automation_records where order_id = any(v_order_ids);
  delete from public.payment_sessions where order_id = any(v_order_ids);
  delete from public.order_events where order_id = any(v_order_ids);
  delete from public.orders where id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('orders', v_deleted);

  delete from public.data_requests where assessment_id = any(v_assessment_ids);
  delete from public.assessment_answers where assessment_id = any(v_assessment_ids);
  delete from public.exposure_answers where assessment_id = any(v_assessment_ids);
  delete from public.assessment_tokens where assessment_id = any(v_assessment_ids);
  delete from public.assessment_events where assessment_id = any(v_assessment_ids);
  delete from public.assessment_resume_events where assessment_id = any(v_assessment_ids);
  delete from public.audit_logs where assessment_id = any(v_assessment_ids);
  delete from public.assessments where id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('assessments', v_deleted);

  delete from public.respondents where organisation_id = any(v_org_ids);
  delete from public.organisations where id = any(v_org_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('organisations', v_deleted);

  select freeze_epoch into v_freeze_epoch
  from public.rc1_operation_freeze_state where singleton = true;

  insert into public.rc1_synthetic_cleanup_audit(
    synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, deleted_counts,
    storage_target_count, storage_verified_absent_count, storage_target_fingerprint
  ) values (
    p_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch, v_counts,
    v_actual_count, v_actual_count, v_actual_fingerprint
  );

  return jsonb_build_object('reference', p_reference, 'already_clean', false, 'deleted', v_counts);
end;
$$;

revoke all on function public.rc1_cleanup_synthetic_certification(text,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_cleanup_synthetic_certification(text,text,text,integer) to authenticated;

comment on function public.rc1_cleanup_synthetic_certification(text,text,text,integer) is
  'Audited removal of one marked MKTEST-RC1- synthetic certification journey after Storage absence is proven. Uses explicit healthy-path dependency ordering, preserves global control-plane records, and is NOT a customer erasure facility.';

commit;
