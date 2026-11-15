# Release readiness: MK Fraud Readiness revised review (14 November 2026)

This is the one current release-readiness document. It supersedes `RELEASE-DECISION.md` (11 November; stale) and the 13 November version of this document. The deployed facts in `B5-DEPLOYED-RESULT.md` remain accurate as a record of the 13 November run. The finding-by-finding responses are in `CORRECTIVE-PASS-RESPONSE.md` (first review) and `RELIABILITY-CORRECTION-RESPONSE.md` (review of the corrective pass).

Everything below is local and uncommitted on `4016c0de`. No hosted evidence was produced after 13 November.

## 1. Recommendation

**Production: no-go. Paying customer cohort: no-go. Next step: one protected-preview verification run against the isolated test database (section 6), after the approvals in section 7.**

**Separately and more urgently, the production operator console appears reachable without sign-in on `mkfraud.co.za`** (section 2). This is an inference from source and configuration, not a demonstrated exploit. It concerns the live service, not this candidate, and it has a standalone containment patch that does not require deploying the revised product.

## 2. Security (`SECURITY-ADMIN-ACCESS.md`)

The inherited `getAdminSession()` acts as the highest-priority active admin profile for any request, and the Vercel project's protection scope is `all_except_custom_domains`. The prepared containment answers the console only on exact, configured, Vercel-protected hosts; it is **containment, not authentication**. It does not identify the operator or correct audit attribution. It ships as `security-containment-74b16d35.patch`, which applies cleanly to the production baseline. On that baseline, with the patch applied, it passes its tests (7 of 7, all 45 console files gated) and TypeScript. Person-bound sign-in (DR-08) is not implemented.

## 3. What is now true, and how it was shown

| Area | State | Evidence (kind) |
|---|---|---|
| Outstanding information and scenarios | Every outstanding item and scenario category reconciles on the exact bound inputs. Kestrel: 16 unanswered questions plus 4 dependent rows = 20. Marula: 2 | Reconciliation 10 of 10 (local double) |
| Interpretation wording | "In place" is qualified: 4 questioned, 86 with no conflict under the reviewed rules (15 with a weaker related practice), "which does not establish that the controls operate" | RC-06 (local double) |
| Essential entitlement | PDF-only; artefact promises blocked; advice about the organisation's own records allowed | Entitlement 4 of 4, and the review's probe (local double) |
| Paid-call accounting | Reserved before dispatch in a durable ledger. Lifetime order ceiling of 6; owner-approved campaign budget of calls and cost; refuses when unavailable or malformed | Ledger SQL 8 of 8 (local SQL); fulfilment GF-04 to GF-15 (local double) |
| Audit package | Stored before any composition; no report without it; a lost link recovered with no AI call | GF-01, GF-16 to GF-19 (local double); GL-07 (local SQL) |
| Publication | Required gates (headings found, page map converged, contents numbers verified) hold a failing PDF; advisories are recorded, never called verified | Publication gates 6 of 6; GF-22; layout 8 of 8 (local double) |
| Publication on original manuscripts | Two Kestrel Essential drafts lose all near-empty pages and gain verified contents numbers; the Kestrel Comprehensive (4,818 words) is unchanged and passes | `original-manuscript-layout.mjs` (unchanged manuscript, rejected runs) |
| Request deadline | Bounds each paid call and the start of each layout pass and of storage; stops before a step that cannot start in time, with a checkpoint to resume from. Not uniform: start-up, upload, verification and finalisation rely on the platform limit plus reconciliation (accepted limitation, section 6) | GF-10, PG-03, PG-04 (local double) |
| Automatic release | Revised orders refuse the worker's automatic trigger before any reservation | GF-03 (local double) |
| Versions | Report model 0.4.0, Fact Pack 0.2, Story Plan 0.2, validator 0.2, composer 0.2, workbook 0.2, publication 1.1, layout 1.1, pipeline 0.2, accounting 1.0, checkpoints 1.0 | Recorded in every audit package |

Regression checks run in this pass: TypeScript (no diagnostics); integrity guard (pass); report quality 16 of 16; relationship semantics 9 of 9; sufficiency adversarial 9 of 9; build 1.6 19 of 19; contract 23; report engine 17. The excellence suite is 88 of 92: gate G01 fails for the four 12 November prototype Essential manuscripts, each of which promises a supporting workbook (DR-17). The 156-script package sweep was not rerun; in the previous pass it gave 83 pass and 73 fail on both the candidate and `4016c0de`.

## 4. What is not done

| Item | Status |
|---|---|
| Durable background fulfilment (DR-14) | **Not implemented.** Generation is synchronous in the operator's request, with an end-to-end deadline and checkpoints. A worker-driven design needs changes to pinned files and an owner decision |
| Person-bound operator sign-in (DR-08) | **Not implemented.** Containment only |
| The ledger migration on any hosted database | **Not applied.** Until it is, and a campaign budget row exists, revised generation refuses every paid call (fail closed). This is by design |
| AI-written reports on the corrected code | None. The last AI outputs are the 13 November deployed runs |
| Original successful manuscripts | Not retained by the 13 November pipeline, so matched layout evidence for those three reports is impossible. Retained rejected manuscripts were used instead |
| Operator console view of the ledger, held reports and pending audit links | Order events record them; a console view would change pinned admin pages |
| Snapshot common scenario account | Labels corrected; not unified with the report sentence |
| Physical devices, screen readers, representative respondents, native Excel, hosted p95 timing, manual quality review against the 34-dimension scorecard | Not done |
| Owner decisions DR-01 to DR-17 | Open. None blocks the next preview run, except DR-15 (the campaign budget) and the approvals in section 7 |

