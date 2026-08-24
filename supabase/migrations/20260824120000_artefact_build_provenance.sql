-- Artefact build provenance.
--
-- Reports generated before this migration cannot answer "which code produced this?".
-- The generation attempt recorded timings and an output id; nothing recorded the build.
-- These columns close that gap so any future artefact can be reproduced or withdrawn.
--
-- All columns are nullable: historical rows genuinely do not have this information and
-- must not be back-filled with guesses. Certification is enforced in application code,
-- which requires the fields to be present for new artefacts only.

alter table public.reports
  add column if not exists graph_version text,
  add column if not exists graph_fingerprint text,
  add column if not exists deterministic_input_hash text,
  add column if not exists source_git_sha text,
  add column if not exists source_ref text,
  add column if not exists report_schema_version text,
  add column if not exists template_version text,
  add column if not exists narrative_provider text,
  add column if not exists narrative_model text,
  add column if not exists writer_version text,
  add column if not exists workbook_checksum text,
  add column if not exists commercial_acceptance_json jsonb;

comment on column public.reports.source_git_sha is
  'Commit that produced this artefact. Null only for artefacts generated before build provenance existed.';
comment on column public.reports.commercial_acceptance_json is
  'Commercial acceptance verdict at generation time: minimum sub-KPI, pass/fail and failing KPI names.';

-- Find artefacts that cannot prove their own lineage. Used by the release gate.
create or replace view public.reports_missing_provenance as
  select id, report_reference, version_number, generated_at
  from public.reports
  where source_git_sha is null
     or graph_version is null
     or graph_fingerprint is null
     or deterministic_input_hash is null
     or report_schema_version is null;

comment on view public.reports_missing_provenance is
  'Artefacts without complete build provenance. Expected to contain historical rows only.';
