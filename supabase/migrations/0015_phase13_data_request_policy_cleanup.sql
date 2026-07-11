-- MK Fraud Readiness Score V1 - Phase 13 data request policy cleanup
-- Purpose: remove a redundant commercial read policy and cover the existing respondent foreign key.

begin;

drop policy if exists data_requests_admin_select_commercial on public.data_requests;

create index if not exists data_requests_respondent_idx
  on public.data_requests(respondent_id);

commit;
