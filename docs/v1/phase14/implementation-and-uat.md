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

## Applied database changes

The following repository migrations are applied to Supabase:

- `0017_phase14_autonomous_report_engine.sql`
- `0018_phase14_pdf_email_delivery.sql`
- `0019_phase14_email_delivery_state_hardening.sql`

The first migration was applied through four equivalent controlled steps because the migration tool rejected the original monolithic transaction at its safety boundary. The resulting live schema was verified against the repository migration.

## Database UAT completed

A controlled paid-order fixture was used without leaving test records. Verified:

- initial fulfilment creation;
- same-idempotency-key reuse;
- rejection of a second active fulfilment for one order;
- unique generation attempt number per fulfilment;
- `updated_at` trigger behaviour across separate transactions;
- anonymous access absent;
- authenticated role limited to SELECT plus admin RLS;
- all temporary fulfilment and generation rows removed.

Post-migration advisors show no new Phase 14 security findings and no unindexed foreign keys on the new operational tables. Newly created indexes appear as unused until live traffic, as expected.

## Code and CI assurance

The verification workflow covers:

- all existing Phase 7–13 regression suites;
- autonomous report validation and fallback tests;
- PDF email delivery and webhook tests;
- Node 24 real Chromium PDF rendering;
- platform hardening and migration boundaries;
- TypeScript;
- the production application build.

## External enablement requirements

Before customer-wide automation is enabled, the exact supported-Workflow head must complete one Vercel preview UAT proving:

- two queue attempts create one fulfilment;
- two start attempts create one workflow run;
- real report generation completes;
- Node 24 Chromium renders a real premium PDF;
- one report version and one storage object are created;
- AI success and deterministic fallback are both observed;
- test email sends a PDF attachment without releasing the customer report;
- duplicate send and forced resend behaviour are correct;
- signed webhook delivery and duplicate handling are correct;
- no fatal runtime logs occur.

The preview deployment is currently blocked by the Vercel project build-rate limit. This is an external deployment gate, not a code or database failure.

## Production enablement sequence

1. keep all flags off during merge and production deployment;
2. verify production health, build metadata and runtime logs;
3. configure AI Gateway and Resend credentials/domain/webhook;
4. set a controlled test-recipient override;
5. enable AI narrative for one approved UAT order;
6. verify AI success and fallback;
7. enable email for the test-recipient order only;
8. verify attachment and webhook delivery;
9. remove the recipient override;
10. enable automatic fulfilment and email in a controlled production rollout;
11. monitor failure, fallback, latency, cost and delivery rates.

No customer-wide flag may be enabled before the external preview and provider gates pass.
