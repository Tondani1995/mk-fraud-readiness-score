-- Phase 14 sixth-remediation handoff corrections.
-- This file remains unpublished.  It is folded into canonical migration 0017
-- and into the environment-specific reconciliation artefacts.

begin;

-- A manual request receives the same durable fulfilment identity as a worker
-- request.  The key changes after each successfully published report, while a
-- failed pre-publication attempt can safely resume its previous identity.
create or replace function public.ensure_manual_premium_report_fulfilment(
  p_order_reference text,
  p_trigger_source text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor jsonb; v_context jsonb; v_order public.orders%rowtype;
  v_fulfilment public.report_fulfilments%rowtype; v_key text;
begin
  v_actor:=public.phase14_require_security(
    'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
  );
  perform public.phase14_require_policy('manual_generation');
  if p_trigger_source not in ('admin_generate','admin_retry','admin_regenerate') then
    raise exception 'phase14_manual_fulfilment_trigger_invalid';
  end if;
  v_context:=public.phase14_generation_entitlement(p_order_reference);
  select * into strict v_order from public.orders where id=(v_context->>'order_id')::uuid for share;
  perform pg_advisory_xact_lock(hashtextextended('phase14-manual:'||v_order.id::text,0));
  select * into v_fulfilment from public.report_fulfilments
  where order_id=v_order.id
    and score_run_id=(v_context->>'score_run_id')::uuid
    and trigger_source in ('admin_generate','admin_retry','admin_regenerate')
    and status in ('queued','assembling','generating','validating','rendering','storing')
  order by created_at desc limit 1 for update;
  if found then
    return jsonb_build_object('created',false,'fulfilment',to_jsonb(v_fulfilment),'context',v_context);
  end if;
  if exists(select 1 from public.report_fulfilments
      where order_id=v_order.id and score_run_id=(v_context->>'score_run_id')::uuid
        and trigger_source in ('admin_generate','admin_retry','admin_regenerate')
        and status='ready_for_delivery') then
    raise exception 'phase14_manual_fulfilment_already_ready';
  end if;
  if exists(select 1 from public.report_fulfilments
      where order_id=v_order.id and score_run_id=(v_context->>'score_run_id')::uuid
        and trigger_source='payment_confirmation'
        and status in ('queued','assembling','generating','validating','rendering','storing','ready_for_delivery')) then
    raise exception 'phase14_manual_fulfilment_conflicts_with_worker';
  end if;
  v_key:=concat('phase14-manual:',v_order.id,':',v_context->>'score_run_id',':',
    coalesce((select id::text from public.reports where order_id=v_order.id and status='generated'
      order by version_number desc limit 1),'initial'),':',p_trigger_source);
  perform set_config('phase14.authoritative_transition','fulfilment_queue_rpc',true);
  insert into public.report_fulfilments(
    order_id,assessment_id,score_run_id,idempotency_key,trigger_source,status,current_step,
    requested_by_admin_user_id
  ) values (
    v_order.id,(v_context->>'assessment_id')::uuid,(v_context->>'score_run_id')::uuid,
    v_key,p_trigger_source,'queued','manual_generation_requested',(v_actor->>'user_id')::uuid
  ) on conflict (idempotency_key) do update set
    status='queued',current_step='manual_generation_requested',last_error_code=null,
    last_error_message=null,failed_at=null,updated_at=clock_timestamp()
  where public.report_fulfilments.status in ('failed','cancelled')
  returning * into v_fulfilment;
  if not found then raise exception 'phase14_manual_fulfilment_identity_conflict'; end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_fulfilment.assessment_id,'report_fulfilments',
    v_fulfilment.id,'phase14_manual_fulfilment_created',jsonb_build_object(
      'order_reference',p_order_reference,'trigger_source',p_trigger_source,
      'score_run_id',v_fulfilment.score_run_id,'idempotency_key',v_fulfilment.idempotency_key));
  return jsonb_build_object('created',true,'fulfilment',to_jsonb(v_fulfilment),'context',v_context);
end;
$function$;

