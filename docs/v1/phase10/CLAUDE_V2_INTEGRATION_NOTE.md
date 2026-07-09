# Claude V2 Phase 10 Integration Note

The Claude V2 package produced a richer 21-page premium advisory template and 36 draft content blocks. This draft branch integrates the repo-facing control surface and report-generation scaffolding first, because the direct package still needs local repo alignment and runtime testing.

## What has been integrated in this branch

- Order-reference based admin generation route.
- Persisted-score-only report data assembly.
- Private storage upload path for generated PDFs.
- Report version rows with supersession on regeneration.
- Admin order-detail controls for generation and download.
- Signed admin download route.
- Additive 0011 migration for template and private storage configuration.
- Static Phase 10 verification.

## What Codex still needs to finish

- Replace the interim report template with the full Claude V2 21-page template after local build verification.
- Bring in the complete 36 draft content blocks once MK has reviewed or explicitly approved them for draft storage in repo migration.
- Prove Puppeteer in the actual runtime environment.
- Generate a real PDF from a `payment_received` order.
- Complete the Phase 10 exit card with evidence.

## Important guardrail

This branch must remain draft and stacked until PR #12 passes runtime UAT and merges.
