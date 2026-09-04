-- Cross-product report-reference namespace hotfix.
--
-- Existing Essential reports are deliberately left untouched so their persisted reference,
-- storage object name and PDF-internal reference remain consistent. New Comprehensive output
-- is emitted by the application with a -COMP- namespace. This trigger is a rollout-safe
-- persistence guard: it only canonicalises a Comprehensive row when the incoming physical
-- file name already carries that namespace, so the pre-hotfix application remains internally
-- consistent during deployment.
--
-- Example:
--   Essential       RPT-MKFRS-2026-EA26478B86-V1
--   Comprehensive   RPT-MKFRS-2026-EA26478B86-COMP-V1
--
-- Historical assessment references that already contain "-COMP-" are preserved as-is.

begin;

create or replace function public.ensure_comprehensive_report_reference_namespace()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_original text;
begin
  if new.report_type = 'mk_validated'::public.report_type
     and position('-COMP-' in coalesce(new.report_reference, '')) = 0
     and position('-COMP-' in coalesce(new.file_name, '')) > 0 then
    v_original := new.report_reference;
    new.report_reference := regexp_replace(
      new.report_reference,
      '-V([0-9]+)$',
      '-COMP-V\1'
    );
    if new.report_reference is null
       or new.report_reference = v_original
       or position('-COMP-' in new.report_reference) = 0 then
      raise exception 'comprehensive_report_reference_namespace_invalid';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reports_comprehensive_reference_namespace on public.reports;
create trigger trg_reports_comprehensive_reference_namespace
before insert or update of report_reference, report_type, file_name
on public.reports
for each row
execute function public.ensure_comprehensive_report_reference_namespace();

comment on function public.ensure_comprehensive_report_reference_namespace() is
  'Rollout-safe guard ensuring new Comprehensive report rows use a distinct -COMP- report-reference namespace without mutating historical Essential or Comprehensive artefacts.';

commit;
