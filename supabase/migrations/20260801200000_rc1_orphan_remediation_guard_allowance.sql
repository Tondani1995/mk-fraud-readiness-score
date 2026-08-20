-- RC1: teach the provider-attestation immutability guard about audited orphan remediation.
--
-- Defect
-- ------
-- 20260801160000 added rc1_execute_orphan_remediation, and 20260801090000 had already given
-- guard_phase14_provider_attestation_immutable a DELETE allowance for the synthetic-journey
-- cleanup. The two are mutually exclusive by construction.
--
-- The synthetic allowance permits a DELETE only when provenance resolves from the attestation --
-- through its delivery authorisation or its email event -- to an organisation carrying a
-- MKTEST-RC1- reference. An orphan attestation has no delivery authorisation and no surviving
-- email event; having no link at all is precisely what makes it an orphan. It can therefore never
-- satisfy that condition, and execute was refused with
--
--   P0001  phase14_provider_attestation_immutable
--
-- leaving the seven attestations in place, which in turn blocked the orphan email_events delete
-- with the foreign key phase14_provider_attestations_email_event_id_fkey (23503). Attestations are
-- the only blocker: the seven orphan email_provider_events and the consumptions delete cleanly.
--
-- Correction
-- ----------
-- A second DELETE-only branch, as narrow as the first, and nothing else changes.
--
-- The existing synthetic branch is reproduced verbatim and is evaluated first, so a linked
-- MKTEST-RC1 journey cleanup behaves exactly as it did before this migration. UPDATE is not
-- relaxed: an attestation records what a provider asserted, and neither control rewrites evidence.
-- An ordinary DELETE, with no audited control in the call stack, is refused exactly as before.
--
-- Two independent conditions must BOTH hold for the new branch to permit a DELETE.
--
-- 1. Execution context. rc1.orphan_remediation_context must be set, and the PL/pgSQL call stack
--    must contain the frame for public.rc1_execute_orphan_remediation(text,text,integer).
--
--    The setting alone is deliberately not sufficient. Any caller can set a custom GUC, so a
--    marker on its own proves nothing about who is running -- which is why the guard reads its own
--    call stack via GET DIAGNOSTICS ... PG_CONTEXT and requires the audited function's frame to be
--    present. A stack frame cannot be fabricated: the only way to obtain it is to actually be
--    executing inside that function, which enforces platform_admin at AAL2, explicit environment
--    enablement, a RELEASED database, and a re-derived fingerprint and total.
--
--    The frame is matched on its exact schema-qualified signature. PL/pgSQL renders the frame as
--    "PL/pgSQL function public.rc1_execute_orphan_remediation(text,text,integer) line N at ...",
--    schema-qualified because the function runs with search_path = '', so a same-named function in
--    another schema renders under that schema and does not match, and an overload renders with its
--    own argument list and does not match either. Neither authenticated nor service_role holds
--    CREATE on schema public, so neither can introduce a public function to spoof the frame.
--
--    set_config(..., is_local => true) makes the marker transaction-local: it is discarded on
--    commit, on rollback, and on subtransaction abort, so it cannot survive an exception or leak
--    into a later statement. rc1_execute_orphan_remediation also clears it immediately after its
--    deletes, so the window is the four DELETE statements and nothing more.
--
-- 2. Proven orphanhood of the row itself. The guard re-proves, at trigger time and from OLD, that
--    the row holds no surviving business or delivery relationship -- it does not trust the caller,
--    and it does not call rc1_orphan_remediation_candidates(), whose result necessarily changes as
--    the deletion proceeds. The predicate is the attestation arm of that function inlined, so the
--    two cannot disagree about what "orphan" means:
--
--      no surviving report_delivery_authorizations row for authorization_id, AND
--      email_event_id is null, or no surviving email_events row, or the surviving email event is
--      itself fully unlinked (no assessment, order, report or data request).
--
--    The two conditions are combined with AND, so a missing email_event_id never makes a row
--    eligible while a delivery authorisation survives, and a deleted or missing email event never
--    makes a row eligible while any other link survives.
--
--    phase14_provider_attestations holds exactly two outgoing foreign keys, authorization_id and
--    email_event_id; every further relation the candidate classifier considers -- organisation,
--    respondent, assessment, score run, order, report, generation attempt, access token, data
--    request -- is reachable only through one of those two, so proving both are dead proves the row
--    is unreachable from any business record. Rather than trust that snapshot, the guard asserts it
--    from the catalogue on every orphan-branch DELETE: if the table ever gains a third foreign key,
--    the two-link proof would no longer be complete, and the guard refuses instead of silently
--    permitting a row whose new relation it does not check.
--
-- Nothing here widens the synthetic cleanup, and no control gains the ability to remove a row that
-- still references a business record.

begin;

-- ---------------------------------------------------------------------------
-- 1. The guard.
--
-- SECURITY INVOKER with an empty search path, exactly as accepted in 20260801090000. Reproduced in
-- full because create or replace rewrites the whole body; the synthetic branch below is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.guard_phase14_provider_attestation_immutable()
returns trigger language plpgsql set search_path=''
as $$
declare
  v_cleanup_ref text;
  v_synthetic_ref text;
  v_orphan_context text;
  v_stack text;
  v_fk_columns text[];
