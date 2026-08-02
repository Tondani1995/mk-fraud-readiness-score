-- RC1: let the marking control admit the resume placeholder, and bound its freshness rule.
--
-- Defect
-- ------
-- 20260801220000 refuses to mark an organisation that has any email event, on the reasoning that
-- an organisation which has done nothing yet cannot have one. That reasoning is wrong.
-- startAccountlessAssessment inserts a queued placeholder in the same operation that creates the
-- organisation, the respondent and the assessment:
--
--   template_key   resume_link_phase4_placeholder
--   status         queued
--   error_message  'Phase 4 does not send email yet. ...'
--
-- so every real journey has exactly one email event from the instant it exists. The in-use check
-- was therefore unsatisfiable by any journey started through the real route, and the control could
-- only ever have marked an organisation that does not exist. Measured against the halted journey
-- MKFRS-2026-556D146758, every other condition passed and only this one refused, with
-- rc1_synthetic_marking:organisation_already_in_use.
--
-- Both suites seeded their fixtures directly rather than through /score/api/assessments/start, so
-- neither ever produced the placeholder. The regression suite added alongside this migration drives
-- the real route, which is the only way that gap could have been caught.
--
-- Correction 1: the placeholder, and nothing else
-- -----------------------------------------------
-- A queued email event is NOT treated as harmless. The control disregards an event only when every
-- one of the following holds, and any event failing any of them still blocks marking:
--
--   * it belongs to the assessment being marked, and to nothing else -- no order, report or data
--     request link;
--   * its template_key is exactly 'resume_link_phase4_placeholder';
--   * notification_type is null, which is how the placeholder is classified as non-provider;
--   * provider_mode = 'disabled';
--   * status = 'queued';
--   * provider_message_id is null;
--   * sent_at is null;
--   * no email_provider_events reference it;
--   * no provider attestation references it;
--   * no attestation consumption reaches it;
--   * no delivery authorisation references it.
--
-- Two further conditions are enforced on the set rather than the row: at most one such placeholder
-- may exist for the assessment, and the organisation's total email-event count must equal the
-- admissible placeholder count. The second is what makes this narrow -- a real message alongside
-- the placeholder leaves total 2 against admissible 1, and marking is refused. An organisation with
-- no email events at all still marks, so a directly seeded fixture keeps working.
--
-- Correction 2: a bounded age instead of an hour
-- ----------------------------------------------
-- The one-hour rule was brittle: a journey whose start succeeded but which then waited on a build,
-- a CI cycle or an operator would become permanently unmarkable, and therefore permanently
-- uncleanable, purely because time passed. The bound becomes 24 hours, which still keeps every
-- older organisation completely out of reach of this control.
--
-- Everything else is reproduced unchanged: staging-only enablement, platform_admin at AAL2, a
-- meaningful reason, a RELEASED database, one named assessment resolved from its own reference,
-- an unmarked organisation, no score run, order, report, delivery authorisation, data request or
-- access token, a marker that can only ever be a MKTEST-RC1 value and can never be cleared or
-- changed, no ids or predicates from the browser, no anon or service_role execution, and an audit
-- that stores fingerprints and state only.

begin;

