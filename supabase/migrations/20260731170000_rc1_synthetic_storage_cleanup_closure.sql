-- RC1: close the synthetic-cleanup Storage gap.
--
-- Defect
-- ------
-- 20260731130000 correctly stopped the prohibited direct `delete from storage.objects`, but it
-- replaced removal with reporting: the function now returns `storage_objects_pending` and deletes
-- the database rows regardless. The route invokes only that RPC and never calls the Storage API.
--
-- A successful certification journey would therefore delete the report row that names the object
-- and leave the generated PDF orphaned in a private bucket, with nothing left in the database to
-- identify it by. The gap is worse than the original defect: the original failed closed and
-- removed nothing, this one succeeds while leaving customer-shaped bytes behind.
--
-- Correction
-- ----------
-- Removal is split across the only two layers that can each do their half safely:
--
--   * The database owns authority and target resolution. rc1_prepare_synthetic_storage_cleanup
--     requires platform_admin at AAL2 and environment enablement, proves synthetic provenance,
--     and derives the exact bucket/path pairs from the synthetic report rows themselves. Nothing
--     the caller supplies can influence which objects are named.
--
--   * The Storage API owns byte removal, because SQL is not permitted to do it. The route performs
--     that step server-side against the resolved targets only.
--
-- The database then refuses to delete anything until removal is proven. The four-argument
-- rc1_cleanup_synthetic_certification re-derives the fingerprint and count from the report rows
-- that still exist, compares them with the authorised preparation result, and independently
-- verifies that no matching storage.objects row remains. Any mismatch, and any surviving object,
-- fails closed with the database rows intact and still identifiable for retry.
--
-- The two-argument form is retained only to refuse. It is the signature the route used before this
-- migration, and leaving it working would leave the bypass in place.
--
-- Nothing here is granted to service_role: the service role is used by the route for the Storage
-- API call alone, after the authenticated AAL2 RPC has decided what may be removed.

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit columns for the Storage evidence.
--
-- Fingerprint and counts only. A raw bucket or path is customer-shaped once real reports exist,
-- so the audit records what was proven, never what it was proven about.
-- ---------------------------------------------------------------------------
alter table public.rc1_synthetic_cleanup_audit
  add column if not exists storage_target_count integer,
  add column if not exists storage_verified_absent_count integer,
  add column if not exists storage_target_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rc1_synthetic_cleanup_audit'::regclass
      and conname = 'rc1_synthetic_cleanup_audit_storage_fingerprint_check'
  ) then
    alter table public.rc1_synthetic_cleanup_audit
      add constraint rc1_synthetic_cleanup_audit_storage_fingerprint_check
      check (storage_target_fingerprint is null or storage_target_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rc1_synthetic_cleanup_audit'::regclass
      and conname = 'rc1_synthetic_cleanup_audit_storage_counts_check'
  ) then
    alter table public.rc1_synthetic_cleanup_audit
      add constraint rc1_synthetic_cleanup_audit_storage_counts_check
      check (
        (storage_target_count is null or storage_target_count >= 0)
        and (storage_verified_absent_count is null or storage_verified_absent_count >= 0)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Target resolution.
--
-- The only place a bucket/path pair is ever produced. It is derived from report rows reachable
-- from an organisation carrying the exact synthetic reference, so a caller can name a journey but
-- never an object.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_prepare_synthetic_storage_cleanup(
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- A certification journey produces one Essential PDF. The bound is deliberately small: it is a
  -- structural assertion that this is a single synthetic journey, not a bulk deletion tool.
  c_target_limit constant integer := 25;
  v_enabled boolean;
  v_org_ids uuid[];
  v_total integer;
  v_distinct integer;
  v_unsafe integer;
  v_targets jsonb;
  v_fingerprint text;
begin
  perform public.rc1_require_platform_admin(true);

  if p_reference is null or p_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$' then
    raise exception 'rc1_synthetic_cleanup:reference_not_synthetic';
  end if;

  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s
  where s.setting_key = 'rc1_synthetic_certification_cleanup';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_synthetic_cleanup:not_enabled_in_this_environment';
  end if;

  select pg_catalog.array_agg(o.id) into v_org_ids
  from public.organisations o
  where o.synthetic_certification_ref = p_reference;
  v_org_ids := coalesce(v_org_ids, array[]::uuid[]);

  -- One statement, no temporary relation: a CREATE TABLE here would run under the RC1
  -- new-relation guard event trigger, and an unqualified temp name cannot resolve under
  -- search_path = '' anyway.
  with targets as (
    select r.storage_bucket as bucket, r.storage_path as path
    from public.reports r
    join public.assessments a on a.id = r.assessment_id
    where a.organisation_id = any(v_org_ids)
      and r.storage_bucket is not null
      and r.storage_path is not null
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(distinct (t.bucket || E'\n' || t.path))::integer,
    pg_catalog.count(*) filter (
      where t.bucket !~ '^[a-z0-9][a-z0-9._-]{1,62}$'
         or pg_catalog.length(t.path) = 0
         or pg_catalog.length(t.path) > 400
         or t.path like '/%'
         or t.path like '%..%'
         or t.path like '%\%'
         or t.path ~ '[[:cntrl:]]'
    )::integer,
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
    ),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('bucket', t.bucket, 'path', t.path)
        order by t.bucket, t.path
      ),
      '[]'::jsonb
    )
  into v_total, v_distinct, v_unsafe, v_fingerprint, v_targets
  from targets t;

  -- Structural safety first: these pairs come from our own rows, so a failure here means the
  -- report table itself is wrong, which is exactly when a deletion must not proceed.
  if coalesce(v_unsafe, 0) > 0 then
    raise exception 'rc1_synthetic_cleanup:unsafe_storage_target';
  end if;
  -- Two report rows naming the same object would make "verified absent" ambiguous.
  if v_total <> v_distinct then
    raise exception 'rc1_synthetic_cleanup:duplicate_storage_target';
  end if;
  if v_total > c_target_limit then
    raise exception 'rc1_synthetic_cleanup:storage_target_limit_exceeded';
  end if;

  return jsonb_build_object(
    'reference', p_reference,
    'target_count', v_total,
    'target_fingerprint', v_fingerprint,
    'targets', v_targets
  );