begin
  if tg_op = 'DELETE' then
    -- Branch 1: audited synthetic-journey cleanup. Verbatim from 20260801090000.
    v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);
    if v_cleanup_ref is not null and v_cleanup_ref <> '' then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.organisations o
      where o.id in (
        -- Route 1: the delivery authorisation this attestation was recorded against.
        select a.organisation_id
        from public.report_delivery_authorizations d
        join public.assessments a on a.id = d.assessment_id
        where d.id = old.authorization_id
        union
        -- Route 2: the email event a signed provider callback was recorded against.
        select a.organisation_id
        from public.email_events e
        join public.assessments a on a.id = e.assessment_id
        where e.id = old.email_event_id
      )
        and o.synthetic_certification_ref = v_cleanup_ref
      limit 1;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;

    -- Branch 2: audited orphan remediation.
    v_orphan_context := pg_catalog.current_setting('rc1.orphan_remediation_context', true);
    if v_orphan_context = 'active' then
      get diagnostics v_stack = pg_context;

      -- The marker says an orphan remediation claims to be running; the stack proves it is.
      if pg_catalog.strpos(
           v_stack,
           'PL/pgSQL function public.rc1_execute_orphan_remediation(text,text,integer) line '
         ) > 0
      then
        -- The two-link orphan proof below is only complete while these are the only two links.
        select pg_catalog.array_agg(distinct a.attname order by a.attname)
        into v_fk_columns
        from pg_catalog.pg_constraint con
        join pg_catalog.pg_class c on c.oid = con.conrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_attribute a
          on a.attrelid = c.oid and a.attnum = any (con.conkey) and not a.attisdropped
        where n.nspname = 'public'
          and c.relname = 'phase14_provider_attestations'
          and con.contype = 'f';

        if v_fk_columns is distinct from array['authorization_id', 'email_event_id']::text[] then
          raise exception 'phase14_provider_attestation_immutable:orphan_proof_incomplete';
        end if;

        -- Proven from OLD, not from the caller. Mirrors the attestation arm of
        -- rc1_orphan_remediation_candidates() so the guard and the classifier cannot drift.
        if (old.authorization_id is null
             or not exists (select 1
                            from public.report_delivery_authorizations d
                            where d.id = old.authorization_id))
           and (old.email_event_id is null
             or not exists (select 1
                            from public.email_events e
                            where e.id = old.email_event_id)
             or exists (select 1
                        from public.email_events e
                        where e.id = old.email_event_id
                          and e.assessment_id is null
                          and e.order_id is null
                          and e.report_id is null
                          and e.data_request_id is null))
        then
          return old;
        end if;
      end if;
    end if;
  end if;

  raise exception 'phase14_provider_attestation_immutable';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The execute function.
