-- Found during Gate B schema reconciliation: reports.template_id is NOT NULL with a FK to
-- report_templates, but report_templates had zero rows - meaning report generation would
-- fail on the very first attempt with a not-null/FK violation. This is a genuine defect in
-- the Phase 10 V2 delivery, not a pre-existing gap - the generate-report route never set
-- template_id at all.
--
-- Unlike report_content_blocks (narrative voice, correctly gated draft/active pending MK's
-- review), a report_templates row represents approved STRUCTURE - which HTML/CSS template
-- definition is in use - not advisory content. Inserting this as 'active' is not a violation
-- of the "keep content draft" instruction; it is a different, structural concept.
--
-- Known limitation, disclosed rather than hidden: the actual rendering code
-- (report-template.ts) does not yet differentiate by report_type/package tier - the same
-- template renders regardless of whether Essential or MK-Validated was purchased. This one
-- row is referenced for all report_type values until tier-specific templates are built.

insert into public.report_templates (template_code, version_number, report_type, status, content_schema_json)
values ('phase10_premium_v2', 1, 'essential_self_assessment', 'active', '{"pageCount": 21, "engine": "html-to-pdf", "notes": "Single template used for all report_type values pending tier-specific design."}'::jsonb)
on conflict (template_code, version_number) do nothing;