-- A final-object orphan record must exist before the object copy for manual
-- generation as well as worker generation.
create or replace function public.register_phase14_manual_final_storage_cleanup(
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text,
  p_report_id uuid
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_actor jsonb; v_claim public.report_generation_claims%rowtype; v_id uuid;
begin
  v_actor:=public.phase14_require_security(
    'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
  );
  perform public.phase14_require_policy('manual_generation');
  if p_storage_path like 'tmp/%' or coalesce(trim(p_storage_path),'')='' then
    raise exception 'phase14_final_cleanup_path_invalid';
  end if;
  if p_expected_checksum !~ '^[0-9a-f]{64}$' or coalesce(trim(p_reason),'')='' then
    raise exception 'phase14_final_cleanup_input_invalid';
  end if;
  select * into strict v_claim from public.report_generation_claims
  where claim_token=p_claim_token for share;
  if v_claim.report_id is distinct from p_report_id
     or v_claim.final_storage_bucket is distinct from p_storage_bucket
     or v_claim.final_storage_path is distinct from p_storage_path
     or v_claim.expected_checksum is distinct from p_expected_checksum then
    raise exception 'phase14_final_cleanup_claim_binding_invalid';
  end if;
  perform set_config('phase14.authoritative_transition','authenticated_rpc',true);
  insert into public.phase14_storage_cleanup_queue(
    storage_bucket,storage_path,expected_checksum,claim_token,report_id,
    owner_admin_user_id,cleanup_reason
  ) values (
    p_storage_bucket,p_storage_path,p_expected_checksum,p_claim_token,p_report_id,
    (v_actor->>'user_id')::uuid,p_reason
  ) on conflict (storage_bucket,storage_path) do update set updated_at=clock_timestamp()
  where public.phase14_storage_cleanup_queue.expected_checksum=excluded.expected_checksum
    and public.phase14_storage_cleanup_queue.claim_token=excluded.claim_token
    and public.phase14_storage_cleanup_queue.report_id=excluded.report_id
    and public.phase14_storage_cleanup_queue.owner_admin_user_id=excluded.owner_admin_user_id
  returning id into v_id;
  if v_id is null then raise exception 'phase14_final_cleanup_ownership_conflict'; end if;
  return v_id;
end;
$function$;

-- Both outer entry points delegate all terminal business effects to this one
-- private transaction core.  p_entry_context is created only by a wrapper.
create or replace function phase14_private.terminal_generation_core(
  p_entry_context jsonb,
  p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_entry text:=p_entry_context->>'entry';
  v_capability_id uuid:=nullif(p_entry_context->>'capability_id','')::uuid;
  v_actor_user_id uuid:=nullif(p_entry_context->>'actor_user_id','')::uuid;
  v_authority_epoch bigint:=nullif(p_entry_context->>'authority_epoch','')::bigint;
  v_claim_token uuid:=(p_payload->>'claim_token')::uuid;
  v_fulfilment_id uuid:=(p_payload->>'fulfilment_id')::uuid;
  v_generation_run_id uuid:=(p_payload->>'generation_run_id')::uuid;
  v_report_id uuid:=(p_payload->>'report_id')::uuid;
  v_cleanup_id uuid:=(p_payload->>'final_cleanup_id')::uuid;
  v_fault_after text:=nullif(p_payload->>'fault_after','');
  v_cap public.phase14_worker_capabilities%rowtype;
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_run public.report_generation_runs%rowtype;
  v_cleanup public.phase14_storage_cleanup_queue%rowtype;
  v_object record; v_order_reference text; v_event_type text; v_metadata jsonb;
begin
  if v_entry not in ('worker','manual') or (v_entry='worker')=(v_actor_user_id is not null) then
    raise exception 'phase14_terminal_entry_context_invalid';
  end if;
  if v_entry='worker' then
    select * into strict v_cap from public.phase14_worker_capabilities
    where id=v_capability_id for update;
    perform phase14_private.fault_if_requested(v_fault_after,'after_capability_lock');
    if v_cap.capability_type not in ('automatic_generation','generation_recovery')
       or v_cap.expected_step<>'terminal_publication'
       or v_cap.fulfilment_id is distinct from v_fulfilment_id
       or v_cap.authority_epoch is distinct from v_authority_epoch then
      raise exception 'phase14_terminal_capability_binding_invalid';
    end if;
  end if;
  select * into strict v_claim from public.report_generation_claims
  where claim_token=v_claim_token for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_claim_lock');
  select * into strict v_report from public.reports where id=v_report_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_lock');
  select * into strict v_fulfilment from public.report_fulfilments
  where id=v_fulfilment_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_fulfilment_lock');
  select * into strict v_run from public.report_generation_runs
  where id=v_generation_run_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_generation_run_lock');
  select * into strict v_cleanup from public.phase14_storage_cleanup_queue
  where id=v_cleanup_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_cleanup_lock');
  if v_claim.state<>'committed' or v_claim.report_id is distinct from v_report_id
     or v_claim.fulfilment_id is distinct from v_fulfilment_id
     or v_claim.lease_expires_at<=clock_timestamp() then
    raise exception 'phase14_terminal_generation_claim_invalid';
  end if;
  if v_report.status<>'draft' or v_report.order_id<>v_claim.order_id
     or v_report.assessment_id<>v_claim.assessment_id or v_report.score_run_id<>v_claim.score_run_id
     or v_report.version_number<>v_claim.version_number or v_report.checksum<>v_claim.expected_checksum
     or v_report.storage_bucket<>v_claim.temporary_storage_bucket
     or v_report.storage_path<>v_claim.temporary_storage_path
     or v_report.fulfilment_id is distinct from v_fulfilment_id then
    raise exception 'phase14_terminal_report_claim_binding_invalid';
  end if;
  if v_fulfilment.order_id<>v_claim.order_id or v_fulfilment.assessment_id<>v_claim.assessment_id
     or v_fulfilment.score_run_id<>v_claim.score_run_id
     or v_fulfilment.status not in ('storing','rendering','generating','validating','assembling') then
    raise exception 'phase14_terminal_fulfilment_binding_invalid';
  end if;
  if v_run.fulfilment_id is distinct from v_fulfilment.id
     or (v_run.report_id is not null and v_run.report_id is distinct from v_report.id) then
    raise exception 'phase14_terminal_generation_run_binding_invalid';
  end if;
  if v_cleanup.storage_bucket<>v_claim.final_storage_bucket
     or v_cleanup.storage_path<>v_claim.final_storage_path
     or v_cleanup.expected_checksum<>v_claim.expected_checksum
     or v_cleanup.report_id is distinct from v_report.id
     or v_cleanup.status not in ('pending','failed')
     or (v_entry='worker' and v_cleanup.owner_capability_id is distinct from v_cap.id)
     or (v_entry='manual' and v_cleanup.owner_admin_user_id is distinct from v_actor_user_id) then
    raise exception 'phase14_terminal_orphan_cleanup_binding_invalid';
  end if;
  select order_reference into strict v_order_reference from public.orders where id=v_claim.order_id;
  perform phase14_private.fault_if_requested(v_fault_after,'after_order_read');
  perform public.phase14_generation_entitlement(
    v_order_reference,v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.score_input_hash
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_entitlement');
  select so.bucket_id,so.name,so.metadata into strict v_object from storage.objects so
  where so.bucket_id=v_claim.final_storage_bucket and so.name=v_claim.final_storage_path;
  perform phase14_private.fault_if_requested(v_fault_after,'after_storage_binding');
  if coalesce(v_object.metadata->>'mimetype','')<>'application/pdf'
     or coalesce(v_object.metadata->>'sha256',v_object.metadata->'metadata'->>'sha256','')
        <>v_claim.expected_checksum then
    raise exception 'phase14_terminal_storage_checksum_invalid';
  end if;
  if v_report.supersedes_report_id is not null then
    update public.reports set status='superseded',updated_at=clock_timestamp()
    where id=v_report.supersedes_report_id and status not in ('voided','superseded');
  end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_previous_report_supersession');
  update public.reports set status='generated',storage_bucket=v_claim.final_storage_bucket,
    storage_path=v_claim.final_storage_path,generation_run_id=v_generation_run_id,
    updated_at=clock_timestamp()
  where id=v_report.id and status='draft';
  if not found then raise exception 'phase14_terminal_report_cas_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_publication');
  update public.report_generation_runs set report_id=v_report.id,status='used'
  where id=v_generation_run_id and fulfilment_id=v_fulfilment.id
    and (report_id is null or report_id=v_report.id);
  if not found then raise exception 'phase14_terminal_generation_run_link_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_generation_run_link');
  update public.report_generation_claims set state='settled',last_heartbeat_at=clock_timestamp(),
    updated_at=clock_timestamp() where claim_token=v_claim.claim_token and state='committed';
  if not found then raise exception 'phase14_terminal_claim_settlement_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_claim_settlement');
  update public.report_fulfilments set status='ready_for_delivery',
    current_step='ready_for_email_delivery',generation_mode=p_payload->>'generation_mode',
    report_id=v_report.id,last_error_code=null,last_error_message=null,updated_at=clock_timestamp()
  where id=v_fulfilment.id and status=v_fulfilment.status;
  if not found then raise exception 'phase14_terminal_fulfilment_cas_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_fulfilment_transition');
  update public.phase14_storage_cleanup_queue set status='retained',last_error=null,
    verification_error=null,lease_owner_capability_id=null,lease_token=null,
    lease_expires_at=null,updated_at=clock_timestamp()
  where id=v_cleanup.id and status in ('pending','failed');
  if not found then raise exception 'phase14_terminal_cleanup_transition_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_cleanup_transition');
  v_event_type:=case when v_report.supersedes_report_id is null then 'generated' else 'regenerated' end;
  v_metadata:=coalesce(p_payload->'metadata','{}'::jsonb)||jsonb_build_object(
    'entry_point',v_entry,'worker_capability_id',v_capability_id,'actor_user_id',v_actor_user_id,
    'authority_epoch',v_authority_epoch,'generation_run_id',v_generation_run_id,
    'fulfilment_id',v_fulfilment.id
  );
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,v_event_type,v_actor_user_id,'Atomic terminal generation publication.',v_metadata);
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_event');
  insert into public.assessment_events(assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json)
  values (v_report.assessment_id,v_report.order_id,v_report.id,'report_generated',
    'phase14-terminal-generation:'||v_claim.claim_token,v_metadata);
  perform phase14_private.fault_if_requested(v_fault_after,'after_assessment_event');
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ((case when v_entry='worker' then 'system' else 'admin' end)::public.audit_actor_type,v_actor_user_id,
    v_report.assessment_id,'reports',v_report.id,
    case when v_event_type='generated' then 'premium_report_generated' else 'premium_report_regenerated' end,
    v_metadata||jsonb_build_object('report_reference',v_report.report_reference));
  perform phase14_private.fault_if_requested(v_fault_after,'after_audit_event');
  if v_entry='worker' then
    update public.phase14_worker_capabilities set status='consumed',consumed_at=clock_timestamp(),
      lease_owner=null,lease_secret_hash=null,lease_expires_at=null,last_heartbeat_at=clock_timestamp(),
      lease_generation=lease_generation+1,expected_step='consumed',updated_at=clock_timestamp()
    where id=v_cap.id and status='leased' and lease_generation=v_cap.lease_generation;
    if not found then raise exception 'phase14_terminal_capability_consumption_failed'; end if;
    perform phase14_private.fault_if_requested(v_fault_after,'after_capability_consumption');
  end if;
  return jsonb_build_object('completed',true,'entry_point',v_entry,'report_id',v_report.id,
    'fulfilment_id',v_fulfilment.id,'generation_run_id',v_generation_run_id,
    'final_storage_bucket',v_claim.final_storage_bucket,'final_storage_path',v_claim.final_storage_path,
    'checksum',v_claim.expected_checksum,'version_number',v_report.version_number,
    'superseded_report_id',v_report.supersedes_report_id,
    'lease_generation',case when v_entry='worker' then v_cap.lease_generation+1 else null end,
    'expected_step',case when v_entry='worker' then 'consumed' else 'ready_for_email_delivery' end);
