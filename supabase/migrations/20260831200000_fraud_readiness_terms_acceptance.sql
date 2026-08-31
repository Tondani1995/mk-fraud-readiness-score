-- Fraud Readiness Assessment terms and privacy acceptance evidence.
--
-- Purely additive. No historical respondent or assessment row is read, rewritten or backfilled.
--
-- Four nullable columns record WHICH document versions the respondent accepted and WHEN. A boolean
-- consent flag cannot answer "which wording was displayed?", so the version identifier is stored
-- alongside the timestamp and neither is ever rewritten.
--
-- Enforcement is a BEFORE INSERT trigger, not a CHECK constraint, and the distinction matters:
-- a CHECK (even NOT VALID) is re-evaluated on every UPDATE, which would make every existing
-- adaptive assessment unsaveable the moment this migration ran. A trigger scoped to INSERT leaves
-- assessments already in flight completely untouched while making it impossible to create a NEW
-- adaptive assessment without acceptance. The legacy non-adaptive start path is intentionally out
-- of scope and unaffected.

begin;

alter table public.assessments
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_notice_version text,
  add column if not exists privacy_acknowledged_at timestamptz;

comment on column public.assessments.terms_version is
  'Identifier of the Fraud Readiness Assessment Terms version accepted at creation. Null on assessments created before this contract existed.';
comment on column public.assessments.terms_accepted_at is
  'Server-side timestamp of the terms acceptance. Never taken from the client.';
comment on column public.assessments.privacy_notice_version is
  'Identifier of the Privacy Notice version acknowledged at creation.';
comment on column public.assessments.privacy_acknowledged_at is
  'Server-side timestamp of the privacy-notice acknowledgement. Never taken from the client.';

create or replace function public.enforce_adaptive_terms_acceptance()
returns trigger
language plpgsql
as $$
begin
  if new.assessment_mode = 'adaptive'
     and (
       new.terms_version is null
       or new.terms_accepted_at is null
       or new.privacy_notice_version is null
       or new.privacy_acknowledged_at is null
     )
  then
    raise exception 'adaptive_terms_acceptance_required'
      using errcode = '23514',
            hint = 'A new adaptive assessment must record the accepted terms version, terms acceptance timestamp, privacy notice version and privacy acknowledgement timestamp.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assessments_adaptive_terms_acceptance on public.assessments;
create trigger trg_assessments_adaptive_terms_acceptance
  before insert on public.assessments
  for each row
  execute function public.enforce_adaptive_terms_acceptance();

commit;
