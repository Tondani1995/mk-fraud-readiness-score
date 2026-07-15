# Phase 14A — Autonomous Premium Report Engine

## Product outcome

Phase 14A changes the R5,000 Essential Self-Assessment Report from a permanently manual generation model into a feature-flagged autonomous fulfilment foundation.

The intended normal flow is payment confirmation, one idempotent fulfilment, deterministic evidence assembly, controlled narrative generation, deterministic validation, one repair attempt, deterministic fallback where needed, PDF rendering, private storage and readiness for PDF email delivery.

Routine human approval is not part of the target operating model. Manual generation remains available as an operational fallback.

The R50,000 MK-validated engagement remains a human-led enquiry and is explicitly excluded from autonomous fulfilment.

## Deterministic authority

The existing scoring and recommendation system remains authoritative for:

- overall score;
- calculated and final maturity;
- exposure score and exposure band;
- domain scores and coverage;
- critical and major gaps;
- maturity caps;
- roadmap priority, owners, severity and actions.

AI is restricted to evidence-cited narrative fields. It cannot calculate, replace or rerank deterministic results.

## Automation controls

Migration `0017_phase14_autonomous_report_engine.sql` adds:

- `report_fulfilments` for one replay-safe state machine per order and score run;
- `report_generation_runs` for generation and validation provenance;
- report links to the successful fulfilment and generation run;
- private operational RLS boundaries;
- feature flags, all disabled by default.

The migration is prepared only and must not be applied before controller review.

The flags are:

- `premium_report_auto_fulfilment_enabled`;
- `premium_report_ai_narrative_enabled`;
- `premium_report_auto_email_enabled`;
- `premium_report_test_recipient_override`.

Missing configuration or database access always resolves to automation disabled.

## Narrative pipeline

The evidence pack contains stable references for persisted scores, maturity, exposure, domains, gaps, caps and deterministic roadmap items. It excludes contact details, EFT details, admin notes, access tokens and secrets. A canonical JSON representation is SHA-256 hashed for provenance.

AI SDK 6.0.83 is pinned because it supports the existing Node 20 runtime. Structured output uses `generateText` with `Output.object` and a strict Zod schema. The model is configurable and defaults to `openai/gpt-5.5` through Vercel AI Gateway.

Every output passes a non-AI validator. The validator checks section completeness, domain and question identities, evidence references, prohibited claims, unsupported numbers, internal leakage, length limits and maturity/exposure contradictions.

One repair attempt is allowed. Provider failures, invalid repairs or an unavailable generator use the existing approved deterministic content automatically. Only evidence, persistence, rendering or storage failures should require human exception handling.

## Shared report service

The original admin report route now delegates to a shared report service. The same service supports administrator and automated actors while preserving existing report references, versioning, private storage, PDF design, checksums, supersession and audit records.

A fulfilment retry reuses its persisted report rather than creating another active version. Orphaned storage objects are removed before one controlled upload retry.

## Payment and admin alignment

When the auto-fulfilment flag is enabled, marking an eligible R5,000 order as `payment_received` creates or reuses one queued fulfilment. With the flag disabled, production behaviour remains unchanged.

The admin order page shows fulfilment status, current step, generation mode, attempts and failures. Manual generation is presented as a fallback rather than the intended normal process.

## Deliberate remaining work

Phase 14A does not yet:

- apply migration `0017`;
- enable any automation flag;
- start a Vercel durable workflow automatically;
- send customer email;
- process delivery or bounce webhooks;
- provide manual send/resend controls;
- automate the R50,000 engagement.

The next controlled work is exact-head CI and preview correction, migration review and application, durable workflow integration, fixture UAT, and Phase 14B PDF attachment delivery.
