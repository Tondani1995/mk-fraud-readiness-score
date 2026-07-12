# Phase 14 Exit Card - Autonomous Premium Report and PDF Email Delivery

## Status

**Code, database and Node 24 Chromium assurance: Pass**

**Exact supported-Workflow Vercel preview, live AI Gateway and live Resend delivery assurance: Outstanding external gates**

PR #21 remains draft and unmerged. Customer-wide automation remains disabled.

## Locked product outcome

The R5,000 Essential Self-Assessment Report is designed to operate without routine human approval:

- confirmed payment creates or reuses one fulfilment;
- deterministic assessment evidence remains authoritative;
- AI drafts narrative-only sections;
- non-AI validation checks every narrative;
- one repair attempt is permitted;
- deterministic approved content is the automatic fallback;
- Chromium renders and privately stores a versioned PDF;
- the PDF is emailed as an attachment when the separate email flag is enabled;
- authorised manual send and resend remain fallbacks.

The R50,000 personalised engagement remains human-led and outside the automation workflow.

## Completed code assurance

- Node.js moved to 24.x through a controlled compatibility spike.
- Next.js remains 14.2.35.
- React remains 18.
- Workflow SDK is pinned to supported release 4.6.0.
- AI SDK is pinned to 6.0.83 with schema-constrained output.
- Zod is pinned to 4.1.8.
- Existing Phase 7-13 regression suites pass.
- Phase 14 autonomous report-engine tests pass.
- Phase 14 PDF email-delivery and webhook tests pass.
- Platform hardening tests pass.
- TypeScript passes.
- The production application build passes.
- Packaged Chromium launches under Node 24 and renders a valid PDF artifact.
- The Node 24 PDF artifact was visually checked with no clipping, broken glyphs or rendering artefacts.

## Applied database assurance

Applied and verified:

- `0017_phase14_autonomous_report_engine.sql`
- `0018_phase14_pdf_email_delivery.sql`
- `0019_phase14_email_delivery_state_hardening.sql`

Verified:

- RLS enabled on all new operational tables;
- anonymous access absent;
- authenticated access limited to SELECT with admin RLS;
- service-role application access preserved;
- one active fulfilment per order;
- one generation attempt number per fulfilment;
- workflow-run uniqueness;
- provider-webhook event uniqueness;
- retry-safe provider-event processing;
- updated-at trigger operation;
- no temporary UAT rows remain;
- no new Phase 14 security-advisor findings;
- no unindexed foreign keys on new Phase 14 objects.

## AI controls

AI cannot calculate or change:

- scores;
- maturity;
- exposure;
- domain results;
- gaps;
- maturity caps;
- roadmap priorities or actions;
- commercial, payment, report or release status.

AI output must match the structured schema and cite known evidence references. Unsupported benchmarks, numbers, guarantees, certification claims, legal conclusions, contradictions and unknown references are blocking validation failures.

## Email controls

- The PDF is read from private storage and attached to the email.
- Resend requests use provider idempotency keys.
- Test-recipient delivery cannot release a customer report.
- Failed pre-provider attempts may be atomically retried.
- Provider-accepted messages are reconciled rather than blindly resent.
- Forced resend creates a separate attempt.
- Webhook signatures and replay windows are validated.
- Every provider webhook event is persisted.
- Duplicate, stale and out-of-order webhook events cannot regress delivery status.
- Manual send and resend are restricted to `platform_admin` and `approver`.

## Feature-flag position

The following remain disabled:

- `premium_report_auto_fulfilment_enabled`
- `premium_report_ai_narrative_enabled`
- `premium_report_auto_email_enabled`
- `r50000_automation_enabled`

`premium_report_test_recipient_override` remains null.

## Completed UAT

Database UAT used a historical paid R5,000 order and verified:

- fulfilment creation;
- idempotent fulfilment reuse;
- rejection of a second active fulfilment;
- generation-attempt uniqueness;
- trigger behaviour;
- ordinary-role access restrictions;
- complete cleanup after testing.

Node 24 runtime UAT verified real Chromium launch and valid PDF rendering in CI.

## Remaining gates

The following cannot be accepted until an exact supported-Workflow Vercel deployment is available:

1. invoke the preview-only paid-order harness twice;
2. prove one fulfilment and one workflow run;
3. prove a real premium report and one private storage object;
4. prove deterministic fallback in the deployed workflow;
5. prove one controlled real AI narrative through AI Gateway;
6. send a PDF to a controlled test recipient through Resend;
7. prove test-recipient isolation, duplicate send, forced resend and signed webhook handling;
8. inspect exact-head Vercel runtime logs;
9. remove the temporary preview-only UAT route;
10. rerun the final exact-head CI and Vercel preview.

The current Vercel project is blocking new builds through the free-plan build-rate limit. This is an external deployment gate, not a code, database or test failure.

## Merge and rollout gate

Do not merge or enable customer-wide automation until the remaining exact-preview and provider gates pass.

After they pass:

1. remove the temporary UAT route;
2. keep flags off during merge;
3. verify production deployment and logs;
4. configure controlled test recipient;
5. enable AI for one approved order;
6. verify AI and deterministic fallback;
7. enable email for test delivery;
8. verify attachment and webhook delivery;
9. remove test override;
10. enable automatic fulfilment and email through a monitored rollout.