end;
$$;

revoke all on function public.rc1_prepare_synthetic_storage_cleanup(text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_prepare_synthetic_storage_cleanup(text) to authenticated;

comment on function public.rc1_prepare_synthetic_storage_cleanup(text) is
  'Resolves the exact private Storage targets backing one MKTEST-RC1- synthetic certification journey. Requires platform_admin at AAL2 and explicit environment enablement; derives every bucket/path pair from synthetic report rows so no caller can name an object. Returns a deterministic target fingerprint and count for the fail-closed cleanup to re-prove. Resolution only: it removes nothing.';

-- ---------------------------------------------------------------------------
-- 3. The two-argument entry point now refuses.
--
-- This is the signature that deleted database rows while leaving the object behind. Retaining it
-- as a working function would retain the gap.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_cleanup_synthetic_certification(
  p_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rc1_require_platform_admin(true);
  raise exception 'rc1_synthetic_cleanup:storage_closure_required';
end;
$$;

comment on function public.rc1_cleanup_synthetic_certification(text,text) is
  'Superseded and refusing. This signature deleted the report rows without removing the Storage objects they named. Use rc1_cleanup_synthetic_certification(text,text,text,integer), which refuses until Storage removal has been proven.';

-- ---------------------------------------------------------------------------
-- 4. The fail-closed cleanup.
-- ---------------------------------------------------------------------------
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
  delete from public.phase14_provider_attestation_consumptions c where c.authorization_id = any(v_authorization_ids);
  delete from public.phase14_provider_attestations a where a.authorization_id = any(v_authorization_ids);

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

comment on function public.rc1_cleanup_synthetic_certification(text,text,text,integer) is
  'Audited removal of a single MKTEST-RC1- synthetic certification journey, after Storage removal has been proven. Requires platform_admin at AAL2 and explicit environment enablement; refuses any non-synthetic reference. Re-derives the Storage target fingerprint and count from the report rows that still exist, refuses on any mismatch with the authorised preparation result, and refuses while any matching storage.objects row remains -- leaving the database rows intact and identifiable for retry. Not a customer erasure facility.';

commit;
