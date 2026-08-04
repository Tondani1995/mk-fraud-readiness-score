-- RC1: correct Reactive domain narrative content that asserts an unsupported maturity band.
--
-- Order MKORD-2026-D1U0CTO8 failed prepare_narrative with domain_maturity_contradiction on D1, D2
-- and D3. All three domains score Reactive. The block metadata was right and content selection was
-- right; the prose was wrong:
--
--   domain_d1_reactive  -- band Reactive, body asserts Structured maturity
--   domain_d3_reactive  -- band Reactive, body asserts Structured maturity
--   D2                  -- no active Reactive domain narrative existed at all, so selection fell
--                          through to the generic fallback, which asserted the band in its wording
--
-- This corrects the two bodies and adds the missing D2 Reactive block. It changes report copy
-- only: no schema change, no policy change, no grant. The band words removed here are replaced
-- with descriptions of the control position, which the domain evidence supports directly.
--
-- Idempotent: each statement is scoped by block_key and re-running it is a no-op.

begin;

update public.report_content_blocks
set body = 'Fraud governance is carried informally. Accountability is understood in practice rather than assigned in writing, and fraud reaches leadership through escalation rather than through a standing reporting rhythm. There is no periodic fraud risk assessment and no single owner able to describe the organisation''s fraud position on demand. The immediate work is to name an owner, give fraud a fixed place on an existing governance agenda, and record decisions where they can later be evidenced.',
    updated_at = now()
where block_key = 'domain_d1_reactive'
  and block_type = 'domain_narrative'
  and maturity_band = 'Reactive';

update public.report_content_blocks
set body = 'Operational fraud controls exist where individual managers have built them, not as a designed control set. Preventive checks depend on the diligence of specific people, segregation is uneven across sites, and exceptions are handled case by case rather than reviewed as a population. The immediate work is to define the minimum control expectations for the highest-value processes and to make the exceptions visible enough that management can review them as a group.',
    updated_at = now()
where block_key = 'domain_d3_reactive'
  and block_type = 'domain_narrative'
  and maturity_band = 'Reactive';

-- Added against the same methodology version and version_number as the existing D1/D3 Reactive
-- blocks, so it participates in the same (methodology_version_id, block_key, version_number)
-- uniqueness the table already enforces.
insert into public.report_content_blocks
  (methodology_version_id, block_key, block_type, domain_code, maturity_band, severity, title, body, status, version_number)
select
  d1.methodology_version_id,
  'domain_d2_reactive',
  'domain_narrative',
  'D2',
  'Reactive',
  null,
  'Fraud risk is understood informally, not assessed',
  'The organisation has a working sense of where it is exposed, held by experienced people rather than by a documented assessment. No periodic fraud risk assessment is performed, so exposure is not ranked, not owned and not tracked as circumstances change. Supplier, subcontractor and payment risks are recognised individually but never assembled into one view. The immediate work is a first formal fraud risk assessment covering the processes where value leaves the organisation, with named owners against each exposure.',
  'active',
  d1.version_number
from public.report_content_blocks d1
where d1.block_key = 'domain_d1_reactive'
on conflict (methodology_version_id, block_key, version_number) do update
set body = excluded.body,
    title = excluded.title,
    domain_code = excluded.domain_code,
    maturity_band = excluded.maturity_band,
    block_type = excluded.block_type,
    status = 'active',
    updated_at = now();

commit;
