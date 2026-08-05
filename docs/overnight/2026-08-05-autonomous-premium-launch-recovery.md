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

## Safe action ledger

| Time | Action | Environment | Result | Evidence |
|---|---|---|---|---|
| 2026-08-05 23:18 | Redeployed unchanged correction SHA after removing stale Preview SHA override | Preview | READY | `dpl_4TUPCHFkyw729HeTVbGsttRR1SPq` |
| 2026-08-05 23:19 | Refreshed Staging AI authority | Staging | exact SHA, PR 52, OpenAI `openai/gpt-5.5`, epoch 2 | Supabase authority RPC/readback |
| 2026-08-05 23:49 | Read-only baseline | Staging/Production | Production aggregate unchanged; Staging retained V1–V4 | Supabase SQL/readback |
| 2026-08-06 00:07 | Applied Staging-only timeout migration | Staging | constraint now 1,000–300,000 ms; Production unchanged | migration `20260805215454` and constraint readback |
| 2026-08-06 00:07 | Focused local correction tests | Local | V7 E 28/28, V7 F audit 0 failures, AI accounting, attempt budget, narrative integrity, typecheck and build passed | local test output; build warning unchanged |
| 2026-08-06 00:24 | Regression-gate alignment tests | Local | migration replay 4/4, near-real-time fulfilment 37/37, service-role AST analysis passed | local test output; no runtime mutation |

## Provider ledger

| Call | Purpose | Type | Model | Status | Cost |
|---|---|---|---|---|---|
| V4 historical | Retired diagnostic journey | synthetic Staging | `openai/gpt-5.5` | timeout / uncertain; excluded from overnight calls | unverified |
| Overnight calls | None yet | — | — | budget available | 0 recorded |

## Checkpoints

- [x] Root-cause confirmation and initial baseline
- [x] Timeout and observability correction (local and Staging correction complete)
- [ ] Provider diagnostic
- [ ] Successful exact-SHA workflow set
- [ ] New Preview deployment
- [ ] Synthetic certification
- [ ] G40/G41 decision
- [ ] G30 decision
- [ ] Final morning handover

## Open issues

The confirmed initial defect was an application-side 45-second timeout that matched the V4 elapsed time. The successor correction is locally verified and applied to Staging; V4 remains uncertain and is not eligible for delivery or certification.

## Morning approvals

Only owner-level approvals remain eligible for the morning handover: PR merge, Production database/environment/AI authority changes, Production model selection, domain promotion, real payment/email activation, public launch, and acceptance of any residual launch risk.
