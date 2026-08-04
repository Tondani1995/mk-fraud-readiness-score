-- RC1: remove band language from Reactive domain narrative TITLES.
--
-- Migration 20260803160000 corrected the bodies of domain_d1_reactive and domain_d3_reactive but
-- left their titles, which read "... : no structured control yet". validatePremiumReportNarrative
-- matches maturity bands case-insensitively over the section's title and body together
-- (sectionText + maturityMentions), so the lowercase descriptive "structured" still registered as
-- a Structured maturity claim on a Reactive-banded section and kept the contradiction alive.
--
-- Report copy only: no schema, policy or grant change. Idempotent -- scoped by block_key and
-- re-running is a no-op.

begin;

update public.report_content_blocks
set title = 'Fraud Leadership and Governance: no formal control yet',
    updated_at = now()
where block_key = 'domain_d1_reactive'
  and block_type = 'domain_narrative'
  and maturity_band = 'Reactive';

update public.report_content_blocks
set title = 'Operational Fraud Controls: no formal control yet',
    updated_at = now()
where block_key = 'domain_d3_reactive'
  and block_type = 'domain_narrative'
  and maturity_band = 'Reactive';

commit;
