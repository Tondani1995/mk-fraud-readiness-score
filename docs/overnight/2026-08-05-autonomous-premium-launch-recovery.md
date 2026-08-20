# Overnight Autonomous Premium Launch Recovery

## Mandate and boundaries

This log records the authorised Preview/Staging recovery window beginning 2026-08-05. The work is limited to PR #52, Preview, and Staging Supabase project `penhenkzfrtmcxklodtu`. Production project `jvjxlphdyzerrhwcgkup` is read-only. No Production deployment, environment mutation, data mutation, real payment, real-customer contact, or merge is permitted. Historical V1–V4 records remain unchanged and the retired order is not reused.

## Initial state

- Repository: `Tondani1995/mk-fraud-readiness-score`
- PR: #52, open, draft, unmerged
- Branch: `feature/adaptive-production-foundation-v1`
- SHA: `e5eef96f35b4cdfd0a1e70e0c0a1194ea93d5d81`
- Preview deployment: `dpl_4TUPCHFkyw729HeTVbGsttRR1SPq`
- Preview URL: `https://mk-fraud-platform-gmz7hnj4x-tondanis-projects.vercel.app`
- Staging: `penhenkzfrtmcxklodtu`
- Production: `jvjxlphdyzerrhwcgkup`
- Current G29 run: `31048952056`, passed
- Historical V4 AI attempt: `6f7ebe41-6367-4506-b574-1328c324d9b0`, `provider_result_uncertain`, not retried

## Initial gate status

- G29: passed on the current SHA and deployment.
- G40: open; V4 timed out at the application’s 45-second AI timeout and fell back deterministically.
- G41: open; no successful real-AI report exists.
- G30: not started.
- Production non-mutation baseline: orders 23, reports 23, email events 75, provider events 0, migrations 34.

## Decision log

### 2026-08-05 23:49 SAST — baseline and control setup

- Decision: create this durable log and one rolling PR checkpoint before corrective work.
- Evidence: exact current SHA/deployment metadata, PR state, Staging migration ledger, and read-only Production aggregates.
- Options rejected: using the retired V4 order for another attempt; carrying current-SHA evidence onto a successor SHA.
- Reason: preserves idempotency and exact-SHA certification validity.
- Risk: documentation changes will create a successor SHA; mitigated by rerunning mandatory workflows.
- Result: control log created; no runtime or database mutation performed.
- Owner approval tomorrow: merge, Production authority/model/env changes, real payment/email activation, and public launch only.

### 2026-08-06 00:07 SAST — timeout, prompt, telemetry and PDF correction slice

- Decision: extend the application AI window to 240 seconds inside the 300-second Preview route budget, with no automatic provider retries, and add safe phase telemetry plus explicit timeout classification.
- Evidence considered: the retained V4 elapsed at 45,164 ms exactly matched the former 45,000 ms application abort; the route and Staging AI-attempt constraint both needed to accommodate a bounded longer request.
- Options rejected: retrying V4, increasing the window without a database constraint update, or logging prompts/customer content for diagnosis.
- Reason: preserves the historical journey, makes the timeout boundary explicit, and records only technical identifiers, provider/model, Gateway generation ID and safe timing status.
- Risk introduced: a longer in-flight request can approach the platform limit; mitigated by the 30-second post-provider margin, 300-second route export, no retries, and durable accounting/phase evidence.
- Result: Staging constraint was extended to 300,000 ms by migration `20260805215454 / pre_g30_ai_timeout_window`; local timeout, accounting, budget, narrative-integrity, typecheck and build checks pass.
- Prompt decision: the compact evidence projection and repair boundaries were tightened. On the same weak-fixture baseline, the generation prompt is 44,983 bytes (approximately 11,246 tokens), below the configured limit; no customer prompt data is emitted by telemetry.
- PDF decision: V7 Checkpoint F initially found four isolated near-empty continuation pages. Normal-flow domain cards and an intact roadmap-table boundary removed those pages; the rerendered four-candidate audit has zero blocking failures and is pixel-identical on repeated renders.
- Owner approval tomorrow: none for this correction slice; successor-SHA workflow and Preview deployment evidence are still required before any synthetic AI call.

### 2026-08-06 00:24 SAST — exact-SHA regression-gate alignment

