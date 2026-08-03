-- RC1: a Structured-band domain may not claim a blanket operating state over a control the
-- respondent recorded as absent.
--
-- The Phase 1 release-safety fixture's PASSING order fails prepare_narrative with
-- QG_NARRATIVE_RESPONSE_LABEL_MISSTATEMENT. That fixture answers eight specific controls 0 (not in
-- place) and every other control 4, so several domains land in the Structured band while still
-- containing a control recorded as entirely absent. Every Structured-band domain narrative opens
-- with the same sentence:
--
--   "This domain is genuinely functioning: real controls exist and are operating across most of
--    what was assessed here, not just described in policy."
--
-- The section cites its own response-value-0 gap, so validatePremiumReportNarrative correctly
-- raises response_label_misstatement: "Narrative overstates an official response value of 0 as
-- implemented or operating."
--
-- The validator is right and the copy is wrong. Telling a paying customer that controls "are
-- operating across most of what was assessed here" while one of the assessed controls is recorded
-- as not in place at all is exactly the overclaim that check exists to stop -- and a domain can
-- reach the Structured band on weighted average while still hiding an absent control, which is the
-- "false comfort" this product is sold to surface. The validator is NOT relaxed.
--
-- The replacement keeps the genuine positive signal (the majority of the domain is backed by real
-- practice, not policy alone) but stops asserting an operating state across everything assessed,
-- and says plainly that a recorded weaker condition sits outside the majority position. The same
-- overclaim is corrected in exec_summary_structured; the matching deterministic fallback copy is
-- corrected in src/lib/reports/fallback-content.ts in the same commit.
--
-- Copy only: no schema change, no policy change, no grant.
-- Idempotent: replace() of an exact sentence, so re-running it is a no-op.

begin;

update public.report_content_blocks
set body = replace(
      body,
      'This domain is genuinely functioning: real controls exist and are operating across most of what was assessed here, not just described in policy.',
      'This domain is genuinely functioning: most of what was assessed here is backed by day-to-day practice rather than policy alone. That is a majority position, not a statement about every control - any condition recorded as weaker in this report sits outside it and still has to be closed on its own merits.'
    ),
    updated_at = now()
where block_type = 'domain_narrative'
  and maturity_band = 'Structured'
  and body like '%real controls exist and are operating across most of what was assessed here%';

update public.report_content_blocks
set body = replace(
      body,
      'controls exist and are operating across most of what was assessed, not just described in policy.',
      'most of what was assessed is backed by day-to-day practice rather than policy alone. That majority position does not extend to every control - any condition recorded as weaker in this report stands outside it.'
    ),
    updated_at = now()
where block_type = 'executive_summary'
  and maturity_band = 'Structured'
  and body like '%controls exist and are operating across most of what was assessed%';

commit;
