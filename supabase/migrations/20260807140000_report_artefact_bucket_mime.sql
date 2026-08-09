-- Allow the supporting register to be stored alongside the report it belongs to.
--
-- 0017 pinned generated-reports to allowed_mime_types = {application/pdf}. That was correct while
-- the PDF was the only artefact; with min-M8 the same report also publishes an XLSX supporting
-- register to the same bucket, under the same organisation/order/version path, protected by the
-- same RLS and reachable only through the parent report's existing customer token. Storage rejects
-- the upload on MIME policy, so the register could never be published in any real environment --
-- every harness used a storage double, which is exactly why this was invisible until the Phase 1
-- integration ran against real Storage.
--
-- Narrowest possible change: add the one spreadsheet type, leave the size limit and every other
-- bucket property untouched, and create no second bucket, no second path convention and no second
-- cleanup path.

begin;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]::text[]
where id = 'generated-reports';

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'generated-reports'
      and allowed_mime_types @> array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
      and allowed_mime_types @> array['application/pdf']::text[]
  ) then
    raise exception 'generated_reports_bucket_mime_policy_not_applied';
  end if;
end;
$$;

commit;