- Decision: correct only the test and contract boundaries exposed by the additive Staging timeout migration; no product or Production behavior was changed.
- Evidence: the migration replay fixture failed because it still exercised the former 45,000 ms constraint; Production postflight failed because it counted the Staging-only migration against the approved 88-file Production ledger; the service-role manifest had stale line-bound exclusions after telemetry additions.
- Corrections: the disposable migration replay now applies `20260805200000_pre_g30_ai_timeout_window.sql`; Staging canonical-set checks expect 89 files; Production postflight explicitly excludes that Staging-only migration; service-role manifest line bindings were updated without changing the inventory hash.
- Result: focused local gates pass — Checkpoint E migration replay 4/4, near-real-time fulfilment 37/37, service-role AST analysis passes with inventory hash `69e85167c4d40f32d0973999c3e8f04705587b0312a4c46d2304225e384934f0`.
- Safety: no database, provider, payment, email, Storage, or Production mutation was performed by this correction slice. The six explicit test/manifest files are ready for the next successor commit and exact-SHA workflow rerun.

### 2026-08-06 00:29 SAST — synthetic notification manifest alignment

- Decision: update only the manifest’s line-bound references for the premium report delivery function and dispatch statement after the telemetry insertion; no application behavior changed.
- Evidence: exact-SHA V1 and Supabase runs stopped at `premium_report_pdf function source line drifted`; the implementation is intact and the local contract test passes after updating `functionLine` 126→127 and `messageLine` 280→289.
- Result: `npm run rc1:test-synthetic-notification-contract` passes with four expected external messages, four expected callbacks, seven deterministic failure cases, and duplicate-prevention assertions.
- Safety: this is the third corrective commit in the authorized overnight budget; no runtime or Production mutation was performed. A successor exact-SHA workflow batch is required.

### 2026-08-06 00:27 SAST — Production postflight Staging-only exclusion

- Decision: correct the disposable Production pre/postflight harness to exclude `20260805200000_pre_g30_ai_timeout_window.sql` from its simulated Production ledger; leave the approved Production postflight SQL and its 88-migration / `20260805150000` assertions unchanged.
- Evidence: the exact-SHA harness failed only because the timeout migration was included in the simulated Production ledger, producing 89 rows and newest `20260805200000`. The migration is Staging-only by design.
- Result: local `npm run rc1:test-prepostflight` passes, including the required malformed-state, frozen-secret, cleanup, certification-control, freeze-race, and all defect STOP cases.
- Safety: test harness correction only; no application, database, provider, payment, email, Storage, or Production mutation. This is the fourth corrective commit in the overnight budget.

### 2026-08-06 00:42 SAST — live Gateway identity-shape correction

- Decision: accept the current AI Gateway routing shape without weakening identity verification. When the legacy top-level `resolvedProviderApiModelId` is absent, resolve it only from a successful matching `routing.modelAttempts[].providerAttempts[]` entry’s `providerApiModelId`; provider, original model, canonical model, generation ID and SDK contradiction checks remain mandatory.
- Evidence: model discovery returned 317 available models and confirmed `openai/gpt-5.5` with a 1,000,000-token context and published pricing. The first structured probe reached OpenAI in 7.6 seconds but was rejected solely because the old parser expected the absent top-level field. A safe metadata inspection confirmed the nested provider-attempt shape and persisted generation metadata.
- Focused result: identity parser fixture including nested provider attempts, timeout architecture, and typecheck all pass locally. The failed probe is not a certification journey and produced no report, payment, Storage, or email mutation.
- Safety: this is the fifth corrective commit in the overnight budget. The exact affected workflows and Preview deployment must be rerun before any further provider call.

### 2026-08-06 00:55 SAST — live SDK response identity correction

- Decision: accept the live AI Gateway shape’s successful OpenAI provider attempt together with the AI SDK `response.modelId` as the resolved model identity when Gateway routing omits `providerApiModelId`; retain provider, requested/canonical model, generation ID and SDK contradiction checks.
- Evidence considered: two safe live metadata probes showed `routing.modelAttempts[].providerAttempts[]` contains `provider=openai` and `success=true` but no API-model field, while the response contains `modelId=openai/gpt-5.5`. The first post-`2321a37` probe therefore failed only at the missing resolved-model field.
- Options rejected: accepting an unverified default model, weakening the provider or model checks, retrying the retired V4 attempt, or treating deterministic fallback as G40 success.
- Result: focused identity and typecheck tests pass; commit `cc24dc3` is the sixth and final authorized corrective commit. No report, payment, Storage, email or Production mutation occurred.
- Owner approval tomorrow: no approval for this Preview/Staging parser correction; merge and all Production actions remain owner-controlled.

### 2026-08-06 00:58 SAST — exact-SHA G29 evidence review

