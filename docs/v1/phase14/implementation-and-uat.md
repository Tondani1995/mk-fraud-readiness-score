# Phase 14 — Autonomous Premium Report and PDF Email Delivery

## Product outcome

Phase 14 converts the R5,000 Essential Self-Assessment Report from an admin-generated consultancy workflow into an automation-first product flow:

1. a completed assessment and persisted score remain the source of truth;
2. confirmed payment creates or reuses one fulfilment;
3. a durable workflow assembles the evidence pack;
4. AI may draft narrative-only sections;
5. deterministic validation blocks unsupported content;
6. one AI repair attempt is allowed;
7. deterministic approved content is the automatic fallback;
8. Chromium renders the PDF;
9. private storage retains the versioned PDF and checksum;
10. the PDF is emailed as an attachment when email automation is enabled;
11. manual send and resend remain controlled fallbacks.

The R50,000 personalised engagement is excluded from automation.

## Authority boundary

AI cannot calculate, change or rerank:

- the overall score;
- calculated or final maturity;
- exposure score or band;
- domain scores or coverage;
- critical or major gaps;
- maturity caps;
- roadmap priorities, owners or timing;
- payment, order, report or release status.

AI receives a sanitised, versioned evidence pack and may produce only schema-constrained narrative sections with explicit evidence references. The non-AI validator verifies section completeness, known evidence references, domain and gap ownership, prohibited claims, unsupported numbers, contradictions and internal-data leakage.

## Recovery model

The standard generation sequence is:

- AI generation;
- deterministic validation;
- one AI repair attempt when validation fails;
- deterministic fallback when generation, repair, gateway access or validation remains unsuccessful.

Routine human approval is not required. Human intervention is reserved for unrecoverable evidence, persistence, storage, rendering, delivery or disputed-outcome exceptions.

## Durable fulfilment state

`report_fulfilments` records one idempotent operational journey per order and score run. The active-state uniqueness constraint prevents concurrent fulfilments for the same order. Workflow start is separately claimed through `not_started`, `starting`, `started` and `failed` states to prevent duplicate workflow runs.

`report_generation_runs` records generation mode, provider, model, prompt/schema versions, evidence checksum, sanitised evidence, structured output, validation results, token counts, latency and errors.

The workflow uses four replay-safe steps:

1. validate the persisted fulfilment references;
2. generate, validate, render and store the report;
3. verify the complete delivery-ready record and private PDF object;
4. email the PDF only when the separate email flag is enabled.

## Email delivery controls

PDF delivery uses a private storage download followed by a Resend attachment send. The provider request includes an idempotency key derived from report and recipient.

The delivery engine distinguishes customer delivery from test-recipient delivery. A test delivery cannot release the customer report or complete the customer fulfilment.

Provider-accepted messages are never blindly resent when a later database write needs reconciliation. Pre-provider failures may be atomically reclaimed. Forced resend creates a distinct attempt and dedupe key.

Signed provider webhooks are verified with a five-minute replay window. Every provider event is stored in `email_provider_events`; duplicate, stale and out-of-order events cannot regress the current delivery state.

Manual send and resend are restricted to `platform_admin` and `approver` roles.

## Feature flags

All flags default to off and remain off until controlled production enablement:

- `premium_report_auto_fulfilment_enabled`
- `premium_report_ai_narrative_enabled`
- `premium_report_auto_email_enabled`
- `premium_report_test_recipient_override`

The R50,000 automation flag remains false.

## Runtime decision

Phase 14 moves the application to Node.js 24 and pins supported Workflow SDK `4.6.0`. Next.js remains 14.2.35 and React remains 18.

The previous Node 20 Chromium guard was replaced only after establishing a permanent Node 24 gate that preserves Chromium tracing, package externals and the full report regression boundary. CI now launches packaged Chromium and renders a real PDF under Node 24.

The Vercel runtime remediation pins `@sparticuz/chromium` `143.0.4`, `puppeteer-core` `24.34.0` and `@puppeteer/browsers` `2.11.0`. The renderer uses the supported zero-argument `chromium.executablePath()` path and Puppeteer default arguments rather than spoofing an AWS Lambda runtime.

## Applied database changes

The following repository migrations are applied to Supabase:

- `0017_phase14_autonomous_report_engine.sql`
- `0018_phase14_pdf_email_delivery.sql`
- `0019_phase14_email_delivery_state_hardening.sql`
- `0020_phase14_privileged_function_grants.sql`

The first migration was applied through four equivalent controlled steps because the migration tool rejected the original monolithic transaction at its safety boundary. The resulting live schema was verified against the repository migration.

## Database UAT completed

A controlled paid-order fixture was used to verify the database state machine. Verified:

- initial fulfilment creation;
- same-idempotency-key reuse;
- rejection of a second active fulfilment for one order;
- unique generation attempt number per fulfilment;
- `updated_at` trigger behaviour across separate transactions;
- anonymous access absent;
- authenticated role limited to SELECT plus admin RLS.

