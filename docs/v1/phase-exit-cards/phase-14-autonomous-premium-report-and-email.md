# Phase 14 Exit Card - Autonomous Premium Report and PDF Email Delivery

> Superseded for merge-readiness purposes on 14 July 2026. This card records historical isolated UAT, but its former pass conclusion predates the independent adversarial review. Use `docs/v1/phase14/adversarial-remediation-2026-07-14.md` for the current control and verification position.

## Status

**Code, database, Node 24 Chromium, live AI Gateway, live Resend send, signed webhook and final clean-preview assurance: Pass on isolated UAT infrastructure.**

PR #21 remains draft and unmerged. Do not mark merge-ready until an independent review-only session inspects the final clean diff and evidence.

Customer-wide automation remains disabled.

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
- `0020_phase14_privileged_function_grants.sql`

Verified:

- RLS enabled on all new operational tables;
- anonymous access absent;
- authenticated admin RLS helper execution preserved;
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

Funded AI Gateway UAT verified:

- live `openai/gpt-5.5` structured narrative generation;
- contextual maturity-validator repair;
- controlled repair after invalid first pass;
- deterministic fallback after controlled provider failure;
- deterministic score, maturity, exposure and gap authority preserved.

Live Resend and signed webhook UAT verified:

- deployment `dpl_3RvMHqyoL37y9kSXSUaLSNLVVfvG` at commit `2189ecd374e9d8de5976f8b9d7409a01c50f8b55` returned HTTP `200` for the V7 email send route;
- one email event exists for V7;
- one provider message ID exists;
- cumulative attempt number is `3`, reflecting two pre-provider/configuration failures and one successful provider-accepted send;
- V7 status is `released`;
- fulfilment is `completed` at `email_sent`;
- a repeated non-force delivery request returned `reusedExistingSend=true` and did not create another email event or provider message;
- missing signature, invalid signature and stale timestamp webhooks were rejected;
- valid delivered webhook for the real V7 provider message was accepted and persisted;
- duplicate delivered provider event was idempotent;
- older `email.sent` event did not regress delivered state;
- unknown provider message was ignored;
- synthetic isolated bounce and complaint fixtures transitioned correctly;
- unrelated synthetic fixture was not mutated;
- synthetic webhook fixtures were removed after evidence capture;
- stored PDF checksum matched the report checksum and email metadata attachment checksum.

Manual inbox receipt and PDF-open confirmation were not independently performed by Codex in this pass. Dispatch acceptance, provider message creation, delivery-state mutation and attachment checksum integrity are evidenced.

## Final clean verification

Final clean commit `5b8c3cd878add5b264ba4cfeee6d8e523419d298` removed the temporary webhook UAT harness.

- GitHub source lookup for `src/app/api/internal/phase14-webhook-uat/route.ts` at that commit returned `404`.
- GitHub Actions `V1 Verification` run `29348727938` / run number `924`: success.
- GitHub Actions `Supabase Migration Replay` run `29348728686` / run number `114`: success.
- Vercel deployment `dpl_4qJNJh1rRdWwyz5obpUUH9E3Suob`: READY.
- Deployment URL: `https://mk-fraud-readiness-score-d9kycvwo1-tondanis-projects.vercel.app`.
- Deployment metadata commit: `5b8c3cd878add5b264ba4cfeee6d8e523419d298`.
- Deployment metadata branch: `phase14/autonomous-premium-report-engine`.
- Health route `/score/api/health`: HTTP `200`, phase `phase-14-autonomous-premium-report-engine`.

A direct request to the removed internal route could not be used as app-level `404` proof because Vercel protected-preview SSO intercepted the request before app routing. The merge-state proof is the exact deployment metadata plus the GitHub `404` for the removed route file at the deployed commit.

## Cleanup and isolation

- Temporary UAT admin auth user: soft-deleted, permanently banned, password removed.
- Temporary UAT admin profile: revoked.
- Temporary synthetic webhook fixtures: deleted after evidence capture.
- Temporary webhook UAT route: removed before final clean PR state.
- UAT flags: all Phase 14 automation flags remain off and `premium_report_test_recipient_override=null`.
- Production Supabase: read-only confirmation only; no matching UAT records and all Phase 14 flags remain off.

## Remaining gate

Independent review-only session must inspect the final diff and evidence.

## Merge and rollout gate

Keep PR #21 draft and unmerged. Do not enable any Phase 14 automation flag, send customer email, or mark the PR merge-ready from this session.

After independent review approval, rollout must still keep flags off at merge, then use a monitored controller-approved enablement sequence.
