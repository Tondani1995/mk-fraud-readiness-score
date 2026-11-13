# B5 restricted end-to-end result (13 November 2026)

## 1. Deployment

- Branch `review/mk-integrated-readiness` on `Tondani1995/mk-fraud-readiness-score`; reports below generated on `04df7439`, current head `f5b82a63` (composer fix found in this review). Not merged; `main` and production unchanged at `74b16d35`.
- Protected preview (Vercel SSO): `https://mk-fraud-platform-git-review-mk-integr-60d093-tondanis-projects.vercel.app`.
- Database: isolated Supabase project `zuqegvsfhzgcydyivnqv` (branch-scoped Preview variables). The review track refuses to start, and the revised commercial path is disabled, against any production database reference.

## 2. Browser assessments on the deployed preview (all through page controls)

| | Kestrel Freight (weak controls) | Marula Retail (strong core confirmations, weak supporting practices) |
|---|---|---|
| Interview | 108 answers; area handed to Executive and governance at area entry; stopped after 20 answers and resumed from the link; PR-08 corrected | 155 answers; stopped and resumed; PR-10 corrected |
| Function packages | 6 functions answered on their own pages; 1 decline with reason; 1 "I don't know" | 3 rounds of sends; 7 functions; 1 "I don't know" |
| Submitted as | `MKFRS-2026-RV9C289E5F` (20 outstanding) | `MKFRS-2026-RV05BD5748` (2 outstanding) |
| Orders | Essential `MKORD-2026-0DE9E75D`; Comprehensive `MKORD-2026-69BC67C1` | Essential `MKORD-2026-19433AAB`; Comprehensive `MKORD-2026-A7D23AC3` |

42 journey steps, 0 failures.

## 3. Persisted-input reconciliation (`qa-output/b5/preview/RECONCILIATION.md`)

Every browser answer is in the stored log (137 of 137; 212 of 212), with the correction, decline, hand-off and stop/resume. The stored log reproduces the bound report input 1.3.0 digest and log digest exactly. Each assessment has a locked, unscored run (`REVISED_UNSCORED`, no score, maturity or exposure) whose input hash is the binding digest. Every register control traces to a stored answer.

## 4. Reports produced by the deployed pipeline

| | Essential (Kestrel) | Comprehensive (Marula) |
|---|---|---|
| Reference | `RPT-MKFRS-2026-RV9C289E5F-V1` | `RPT-MKFRS-2026-RV05BD5748-COMP-V1` |
| Order | `MKORD-2026-0DE9E75D` (test payment confirmed in the console) | `MKORD-2026-A7D23AC3` |
| Writer | gpt-5-mini first draft (3,721 words, 20 blocking) then terra line repair | gpt-5-mini first draft (4,449 words, 8 blocking) then terra line repair |
| Manuscript | Validator pass, 3,011 words, no warnings | Validator pass, 4,831 words, no warnings |
| PDF | 20 pages, 244,484 bytes, Poppins Regular/Medium/SemiBold, restricted label on 19 pages | 33 pages, 441,489 bytes, Poppins, restricted label on 32 pages |
| Workbook | (Essential is PDF-only by product contract) | 8 sheets: Read me, Summary, Material Findings, Risk Register, Control Blueprints, Implementation Blueprint, Management Decisions, Question Traceability (55,967 bytes) |
| Storage | `generated-reports`, VERIFIED, checksum recorded | PDF and register VERIFIED, atomically finalised |
| Generation time | 142 s of AI time | 257 s of AI time (route limit 300 s) |

Downloaded through the operator's console route on the deployment: all three files are byte-identical to their stored checksums. Requesting one order's report under another order is refused (`report_order_mismatch`). Customer email and self-service access links are disabled by design in this codebase (manual delivery), so the operator download is the delivery path.

AI use for the whole test: 20 calls within the approved ceiling of 20 (one rejected by the gateway before any model ran), about US$0.35 in total.

## 5. Failure paths

Locally (`qa-output/b5/local/failure-paths.json`, 9 of 9) and on the deployment: production refusal; invalid private link; answers changed after submission; idempotent re-submission; role refusal; terms required; duplicate Comprehensive order; duplicate payment confirmation (one transition); concurrent generation (one runs, one refused); AI service unavailable (clean failure, retry); manuscript rejected (nothing composed, nothing stored, every attempt recorded, retry works); malformed model setting (ignored, recorded).

## 6. Defects by launch impact

### Prevent restricted end-to-end testing
None open. Fixed during this run: owner declines could not be saved on the database store (migration `20261113090000`).

### Prevent customer release
1. **Revised scoring method unapproved (B4; MD-1 to MD-16, U-1 to U-7).** Reports correctly issue no score and no readiness conclusion.
2. **False comfort under-detected (D-2).** Marula, with 46 supporting practices reported weak, reads "controls in place for 86 of the 90 scenarios", "no applicable scenario has a core control reported as a gap" and lists seven "areas of stability"; only 1 inconsistency is settled because most of the 770 answer pairs are unreviewed. A customer could take false comfort.
3. **Writer reliability (AT-AI-01).** The production writer never passed alone; every successful report needed the stronger model's repair, and 9 earlier attempts were rejected. The fail-closed behaviour is correct, but a customer order would routinely need operator retries.
4. **Time limit.** The Comprehensive took 257 s of AI time against a 300 s route limit. A longer manuscript or slower provider will time out; generation needs to move to the background fulfilment worker or the route limit must rise.
5. **Comprehensive depth for a weak organisation.** Kestrel's Comprehensive Fact Pack has the same counts as its Essential (2 themes, 5 findings, 1 pathway); the R35 000 tier difference rests on blueprints and registers rather than more analysis. Not yet generated for Kestrel.
6. **Score wording in the generated PDFs.** Both PDFs say "Score: Not issued" beside a caption describing an arithmetic result, and the profile shows an empty "Test figure" column. Fixed in `f5b82a63`; the two test PDFs predate the fix.
7. **Methodology, copy, terms and access approvals still open (B3, B6, B7)** and the length gate is record-only in the restricted test.

### Post-launch backlog
- Order-scoped attempts cannot store structured diagnostics (also affects the existing Comprehensive path).
- Contents page has no page numbers in the hosted renderer (the offline two-pass page map needs `pdftotext`).
- Long, three-line claim headings in places; heading length rule.
- Intermittent page timeout under parallel load (J-01-like), not reproduced on rerun.

## 7. Recommendation

**Do not release to a limited customer cohort yet.** The integration works end to end on the deployed system: real browser assessments, persisted and reconciled answers, existing orders and payment confirmation, real AI-written manuscripts validated against the Reporting Bible, branded PDFs and a workbook stored, verified and downloaded through the operator path. What is not ready is what a paying customer would read: no approved scoring method, a demonstrated false-comfort risk for strong-but-inconsistent organisations, a writer that needs repair on every report and a Comprehensive generation that runs close to the time limit.

Shortest route to a limited cohort: MK approves the scoring and inconsistency decisions (MD series, D-2); generation moves to the background worker; Kestrel's Comprehensive and Marula's Essential are generated on `f5b82a63` and reviewed against the 34-dimension scorecard; then a small cohort with manual operator review of every report before delivery.
