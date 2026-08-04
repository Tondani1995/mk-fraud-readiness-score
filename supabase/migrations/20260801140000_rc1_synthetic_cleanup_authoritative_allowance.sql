-- RC1: let the audited cleanup remove Phase 14 owned event rows.
--
-- Defect
-- ------
-- The first journey to produce a real PDF could not be cleaned up:
--
--   P0001  phase14_authoritative_rpc_required:report_events:DELETE
--
-- guard_phase14_authoritative_mutation protects assessment_events, audit_logs, email_events,
-- email_provider_events and report_events. Once a row carries a phase14_operation_ref it may only
-- be mutated by a recognised authoritative transition -- authenticated_rpc, worker_rpc, migration
-- and so on. The audited synthetic cleanup is none of those, so the report_events written during
-- generation blocked their own removal, which in turn blocked reports, then score_runs (foreign
-- key), then assessments and organisations.
--
-- Only report_events actually blocked here: the journey's other event rows carried no
-- phase14_operation_ref. The guard is nonetheless shared, so the allowance is written once.
--
-- This is the same class of gap already corrected for score runs, score traces, locked answers and
-- provider attestations: a guard that is right for ordinary operation and has no notion of an
-- audited synthetic-certification cleanup.
--
-- Correction
-- ----------
-- The guard gains the identical allowance and nothing else. A DELETE is permitted only when BOTH
--
--   1. the transaction-local marker rc1.synthetic_cleanup_ref is set, which only
--      rc1_cleanup_synthetic_certification sets and only for its own transaction; and
--   2. provenance is proven from the row itself to an organisation whose
--      synthetic_certification_ref equals that marker, by whichever link the row actually has --
--      assessment_id, report_id, or email_event_id.
--
-- synthetic_certification_ref carries a CHECK constraining it to ^MKTEST-RC1-<yyyymmdd>-<nn>$,
-- which is what confines the allowance to synthetic certification data.
--
-- UPDATE and INSERT are not relaxed at all, and the phase14_operation_ref immutability rule, the
-- reference-stamping behaviour and every authoritative-context name are untouched. A row that
-- cannot prove provenance is refused exactly as before.

begin;

create or replace function public.guard_phase14_authoritative_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_old_owned boolean := false;
  v_new_owned boolean := false;
  v_context text := nullif(current_setting('phase14.authoritative_transition', true), '');
  v_transition_owner name;
  v_cleanup_ref text;
  v_synthetic_ref text;
begin
  if tg_table_name = 'phase14_operational_alerts' then
    v_old_owned := tg_op in ('UPDATE','DELETE');
    v_new_owned := tg_op in ('INSERT','UPDATE');
  else
    v_old_owned := public.phase14_shared_row_was_owned(tg_table_name, v_old);
    v_new_owned := public.phase14_shared_row_was_owned(tg_table_name, v_new);
  end if;
  if tg_table_name='email_provider_events' and tg_op in ('INSERT','UPDATE')
     and not v_new_owned and nullif(v_new->>'email_event_id','') is not null then
    v_new_owned:=exists(select 1 from public.email_events e
      where e.id=(v_new->>'email_event_id')::uuid and e.phase14_operation_ref is not null);
  end if;

  if tg_op = 'DELETE' then
    v_cleanup_ref := nullif(current_setting('rc1.synthetic_cleanup_ref', true), '');
    if v_cleanup_ref is not null then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.organisations o
      where o.id in (
        select a.organisation_id from public.assessments a
        where a.id = nullif(v_old->>'assessment_id','')::uuid
        union
        select a.organisation_id from public.reports r
        join public.assessments a on a.id = r.assessment_id
        where r.id = nullif(v_old->>'report_id','')::uuid
        union
        select a.organisation_id from public.email_events e
        join public.assessments a on a.id = e.assessment_id
        where e.id = nullif(v_old->>'email_event_id','')::uuid
      )
        and o.synthetic_certification_ref = v_cleanup_ref
      limit 1;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

  select pg_get_userbyid(p.proowner) into v_transition_owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'phase14_require_security'
  order by p.oid limit 1;

  if v_old_owned or v_new_owned then
    if current_user is distinct from v_transition_owner
       or coalesce(v_context,'') not in (
         'authenticated_rpc','fulfilment_queue_rpc','fulfilment_transition_rpc',
         'gate_administration','gate_invalidation','migration','operational_alert_rpc',
         'policy_approval','runtime_secret_rotation','trusted_provider_attestation',
         'worker_authorization','worker_attested_rpc','worker_rpc','worker_completion'
       ) then
      raise exception 'phase14_authoritative_rpc_required:%:%', tg_table_name, tg_op;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' and tg_op = 'UPDATE' and v_old_owned then
    if old.phase14_operation_ref is distinct from new.phase14_operation_ref then
      raise exception 'phase14_operation_ref_immutable:%', tg_table_name;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' then
    if tg_op in ('INSERT','UPDATE') and v_new_owned
       and new.phase14_operation_ref is null then
      new.phase14_operation_ref := 'phase14:' || replace(tg_table_name,'_','-') || ':' || new.id::text;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

commit;
