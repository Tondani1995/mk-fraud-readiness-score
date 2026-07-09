# MK Phase 10 Premium PDF Report Engine Specification

Phase 10 is the paid-report product layer for the MK Fraud Readiness Score. The report must feel like a premium fraud advisory deliverable, not a questionnaire export.

## Core contract

The report engine must read persisted scoring outputs and must not recalculate scores in the PDF layer. The source of truth is `score_runs`, `score_domain_results`, `score_question_traces`, `exposure_answers` and `maturity_cap_events`.

## Generation gate

For V1, an order is eligible only when the Phase 9 manual EFT workflow has marked it `payment_received` or equivalent verified state. Payment confirmation does not automatically generate a report; generation remains a separate admin action.

## Output standard

The paid report should contain an executive diagnosis, readiness/exposure interpretation, domain heatmap, priority gaps, false-comfort discussion, domain analysis, leadership roadmap and methodology limitations.

## Storage and release

Generated reports are stored privately in the `generated-reports` bucket. Admin downloads use short-lived signed URLs. There is no client portal or public file URL in this phase.

## Content governance

Draft content blocks are review-only. Real reports select active blocks only. Fallback copy is allowed during technical testing, but MK-approved blocks are required before commercial release.