## 5. Durable background generation: the proposal stands (DR-14)

The design in the 13 November version is unchanged, now with the ledger and checkpoints it needs already in place:
- a revised generation job claimed by lease;
- one stage per invocation;
- finalisation through the existing atomic RPCs;
- no automatic release.

It touches `src/app/score/api/internal/fulfilment-worker/route.ts` and `src/lib/reports/phase1-manual-fulfilment.ts`, each requiring an owner-approved guard exception. Until then, every revised report is generated from the operator's order page.

## 6. Next protected-preview verification step, and how its limit is enforced

**Proposed run:** the four reports on the corrected code. These are Kestrel Essential and Kestrel Comprehensive (`MKORD-2026-69BC67C1`, the case that failed live), and Marula Essential and Marula Comprehensive, each as a new version on its existing test order.

| Case | Purpose | Calls (max per attempt) |
|---|---|---|
| L-1 | Kestrel Essential: weak organisation, 16 outstanding questions | 2 |
| L-2 | Kestrel Comprehensive: the failed live case, with workbook | 2 |
| L-3 | Marula Essential: strong-but-inconsistent; qualified headline | 2 |
| L-4 | Marula Comprehensive: PDF and workbook agree; risk-register scope stated | 2 |
| L-5 | At most one operator retry on a rejected case; resume and allowance on the real gateway | 2 |

**Limit: 10 calls and US$1.00 for the whole run.** The order ceiling (6) still applies to each order.

**How it is enforced.** No step depends on anyone counting by hand:

1. The migration `20261113150000_readiness_review_generation_ledger.sql` is applied to the isolated test database `zuqegvsfhzgcydyivnqv`, and to nothing else.
2. The owner inserts one budget row: `insert into readiness_review.generation_budgets (campaign, max_calls, max_cost_usd, approved_by) values ('b5-live-2', 10, 1.00, '<owner>');`. The table is append-only, so the limit cannot be raised in place; a larger limit needs a new, separately approved campaign.
3. The branch Preview variable `MK_REVISED_CALL_CAMPAIGN=b5-live-2` is set. Without a matching row, every paid call is refused.
4. Every call is reserved in the database before it is sent, under a lock. The reservation is refused when it would take the run past 10 calls or past US$1.00, counting:
   - each settled call at its actual cost, computed from the usage the gateway reports and list prices;
   - each unsettled, failed or indeterminate call at its worst case: list price × (input characters ÷ 3) + output cap × output price, plus 10%.
5. Each call carries an output-token cap, so its worst case is bounded:

   | Call | Model | Output cap | Worst case per call |
   |---|---|---|---|
   | Writer | gpt-5-mini | 48,000 tokens | about US$0.11 |
   | Line repair | gpt-5.6-terra | 12,000 tokens | about US$0.22 |
   | Full repair | gpt-5.6-terra | 48,000 tokens | about US$0.78 |

**What happens when usage or cost cannot be read:**

| Case | Effect |
|---|---|
| Usage missing from the gateway response | The call stays at its worst case. The run may stop early; it never overspends |
| The ledger cannot be reached, or answers with an error or malformed data | The call is not made |
| The settlement write fails | The call stays reserved at its worst case |
| A model with no recorded price | It cannot be called |

**Accepted limitations (owner, 14 November 2026), described as they are:**
- *The dollar figure is an estimated reservation, not a guaranteed billing ceiling.* The worst case for a call uses an input estimate of characters ÷ 3 plus 10% and list prices embedded in source. The output cap is enforced, but the input estimate is not a proven upper bound, and the database accepts a settled cost higher than the reservation. Spend can therefore exceed US$1.00 by the amount any single call's actual cost exceeds its estimate. After that, further calls are refused, and the overrun is recorded, never hidden. The 10-call ceiling and the order ceiling are exact.
- *The request deadline is not uniform across every operation.* Bounded: each paid call (abort signal), the start of each layout pass, and the start of storage. Not bounded by one shared deadline: browser and page start-up, the font-ready wait, PDF text extraction, upload, object verification and finalisation once started. A request that overruns there depends on the platform's 300 s limit, the existing ambiguous-commit reconciliation, and the stored checkpoints for recovery.

**Consequence to know before approving.** The four writer calls alone reserve about US$0.44 until settled. A full repair reserves about US$0.78, so it fits only while committed spend is under about US$0.22. At the 13 November actual cost (about US$0.02 per call), runs that go one at a time settle quickly and stay well inside the limit. A full repair late in the run may still be refused (`campaign_budget_exhausted`). That is the intended fail-safe; raising the limit would be a separate decision.

The ledger is the authoritative count. The gateway's own usage dashboard should be checked afterwards to reconcile it, and that comparison should be reported.

## 7. Approvals needed, in order

1. **Production console exposure:** the owner confirms it on production with a safe check, then decides whether to deploy the standalone containment patch to production on its own.
2. **Commit and push** the candidate to `review/mk-integrated-readiness` as separate commits: reporting, accounting and audit, publication, security, copy, tests and documents. The security patch for production stays separate.
3. **Apply the ledger migration to the isolated test database only**, and insert the `b5-live-2` budget row (owner).
4. **Preview redeploy** of the branch with `MK_REVISED_CALL_CAMPAIGN=b5-live-2`.
5. **The live run** in section 6 (10 calls, US$1.00).
6. **Afterwards:** owner decisions DR-01 to DR-17 as the product requires. DR-08 and DR-14 are each a separately reviewed implementation with its own guard exception.

Nothing in this pass committed, pushed, deployed, changed a hosted database, used a production credential, made a paid model call, initiated a payment or sent a communication.
