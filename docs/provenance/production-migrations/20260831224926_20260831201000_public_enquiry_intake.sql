-- Public MK Advisory and general website contact enquiries.
--
-- Purely additive. No existing row is read, rewritten or backfilled, and no existing constraint
-- changes meaning for the enquiry types already in use.
--
-- Both new intakes reuse public.data_requests rather than introducing a second enquiry system.
-- The table already permits a NULL assessment_id, organisation_id and respondent_id, so a lead
-- that has not completed an assessment is stored with those left NULL. Nothing fabricates a
-- placeholder assessment, organisation or respondent to satisfy a foreign key: such a row would
-- surface in the assessment queue and in counts as though someone had begun an assessment.
--
-- The mk_advisory CHECK constraints added by 20260830170000 continue to apply unchanged to public
-- Advisory enquiries -- reason, focus areas, contact method, timeframe and consent are all still
-- required -- which is precisely what keeps the two Advisory paths one commercial model. The
-- website_contact type is scoped out of them by their own `request_type <> 'mk_advisory'` guard.
--
-- The active-Advisory unique index (data_requests_active_mk_advisory_uidx) is partial on
-- `assessment_id is not null`, so public enquiries are outside it and two prospects can raise
-- enquiries concurrently without collision.

begin;

alter table public.data_requests
  add column if not exists contact_name text,
  add column if not exists company_name text,
  add column if not exists contact_phone text,
  add column if not exists service_interest text,
  add column if not exists enquiry_source text;

comment on column public.data_requests.contact_name is
  'Lead contact name for an enquiry with no linked respondent. NULL when respondent_id carries the identity.';
comment on column public.data_requests.company_name is
  'Lead organisation name for an enquiry with no linked organisation. NULL when organisation_id carries it.';
comment on column public.data_requests.contact_phone is
  'Optional lead telephone number.';
comment on column public.data_requests.service_interest is
  'Website contact service selection. Not a product code and never an entitlement.';
comment on column public.data_requests.enquiry_source is
  'Where the enquiry entered the platform: snapshot_advisory, public_advisory or website_contact. Triage only.';

do $$
begin
  -- An enquiry source, where recorded, must be one MK recognises.
  alter table public.data_requests drop constraint if exists data_requests_enquiry_source_chk;
  alter table public.data_requests
    add constraint data_requests_enquiry_source_chk
    check (enquiry_source is null or enquiry_source in ('snapshot_advisory', 'public_advisory', 'website_contact'));

  -- A public Advisory enquiry has no linked respondent or organisation, so it must carry its own
  -- contact identity or MK has a lead it cannot answer. Assessment-linked Advisory enquiries are
  -- unaffected: their identity comes from the joined rows.
  alter table public.data_requests drop constraint if exists data_requests_public_advisory_identity_chk;
  alter table public.data_requests
    add constraint data_requests_public_advisory_identity_chk
    check (
      request_type <> 'mk_advisory'
      or assessment_id is not null
      or (
        contact_name is not null
        and company_name is not null
        and requested_by_email is not null
      )
    );

  -- A website contact enquiry is never an Advisory enquiry and is not permitted to borrow the
  -- Advisory taxonomy; it carries its own minimum shape instead.
  alter table public.data_requests drop constraint if exists data_requests_website_contact_chk;
  alter table public.data_requests
    add constraint data_requests_website_contact_chk
    check (
      request_type <> 'website_contact'
      or (
        contact_name is not null
        and requested_by_email is not null
        and service_interest is not null
        and notes is not null
        and assessment_id is null
        and organisation_id is null
        and respondent_id is null
      )
    );

  alter table public.data_requests drop constraint if exists data_requests_website_contact_service_chk;
  alter table public.data_requests
    add constraint data_requests_website_contact_service_chk
    check (
      request_type <> 'website_contact'
      or service_interest in (
        'mk-advisory',
        'fraud-health-check',
        'threat-intelligence',
        'programme-design',
        'awareness',
        'controls',
        'other'
      )
    );
end $$;

-- The admin queue reads unlinked enquiries by type and recency.
create index if not exists data_requests_enquiry_source_created_idx
  on public.data_requests(enquiry_source, created_at desc)
  where enquiry_source is not null;

create index if not exists data_requests_requested_by_email_idx
  on public.data_requests(requested_by_email)
  where requested_by_email is not null;

-- data_requests already has RLS enabled with all grants revoked from anon and authenticated
-- (0014_phase13_customer_commercial_conversion.sql). Re-asserted here so a future grant cannot
-- silently open a public write path into the enquiry table.
alter table public.data_requests enable row level security;
revoke all on table public.data_requests from anon, authenticated;

commit;
