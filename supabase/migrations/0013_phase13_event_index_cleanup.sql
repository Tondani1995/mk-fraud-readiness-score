-- MK Fraud Readiness Score V1 - Phase 13 event index cleanup
-- Purpose: resolve advisor findings introduced during Phase 13 runtime assurance.

begin;

create index if not exists assessment_events_respondent_idx
  on public.assessment_events(respondent_id);

drop index if exists public.assessment_events_dedupe_key_uidx;

commit;
