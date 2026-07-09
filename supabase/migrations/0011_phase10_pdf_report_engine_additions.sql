-- MK Fraud Readiness Score V1 - Phase 10 premium PDF report engine additions
-- Purpose: add the minimum additive database configuration needed for controlled
-- admin-only PDF report generation after Phase 9 manual EFT confirmation.

begin;

alter table public.report_events
  add column if not exists metadata_json jsonb default '{}'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generated-reports', 'generated-reports', false, 15728640, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.report_templates (
  template_code,
  version_number,
  report_type,
  status,
  content_schema_json
)
values (
  'mk_fraud_readiness_advisory_v1',
  1,
  'essential_self_assessment',
  'active',
  jsonb_build_object(
    'template', 'premium_mk_fraud_readiness_advisory_v1',
    'client_facing_internal_codes_allowed', false,
    'sections', jsonb_build_array(
      'cover',
      'executive_diagnosis',
      'score_story',
      'exposure_readiness_matrix',
      'domain_heatmap',
      'priority_gaps',
      'false_comfort',
      'domain_analysis',
      'leadership_roadmap',
      'methodology_limitations'
    )
  )
)
on conflict (template_code, version_number) do update
set status = excluded.status,
    content_schema_json = excluded.content_schema_json;

-- The V2 premium content pack reviewed by MK remains draft by design. Real reports
-- only select active content blocks; these starter blocks require MK content approval
-- before they should influence a paid client report.
do $$
declare
  v_methodology_version_id uuid;
begin
  select id into v_methodology_version_id
  from public.methodology_versions
  where status = 'active'
  order by created_at desc
  limit 1;

  if v_methodology_version_id is null then
    raise exception 'No active methodology version found - cannot seed Phase 10 content review markers.';
  end if;

  insert into public.report_content_blocks (
    methodology_version_id,
    block_key,
    block_type,
    domain_code,
    maturity_band,
    severity,
    title,
    body,
    actions_json,
    status,
    version_number
  ) values
    (v_methodology_version_id, 'exec_diagnosis_capped_v2', 'executive_summary', null, null, 'capped', 'A single control gap is holding back a stronger underlying position', 'Taken purely as a weighted average, this organisation may look stronger than the final readiness band allows. The cap exists because some controls are non-negotiable: if one of them fails, strength elsewhere cannot fully compensate for the exposure it creates.', '{}'::jsonb, 'draft', 1),
    (v_methodology_version_id, 'false_comfort_capped_v2', 'false_comfort', null, null, 'capped', 'Where this organisation may look stronger than it really is', 'Averages can hide the difference between consistent maturity and one serious control failure surrounded by otherwise strong answers. This section is intentionally draft until MK approves the final client-facing wording.', '{}'::jsonb, 'draft', 1),
    (v_methodology_version_id, 'leadership_attention_developing_v2', 'leadership_attention', null, 'Developing', null, null, 'Leadership should pay attention to dependency risk: where fraud prevention still relies on specific people being present, informed and vigilant rather than on a repeatable operating system.', '{}'::jsonb, 'draft', 1)
  on conflict (methodology_version_id, block_key, version_number) do nothing;
end $$;

insert into public.app_settings (setting_key, value_json)
values (
  'phase10_premium_pdf_report_engine',
  '{"status":"draft_stack","payment_gateway":false,"proof_upload":false,"automated_payment_verification":false,"client_portal":false,"ai_live_recommendations":false,"benchmarks":false,"requires_order_status":"payment_received","storage_bucket":"generated-reports"}'::jsonb
)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
