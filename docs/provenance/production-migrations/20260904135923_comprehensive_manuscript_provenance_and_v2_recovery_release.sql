-- Two bounded forward corrections for the Comprehensive current path.
--
-- 1. FAIL CLOSED ON A DISCARDED MANUSCRIPT.
--    The first real Preview Comprehensive package reached REPORT_READY, release and delivery with
--    manual_report_generation_attempts.final_narrative_json null: the Comprehensive branch rendered
--    the customer PDF from an in-memory manuscript and never crossed the provenance boundary, which
--    was only ever wired for Essential. The accepted narrative therefore stopped existing when the
--    request ended, and a provider-free revision of a released report became impossible.
--
-- 2. A NAMED, SINGLE-PURPOSE RECOVERY-REVISION SEAM.
--
-- Nothing here rewrites history: V1 keeps its row, checksum, storage object, delivery ledger and
-- token record, and no earlier migration is modified.

create or replace function public.guard_comprehensive_manuscript_provenance()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_is_comprehensive boolean;
  v_validation_mode text;
begin
  if new.status is distinct from 'REPORT_READY' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'REPORT_READY' then
    return new;
  end if;

  select exists (
    select 1
    from public.orders o
    join public.products p on p.id = o.product_id
    where o.id = new.order_id
      and p.product_code = 'mk_validated_assessment'
  ) into v_is_comprehensive;
  if not coalesce(v_is_comprehensive, false) then
    return new;
  end if;

  v_validation_mode := new.final_validation_json->>'validation_mode';
  if v_validation_mode = 'legacy_pdf_native_recovery_revision' then
    if coalesce(new.final_validation_json->>'source_report_checksum', '') !~ '^[0-9a-f]{64}$'
       or coalesce(new.final_validation_json->>'report_checksum', '') !~ '^[0-9a-f]{64}$'
       or coalesce((new.final_validation_json->>'provider_generation_reused')::boolean, false) is not true then
      raise exception 'comprehensive_recovery_revision_provenance_invalid';
    end if;
    return new;
  end if;

  if new.final_narrative_json is null
     or new.final_validation_json is null
     or coalesce(new.evidence_checksum, '') !~ '^[0-9a-f]{64}$'
     or coalesce(pg_catalog.btrim(new.resolved_model), '') = ''
     or new.narrative_prepared_at is null then
    raise exception 'comprehensive_manuscript_provenance_missing';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_comprehensive_manuscript_provenance
  on public.manual_report_generation_attempts;
create trigger trg_guard_comprehensive_manuscript_provenance
  before insert or update on public.manual_report_generation_attempts
  for each row execute function public.guard_comprehensive_manuscript_provenance();

create or replace function public.supersede_prior_version_report_access(
  p_current_report_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_current public.reports%rowtype;
  v_prior public.reports%rowtype;
  v_note text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_revoked jsonb;
begin
  perform public.rc1_require_operation_open('worker');
  if pg_catalog.length(v_note) < 5 then raise exception 'access_token_reason_too_short'; end if;

  select * into v_current from public.reports where id = p_current_report_id;
  if not found or v_current.status <> 'released' then
    raise exception 'supersede_access_current_report_not_released';
  end if;
  if v_current.supersedes_report_id is null then
    raise exception 'supersede_access_no_prior_version';
  end if;

  select * into v_prior from public.reports where id = v_current.supersedes_report_id for update;
  if not found or v_prior.status <> 'superseded' then
    raise exception 'supersede_access_prior_version_still_live';
  end if;

  with revoked as (
    update public.customer_report_access_tokens
    set revoked_at = pg_catalog.now(),
        revoked_reason = v_note,
        updated_at = pg_catalog.now()
    where report_id = v_prior.id and revoked_at is null
    returning id, purpose, access_count
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(revoked)), '[]'::jsonb) into v_revoked from revoked;

  insert into public.report_events (report_id, event_type, actor_user_id, note, metadata_json)
  values (
    v_prior.id, 'access_revoked', null, v_note,
    pg_catalog.jsonb_build_object(
      'superseded_by_report_id', v_current.id,
      'superseded_by_reference', v_current.report_reference,
      'revoked_tokens', v_revoked
    )
  );

  return pg_catalog.jsonb_build_object(
    'prior_report_id', v_prior.id,
    'prior_report_reference', v_prior.report_reference,
    'current_report_id', v_current.id,
    'revoked_tokens', v_revoked
  );
end;
$$;

revoke all on function public.supersede_prior_version_report_access(uuid, text) from public, anon, authenticated;
grant execute on function public.supersede_prior_version_report_access(uuid, text) to service_role;
