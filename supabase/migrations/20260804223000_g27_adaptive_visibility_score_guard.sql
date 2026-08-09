-- G27/G29 corrective pass: allow the adaptive visibility contract through the
-- legacy completed-score guard without weakening legacy score-run invariants.
--
-- Adaptive runs deliberately have no exposure inputs.  When visibility is
-- insufficient they also deliberately have no customer-facing numeric score
-- or maturity.  Legacy (non-adaptive) completed runs retain every existing
-- requirement.

begin;

create or replace function public.guard_score_run_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status public.assessment_status;
  v_cleanup_ref text;
  v_synthetic_ref text;
  v_adaptive boolean := new.adaptive_result_status is not null;
  v_visibility_blocked boolean := new.adaptive_result_status = 'INSUFFICIENT_VISIBILITY';
begin
  if tg_op = 'DELETE' then
    v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);
    if v_cleanup_ref is not null and v_cleanup_ref <> '' then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.assessments a
      join public.organisations o on o.id = a.organisation_id
      where a.id = old.assessment_id;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

  if tg_op in ('UPDATE','DELETE') and old.status = 'completed' then
    raise exception 'Completed score runs are immutable. Create a new score run instead.';
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status into parent_status from public.assessments where id = new.assessment_id;
    if parent_status is null then
      raise exception 'Parent assessment not found.';
    end if;

    if parent_status not in ('submitted','scored','snapshot_available','report_requested','under_review','closed') then
      raise exception 'Score runs may only be created for submitted or later assessments. Current status: %.', parent_status;
    end if;

    if new.status = 'completed' then
      if (not v_visibility_blocked)
         and (new.overall_score is null or new.calculated_maturity is null or new.final_maturity is null) then
        raise exception 'Completed score run requires overall score, calculated maturity and final maturity.';
      end if;

      if not v_adaptive and (new.exposure_score is null or new.exposure_band is null) then
        raise exception 'Completed score run requires exposure score and exposure band.';
      end if;

      if new.coverage_pct is null or new.coverage_pct < 80 then
        raise exception 'Completed score run requires coverage of at least 80 percent.';
      end if;

      if new.input_hash is null or length(new.input_hash) < 32 then
        raise exception 'Completed score run requires a deterministic input hash.';
      end if;

      if new.locked_at is null then
        raise exception 'Completed score run must be locked.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

commit;
