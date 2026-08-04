-- RC1: follow both routes from a provider attestation to its journey.
--
-- Defect
-- ------
-- The synthetic cleanup removed phase14_provider_attestations by authorization_id only. That is
-- the delivery-side link. Attestations are also written when a signed provider callback is
-- recorded against an email event, and those rows carry email_event_id with a null
-- authorization_id until a delivery authorisation exists.
--
-- A certification journey whose four transactional sends were delivered -- but which had not yet
-- reached a delivery authorisation -- therefore left those attestations in place, and their
-- foreign key onto email_events blocked the cleanup:
--
--   23503  update or delete on table "email_events" violates foreign key constraint
--          "phase14_provider_attestations_email_event_id_fkey"
--
-- The route reported this as an unclassified refusal, which is correct behaviour for an
-- unrecognised database error but told the operator nothing.
--
-- Correction
-- ----------
-- Attestations and their consumptions are now resolved by either route: the delivery
-- authorisation, or the email event belonging to the journey's assessments. Both remain scoped to
-- the synthetic journey -- no attestation is reachable that does not belong to one of its
-- assessments -- and both are counted in the audited result.
--
-- Nothing else in the function changes: the same authority checks, the same Storage proof, the
-- same provenance requirement, the same FK-safe ordering and the same fingerprint-only audit.

begin;

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
  v_report_ids uuid[];
  v_authorization_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
  v_freeze_epoch bigint;
  v_actual_count integer;
  v_actual_fingerprint text;
  v_remaining integer;