create or replace function public.rc1_mark_synthetic_certification_organisation(
  p_assessment_reference text,
  p_synthetic_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_assessment_ref text := pg_catalog.btrim(coalesce(p_assessment_reference, ''));
  v_reason_fingerprint text;
  v_enabled boolean;
  v_state text;
  v_freeze_epoch bigint;
  v_organisation_id uuid;
  v_assessment_id uuid;
  v_assessment_count integer;
  v_blocking integer;
  v_email_total integer;
  v_placeholder integer;
  v_created_at timestamptz;
  v_marked integer;
begin
  v_actor := public.rc1_require_platform_admin(true);

  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_synthetic_marking:meaningful_reason_required';
  end if;
  if p_synthetic_reference is null
     or p_synthetic_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$' then
    raise exception 'rc1_synthetic_marking:synthetic_reference_invalid';
  end if;
  if v_assessment_ref = '' or pg_catalog.char_length(v_assessment_ref) > 100 then
    raise exception 'rc1_synthetic_marking:assessment_reference_required';
  end if;

  -- Marking data synthetic is meaningless where the synthetic cleanup is not enabled, so the two
  -- share one environment switch. Inert on arrival in every environment, Production included.
  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s where s.setting_key = 'rc1_synthetic_certification_cleanup';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_synthetic_marking:not_enabled_in_this_environment';
  end if;

  select state into v_state from public.rc1_operation_freeze_state where singleton = true;
  if coalesce(v_state, '') <> 'RELEASED' then
    raise exception 'rc1_synthetic_marking:database_not_released';
  end if;

  -- Resolved from the journey's own reference, never from a browser-supplied id or predicate.
  select a.id, a.organisation_id into v_assessment_id, v_organisation_id
  from public.assessments a
  where a.assessment_reference = v_assessment_ref;
  if v_organisation_id is null then
    raise exception 'rc1_synthetic_marking:assessment_not_found';
  end if;

  -- An existing marker is never overwritten, cleared or relabelled.
  select o.created_at into v_created_at
  from public.organisations o
  where o.id = v_organisation_id and o.synthetic_certification_ref is null;
  if v_created_at is null then
    raise exception 'rc1_synthetic_marking:organisation_already_marked_or_missing';
  end if;

  -- Bounded age. Anything older than a day is completely out of reach of this control, while a
  -- journey delayed by a build or a CI cycle does not become permanently uncleanable.
  if v_created_at < pg_catalog.now() - interval '24 hours' then
    raise exception 'rc1_synthetic_marking:organisation_not_recent';
  end if;

  -- The organisation must own exactly one assessment: the one named.
  select pg_catalog.count(*)::integer into v_assessment_count
  from public.assessments a where a.organisation_id = v_organisation_id;
  if v_assessment_count <> 1 then
    raise exception 'rc1_synthetic_marking:organisation_has_other_assessments';
  end if;

  -- Nothing may have happened under it yet, email aside. A journey is marked at its start, so the
  -- presence of any of these means this is not a fresh certification journey.
  select
    (select pg_catalog.count(*) from public.score_runs r
       join public.assessments a on a.id = r.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.orders o
       join public.assessments a on a.id = o.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.reports rp
       join public.assessments a on a.id = rp.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.report_delivery_authorizations d
       join public.assessments a on a.id = d.assessment_id
       where a.organisation_id = v_organisation_id)
  -- A data request carries both links, so either one counts as use.
  + (select pg_catalog.count(*) from public.data_requests dr
       where dr.organisation_id = v_organisation_id
          or dr.assessment_id in (
               select a.id from public.assessments a where a.organisation_id = v_organisation_id))
  -- An access token has no assessment column; it reaches the organisation through its order.
  + (select pg_catalog.count(*) from public.customer_report_access_tokens t
       join public.orders o2 on o2.id = t.order_id
       join public.assessments a on a.id = o2.assessment_id
       where a.organisation_id = v_organisation_id)
  -- Answers are real use of the journey too.
  + (select pg_catalog.count(*) from public.assessment_answers an
       join public.assessments a on a.id = an.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.exposure_answers ex
       join public.assessments a on a.id = ex.assessment_id
       where a.organisation_id = v_organisation_id)
  into v_blocking;
  if v_blocking > 0 then
    raise exception 'rc1_synthetic_marking:organisation_already_in_use';
  end if;

  -- Email is handled separately, because assessment start always writes one queued placeholder.
  -- Every email event reachable from the organisation, by any of its links.
  select pg_catalog.count(*)::integer into v_email_total
  from public.email_events e
  where e.assessment_id in (
          select a.id from public.assessments a where a.organisation_id = v_organisation_id)
     or e.order_id in (
          select o.id from public.orders o
          join public.assessments a on a.id = o.assessment_id
          where a.organisation_id = v_organisation_id)
     or e.report_id in (
          select rp.id from public.reports rp
          join public.assessments a on a.id = rp.assessment_id
          where a.organisation_id = v_organisation_id)
     or e.data_request_id in (
          select dr.id from public.data_requests dr where dr.organisation_id = v_organisation_id);

  -- Those, and only those, that are the untouched non-provider placeholder for this assessment.
  select pg_catalog.count(*)::integer into v_placeholder
  from public.email_events e
  where e.assessment_id = v_assessment_id
    and e.order_id is null
    and e.report_id is null
    and e.data_request_id is null
    and e.template_key = 'resume_link_phase4_placeholder'
    and e.notification_type is null
    and e.provider_mode = 'disabled'
    and e.status = 'queued'
    and e.provider_message_id is null
    and e.sent_at is null
    and not exists (select 1 from public.email_provider_events pe where pe.email_event_id = e.id)
    and not exists (select 1 from public.phase14_provider_attestations pa where pa.email_event_id = e.id)
    and not exists (
      select 1 from public.phase14_provider_attestation_consumptions c
      join public.phase14_provider_attestations pa on pa.id = c.attestation_id
      where pa.email_event_id = e.id)
    and not exists (select 1 from public.report_delivery_authorizations d where d.email_event_id = e.id);

  -- At most one placeholder, and no email event that is not that placeholder.
  if v_placeholder > 1 then
    raise exception 'rc1_synthetic_marking:multiple_placeholder_events';
  end if;
  if v_email_total <> v_placeholder then
    raise exception 'rc1_synthetic_marking:organisation_already_in_use';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex');

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  -- organisations sits on the assessment_start freeze surface, so the RC1 guard refuses this write
  -- while the database is frozen. The null check is restated here so a concurrent marking cannot
  -- slip between the read above and this update.
  update public.organisations o
  set synthetic_certification_ref = p_synthetic_reference
  where o.id = v_organisation_id and o.synthetic_certification_ref is null;
  get diagnostics v_marked = row_count;
  if v_marked <> 1 then
    raise exception 'rc1_synthetic_marking:marking_did_not_apply_exactly_once';
  end if;

  insert into public.rc1_synthetic_marking_audit (
    synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, marked_count
  ) values (
    p_synthetic_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch, v_marked
  );

  return jsonb_build_object(
    'synthetic_reference', p_synthetic_reference,
    'marked', v_marked,
    'freeze_epoch', v_freeze_epoch
  );
end;
$$;

revoke all on function public.rc1_mark_synthetic_certification_organisation(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_mark_synthetic_certification_organisation(text,text,text) to authenticated;

comment on function public.rc1_mark_synthetic_certification_organisation(text,text,text) is
  'Stamps organisations.synthetic_certification_ref on exactly one brand-new certification organisation, resolved from the journey''s own assessment reference. Requires platform_admin at AAL2, a meaningful reason, the synthetic-cleanup environment enablement and a RELEASED database. Refuses unless the organisation is unmarked, created within the last 24 hours, owns exactly that one assessment, and has no answer, score run, order, report, delivery authorisation, data request or access token. Email is admitted only for a single untouched non-provider resume placeholder belonging to that assessment -- disabled provider mode, queued, no provider message id, no sent_at, and no provider event, attestation, consumption or delivery authorisation referencing it -- and any other email event refuses. Never overwrites, clears or relabels an existing marker. Audits the reference, fingerprints and a count only.';

commit;
