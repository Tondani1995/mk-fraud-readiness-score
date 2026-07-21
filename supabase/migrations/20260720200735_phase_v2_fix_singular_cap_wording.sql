-- Phase V2: fix incorrect singular "a single control gap" wording in the
-- capped-summary executive_summary content block.
--
-- The block previously implied exactly one control was responsible for a
-- maturity cap, which is factually wrong whenever more than one
-- maturity-limiting control fired. This rewrites the block to speak in
-- terms of "one or more" specific controls, matching what
-- fallback-content.ts and the evidence-model layer now say in code.
--
-- This migration mirrors a change already applied directly to the
-- production project (jvjxlphdyzerrhwcgkup) on 2026-07-20. It is written
-- idempotently (targeted UPDATE ... WHERE, not a blind rewrite) so it is
-- safe to replay against any environment that already has this row from
-- migration 0034_phase_v2_content_library_activation.sql.

update public.report_content_blocks
set
  title = 'One or more control gaps are holding back a stronger underlying position',
  body = 'Taken purely as a weighted average across all ten domains, {{organisationName}}''s responses would score {{overallScore}} out of 100 - which would ordinarily place the organisation in the {{calculatedMaturity}} readiness band. That average is not the full picture. One or more specific, non-negotiable controls scored low enough on their own to cap the final reading to {{finalMaturity}}, regardless of how strong the organisation looks everywhere else. This is a deliberate feature of how readiness is measured, not a scoring quirk: certain controls matter enough on their own that a serious gap in just one of them changes what the rest of the score is allowed to mean. The control or controls responsible for this cap are identified later in this report, and closing it is very likely to unlock the higher reading the rest of the organisation''s answers already point toward.',
  updated_at = now()
where block_type = 'executive_summary'
  and title in (
    'A single control gap is holding back a stronger underlying position',
    'One or more control gaps are holding back a stronger underlying position'
  )
  and body ilike '%non-negotiable control%';