- Result: the deployment-bound G29 run completed with all product baseline, adaptive Staging, loopback DB, legacy respondent, responsive Preview and immutable deployment jobs green. Its retained-PDF review confirmed Storage bytes `329740`, PDF magic, checksum `49e8509c…8939b5`, and all required content checks.
- Bounded failure: the application signed-access route returned `423 RC1_OPERATION_FROZEN` because Staging was frozen. Direct signed Storage probes returned HTTP 200 with the exact expected PDF. The route’s freeze response is preserved as a safety control; no unfreeze or route bypass was performed.
- Migration replay: exact-SHA run `31053847465` passed. Dispatch-bound G29 run `31054039673` failed only on the frozen customer-token route and its merged result consequently failed; this is not carried as a green G29 claim.

## Safe action ledger

| Time | Action | Environment | Result | Evidence |
|---|---|---|---|---|
| 2026-08-05 23:18 | Redeployed unchanged correction SHA after removing stale Preview SHA override | Preview | READY | `dpl_4TUPCHFkyw729HeTVbGsttRR1SPq` |
| 2026-08-05 23:19 | Refreshed Staging AI authority | Staging | exact SHA, PR 52, OpenAI `openai/gpt-5.5`, epoch 2 | Supabase authority RPC/readback |
| 2026-08-05 23:49 | Read-only baseline | Staging/Production | Production aggregate unchanged; Staging retained V1–V4 | Supabase SQL/readback |
| 2026-08-06 00:07 | Applied Staging-only timeout migration | Staging | constraint now 1,000–300,000 ms; Production unchanged | migration `20260805215454` and constraint readback |
| 2026-08-06 00:07 | Focused local correction tests | Local | V7 E 28/28, V7 F audit 0 failures, AI accounting, attempt budget, narrative integrity, typecheck and build passed | local test output; build warning unchanged |
| 2026-08-06 00:24 | Regression-gate alignment tests | Local | migration replay 4/4, near-real-time fulfilment 37/37, service-role AST analysis passed | local test output; no runtime mutation |
| 2026-08-06 00:54 | Safe live Gateway metadata probes | Preview | successful OpenAI responses; `routing.modelAttempts` has no provider API-model field; SDK response model is `openai/gpt-5.5` | generation IDs recorded only in local safe output |
| 2026-08-06 00:56 | Staging authority rebind | Staging | exact SHA `2321a37…`, PR 52, Preview, OpenAI `openai/gpt-5.5`, epoch 2 | `set_pre_g30_staging_ai_authority` and readback |
| 2026-08-06 00:58 | Deployment-bound G29 evidence | Preview/Staging | core jobs green; retained route blocked by intentional frozen state; direct Storage PDF exact | workflow `31054039673` |

## Provider ledger

| Call | Purpose | Type | Model | Status | Cost |
|---|---|---|---|---|---|
| V4 historical | Retired diagnostic journey | synthetic Staging | `openai/gpt-5.5` | timeout / uncertain; excluded from overnight calls | unverified |
| Small structured probe (pre-parser correction) | Provider diagnostic | Preview | reached OpenAI; rejected by parser for missing resolved model | `gen_01KZA25MBHY2MCK869FSP94HHR`; cost `0.000725` |
| Metadata inspection (pre-parser correction) | Provider diagnostic | Preview | confirmed live routing shape | `gen_01KZA267BVYBP2GQXCD946PT4B`; cost `0.000725` |
| Post-`2321a37` small structured probe | Provider diagnostic | Preview | reached OpenAI; parser still rejected missing resolved model | safe result; no report mutation |
| Live-shape metadata inspection | Provider diagnostic | Preview | successful OpenAI; response model `openai/gpt-5.5`; no provider API-model field | `gen_01KZA267BVYBP2GQXCD946PT4B`-class safe metadata; cost `0.000725` |

## Checkpoints

- [x] Root-cause confirmation and initial baseline
- [x] Timeout and observability correction (local and Staging correction complete)
- [x] Provider diagnostic (model discovery and safe metadata probes; full synthetic probe pending parser correction)
- [ ] Successful exact-SHA workflow set for final `cc24dc3`
- [ ] New Preview deployment for final `cc24dc3`
- [ ] Synthetic certification
- [ ] G40/G41 decision
- [ ] G30 decision
- [ ] Final morning handover

## Open issues

The confirmed initial defect was an application-side 45-second timeout that matched the V4 elapsed time. The successor correction is locally verified and applied to Staging; V4 remains uncertain and is not eligible for delivery or certification.

## Morning approvals

Only owner-level approvals remain eligible for the morning handover: PR merge, Production database/environment/AI authority changes, Production model selection, domain promotion, real payment/email activation, public launch, and acceptance of any residual launch risk.

## 2026-08-06 01:45 SAST — final-SHA G29 runtime attempt and closure decision

