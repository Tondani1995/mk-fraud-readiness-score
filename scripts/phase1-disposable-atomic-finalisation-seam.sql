-- TEST-ONLY compatibility seam for the Phase 1 historical post-0023 replay. NEVER DEPLOYED.
--
-- The Phase 1 job runs the CURRENT application against the HISTORICAL 0023 schema, which predates
-- finalise_manual_report_with_supporting_register() by a long way. The application deliberately
-- fails closed when that RPC is absent: falling back to complete_manual_report_generation() would
-- reinstate the ordering defect where a completed, VERIFIED report could lose its PDF when the
-- supporting register failed. That runtime behaviour is correct and must not change.
--
-- So the FIXTURE supplies the boundary instead. This file exists only in the disposable CI database
-- created for that job. It is not referenced by any migration, is not in the migration ledger, and
-- is never applied to Preview, Staging or Production. The permanent regressions in
-- phase14:test-ai-settlement-parity assert that the deployed application contains no such fallback.
--
-- The seam delegates to the historical primitive and shapes the result the current caller expects.
-- On this schema report_artifacts does not exist, so the register half is represented rather than
-- persisted -- the Phase 1 job is asserting the historical schema boundary, not the register
-- contract, which is proved against the real RPC in the disposable-Postgres harness and Matrix C.

\echo 'Installing TEST-ONLY Phase 1 atomic-finalisation seam (disposable database only).'

do $$
begin
  if to_regclass('public.report_artifacts') is not null then
    raise exception 'phase1_seam_refused: report_artifacts exists, this is not the historical schema';
  end if;
end;
$$;

-- TEST-ONLY Storage fixture for this disposable database only.
--
-- The only migration that CREATES the generated-reports bucket
-- (20260708193318_phase9_phase10_private_storage_buckets.sql) sorts AFTER 0023, so at this
-- historical boundary the bucket does not exist at all -- which is why 0017's UPDATE, and an
-- earlier version of this file's UPDATE, both reported "UPDATE 0". The register upload would
-- therefore be rejected before finalisation is ever reached.
--
-- So the bucket is provisioned here explicitly rather than assumed: private, at the converged
-- 15MB limit 0017 settles on, permitting the PDF the report is and the XLSX the supporting
-- register is (the widening the Production-bound 20260807140000 carries for real environments).
-- This is a fixture, not a migration: it is in no ledger and reaches no real environment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-reports', 'generated-reports', false, 15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[];

-- Prove the fixture rather than trusting it. Any failure here stops the job immediately, so a
-- silent no-op can never again be mistaken for a working Storage boundary.
do $phase1_storage_fixture$
declare
  v_public boolean;
  v_mimes text[];
begin
  select b.public, b.allowed_mime_types into v_public, v_mimes
  from storage.buckets b where b.id = 'generated-reports';

  if not found then
    raise exception 'phase1_seam_storage_fixture_failed: generated-reports bucket absent after provisioning';
  end if;
  if v_public is distinct from false then
    raise exception 'phase1_seam_storage_fixture_failed: generated-reports must remain private';
  end if;
  if not ('application/pdf' = any(v_mimes)) then
    raise exception 'phase1_seam_storage_fixture_failed: generated-reports must permit application/pdf';
  end if;
  if not ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = any(v_mimes)) then
    raise exception 'phase1_seam_storage_fixture_failed: generated-reports must permit the register XLSX type';
  end if;
end;
$phase1_storage_fixture$;

create or replace function public.finalise_manual_report_with_supporting_register(
  p_attempt_id uuid,
  p_template_id uuid,
  p_report_type public.report_type,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum text,
  p_register_storage_path text,
  p_register_file_name text,
  p_register_mime_type text,
  p_register_file_size_bytes bigint,
  p_register_checksum text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  -- Historical primitive does the authoritative report work on this schema.
  v_result := public.complete_manual_report_generation(
    p_attempt_id, p_template_id, p_report_type, p_storage_bucket, p_storage_path,
    p_file_name, p_mime_type, p_file_size_bytes, p_checksum);

  -- Represent the register half so the current caller's success shape is satisfied. There is no
  -- report_artifacts table on this schema to bind to.
  return v_result || jsonb_build_object('supporting_register', jsonb_build_object(
    'storage_bucket', p_storage_bucket,
    'storage_path', p_register_storage_path,
    'file_name', p_register_file_name,
    'mime_type', p_register_mime_type,
    'file_size_bytes', p_register_file_size_bytes,
    'checksum_sha256', p_register_checksum,
    'storage_status', 'VERIFIED',
    'seam', 'phase1-historical-test-only'
  ));
end;
$$;

revoke all on function public.finalise_manual_report_with_supporting_register(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.finalise_manual_report_with_supporting_register(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) to service_role;

do $phase1_seam_installed$
begin
  if to_regprocedure('public.finalise_manual_report_with_supporting_register(uuid,uuid,public.report_type,text,text,text,text,bigint,text,text,text,text,bigint,text)') is null then
    raise exception 'phase1_seam_install_failed: the atomic finalisation seam is not present';
  end if;
end;
$phase1_seam_installed$;

\echo 'TEST-ONLY Phase 1 seam installed and Storage fixture proved.'
