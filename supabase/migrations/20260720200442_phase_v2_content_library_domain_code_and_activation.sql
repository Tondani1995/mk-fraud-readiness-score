-- Source/cloud reconciliation (docs/safe-launch/25-source-cloud-migration-reconciliation.md):
-- this file replaces the git-tracked 0034_phase_v2_content_library_activation.sql, which used a
-- filename-slot version ("0034") that does not correspond to any version applied to
-- jvjxlphdyzerrhwcgkup. The migration actually applied to production under this exact version
-- identity (20260720200442) is reproduced below VERBATIM from
-- supabase_migrations.schema_migrations.statements, retrieved read-only via the Supabase MCP
-- execute_sql tool on 2026-07-25. Nothing here was invented; nothing here was edited from what is
-- live.
--
-- KNOWN, DISCLOSED, UNRESOLVED LIMITATION -- do not silently "fix" this without a reconciliation
-- decision (see doc 25): step 5 below inserts using a hardcoded literal methodology_version_id
-- ('df96e242-9625-4b2a-bc62-615ae402483a'), matching the specific UUID that exists in
-- jvjxlphdyzerrhwcgkup's methodology_versions table. A fresh/disposable database's
-- methodology_versions row for the same version_code gets a freshly-generated UUID (via
-- gen_random_uuid() defaults, seeded independently), which will not equal this literal -- so this
-- exact statement, replayed verbatim against a fresh database, will insert zero domain_narrative
-- rows for that block (the ON CONFLICT target never matches, but more importantly no row in
-- methodology_versions will have this literal id, so nothing about methodology_version_id itself
-- fails outright, but the five INSERTed rows will reference a methodology_version_id that does not
-- exist in the fresh database's own methodology_versions table -- a foreign-key violation).
-- git history separately carried a corrected version of this same content-activation goal
-- (the former 0034 file) that resolved methodology_version_id dynamically by version_code instead
-- of this literal, specifically to fix this exact fresh-replay failure -- that correction was never
-- applied to production under any version identity and is not reproduced here, to keep this file a
-- faithful, unedited mirror of what actually ran. See doc 25 for the full analysis and the
-- unresolved reconciliation question (whether to add the dynamic-lookup correction as a new,
-- honestly-versioned follow-up migration).

-- V2 commercial rebuild: repair report_content_blocks activation infrastructure.
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
--    maturity-limiting control. The reference assessment (MK Assist, MKFRS-2026-18BC0EC4D7) has 4
--    maturity_cap_events, so singular framing is factually wrong whenever more than one cap fires.
update public.report_content_blocks
set body = replace(
  body,
  'The specific control responsible for this cap is identified later in this report',
  'The control or controls responsible for this cap are identified later in this report'
)
where block_type = 'executive_summary' and severity = 'capped';

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

-- 6) Activate the reviewed content library. All 36 original blocks were read and assessed for
--    accuracy, tone, and tier-fit; only the one wording defect above required correction.
update public.report_content_blocks
set status = 'active'
where status = 'draft';