--
-- Reproduced verbatim from 20260801160000 apart from the two set_config calls that open and close
-- the execution context around the deletes. Every existing check -- AAL2 authority, enablement,
-- RELEASED state, re-derived fingerprint and total, the linked-candidate sweep and the candidate
-- bound -- runs before the context is opened, and all of it stays inside one transaction, so any
-- failure on any candidate rolls back every deletion and discards the marker with it.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_execute_orphan_remediation(
  p_reason text,
  p_expected_fingerprint text,
  p_expected_total integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_candidate_limit constant integer := 50;
  v_actor jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_reason_fingerprint text;
  v_enabled boolean;
  v_state text;
  v_total integer;
  v_fingerprint text;
  v_linked integer;
  v_freeze_epoch bigint;
  v_deleted integer;
  v_counts jsonb := '{}'::jsonb;
  v_email_ids uuid[];
  v_provider_ids uuid[];
  v_attestation_ids uuid[];
begin
  v_actor := public.rc1_require_platform_admin(true);

  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_orphan_remediation:meaningful_reason_required';
  end if;
  if p_expected_fingerprint is null or p_expected_fingerprint !~ '^[0-9a-f]{64}$'
     or p_expected_total is null or p_expected_total < 0 then
    raise exception 'rc1_orphan_remediation:expected_result_required';
  end if;

  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s where s.setting_key = 'rc1_orphan_remediation';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_orphan_remediation:not_enabled_in_this_environment';
  end if;

  select state into v_state from public.rc1_operation_freeze_state where singleton = true;
  if coalesce(v_state, '') <> 'RELEASED' then
    raise exception 'rc1_orphan_remediation:database_not_released';
  end if;

  -- Re-derive rather than trusting what prepare reported.
  select pg_catalog.count(*)::integer into v_total from public.rc1_orphan_remediation_candidates();
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(pg_catalog.string_agg(relation || ':' || record_id::text, E'\n' order by relation, record_id), ''),
        'UTF8'), 'sha256'), 'hex')
  into v_fingerprint
  from public.rc1_orphan_remediation_candidates();

  if v_total <> p_expected_total then
    raise exception 'rc1_orphan_remediation:candidate_total_mismatch';
  end if;
  if v_fingerprint <> p_expected_fingerprint then
    raise exception 'rc1_orphan_remediation:candidate_fingerprint_mismatch';
  end if;
  if v_total > c_candidate_limit then
    raise exception 'rc1_orphan_remediation:candidate_limit_exceeded';
  end if;

  select pg_catalog.count(*)::integer into v_linked
  from public.rc1_orphan_remediation_candidates() c
  where (c.relation = 'email_events' and exists (
           select 1 from public.email_events e
           where e.id = c.record_id
             and (e.assessment_id is not null or e.order_id is not null
                  or e.report_id is not null or e.data_request_id is not null)))
     or (c.relation = 'email_provider_events' and exists (
           select 1 from public.email_provider_events pe
           join public.email_events e on e.id = pe.email_event_id
           where pe.id = c.record_id
             and (e.assessment_id is not null or e.order_id is not null
                  or e.report_id is not null or e.data_request_id is not null)))
     or (c.relation = 'phase14_provider_attestations' and exists (
           select 1 from public.phase14_provider_attestations a
           where a.id = c.record_id
             and (exists (select 1 from public.report_delivery_authorizations d where d.id = a.authorization_id)
                  or exists (select 1 from public.email_events e
                             where e.id = a.email_event_id
                               and (e.assessment_id is not null or e.order_id is not null
                                    or e.report_id is not null or e.data_request_id is not null)))));
  if v_linked > 0 then
    raise exception 'rc1_orphan_remediation:candidate_still_linked';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex');

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  -- Retry safety: an already-clean environment records the attempt and changes nothing. The
  -- execution context is never opened on this path, because nothing is deleted on it.
  if v_total = 0 then
    insert into public.rc1_orphan_remediation_audit (
      reason_fingerprint, actor_fingerprint, freeze_epoch,
      candidate_fingerprint, candidate_total, deleted_counts
    ) values (
      v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch,
      v_fingerprint, 0, jsonb_build_object('already_clean', true)
    );
    return jsonb_build_object('already_clean', true, 'total', 0, 'deleted', '{}'::jsonb);
  end if;

  select pg_catalog.array_agg(record_id) into v_email_ids
  from public.rc1_orphan_remediation_candidates() where relation = 'email_events';
  select pg_catalog.array_agg(record_id) into v_provider_ids
  from public.rc1_orphan_remediation_candidates() where relation = 'email_provider_events';
  select pg_catalog.array_agg(record_id) into v_attestation_ids
  from public.rc1_orphan_remediation_candidates() where relation = 'phase14_provider_attestations';
  v_email_ids := coalesce(v_email_ids, array[]::uuid[]);
  v_provider_ids := coalesce(v_provider_ids, array[]::uuid[]);
  v_attestation_ids := coalesce(v_attestation_ids, array[]::uuid[]);

  -- Open the execution context. Transaction-local, and paired with the reset below so it covers
  -- the deletes and nothing else. The attestation guard additionally proves this frame is real.
  perform pg_catalog.set_config('rc1.orphan_remediation_context', 'active', true);

  -- Dependency-safe order, in this single transaction: consumptions reference attestations,
  -- attestations and provider events reference email events.
  delete from public.phase14_provider_attestation_consumptions c
  where c.attestation_id = any(v_attestation_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestation_consumptions', v_deleted);

  delete from public.phase14_provider_attestations a where a.id = any(v_attestation_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestations', v_deleted);

  delete from public.email_provider_events pe where pe.id = any(v_provider_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_provider_events', v_deleted);

  delete from public.email_events e where e.id = any(v_email_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_events', v_deleted);

  -- Close it immediately. A rollback would discard it anyway; this keeps the window minimal even
  -- on the success path, so the audit insert below runs with no allowance in force.
  perform pg_catalog.set_config('rc1.orphan_remediation_context', '', true);

  insert into public.rc1_orphan_remediation_audit (
    reason_fingerprint, actor_fingerprint, freeze_epoch,
    candidate_fingerprint, candidate_total, deleted_counts
  ) values (
    v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch,
    v_fingerprint, v_total, v_counts
  );

  return jsonb_build_object('already_clean', false, 'total', v_total, 'deleted', v_counts);
end;
$$;

revoke all on function public.rc1_execute_orphan_remediation(text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_execute_orphan_remediation(text,text,integer) to authenticated;

comment on function public.rc1_execute_orphan_remediation(text,text,integer) is
  'Removes provider rows that reference no surviving business record, after re-deriving the candidate set and proving it still matches the fingerprint and total returned by rc1_prepare_orphan_remediation. Requires platform_admin at AAL2, explicit environment enablement and a RELEASED database. Refuses on any linked candidate, count above the certification-sized bound, stale fingerprint or mismatched total. Opens a transaction-local execution context around its deletes only, which the provider-attestation immutability guard verifies against its own call stack before permitting a DELETE, and which the guard additionally requires the row itself to prove orphanhood for. Audits counts and fingerprints only. Not a customer erasure facility.';

commit;