begin
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

  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s
  where s.setting_key = 'rc1_synthetic_certification_cleanup';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_synthetic_cleanup:not_enabled_in_this_environment';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex'
  );

  select pg_catalog.array_agg(o.id) into v_org_ids
  from public.organisations o
  where o.synthetic_certification_ref = p_reference;

  select pg_catalog.array_agg(a.id) into v_assessment_ids
  from public.assessments a where a.organisation_id = any(coalesce(v_org_ids, array[]::uuid[]));
  v_assessment_ids := coalesce(v_assessment_ids, array[]::uuid[]);

  select pg_catalog.array_agg(r.id) into v_report_ids
  from public.reports r where r.assessment_id = any(v_assessment_ids);
  v_report_ids := coalesce(v_report_ids, array[]::uuid[]);

  -- Re-derive the targets independently of what the caller was told, from the report rows that
  -- still exist right now, and refuse unless they are the ones that were authorised.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            pg_catalog.string_agg(t.bucket || E'\n' || t.path, E'\n' order by t.bucket, t.path),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  into v_actual_count, v_actual_fingerprint
  from (
    select r.storage_bucket as bucket, r.storage_path as path
    from public.reports r
    where r.id = any(v_report_ids)
      and r.storage_bucket is not null
      and r.storage_path is not null
  ) t;

  if v_actual_count <> p_expected_target_count
     or v_actual_fingerprint <> p_expected_target_fingerprint then
    raise exception 'rc1_synthetic_cleanup:storage_target_mismatch';
  end if;

  -- Independent absence check. The route says it removed the objects; this is the database
  -- refusing to take its word for it.
  select pg_catalog.count(*)::integer into v_remaining
  from storage.objects so
  join public.reports r
    on so.bucket_id = r.storage_bucket and so.name = r.storage_path
  where r.id = any(v_report_ids);

  if coalesce(v_remaining, 0) > 0 then
    raise exception 'rc1_synthetic_cleanup:storage_objects_remaining';
  end if;

  -- Exact successful retry: nothing left to resolve, recorded rather than raised.
  if v_org_ids is null or pg_catalog.array_length(v_org_ids, 1) is null then
    insert into public.rc1_synthetic_cleanup_audit (
      synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, deleted_counts,
      storage_target_count, storage_verified_absent_count, storage_target_fingerprint
    ) values (
      p_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', null,
      jsonb_build_object('organisations', 0, 'already_clean', true),
      v_actual_count, v_actual_count, v_actual_fingerprint
    );
    return jsonb_build_object('reference', p_reference, 'already_clean', true, 'deleted', '{}'::jsonb);
  end if;

  select pg_catalog.array_agg(o.id) into v_order_ids
  from public.orders o where o.assessment_id = any(v_assessment_ids);
  v_order_ids := coalesce(v_order_ids, array[]::uuid[]);

  perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', p_reference, true);

  v_counts := v_counts || jsonb_build_object(
    'storage_targets_verified_absent', v_actual_count
  );

  delete from public.customer_report_access_tokens t where t.report_id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('customer_report_access_tokens', v_deleted);

  delete from public.email_provider_events e
  where e.email_event_id in (select id from public.email_events where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_provider_events', v_deleted);

  select pg_catalog.array_agg(d.id) into v_authorization_ids
  from public.report_delivery_authorizations d where d.assessment_id = any(v_assessment_ids);
  v_authorization_ids := coalesce(v_authorization_ids, array[]::uuid[]);

  delete from public.report_delivery_finalizations f where f.authorization_id = any(v_authorization_ids);

  -- Provider attestations reach the journey by two independent routes: a delivery authorisation,
  -- and the email event a signed provider callback was recorded against. A journey whose sends
  -- were delivered but never reached a delivery authorisation carries attestations with a null
  -- authorization_id, and those still hold a foreign key onto email_events -- which is exactly
  -- what blocked the email_events delete below. Both routes are followed here.
  delete from public.phase14_provider_attestation_consumptions c
  where c.authorization_id = any(v_authorization_ids)
     or c.attestation_id in (
       select a.id from public.phase14_provider_attestations a
       where a.authorization_id = any(v_authorization_ids)
          or a.email_event_id in (
            select e.id from public.email_events e where e.assessment_id = any(v_assessment_ids)));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestation_consumptions', v_deleted);

  delete from public.phase14_provider_attestations a
  where a.authorization_id = any(v_authorization_ids)
     or a.email_event_id in (
       select e.id from public.email_events e where e.assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestations', v_deleted);

  delete from public.manual_report_delivery_attempts d where d.order_id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('manual_report_delivery_attempts', v_deleted);

  delete from public.report_quality_diagnostics q
  where q.attempt_id in (select id from public.manual_report_generation_attempts where order_id = any(v_order_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_quality_diagnostics', v_deleted);

  delete from public.manual_report_generation_attempts g where g.order_id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('manual_report_generation_attempts', v_deleted);

  delete from public.report_delivery_authorizations d where d.id = any(v_authorization_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_delivery_authorizations', v_deleted);

  delete from public.email_events e where e.assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_events', v_deleted);

  delete from public.report_generation_claims c where c.assessment_id = any(v_assessment_ids);
  delete from public.report_events re where re.report_id = any(v_report_ids);
  delete from public.reports r where r.id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('reports', v_deleted);

  delete from public.report_fulfilments f where f.assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_fulfilments', v_deleted);

  delete from public.score_question_traces t
  where t.score_run_id in (select id from public.score_runs where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('score_question_traces', v_deleted);

  delete from public.maturity_cap_events m
  where m.score_run_id in (select id from public.score_runs where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('maturity_cap_events', v_deleted);

  delete from public.score_domain_results d
  where d.score_run_id in (select id from public.score_runs where assessment_id = any(v_assessment_ids));

  update public.assessments set current_score_run_id = null where id = any(v_assessment_ids);

  delete from public.score_runs s where s.assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('score_runs', v_deleted);

  delete from public.payment_transition_events p where p.order_id = any(v_order_ids);
  delete from public.payment_automation_records p where p.order_id = any(v_order_ids);
  delete from public.payment_sessions p where p.order_id = any(v_order_ids);
  delete from public.order_events o where o.order_id = any(v_order_ids);
  delete from public.orders o where o.id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('orders', v_deleted);

  delete from public.data_requests d where d.assessment_id = any(v_assessment_ids);
  delete from public.assessment_answers a where a.assessment_id = any(v_assessment_ids);
  delete from public.exposure_answers e where e.assessment_id = any(v_assessment_ids);
  delete from public.assessment_tokens t where t.assessment_id = any(v_assessment_ids);
  delete from public.assessment_events e where e.assessment_id = any(v_assessment_ids);
  delete from public.assessment_resume_events e where e.assessment_id = any(v_assessment_ids);
  delete from public.audit_logs l where l.assessment_id = any(v_assessment_ids);

  delete from public.assessments a where a.id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('assessments', v_deleted);

  delete from public.respondents r where r.organisation_id = any(v_org_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('respondents', v_deleted);

  delete from public.organisations o where o.id = any(v_org_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('organisations', v_deleted);

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  insert into public.rc1_synthetic_cleanup_audit (
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

commit;