Post-migration advisors show no new Phase 14 security findings and no unindexed foreign keys on the new operational tables. Newly created indexes appear as unused until live traffic, as expected.

Labelled runtime-UAT records are retained only on the isolated Supabase branch as controller evidence. Production contains no matching UAT organisation, assessment or order records.

## Code and CI assurance

The verification workflow covers:

- all existing Phase 7-13 regression suites;
- autonomous report validation and fallback tests;
- PDF email delivery and webhook tests;
- Node 24 real Chromium PDF rendering;
- platform hardening and migration boundaries;
- TypeScript;
- the production application build.

The real Chromium assurance launches the packaged browser and creates a non-trivial A4 PDF under Node 24. Clean Supabase migration replay verifies the complete numeric migration chain, schema, seed state, RLS, grants and private report storage.

## Isolated Vercel runtime UAT — 14 July 2026

The Preview branch was proven to use isolated Supabase ref `nlukprffbrqmvjcmygyr`; production remained on `jvjxlphdyzerrhwcgkup`.

The R5,000 UAT order `MKORD-2026-B8C7U5WQ` completed the respondent, scoring, manual-EFT and entitlement journey. Duplicate detailed-report requests reused one order and duplicate fulfilment triggers reused one workflow run.

The first hosted PDF attempt exposed a real Node 24 packaging defect: Chromium could not load `libnspr4.so`. After the supported Chromium/Puppeteer remediation, the retained fulfilment was retried rather than replaced. Vercel runtime diagnostics then proved:

- Node `24.18.0`;
- the Chromium executable exists;
- the AL2023 native library directory exists;
- `libnspr4.so` exists;
- `LD_LIBRARY_PATH` contains the AL2023 library directory;
- the workflow rendered and stored the premium PDF successfully.

The resulting report `RPT-MKFRS-2026-5C01B4F1EE-V1` is a 310,424-byte private PDF with SHA-256 checksum `c3408eba0cee20013bc08fb3a9f609f57144ba7d813d5ab5190f76ce3548530d`.

All 21 rendered pages were visually inspected. No clipping, overlap, broken glyphs, missing fonts or rendering corruption was observed. The cover, scorecards, exposure profile, domain pages, roadmap and methodology sections are readable and consistently branded.

A release-quality presentation issue remains: several pages are materially under-filled, which makes the 21-page report feel longer than its substantive content. Pages containing the confidentiality note, methodology summary, gap dashboard, critical flag and false-comfort section should be consolidated or reflowed before customer release.

## Isolated AI runtime UAT — conditional

Three labelled, paid and manually verified R5,000 UAT orders exercised the real narrative pipeline while automatic fulfilment and email remained off:

1. normal live AI generation;
2. a controller-injected invalid first pass followed by the real repair call;
3. a controller-injected provider failure.

The injected invalid first pass was rejected with 18 blocking validation issues, confirming that unsupported benchmark/compliance claims, unknown evidence references and missing required sections cannot pass into a report.

The normal generation and repair calls both reached Vercel AI Gateway but were denied because the Vercel team does not yet have a valid payment card on file. Both scenarios safely produced validated deterministic fallback reports. The injected provider-failure scenario also produced a validated deterministic fallback report.

The fallback gate therefore passed, but live AI success and live AI repair remain blocked by external AI Gateway billing enablement. No AI token usage was recorded for the denied requests.

Throughout AI UAT:

- deterministic score-run values and input hash remained unchanged;
- all generated reports remained unreleased;
- no email or provider event was created;
- production contained no matching UAT records;
- all UAT and production Phase 14 flags were restored to off;
- the test-recipient override remained `null`.

## External enablement requirements

Before customer-wide automation is enabled, the remaining isolated gates must prove:

- a valid live AI first-pass response;
- a valid live AI repair response after validator rejection;
- controlled test-recipient PDF email delivery without customer release;
- duplicate-send and forced-resend behaviour;
- signed webhook delivery, invalid-signature rejection and duplicate/out-of-order handling;
- no fatal runtime logs.

The current external blocker is Vercel AI Gateway billing enablement. A valid payment method or an explicitly approved alternative provider configuration is required before live AI success and repair can be retested.

## Production enablement sequence

1. keep all flags off during merge and production deployment;
2. verify production health, build metadata and runtime logs;
3. enable and validate the approved AI provider billing/credential boundary;
4. complete live AI success and repair UAT;
5. configure Resend credentials, domain and webhook;
6. set a controlled test-recipient override;
7. enable email for the test-recipient order only;
8. verify attachment and webhook delivery;
9. remove the recipient override;
10. tighten the sparse PDF page layouts before customer release;
11. enable automatic fulfilment and email in a controlled production rollout;
12. monitor failure, fallback, latency, cost and delivery rates.

No customer-wide flag may be enabled before the external provider, email and final presentation gates pass.
