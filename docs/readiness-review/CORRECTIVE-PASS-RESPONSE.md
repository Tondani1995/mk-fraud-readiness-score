# Response to the independent product review of 13 November 2026 (corrective pass)

> Several items below were corrected again after an independent review of this pass: call accounting, audit retention, the entitlement rule, publication gates, the request deadline, the host gate and the "stand without question" wording. See `RELIABILITY-CORRECTION-RESPONSE.md`; where the two differ, that document is current.

Reviewed candidate: `4016c0de` on `review/mk-integrated-readiness`. This pass is local and uncommitted to any remote: nothing was pushed, merged or deployed, no paid model call was made, no production credential was used, no payment was made and nothing was sent to anyone. Each finding was checked against the code and the two exact bound records before it was acted on.

Changes are grouped so that each can be reviewed separately:

| Group | Files |
|---|---|
| Reporting | `src/lib/reports/revised/outstanding-ledger.ts` (new), `evidence-model.ts`, `position.ts`, `essential-presentation.ts`, `comprehensive.ts`, `manuscript/fact-pack.ts`, `manuscript/story-plan.ts`, `manuscript/writer-brief.ts`, `manuscript/manuscript.ts`, `manuscript/workbook-bible.ts` |
| Publication | `manuscript/layout.ts` (new), `manuscript/compose.ts`, `src/lib/reports/design/mk-publication.ts` |
| Fulfilment | `src/lib/reports/revised/live/produce.ts`, `live/manual-generation.ts` |
| Security | `src/lib/auth/admin-surface.ts` (new), `src/middleware.ts` |
| Presentation and copy | `src/app/review/page.tsx`, `src/app/review/s/[token]/snapshot/page.tsx`, `src/components/readiness-review/SessionLinks.tsx`, `SnapshotDocument.tsx`, `src/lib/readiness-review/service.ts`, `view-model.ts` (labels only) |
| Tests and fixtures | `scripts/revised-reports/b5-fixture-reconciliation-tests.mjs`, `layout-tests.mjs`, `b5-fulfilment-tests.mjs`, `content-pending.mjs`, `lib/writer-double.mjs`, `lib/b5-fixtures.mjs`, `fixtures/b5-*-bound.json`, `scripts/admin-surface-gate-tests.mjs` |

No pinned file was changed: the integrity guard passes with the existing four reviewed exceptions. Scoring, branching, completion policy and relationship semantics are unchanged; the engine is untouched.

## Section 2: customer experience

| Finding | Confirmed? | Response |
|---|---|---|
| Entry copy promises at most 95 screens and a local harness | Yes. Build 1.6 has no screen limit (no "95" in the engine) and the deployment stores answers in a database | The start page and the session links page now follow the build a session uses and where answers are stored. Build 1.5 wording is kept for build 1.5 (owner package, Snapshot status and interview copy were already build-aware) |
| Snapshot is long | Yes | Not redesigned in this pass; recorded in the verification matrix. Comprehension and completion time need representative users |
| 46 reported gaps beside 0 material scenarios open | Yes, different measures | The card and section are renamed "Material scenarios not yet established", and the definition states that none does not mean no concerns. Reports now carry one scenario account (Q8). A single shared account on the Snapshot itself needs the report analysis in the Snapshot; left as a follow-up |
| "Cannot be ordered" above the restricted order form; "makes no order, report or delivery available" | Yes | When the restricted path is enabled, both statements say a report can be requested for restricted testing only, carries no score or conclusion and is not released to a customer. Unchanged elsewhere |
| Replace, supplement or separate from MFRS | Owner decision | DR-01 |

## Section 3: generation