end;
$function$;

create or replace function public.terminal_phase14_generation_publication(
  p_attestation jsonb,p_signature text,p_request_payload text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_payload jsonb:=p_request_payload::jsonb; v_cap jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  v_cap:=phase14_private.verify_worker_attestation(
    p_attestation,p_signature,p_request_payload,'terminal_phase14_generation_publication'
  );
  perform phase14_private.fault_if_requested(nullif(v_payload->>'fault_after',''),'after_attestation');
  perform set_config('phase14.worker_capability_id',v_cap->>'id',true);
  perform set_config('phase14.worker_capability_type',v_cap->>'capability_type',true);
  perform set_config('phase14.authoritative_transition','worker_attested_rpc',true);
  return phase14_private.terminal_generation_core(jsonb_build_object(
    'entry','worker','capability_id',v_cap->>'id','authority_epoch',v_cap->>'authority_epoch'
  ),v_payload);
end;
$function$;

create or replace function public.admin_terminal_phase14_generation_publication(
  p_request_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_actor jsonb;
begin
  v_actor:=public.phase14_require_security(
    'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
  );
  perform public.phase14_require_policy('manual_generation');
  perform phase14_private.fault_if_requested(nullif(p_request_payload->>'fault_after',''),'after_administrator_authorization');
  perform set_config('phase14.authoritative_transition','authenticated_rpc',true);
  return phase14_private.terminal_generation_core(jsonb_build_object(
    'entry','manual','actor_user_id',v_actor->>'user_id',
    'authority_epoch',v_actor->>'authority_epoch'
  ),p_request_payload);
end;
$function$;

-- Recovery has a distinct signed envelope and nonce domain.  It cannot be
-- confused with an ordinary business-step attestation.
create table if not exists phase14_private.worker_recovery_nonces(
  nonce uuid primary key,
  capability_id uuid not null references public.phase14_worker_capabilities(id) on delete restrict,
  old_execution_id text not null,
  proposed_execution_id text not null,
  lease_generation integer not null,
  reason text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default clock_timestamp()
);
revoke all on table phase14_private.worker_recovery_nonces from public,anon,authenticated,service_role;

create or replace function phase14_private.verify_worker_recovery_attestation(
  p_attestation jsonb,p_signature text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_cap public.phase14_worker_capabilities%rowtype; v_gate public.phase14_security_gates%rowtype;
  v_key phase14_private.worker_attestation_keys%rowtype;
  v_secret text; v_canonical text; v_expected text; v_issued timestamptz; v_expires timestamptz;
  v_nonce uuid; v_capability_id uuid; v_generation integer; v_reason text;
begin
  v_reason:=trim(coalesce(p_attestation->>'reason',''));
  if coalesce(p_attestation->>'old_execution_id','') !~ '^[a-zA-Z0-9._:/-]{1,240}$'
     or coalesce(p_attestation->>'proposed_execution_id','') !~ '^[a-zA-Z0-9._:/-]{1,240}$'
     or coalesce(p_attestation->>'operation_key','') !~ '^[a-zA-Z0-9._:/-]{1,240}$'
     or coalesce(p_attestation->>'expected_step','') !~ '^[a-z0-9_]{1,100}$'
     or length(v_reason) not between 1 and 500 then
    raise exception 'phase14_worker_recovery_attestation_shape_invalid';
  end if;
  begin
    v_capability_id:=(p_attestation->>'capability_id')::uuid;
    v_generation:=(p_attestation->>'lease_generation')::integer;
    v_issued:=to_timestamp((p_attestation->>'issued_at_epoch')::double precision);
    v_expires:=to_timestamp((p_attestation->>'expires_at_epoch')::double precision);
    v_nonce:=(p_attestation->>'nonce')::uuid;
  exception when others then raise exception 'phase14_worker_recovery_attestation_shape_invalid'; end;
  if v_issued>clock_timestamp()+interval '5 seconds' or v_issued<clock_timestamp()-interval '2 minutes'
     or v_expires<=clock_timestamp() or v_expires>v_issued+interval '2 minutes' then
    raise exception 'phase14_worker_recovery_attestation_time_invalid';
  end if;
  select * into v_cap from public.phase14_worker_capabilities where id=v_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if v_cap.status<>'leased' or v_cap.lease_expires_at is null
     or v_cap.lease_expires_at>clock_timestamp() then
    raise exception 'phase14_worker_recovery_lease_not_expired';
  end if;
  if v_cap.expires_at<=clock_timestamp() then raise exception 'phase14_worker_recovery_capability_expired'; end if;
  if v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version
     or v_cap.security_gate_version<>v_gate.satisfied_version
     or v_cap.authority_epoch<>v_gate.authority_epoch
     or (p_attestation->>'authority_epoch')::bigint<>v_gate.authority_epoch then
    raise exception 'phase14_worker_recovery_authority_epoch_stale';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  if p_attestation->>'capability_type' is distinct from v_cap.capability_type
     or p_attestation->>'operation_key' is distinct from v_cap.operation_key
     or p_attestation->>'old_execution_id' is distinct from v_cap.workflow_execution_id
     or p_attestation->>'expected_step' is distinct from v_cap.expected_step
     or v_generation<>v_cap.lease_generation then
    raise exception 'phase14_worker_recovery_state_binding_invalid';
  end if;
  if v_cap.order_id is distinct from nullif(p_attestation->>'order_id','')::uuid
     or v_cap.assessment_id is distinct from nullif(p_attestation->>'assessment_id','')::uuid
     or v_cap.score_run_id is distinct from nullif(p_attestation->>'score_run_id','')::uuid
     or v_cap.fulfilment_id is distinct from nullif(p_attestation->>'fulfilment_id','')::uuid
     or v_cap.report_id is distinct from nullif(p_attestation->>'report_id','')::uuid
     or lower(coalesce(v_cap.recipient_email::text,'')) is distinct from lower(coalesce(p_attestation->>'recipient','')) then
    raise exception 'phase14_worker_recovery_commercial_binding_invalid';
  end if;
  select * into v_key from phase14_private.worker_attestation_keys
  where key_id=p_attestation->>'key_id' and status in ('current','previous')
    and valid_from<=clock_timestamp() and (valid_until is null or valid_until>clock_timestamp()) for share;
  if not found then raise exception 'phase14_worker_recovery_key_invalid'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_key.vault_secret_id;
  if v_secret is null then raise exception 'phase14_worker_recovery_key_unavailable'; end if;
  v_canonical:=concat_ws('|',p_attestation->>'key_id',p_attestation->>'capability_id',
    p_attestation->>'capability_type',p_attestation->>'operation_key',
    p_attestation->>'old_execution_id',p_attestation->>'proposed_execution_id',
    p_attestation->>'expected_step',p_attestation->>'lease_generation',
    coalesce(p_attestation->>'order_id',''),coalesce(p_attestation->>'assessment_id',''),
    coalesce(p_attestation->>'score_run_id',''),coalesce(p_attestation->>'fulfilment_id',''),
    coalesce(p_attestation->>'report_id',''),coalesce(lower(p_attestation->>'recipient'),''),
    p_attestation->>'authority_epoch',v_reason,p_attestation->>'issued_at_epoch',
    p_attestation->>'expires_at_epoch',p_attestation->>'nonce');
  v_expected:=encode(extensions.hmac(convert_to(v_canonical,'utf8'),convert_to(v_secret,'utf8'),'sha256'),'hex');
  if p_signature !~ '^[0-9a-f]{64}$'
     or extensions.digest(convert_to(p_signature,'utf8'),'sha256')
        <>extensions.digest(convert_to(v_expected,'utf8'),'sha256') then
    raise exception 'phase14_worker_recovery_signature_invalid';
  end if;
  begin
    insert into phase14_private.worker_recovery_nonces(
      nonce,capability_id,old_execution_id,proposed_execution_id,lease_generation,reason,issued_at,expires_at
    ) values (v_nonce,v_cap.id,p_attestation->>'old_execution_id',
      p_attestation->>'proposed_execution_id',v_generation,v_reason,v_issued,v_expires);
  exception when unique_violation then raise exception 'phase14_worker_recovery_attestation_replay'; end;
  return to_jsonb(v_cap)-'issue_secret_hash'-'lease_secret_hash';
end;
$function$;

create or replace function public.recover_phase14_worker_capability_lease(
  p_attestation jsonb,p_signature text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_cap jsonb; v_row public.phase14_worker_capabilities%rowtype; v_new_execution text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  v_cap:=phase14_private.verify_worker_recovery_attestation(p_attestation,p_signature);
  v_new_execution:=p_attestation->>'proposed_execution_id';
  perform set_config('phase14.worker_capability_id',v_cap->>'id',true);
  perform set_config('phase14.worker_capability_type',v_cap->>'capability_type',true);
  perform set_config('phase14.authoritative_transition','worker_attested_rpc',true);
  update public.phase14_worker_capabilities set workflow_execution_id=v_new_execution,
    lease_owner=v_new_execution,lease_generation=lease_generation+1,
    lease_expires_at=least(expires_at,clock_timestamp()+interval '60 minutes'),
    takeover_count=takeover_count+1,last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=(v_cap->>'id')::uuid and status='leased'
    and lease_generation=(v_cap->>'lease_generation')::integer
    and workflow_execution_id=p_attestation->>'old_execution_id'
    and expected_step=p_attestation->>'expected_step'
  returning * into v_row;
  if not found then raise exception 'phase14_worker_recovery_cas_failed'; end if;
  insert into public.audit_logs(actor_type,assessment_id,entity_table,entity_id,action,after_json)
  values ('system',v_row.assessment_id,'phase14_worker_capabilities',v_row.id,
    'phase14_worker_expired_lease_recovered',jsonb_build_object(
      'capability_type',v_row.capability_type,'operation_key',v_row.operation_key,
      'old_execution_id',p_attestation->>'old_execution_id','new_execution_id',v_new_execution,
      'expected_step',v_row.expected_step,'previous_lease_generation',(v_cap->>'lease_generation')::integer,
      'lease_generation',v_row.lease_generation,'lease_expires_at',v_row.lease_expires_at,
      'takeover_count',v_row.takeover_count,'authority_epoch',v_row.authority_epoch,
      'reason',p_attestation->>'reason'));
  return jsonb_build_object('capability_id',v_row.id,'capability_type',v_row.capability_type,
    'operation_key',v_row.operation_key,'execution_id',v_row.workflow_execution_id,
    'expected_step',v_row.expected_step,'lease_generation',v_row.lease_generation,
    'lease_expires_at',v_row.lease_expires_at,'expires_at',v_row.expires_at,
    'takeover_count',v_row.takeover_count,'authority_epoch',v_row.authority_epoch,
    'order_id',v_row.order_id,'assessment_id',v_row.assessment_id,'score_run_id',v_row.score_run_id,
    'fulfilment_id',v_row.fulfilment_id,'report_id',v_row.report_id,'recipient',v_row.recipient_email);
end;
$function$;

revoke all on function public.ensure_manual_premium_report_fulfilment(text,text)
  from public,anon,service_role;
grant execute on function public.ensure_manual_premium_report_fulfilment(text,text) to authenticated;
revoke all on function public.register_phase14_manual_final_storage_cleanup(text,text,text,uuid,text,uuid)
  from public,anon,service_role;
grant execute on function public.register_phase14_manual_final_storage_cleanup(text,text,text,uuid,text,uuid)
  to authenticated;
revoke all on function public.admin_terminal_phase14_generation_publication(jsonb)
  from public,anon,service_role;
grant execute on function public.admin_terminal_phase14_generation_publication(jsonb) to authenticated;
revoke all on function public.recover_phase14_worker_capability_lease(jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.recover_phase14_worker_capability_lease(jsonb,text) to service_role;
revoke all on function public.terminal_phase14_generation_publication(jsonb,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.terminal_phase14_generation_publication(jsonb,text,text) to service_role;

-- Normalize the exact early-production ACL/constraint/storage variants to the
-- canonical disabled foundation without touching stored objects or rows.
revoke insert,select,update,delete on table public.app_settings
  from anon,authenticated,service_role;
revoke insert,select,update,delete on table public.email_events
  from anon,authenticated;
revoke select on table public.report_fulfilments,public.report_generation_runs
  from service_role;
grant execute on function public.set_updated_at() to public,anon,authenticated,service_role;
do $phase14_production_constraint_name_convergence$
begin
  if exists(select 1 from pg_constraint where conrelid='public.report_fulfilments'::regclass
      and conname='report_fulfilments_idempotency_key_key')
     and not exists(select 1 from pg_constraint where conrelid='public.report_fulfilments'::regclass
      and conname='report_fulfilments_idempotency_key_unique') then
    alter table public.report_fulfilments rename constraint
      report_fulfilments_idempotency_key_key to report_fulfilments_idempotency_key_unique;
  end if;
end;
$phase14_production_constraint_name_convergence$;
update storage.buckets set file_size_limit=15728640,
  allowed_mime_types=array['application/pdf']::text[] where id='generated-reports';

-- Split publication and post-publication evidence APIs are not runtime routes.
revoke all on function public.publish_premium_report_generation(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.link_premium_report_generation_run(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.record_phase14_report_generated(uuid,uuid,uuid,text,text,jsonb)
  from public,anon,authenticated,service_role;
revoke all on all functions in schema phase14_private from public,anon,authenticated,service_role;
revoke all on all tables in schema phase14_private from public,anon,authenticated,service_role;
revoke all on schema phase14_private from public,anon,authenticated,service_role;

commit;
