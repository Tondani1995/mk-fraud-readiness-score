-- Revised Comprehensive reports could not be finalised in production (15 November 2026, order MKORD-2026-DEC6F8A6):
-- guard_comprehensive_manuscript_provenance, added to production outside the repository's migrations, requires the
-- scored Comprehensive pipeline's provenance columns on the generation attempt (final narrative, validation, evidence
-- checksum, resolved model, preparation time). The revised pipeline records its provenance in the review store instead:
-- a validated checkpoint holding the manuscript and the full audit package, written for this attempt before any report is
-- composed (readiness_review.generation_checkpoints). The isolated test database never had this guard, so the restricted
-- test did not see the conflict.
--
-- For a revised (readiness_review) assessment the guard now requires that validated audit package for this exact
-- attempt and order, and refuses without it. Every other Comprehensive attempt is checked exactly as before.
create or replace function public.guard_comprehensive_manuscript_provenance()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_is_comprehensive boolean;
  v_validation_mode text;
  v_revised boolean;
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

  -- Revised assessments: the validated audit package for this attempt is the manuscript's provenance.
  select exists (
    select 1 from public.orders o join public.assessments a on a.id = o.assessment_id
    where o.id = new.order_id and a.assessment_mode = 'readiness_review'
  ) into v_revised;
  if v_revised then
    if exists (
      select 1
      from readiness_review.generation_checkpoints k
      join public.orders o on o.order_reference = k.order_reference
      where o.id = new.order_id
        and k.attempt_id = new.id::text
        and k.stage = 'validated'
        and k.manuscript is not null
        and k.audit_package is not null
    ) then
      return new;
    end if;
    raise exception 'comprehensive_revised_audit_package_missing';
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
$function$;