| Finding | Response |
|---|---|
| Comprehensive used 86% of the 300 s route | A time budget (270 s) now governs every paid call: a call that cannot fit before the 60 s reserve for layout, storage and finalisation is not started, and a running call is aborted at the budget. The attempt fails cleanly with a resumable record rather than being killed by the platform |
| Retry by pressing Retry | Retries resume from the last completed step: a draft awaiting repair is repaired with one call; a validated manuscript whose layout, storage or finalisation failed is composed again with no AI call. At most 6 AI calls per order across attempts (DR-15) |
| Existing worker assumed to support the revised method | It does not, safely: the worker would generate and then call `automatic_release_completed_fulfilment`. The revised branch now refuses any automatic trigger before a paid call; revised reports are produced only from the operator's order page and never released automatically. A worker-driven staged design is set out for approval (DR-14) |
| Successful runs keep hashes only | The success record now carries the audit package: manuscript, Fact Pack, Story Plan, writer brief, validation and model metadata, service role only, no credentials (DR-11 for retention) |
| Operator diagnostics | Each failure records its code, stage, calls used, whether it is resumable and an operator instruction (`REVISED_OPERATOR_GUIDANCE`). An accurate `revised_report_generated` order event records the AI writer, repair, calls, method version, outstanding count and that nothing was released |
| Kestrel Comprehensive failed live | Not regenerated (no paid calls). With a deterministic writer double it now completes end to end on the exact bound input, with workbook and atomic finalisation (GF-02). That proves the pipeline, not the AI writer |

## Section 4: report quality

| Finding | Response |
|---|---|
| **Q1** outstanding information understated (Marula 2 vs 1; Kestrel 20 vs 13) | Confirmed on the exact bound inputs. The report register listed control questions only. A new ledger lists every question asked and not answered, of any type, with provenance, and reconciles it unit by unit to the assessment. Kestrel's 20 = 16 questions (13 control, 3 about whether a scenario applies) + 3 confirmations and 1 scenario those answers hold back; Marula's 2 = 1 control and 1 context question. The report register now has 16 and 2 rows; the Fact Pack carries both counts and the reconciliation sentence. What unknown means is unchanged |
| **Q2** four Kestrel scenarios unaccounted for | Confirmed: their applicability depends on answers outstanding (D5-S-03, D7-S-02, D8-S-08, D10-S-03). They are no longer counted as applying (69, not 73), are disclosed in the headline sentence, have a "not yet established" segment outside the count in the profile, and no area containing one reads as stable. None has a finding, risk or register control |
| **Q3** Essential promises a workbook | Confirmed in both Essentials. Captions, story plan, Fact Pack labels and writer brief no longer refer to a workbook for Essential, and the validator now blocks any Essential manuscript that mentions a workbook, spreadsheet or register (repairable line by line). No entitlement changed |
| **Q4** "Not yet in the library" in a paid layout | Confirmed (Kestrel Essential p13). Customers now see neutral method wording; each gap is recorded for MK approval: 34 controls (DR-10). The missing advice itself is not invented |
| **Q5** false comfort reduced, not resolved | Agreed. Owner decision DR-03 |
| **Q6** Comprehensive depth; one risk row for 19 findings | The register's rule and its effect are stated in the workbook ("Risk Register scope"); the classification is unchanged (DR-07). Depth is DR-06 |
| **Q7** orphan heading, sparse continuation pages, no contents page numbers, long headings | The hosted pipeline now lays the report out in passes with the same Chromium and pdfjs already in production: near-empty pages before a section or forced-new-page unit are removed, stranded headings start the next page, the contents page carries page numbers checked against the final PDF, and a contents list that would spill a few rows is compacted. Headings over 16 words are flagged (warning) and the writer brief sets the limit |
| **Q8** 86 of 90 in the PDF, 90 of 90 in the workbook | One convention for the PDF, position panel and workbook: "every core control in place for 90 (for 4 of these the answers raise a question or cannot both be right, so 86 stand without question)" |
| Two stored PDFs predate the score-caption fix | Agreed; they are not used as acceptance evidence |
| Validator does not check entailment or composer captions | Partly addressed: entitlement wording is now validated, and composer captions are tested on the rendered PDFs. Paragraph entailment remains a manual review item |

## Section 5: admin and security

| Finding | Response |
|---|---|
| `getAdminSession()` is not bound to the requesting person | Confirmed, and more serious than stated: the project's Vercel protection excludes custom domains, so on `mkfraud.co.za` nothing appears to stand in front of the console. Not probed. Containment prepared and tested (console answers only on Vercel-protected hosts); person-bound sign-in prepared as DR-08. `SECURITY-ADMIN-ACCESS.md` |
| Review role links are bearer links | Agreed; fictional-only (DR-09) |
| Order-scoped diagnostics cannot be stored | Unchanged RPC; revised diagnostics, resume points and audit packages are stored in the review store instead |

## Sections 6 and 7

Commercial and methodology decisions are in `DECISION-REGISTER.md` (DR-01 to DR-16). Verification, the historical sweep and the outstanding verification matrix are in `RELEASE-READINESS.md`.
