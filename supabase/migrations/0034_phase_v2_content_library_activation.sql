-- V2 commercial rebuild: repair report_content_blocks activation infrastructure.
-- Mirrors the migration already applied to production (jvjxlphdyzerrhwcgkup) via the Supabase
-- MCP apply_migration tool on this branch. Kept here so the migration history in source control
-- matches what actually ran in production, per the "no undocumented production-only changes" rule.

-- 1) Normalize domain_code from full domain names to canonical Dn codes using domains as source of truth.
update public.report_content_blocks rcb
set domain_code = d.domain_code
from public.domains d
where rcb.domain_code is not null
  and rcb.domain_code = d.name;

-- 2) Guard: fail loudly if any domain-scoped row could not be mapped to a canonical code.
do $$
declare
  bad_count integer;
begin
  select count(*) into bad_count
  from public.report_content_blocks
  where domain_code is not null
    and domain_code !~ '^D([1-9]|10)$';
  if bad_count > 0 then
    raise exception 'domain_code normalization left % unmapped rows', bad_count;
  end if;
end $$;

-- 3) Prevent regression: only canonical Dn codes or NULL allowed going forward.
alter table public.report_content_blocks
  add constraint report_content_blocks_domain_code_canonical
  check (domain_code is null or domain_code ~ '^D([1-9]|10)$');

-- 4) Content correction found during review: the capped executive-summary block assumed a single
--    maturity-limiting control, both in its body and its title. The reference assessment (MK Assist,
--    MKFRS-2026-18BC0EC4D7) has 4 maturity_cap_events, so singular framing is factually wrong
--    whenever more than one cap fires. Reworded to be count-neutral.
update public.report_content_blocks
set body = replace(
  body,
  'The specific control responsible for this cap is identified later in this report',
  'The control or controls responsible for this cap are identified later in this report'
)
where block_type = 'executive_summary' and severity = 'capped';

update public.report_content_blocks
set title = 'One or more control gaps are holding back a stronger underlying position'
where block_type = 'executive_summary' and severity = 'capped'
  and title = 'A single control gap is holding back a stronger underlying position';

-- 5) Fill the highest-priority content-coverage gap found during review: 9 of 10 domains had no
--    Developing-band domain_narrative block (only Structured/Strategic authored), so any domain
--    scoring 40-64 silently fell back to generic content. MK Assist alone has 5 domains in this
--    exact situation (D5, D6, D7, D9, D10). Author the missing Developing-band narratives.
insert into public.report_content_blocks
  (methodology_version_id, block_key, block_type, domain_code, maturity_band, severity, title, body, status, version_number)
values
  ('df96e242-9625-4b2a-bc62-615ae402483a', 'domain_fraud_incident_response_developing', 'domain_narrative', 'D5', 'Developing', null,
   'A response would happen, but it has not been rehearsed',
   'The organisation has some sense of what it would do if fraud were suspected, but that knowledge lives mostly in individual judgement rather than a documented, evidence-preserving process. An untested response plan tends to reveal its gaps in the middle of a live incident, which is the most expensive place to discover them.',
   'active', 1),
  ('df96e242-9625-4b2a-bc62-615ae402483a', 'domain_whistleblowing_and_reporting_culture_developing', 'domain_narrative', 'D6', 'Developing', null,
   'A way to report exists, but trust in it is still unproven',
   'A reporting channel is technically available, but it is not yet clear whether people would actually use it or trust that raising a concern is safe and would be taken seriously. A channel nobody trusts enough to use is functionally close to having no channel at all.',
   'active', 1),
  ('df96e242-9625-4b2a-bc62-615ae402483a', 'domain_third_party_and_supply_chain_fraud_risk_developing', 'domain_narrative', 'D7', 'Developing', null,
   'Some supplier checks happen, but not consistently',
   'Elements of supplier due diligence exist, but they are not applied consistently across every supplier relationship, and rarely continue once a relationship is established. Fraud risk in this domain tends to concentrate precisely in the gap between onboarding checks and ongoing monitoring.',
   'active', 1),
  ('df96e242-9625-4b2a-bc62-615ae402483a', 'domain_fraud_culture_and_awareness_developing', 'domain_narrative', 'D9', 'Developing', null,
   'Awareness exists, but it has not been reinforced recently',
   'People have likely heard about fraud risk at some point, but that awareness has not been refreshed with current examples or built into how the organisation talks about risk day to day. Awareness that fades between refreshers tends to be lowest exactly when pressure or temptation is highest.',
   'active', 1),
  ('df96e242-9625-4b2a-bc62-615ae402483a', 'domain_continuous_improvement_and_fraud_risk_monitoring_developing', 'domain_narrative', 'D10', 'Developing', null,
   'Fraud risk is reviewed, but not on a fixed rhythm',
   'Some review of fraud controls happens, but it is not yet built into a predictable cycle leadership can rely on. Without a fixed rhythm, review tends to happen only after something prompts it, rather than catching a new risk before it becomes a loss.',
   'active', 1)
on conflict (methodology_version_id, block_key, version_number) do nothing;

-- 6) Activate the reviewed content library. All 36 original draft blocks were read and assessed for
--    accuracy, tone, and tier-fit; the wording defects above were the only corrections required.
update public.report_content_blocks
set status = 'active'
where status = 'draft';
