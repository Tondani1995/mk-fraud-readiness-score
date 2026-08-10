-- Joint launch: an operational alert category for an orphaned Comprehensive evidence object.
--
-- WHY
-- Comprehensive evidence intake uploads to private Storage and then inserts the database row. If
-- the insert definitively fails, the compensating delete removes the object it just uploaded. When
-- even that delete fails, the object is orphaned: it exists in the private bucket with no row
-- describing it, so nothing in the product knows it is there and no reviewer or retention process
-- will ever reach it. That is exactly the condition an operator has to be told about.
--
-- record_phase14_operational_alert() enforces a closed category allow-list, so the new category has
-- to be added there. This migration re-creates that function with the one extra value and nothing
-- else changed -- the service-role check, the key/severity validation and the upsert-on-alert_key
-- behaviour are preserved verbatim.
--
-- SAFETY OF THE ALERT PAYLOAD: the caller passes only the bucket, the storage path and the
-- engagement/order identifiers. No customer name, no email, no file contents and no URL of any
-- kind. The path is a server-derived organisation/order/uuid triple, which is what an operator
-- needs in order to find and remove the object by hand.

begin;

create or replace function public.record_phase14_operational_alert(
  p_alert_key text,
  p_category text,
  p_report_id uuid default null,
  p_email_event_id uuid default null,
  p_detail_json jsonb default '{}'::jsonb,
  p_severity text default 'critical'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  if coalesce(trim(p_alert_key),'') = '' or length(p_alert_key) > 300 then
    raise exception 'phase14_alert_key_invalid';
  end if;
  if p_category not in (
    'report_download_object_missing','report_download_object_size_invalid',
    'report_download_checksum_mismatch','report_email_checksum_mismatch',
    'report_temporary_object_cleanup_failed','storage_cleanup_verification_failed',
    -- Joint launch: a Comprehensive evidence object survived a failed database insert AND its
    -- compensating delete, so it is orphaned in private storage and needs manual removal.
    'comprehensive_evidence_orphan_object'
  ) then raise exception 'phase14_alert_category_invalid'; end if;
  if p_severity not in ('warning','critical') then raise exception 'phase14_alert_severity_invalid'; end if;
  perform set_config('phase14.authoritative_transition', 'operational_alert_rpc', true);
  insert into public.phase14_operational_alerts(
    alert_key,severity,category,report_id,email_event_id,detail_json,status
  ) values (
    p_alert_key,p_severity,p_category,p_report_id,p_email_event_id,
    coalesce(p_detail_json,'{}'::jsonb),'open'
  ) on conflict (alert_key) do update
  set severity = excluded.severity, detail_json = excluded.detail_json, status = 'open'
  returning id into v_id;
  return v_id;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_phase14_operational_alert'
      and pg_catalog.pg_get_functiondef(p.oid) like '%comprehensive_evidence_orphan_object%'
  ) then
    raise exception 'joint_launch_evidence_orphan_alert_category_not_installed';
  end if;

  -- The pre-existing categories must all survive; a dropped category would silently disable an
  -- existing alert path.
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_phase14_operational_alert'
      and pg_catalog.pg_get_functiondef(p.oid) like '%report_download_object_missing%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%report_download_object_size_invalid%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%report_download_checksum_mismatch%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%report_email_checksum_mismatch%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%report_temporary_object_cleanup_failed%'
      and pg_catalog.pg_get_functiondef(p.oid) like '%storage_cleanup_verification_failed%'
  ) then
    raise exception 'joint_launch_evidence_orphan_alert_dropped_existing_category';
  end if;
end $$;

commit;