- Authoritative final SHA: `cc24dc34de7c3a394d92839e30cba70b7773079c`.
- Authoritative Preview deployment: `dpl_GL8yN7MoGJFuCEfHFaoCPv5jJryv`, READY at `https://mk-fraud-platform-llay7r9ds-tondanis-projects.vercel.app`.
- Exact-SHA mandatory workflows all passed: Security Scans `31054564210`, V1 Verification `31054564194`, G29 certification evidence `31054564237`, V7 Report Hardening `31054564202`, Phase 2-3 Release Safety `31054564209`, Phase 1 Release Safety `31054564193`, and Supabase Migration Replay `31054564197`.
- Decision: use the authorised single new synthetic journey through the customer UI, then the existing service-role payment RPC and the existing protected Staging worker workflow. No owner authentication, real payment, Production operation, or new code path was used.
- Baseline before commercial mutation: assessment `MKFRS-2026-54F543F55A` was `scored`, score run `completed`, graph snapshot `MFRS-V1.1-ADAPTIVE-DRAFT-20260804`, order/payment/report/email counts were `0/0/0/0`.
- Journey result: order `MKORD-2026-ZYZAAFEI`; one `PAID` transition (`c445a683-3379-42fc-b12c-d78c3177a753`, `manual_admin`, `authorised_manual_confirmation`, processing result `applied`); exactly one queued attempt `cf7ca395-48d5-4415-bc1c-c3d4f631e4b8`.
- Existing order side effects remained bounded: three email events only (`internal_eft_order_created` queued, customer confirmation delivered, admin notification delivered), with no premium-report email. No report, generation run, AI attempt, delivery authorisation, delivery finalisation, or synthetic report Storage object was created.
- Worker workflow `31057188098` reached the exact SHA and deployment and returned HTTP `200` with `claimed=true`, `outcome=RETRY_SCHEDULED`, `errorCategory=commercial_quality_failed`, and Vercel request ID `iad1::69vqr-1785973262038-e77c7302c95f`. The safe runtime artifact reported `worker_release_incomplete`.
- Staging diagnostic: `QG_AI_EVIDENCE_REF_DUPLICATE` from `ai-evidence`. The failure occurred before AI dispatch (`generation_runs=0`, `ai_attempts=0`), so no provider spend or ambiguous provider identity was created by the journey.
- Root cause: the visibility-only adaptive evidence model emits the same `evidence:VIS-*` identifiers through both the evidence checklist and visibility-gap evidence entries. This is a genuine application defect, not a provider failure. The six-commit overnight correction allowance is exhausted, so no further correction commit is authorised in this window; the journey is preserved for diagnosis and no retry was attempted.
- Production read-only post-check remains unchanged: orders `23`, reports `23`, email events `75`, provider events `0`, migrations `34`.
- Decision: G40 and G41 remain open; G30 must not begin. The exact remaining blocker is the uncorrected `QG_AI_EVIDENCE_REF_DUPLICATE` defect preventing a real-AI report from reaching PDF, Storage, delivery, and independent runtime evidence.

## 2026-08-06 09:55 SAST — authorised visibility-evidence identity correction

- Decision: use the explicitly authorised additional narrow corrective commit to separate the visibility condition identity from its evidence-checklist artefact. The checklist keeps its existing `evidence:VIS-*` reference; the condition uses `visibility-gap:<gap.id>` and links to the checklist, question and domain references.
- Focused evidence: `g27:test-adaptive-correction` passes; it proves unique visibility identities, one condition and one checklist artefact per gap, exact linkage, deterministic canonical JSON/checksum, fail-closed duplicate visibility identity handling, narrative evidence retention, and unchanged ordinary exposure-assessed output. V7 Checkpoint D passes 23/23 and Checkpoint E passes 28/28. The G29 runner already includes the adaptive-correction, V7 D and V7 E suites.
- First journey containment: attempt `cf7ca395-48d5-4415-bc1c-c3d4f631e4b8` was parked through the existing authoritative `rc1_park_fulfilment_attempt` control with reason `superseded_by_visibility_evidence_identity_fix`. It is now `MANUAL_REVIEW_REQUIRED`, has no lease and no next retry time, and is not claimable. The original `QG_AI_EVIDENCE_REF_DUPLICATE` diagnostic, assessment/order/payment and three existing email events remain unchanged; AI attempts, reports, delivery authorisations, premium email and report Storage remain zero. One authoritative parking audit event exists.
- Safety: no migration, Production operation, provider configuration, payment state, report state or email was changed by this correction. The pre-existing dirty log was retained and extended; `supabase/.temp` and `tmp` remain unstaged.
- Next exact-SHA gates: typecheck/build, one narrow commit and push, mandatory exact-SHA workflows, READY Preview deployment and Staging authority rebind, then one fresh and final second synthetic journey. No third journey is authorised. G40/G41 remain open until real-AI, PDF/Storage, delivery and independent evidence all pass.
