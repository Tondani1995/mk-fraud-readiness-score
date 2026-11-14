# Controlled staging certification: decision package (14 November 2026)

**Update, round 2 (`b5-live-3`, section 11): all four authorised reports now exist on the corrected code.** Kestrel Comprehensive, Marula Comprehensive and Marula Essential were generated, verified and kept private in 4 calls and US$0.459 recorded. The recommendation is unchanged: no-go for production or a customer cohort.

**Outcome of round 1: partial certification.** The staging boundary, the non-chargeable hosted journey and its failure paths, the durable call ledger, the audit checkpoints, the publication gates and private delivery all passed on the protected Preview. One of the four authorised reports was produced (Kestrel Essential v2). Marula Essential was rejected by validation after its repair. Kestrel Comprehensive was stopped by the campaign ledger before its repair call, and under your stop rule the run ended there; Marula Comprehensive was not attempted.

**Recommendation: no-go for production or a customer cohort. Next milestone: a second restricted campaign after four bounded fixes (section 7).**

Evidence: `outputs/staging-certification-2026-11-14/`, separated into `hosted/` (this run), `local-doubles/` (test doubles and local SQL) and `historical-13-november/` (earlier deployed outputs, for comparison only).

## 1. What was changed, and where

| Item | Value |
|---|---|
| Commits on `review/mk-integrated-readiness` | `4bc8d6b3` publication; `281de7da` reporting; `14f7f9e9` accounting, audit and fulfilment; `9ef92e37` review copy; `8ba65c96` security containment (and the standalone production patch, not deployed); `c6860a6d` tests, fixtures and documents; `1a0e96ca` start-page copy fixes found on the Preview, plus the redeploy for the campaign variable |
| Push | `review/mk-integrated-readiness` only: `4016c0de..1a0e96ca`. `main` unchanged at `74b16d35` |
| Preview | `dpl_cEEgmjMUEs7miuSxh7GNBTNHtqiL` (commit `1a0e96ca`, target Preview, branch alias `mk-fraud-platform-git-review-mk-integr-60d093-tondanis-projects.vercel.app`). The first build `dpl_3M7XNTrQFgWmDNvHaV2mNrSecY2k` (`c6860a6d`) was used for the non-chargeable runs |
| Isolated migration | `readiness_review_generation_ledger`, applied to `zuqegvsfhzgcydyivnqv` only (recorded in its migration history) |
| Campaign | `b5-live-2`: 10 calls, US$1.00 estimated reservation budget, created 08:41 UTC; no earlier campaign existed |
| Preview variable | `MK_REVISED_CALL_CAMPAIGN=b5-live-2`, added by the owner (my access to Preview variables was refused with 403) |

## 2. Staging boundary (all verified before any hosted write or model call)

| Check | Result |
|---|---|
| Preview protected | Every path redirects to Vercel sign-in without credentials |
| Database target | The deployment resolves the one active admin profile that exists only in `zuqegvsfhzgcydyivnqv` (matching id hash); the review store reports the isolated test database |
| Production references refused | FP-01: the commercial path is refused for a production runtime and for production app or review database references |
| Operator host | The console answers on the branch alias (Vercel's branch host for this deployment) |
| Email | 13 email events in total, all `recorded_disabled`; 0 provider events; 0 delivery authorisations; no order marked delivered |
| Fictional data | Kestrel Freight and Marula Retail Holdings (fictional); test EFT only; no money moved |
| Migration | 3 tables, 3 append-only guards, functions executable by `service_role` only; with no budget, a reservation returned `campaign_budget_missing` |

## 3. Non-chargeable hosted results

| Journey | Result |
|---|---|
| Browser journey, both organisations, through the real pages | 42 of 42. Assessment creation and staged branching; area handover; stop after 20 answers and resume; a corrected answer; a decline with a reason; an "I don't know"; function packages over three send rounds; Snapshot with no score; submission bound to `MKFRS-2026-RV84294E65` (Kestrel) and `MKFRS-2026-RVD222EF5C` (Marula); four orders through the existing paid-order route |
| Persisted-input reconciliation | Every browser answer is in the stored log (137 of 137; 212 of 212), with the correction, decline, handover and stop/resume. The bound input and log digests replay exactly. Score runs are locked and unscored. Kestrel shows 2 later actions excluded from its bound input (live session moved on after submission; bound input unchanged) |
| Failure paths (FP-01 to FP-09) | 9 of 9: production refusal; invalid private link; a later answer blocks re-submission; idempotent re-submission; reviewer link refused; terms required; duplicate Comprehensive order returns the existing one; a double test-EFT confirmation records one transition; two concurrent generations: one `generation_already_active`, the other refused before any call |
| Fail closed without the campaign variable | Kestrel Comprehensive retry refused `generation_budget_missing` in 8 s; nothing reserved |
| Changed pages, 1440 and 375 px | Start page, links page, Snapshot, respondent page: no horizontal overflow, Poppins, visible keyboard focus (3 px slate outline), no running animation with reduced motion, inputs labelled. The Snapshot shows the restricted-ordering wording and "not yet established". No "cannot be ordered" or "95 screens" on build 1.6. Two copy defects found (missing space; "first stage" and "still open") were fixed in `1a0e96ca` and confirmed live |
| Private files | Operator download returns the exact stored bytes via a signed link; the same report requested under another order is refused (`report_order_mismatch`); the stored PDF is not reachable by public URL, anonymous download or anonymous signed URL |

## 4. The four authorised reports

| Case | Order | Outcome | Calls | Recorded cost |
|---|---|---|---|---|
| L-1 Kestrel Essential | `MKORD-2026-0DE9E75D` (regenerated) | **Generated: `RPT-MKFRS-2026-RV9C289E5F-V2`**, 158 s | writer + repair | US$0.1224 |
| L-3 Marula Essential | `MKORD-2026-19433AAB` (regenerate) | **Rejected after repair.** Remaining issues: 2 typed figures, 1 paragraph without references, 1 internal identifier, 1 repeated-phrase limit. Nothing composed or stored; draft checkpoint kept | writer + repair | US$0.1287 |
| L-2 Kestrel Comprehensive | `MKORD-2026-69BC67C1` (retry) | **Stopped by the ledger.** Draft failed validation with structural issues; the full repair's worst case (US$0.7686) did not fit beside US$0.2695 committed. Refused before dispatch; draft checkpoint kept | writer | US$0.0184 |
| L-4 Marula Comprehensive | `MKORD-2026-A7D23AC3` | **Not attempted** (stop rule: the campaign ledger refused further work) | none | none |

**L-1 integrity**

| Check | Result |
|---|---|
| Bound input | Input digest `7a372eaf…` and log digest `c6e7b9ca…`, the exact bound fixture |
| Validation | Pass |
| Publication gates | PG-HEADINGS, PG-CONVERGED and PG-CONTENTS pass; 3 layout passes; the conclusion flowed on to avoid a near-empty page |
| Audit package | Stored as the validated checkpoint at 09:09:21, before composition, and linked to the report at 09:09:32. It holds 11 parts: manuscript, Fact Pack 0.2, Story Plan, writer brief, validation, models and call ids, versions and bound input. No credential-like content |
| PDF | 18 pages, 236,301 bytes, sha256 `70ecfd20…`; storage VERIFIED; downloaded bytes match the stored checksum |
| Order | Status unchanged (`payment_received`); nothing delivered |

**L-1 content, measured on the actual PDF**

| Check | Result |
|---|---|
| Score, band, readiness conclusion | None; stated in the executive summary and the position panel |
| Essential entitlement | No workbook or register promise |
| Internal library wording | None |
| Old score caption | None |
| "Stand without question" | Absent |
| Em dashes | None |
| Font | Poppins embedded |
| Restricted label | On 17 pages |
| Contents page | Numbered and verified |
| Outstanding reconciliation | "The assessment records 20 outstanding items, while 16 questions were asked and not answered", with the reason for the difference |

## 5. Calls, costs and allowance

| Measure | Value |
|---|---|
| Calls reserved | **5 of 10**. All settled (succeeded): 3 writer calls (gpt-5-mini), 2 repair calls (gpt-5.6-terra). No failed, indeterminate or unsettled calls |
| Recorded cost | **US$0.2695** of US$1.00, from the gateway's reported usage at the list prices in source |
| Unused | 5 calls and about US$0.73 |
| Worst-case reservations | US$1.83 in total for the 5 calls. That is about 6.5 times recorded: writer about US$0.11 against US$0.017; repair about US$0.75 against US$0.11 |
| Estimated against recorded | The repairs wrote 29,637 prompt-cache tokens, priced in the record at the input rate. At the listed cache-write price the run costs about US$0.016 more (about US$0.286). The actual gateway bill could not be read (403) and should be checked in the Vercel dashboard |
| Models | Writer `openai/gpt-5-mini`; repair `openai/gpt-5.6-terra`. The writer override variable still holds a malformed value and is ignored, as before |

## 6. Report-quality findings (actual L-1 report, and the run)

**Improved since 13 November, measured on the actual PDFs**

| Measure | Kestrel Essential v1 (13 November) | Kestrel Essential v2 (14 November) |
|---|---|---|
| Pages | 20 | 18 |
| Workbook references | 2 | 0 |
| Library-gap wording | 2 | 0 |
| Old score caption | 2 | 0 |
| Contents page numbers | none | present and verified |
| Outstanding information | no reconciliation | 20 versus 16 reconciled |

The findings are specific and operational. Each one explains how an impersonator would exploit requester-led confirmation, the control that stops it (organisation-initiated confirmation, Home Affairs identity checks, call-back to numbers on file), the accountable executive and practical owner, and a retained record. Stages are framed as proposals, not deadlines.

**Defects found (none was fixed during certification, to keep the run comparable)**

1. **The position panel is not on the shared account.** `compose.ts:180` builds its own sentence. It mentions the 12 outstanding but not the 4 scenarios whose applicability is pending, and it lacks the qualification that no conflict found does not establish operation.
2. **The executive opening paraphrases the account.** It accounts for 57 of the 69 scenarios in the first sentence. The 4 pending scenarios are disclosed later in the narrative ("No conclusion is drawn about controls for those further scenarios…"). The validator does not require the T-SCENARIO-ACCOUNT fact to be used.
3. **Length.** The L-1 manuscript has 2,915 words, below the 3,000-word Essential minimum. It is recorded as a customer-release blocker (record-only rule in the restricted test).
4. **Writer reliability.** All three first drafts failed validation. One repair succeeded, one still failed (L-3), and one needed a full repair the budget could not hold (L-2). This repeats the 13 November pattern.
5. **The operator event names the wrong model.** "written by the AI writer openai/gpt-5.6-terra, repaired by the repair model" names the repair model as the writer (it reports the last model used). The legacy "Deterministic report generation started" note still appears beside it (DR-12).
6. **Request time.** The console request outlived the client's network read (about 40 s); the server completed normally (158 s for L-1). Operators need the console's own status, not a held-open request.
7. **Comprehensive and workbook not certified on this code.** No Comprehensive was produced, so workbook consistency, risk-register scope and PDF/workbook agreement remain evidenced only by local doubles and the 13 November historical output.

**Not reviewable this run:** commercial differentiation between Essential and Comprehensive (no Comprehensive was generated).

**Snapshot agreement:** the Snapshot's 20 outstanding matches the PDF's reconciliation sentence. The Snapshot still has no single scenario account (known).

## 7. Incident during the run

My HTTP client's timeout error printed the Preview access cookie into the session transcript and a local log. The log was deleted, the share link was revoked through Vercel, and both the old cookie and the old link now redirect to sign-in (verified). The generation driver now redacts errors. The cookie only ever granted access to this protected, fictional Preview, and it had a one-day expiry.

## 8. Recommendation and next milestone

**No-go for production and paying customers. Go for a second restricted campaign after four bounded fixes:**

1. Make the position panel use the shared scenario account, with the pending scenarios and the operating-effectiveness qualification.
2. Require the executive section to cite the account fact (validator rule plus writer brief).
3. Report the writer and repair models separately in the operator event.
4. Choose a campaign shape that can complete the Comprehensives. Because a full repair reserves about US$0.77, either:
   - run each Comprehensive first, in its own campaign, or
   - approve a reservation budget sized for one full repair per Comprehensive (for example 8 calls and US$2.50 estimated, against about US$0.30 expected actual).

   This is your decision; nothing has been raised.

**Owner decisions that gate a customer release** (unchanged): DR-01 to DR-04, DR-06, DR-10, DR-13 and DR-17. Person-bound sign-in (DR-08) and background fulfilment (DR-14) remain unimplemented. Production console containment (`security-containment-74b16d35.patch`) awaits your safe check and a separate decision.

**Human verification still outstanding:** physical devices, screen readers and magnification, representative respondents, native Excel, MK review of actual reports against the 34-dimension scorecard, and hosted p95 timing.

## 9. Accepted limitations, as they are

- The US$ figure is an estimated reservation, not a guaranteed billing ceiling (here it over-reserved about 6.5 times; prompt-cache writes are priced at the input rate).
- The request deadline is not uniform: provider calls, layout pass starts and storage start are bounded. Start-up, upload, verification and finalisation rely on the platform limit and reconciliation.

## 10. Fixes made after certification (14 November 2026), and the proposed second campaign

Owner approved the fixes on 14 November. Local evidence only; nothing was spent and no report was regenerated.

| Defect | Fix | Evidence (local, exact bound fixtures) |
|---|---|---|
| 1. Position panel not on the shared account | `compose.ts` uses the position statement's text, which is the shared scenario account, whenever the Fact Pack carries it; older Fact Packs keep the earlier sentence. Composer 0.3 | SF-01: the Kestrel panel shows all 69 + 4 categories, including "Whether 4 further scenarios apply depends on answers that are outstanding". SF-02: the Marula panel carries "which does not establish that the controls operate". SF-05: 12 November prototypes unaffected |
| 2. Executive opening paraphrased the account | New blocking validator rule `ACCOUNT-MISSING`: the executive section must contain `[[T-SCENARIO-ACCOUNT]]`, reported against its first paragraph so the existing line repair can fix it. The writer contract (rule 12) and the writer brief say so. Validator 0.3, pipeline 0.3 | SF-03: blocked without the slot, passes with it. SF-04: the line repair fixes it. Fulfilment 22 of 22 unchanged |
| 5. Operator event named the wrong model | `revisedGenerationNote` names the writer and, separately, the repair model; says when no AI call was made (resumed from a stored manuscript) or when a stored draft was repaired; records both model ids and the ledger call ids | SF-06 |

Not changed (outside these fixes): writer reliability and manuscript length (defects 3 and 4). The new rule adds one more way a first draft can fail, but it is line-repairable within the existing single repair.

**Proposed second campaign (for owner approval; nothing created).** `b5-live-2` stays closed at 5 calls and US$0.27; it is not reset.

The cases still open each resume from a stored checkpoint where one exists:

| Case | What it needs | Worst-case reservation |
|---|---|---|
| Kestrel Comprehensive | Its full repair only (draft stored) | about US$0.78 |
| Marula Comprehensive | Writer, plus a repair if needed | US$0.11 + up to US$0.79 |
| Marula Essential | Its repair only (draft stored) | up to US$0.76 |

A US$1.00 budget cannot hold the two Comprehensives in sequence (about US$1.02 at the second repair, even after the first settles).

**Proposal:** a new campaign `b5-live-3` with **6 calls and US$1.50**, run one case at a time in the order Kestrel Comprehensive, Marula Comprehensive, Marula Essential. That leaves room for one bounded retry. Expected actual spend is about US$0.40 to US$0.50 at the 14 November rates.

The same stop rules apply, and the same accepted limitation: the dollar figure is an estimated reservation, not a guaranteed billing ceiling.

## 11. Round 2: campaign `b5-live-3` (14 November 2026)

**Approved by the owner on 14 November:** 6 calls and US$1.50 estimated, cases run one at a time, same stop rules. `b5-live-2` stays closed at 5 calls and US$0.2695; it was not reset.

**Set-up.** The budget row was inserted on the isolated database `zuqegvsfhzgcydyivnqv` (09:28 UTC). The owner set the branch Preview variable to `b5-live-3`. Empty commit `8637345a` redeployed the branch: Preview `dpl_4aukEkhz4nkGHVPJbe5KTATSTwW4`, READY, with the branch alias. `main` is untouched at `74b16d35`. A new share link was created for the run, kept in a git-excluded folder, never printed, and revoked at the end (verified: it now redirects to sign-in). The local copy was deleted.

### 11.1 Results

| Case | Order | Report | Calls (this attempt) | Recorded | Pages | Manuscript words (minimum) | Result |
|---|---|---|---|---|---|---|---|
| Kestrel Comprehensive | `MKORD-2026-69BC67C1` | `RPT-MKFRS-2026-RV9C289E5F-COMP-V1` | 1: full repair of the draft stored in round 1 | US$0.1369 | 28 | 3,869 (3,800) | Generated, 82 s |
| Marula Comprehensive | `MKORD-2026-A7D23AC3` | `RPT-MKFRS-2026-RV05BD5748-COMP-V2` | 2: writer, then full repair | US$0.1997 | 34 | 5,868 (3,800) | Generated, 183 s |
| Marula Essential | `MKORD-2026-19433AAB` | `RPT-MKFRS-2026-RV05BD5748-V2` | 1: full repair of the draft stored in round 1 | US$0.1224 | 22 | 3,653 (3,000) | Generated, 71 s |

No case was rejected, so the optional retry was not used. No stop rule fired.

**Verification on each report**, from the database, storage and the deployed console:
- The attempt is REPORT_READY.
- The audit checkpoints run drafted, validated, linked, and no audit package is left unlinked.
- The PDF bytes in storage match the recorded checksum. For the two Comprehensives, the workbook bytes also match.
- The operator download route returns identical bytes for all three PDFs and both workbooks.
- A request for the Marula Essential workbook is refused (`storage_path_mismatch`), because Essential is PDF-only.
- A cross-order download is refused (`report_order_mismatch`).
- Anonymous access to every stored object is refused.
- Every order is still `payment_received`, with no email, notification or delivery event and no delivery field set.
- Each operator event names the models correctly:
  - Marula Comprehensive: "written by openai/gpt-5-mini and repaired by openai/gpt-5.6-terra (2 AI calls)".
  - The two resumed cases: "repaired by openai/gpt-5.6-terra from the draft stored by an earlier attempt (1 AI call in this attempt)".

**Content checks.** The checks below were scripted on the extracted text, and the opening pages were read as rendered images.
- All three reports contain the shared scenario account sentence. In Kestrel it carries the pending scenarios. In Marula it carries "which does not establish that the controls operate".
- The Kestrel position panel now carries the shared account, including "Whether 4 further scenarios apply depends on answers that are outstanding". Fix 1 is confirmed live.
- Each report issues no score, band or readiness conclusion.
- No report contains library-gap wording, the old score caption, "stand without question", or an em dash.
- The restricted-test label appears on every page.
- Poppins is embedded.
- Outstanding items reconcile: 20 for Kestrel and 2 for Marula, matching the order events.
- The Marula Essential report has no workbook reference.
- Both Comprehensive workbooks have 8 sheets. In each, the account matches the PDF, the risk-register scope is stated, and the edition notice is present.

### 11.2 Calls, costs and allowance

| Measure | Value |
|---|---|
| Calls reserved | **4 of 6**, all settled as succeeded: 1 writer call (gpt-5-mini) and 3 full repairs (gpt-5.6-terra). No failed, indeterminate or unsettled calls, and no refusals |
| Recorded cost | **US$0.4590** of US$1.50 |
| Unused | 2 calls and US$1.041 |
| Worst-case reservations | US$2.41 for the 4 calls, about 5.3 times recorded. A full repair reserved US$0.755 to US$0.776 against US$0.122 to US$0.180 actual |
| Estimated against recorded | The repairs wrote 56,445 prompt-cache tokens, priced in the record at the input rate. At the cache-write rate implied in round 1 (about 1.25 times input), the run costs about US$0.031 more, about US$0.49. The gateway bill could not be read (403) and should be checked in the Vercel dashboard |
| Both campaigns together | 9 calls, US$0.7285 recorded (about US$0.78 with cache writes at their own rate) |

### 11.3 Quality findings

**Resolved by the round 1 fixes, confirmed on actual reports.** These were defects 1, 2 and 5 in section 6 (position panel, executive account, model names).

**Still open:**
1. **Writer reliability.** None of the four first drafts across both rounds passed validation (3 in round 1, plus Marula Comprehensive here). Every report produced so far depended on the gpt-5.6-terra repair, and on a full repair rather than a line repair in all three cases here. The pipeline is reliable *with* the repair. Cost per report stays low (US$0.12 to US$0.20), but the cheap-writer economics are not yet proven.
2. **Length is above minimum but below target.** Kestrel Comprehensive (3,869 words) clears the 3,800 minimum by 69 words and is well below the writer's 4,800 to 5,800 target. Marula Essential (3,653) is below its 3,800 to 4,500 target. Neither is a blocker under the rules.
3. **Legacy operator note.** "Deterministic report generation started" still appears beside the corrected event. It comes from the shared fulfilment path (DR-12) and is unchanged.

**Essential against Comprehensive (now reviewable, Marula).**
- Essential: 22 pages and 3,653 manuscript words, PDF only, with no workbook reference.
- Comprehensive: 34 pages and 5,868 words, plus an 8-sheet workbook (risk register, control and implementation blueprints, management decisions, question traceability). The Comprehensive PDF names the workbook as the source for every item.

The difference is visible and matches the entitlements. Whether it justifies the price gap is an owner judgement.

### 11.4 What this round does not change

Production and paying-customer release remain unapproved. The owner decisions in section 8 are still open, as are person-bound sign-in (DR-08), background fulfilment (DR-14), the production console containment, and the human verification items. Nothing was merged, deployed to production, emailed or delivered, and no real payment was made. Evidence: `outputs/staging-certification-2026-11-14/hosted/round-2-b5-live-3/`.

### 11.5 Campaign closed on the Preview (14 November 2026, after round 2)

The owner deleted the branch Preview variable `MK_REVISED_CALL_CAMPAIGN`. Empty commit `0211c5b6` redeployed the branch: Preview `dpl_F1kQSup35cadnXmVbWStynfCor1U`, READY, serving the branch alias.

**Fail-closed check, with no cost.** One operator regenerate was sent for Marula Essential (`MKORD-2026-19433AAB`). It would have resumed from a stored draft, so it would have attempted exactly one repair call. The request was refused in 12 seconds with HTTP 409 and `generation_budget_missing`: "No approved test campaign budget is in force, so no AI call can be made."

The ledger records no call for that attempt, and no call at all after the check began. It still holds 9 calls in total, and `b5-live-3` is still at 4 calls and US$0.459. No report was created. The order received only the requested, started and failed events.

The share link used for the check was revoked (verified: it now redirects to sign-in), and the local copy was deleted. The 2 calls and US$1.04 left in `b5-live-3` can no longer be reached from the Preview unless a campaign variable is set again and the branch is redeployed.

**Observation for the owner (not changed).** A stored draft remains a resume point after a later attempt has repaired it successfully. As a result, an operator "regenerate" on Kestrel Comprehensive or Marula Essential would repair the 14 November round 1 draft again rather than ask the writer for a fresh one. That is harmless while the inputs are identical, but it is worth a decision before a customer release.

### 11.6 Fix: "Create New Version" writes a fresh draft (owner request, 14 November 2026)

The observation in 11.5 is fixed. Local evidence only; nothing was spent and no report was regenerated.

| Change | Where |
|---|---|
| "Create New Version" (`admin_regenerate`) never resumes. The writer drafts the new version from the bound input, whatever drafts or manuscripts are stored. Generate and retry still resume | `resumeFrom(…, mode)` in `checkpoints.ts`; `resumeMode` passed from `manual-generation.ts` |
| A report supersedes every earlier draft and manuscript on the same inputs, so a retry after a report also writes afresh instead of re-repairing or recomposing old work. The same applied latently to a manuscript composed into a report, which previously stayed reusable | `resumeFrom` |
| A report dates from its validated manuscript, not its link, so a link recovered late does not supersede a draft written after that report | `resumeFrom` |
| A checkpoint without a readable time is malformed history and refused, never treated as empty | `loadCheckpoints` |
| The audit package records `resumeMode` (`fresh` or `resume`). Checkpoints 1.1 | `produce.ts` |

**Tests.**
- Resume rules: 8 of 8 (`resume-mode-tests.mjs`). This includes the actual 14 November case and the Postgres time formats.
- Fulfilment: 27 of 27, with five new cases (GF-23 to GF-27):
  - a new version after a draft-repaired report is written afresh;
  - a retry after a report is written afresh;
  - a new version ignores a current draft;
  - a new version ignores an unlinked validated manuscript;
  - a composed manuscript is superseded by its report.

The retry paths that should resume still do (GF-10, GF-11, GF-12, GF-22). Staging fixes 6 of 6, entitlement 4 of 4, publication gates 6 of 6, layout 8 of 8 and reconciliation 10 of 10 all pass, and TypeScript is clean.

**Cost consequence.** A new version always costs at least one writer call (about US$0.02 actual, US$0.11 reserved), and usually a repair as well, since no first draft has yet passed on its own. Before this fix, a new version on Kestrel Comprehensive or Marula Essential would have cost one repair.

### 11.7 Fix: the "Deterministic report generation started" note is removed (owner request, 14 November 2026; DR-12)

The note was written by the shared database function `start_manual_report_generation` (migration 0023), so it appeared for every manual attempt, including AI-written revised reports.

**Change.** New migration `20261114170000_neutral_generation_started_note.sql` redefines the function with the note "Report generation started." That is true for every generation path. The function differs from 0023 by that one line. The `generation_started` event type is kept, because monitoring and the order timeline use it. The metadata, security definer, search path and grants (service role only) are unchanged. Events already recorded are history and are not rewritten. The comment in `manual-generation.ts` and DR-12 in the decision register are updated.

**Applied to the isolated test database `zuqegvsfhzgcydyivnqv` only.** It is verified there:
- The function no longer contains "Deterministic".
- Grants are still `postgres` and `service_role` only.
- A check inside a transaction that was then rolled back queued a temporary attempt on a test order and started it. The function recorded exactly one `generation_started` event reading "Report generation started.", and nothing persisted afterwards.

Production keeps the old note until this migration is released with the candidate, which needs separate approval.

### 11.8 Writer improvement: first drafts (owner request, 14 November 2026)

**Diagnosis, from the four stored first drafts.** Each draft was re-validated locally against a Fact Pack rebuilt to the same content digest as the hosted one (verified), with no AI call.

| Failure | Drafts | Detail |
|---|---|---|
| Thin paragraphs | 4 of 4 | 2,413 to 2,941 words against a 3,800 to 5,800 target. Paragraph counts were close to plan, but paragraphs averaged 30 to 43 words; the repaired finals averaged about 58. On the test deployment the length rule only records the shortfall, but it would block a customer release |
| Counts typed as words | 4 of 4 | Mostly in headings ("Seven findings", "Two management-level patterns", "ten assessed areas"); also "two related questions" in prose |
| "recorded" overused | 4 of 4 | 6 to 17 uses against an allowance of 5. The briefs themselves use the word 6 to 23 times |
| Scenario account missing | 3 of 4 | Round 1 drafts only; fixed earlier (rule 12) |
| Decisions section | 1 of 4 | Raw "DECISION-02", paragraphs without references, "matter most" |
| Unit heading missing | 1 of 4 | A single-unit pathways section |

Why this cost a full repair every time: "recorded" overuse is reported against the whole manuscript rather than a line, and a missing unit heading is structural. Either rules out the cheaper line repair.

**Changes (prompt and brief only; the validator and its thresholds are unchanged).**
- **Brief.** A Length section and, for every Story Plan section, a paragraph count and a word budget. The budgets are sized so the whole manuscript lands inside the product's band at 50 to 110 words a paragraph. For the four cases they give:

  | Case | Budget |
  |---|---|
  | Kestrel Essential | 4,240 words, 65 a paragraph |
  | Kestrel Comprehensive | 5,280 words, 60 a paragraph |
  | Marula Essential | 4,360 words, 55 a paragraph |
  | Marula Comprehensive | 5,250 words, 50 a paragraph |

  Every unit section also gets an exact unit-heading count, plus contract lines against counts in headings and against copying "recorded" (`writer-brief.ts`).
- **System prompt.**
  - Rule 4 names the counted nouns, with the rejected "two related questions" form.
  - New rule 4a: headings never contain a count, with examples.
  - Rule 9 adds "matter most" and "ranked first".
  - New rule 13 states the word-family limits, generated from the validator's own allowances minus one, so they cannot drift. "management should" stays under rule 11.
  - New rule 14: describe decisions in words and keep their reference lines.
  - The length rule now requires three to five sentences a paragraph and points to the budgets.
  - A self-check runs before a whole manuscript is returned. It is scoped so that it never overrides the line-repair JSON format.

  Pipeline 0.4 (`produce.ts`).

**Tests.**
- Writer contract: 7 of 7 (`writer-contract-tests.mjs`). It checks that:
  - the budgets fall inside the band;
  - every section has its Length and unit-heading lines;
  - the rule 13 limits sit below the validator allowances;
  - the heading examples agree with the validator (the "never" headings are rejected, the suggested ones pass);
  - every listed ranking phrase is one the validator rejects;
  - the self-check leaves the line-repair format alone;
  - the deterministic manuscript still passes on all four cases.
- Unchanged: fulfilment 27 of 27, resume rules 8 of 8, staging fixes 6 of 6, entitlement 4 of 4, publication gates 6 of 6, layout 8 of 8, reconciliation 10 of 10, and excellence 88 of 92 (the same four DR-17 gaps as before). TypeScript is clean.

**Not yet shown.** Whether gpt-5-mini's first drafts now pass can only be measured with real calls, and the Preview has no campaign budget. A measuring run would be one "Create New Version" on each of the four orders, one at a time. Each records `firstPass` in its audit package. A passing draft costs one writer call (about US$0.02); a failing one also takes a repair. A campaign of 8 calls and US$2.00 estimated reservation would hold that run, including one full repair, with expected spend of about US$0.10 to US$0.60. This needs owner approval, a budget row, the Preview variable and a redeploy.

### 11.9 DR-02 implemented: the MK Fraud Readiness score and the agreed conclusion (14 November 2026)

Implemented on the review branch only. Local evidence; no AI call, deployment or database change.

**The score** (`src/lib/reports/revised/score.ts`, `mk-fraud-readiness-score-1.0`):
- **Calculation:** a whole-number percentage over the scenarios that apply and whose core answers are all known.
- **Credit:** a scenario with every core control reported in place earns 1. With a related practice reported weaker it earns 0.75. Where the answers are contradicted it earns 0.5, and a core control reported as a gap earns 0.
- **Not counted:** scenarios with outstanding core answers, scenarios not reached in the interview, scenarios whose applicability is pending, and scenarios not expected at the organisation's size.
- **No countable scenario:** generation is refused before any AI call (`score_not_computable`, 409).
- **Results on the test organisations:** Kestrel 4% (2 of 57 counted, 12 not yet counted); Marula 94% (84.25 of 90).

**Two readings of the decision, confirmed by the owner on 14 November 2026 ("Both stand"):**
1. "Contradicted" covers every scenario the report's shared account describes as "the answers raise a question or cannot both be right". That is a direct contradiction, a control lacking an input it needs, and a question to clarify. All earn half credit (`SCORE_CREDIT`). For Marula that is 4 scenarios.
2. The agreed outstanding sentence is used when questions are unanswered and scenarios are held back. When scenarios are held back only because the interview did not reach them, no question is unanswered. In that case the sentence names that reason instead ("N scenarios were not reached in the interview, so they are not yet counted; the score may change once they are answered."). When questions are unanswered but hold back no scenario (Marula: 2 questions), the sentence is left out; those questions are still disclosed in the outstanding-information reconciliation.

**Where the score and conclusion now appear:**
- **Position panel:** "Score 4%" with its basis. The conclusion cell reads "No readiness label": no band, level or pass mark, and not a finding of protection.
- **Fact Pack (0.3):** `N-SCORE`, `N-SCORE-COUNTED` and `N-SCORE-NOT-COUNTED`, plus the agreed heading, paragraph and outstanding sentence as `T-` facts inserted by slot. The pending "approved readiness conclusion" requirement is removed for scored packs.
- **Story Plan (0.3):** the conclusion opens with the agreed wording.
- **Composer (0.4):** the conclusion heading is the agreed one, in the section and on the contents page.
- **Validator (0.4):**
  - `CONCLUSION-MISSING` (blocking, line-repairable) requires the agreed paragraph, and the outstanding sentence when it exists.
  - `READY` blocks any statement that the organisation is ready or that readiness is achieved. It matched nothing in the eight real AI drafts and finals.
- **Writer:** prompt rule 15, brief lines and the self-check.
- **Workbook Read me:** carries the score.
- **Operator event:** states the score and that no readiness label is issued.
- **Audit package:** records the score's inputs and version.
- **Restricted label:** reports use a new label without "no readiness score is issued". The Snapshot keeps its label, which is still true for it.

Older unscored Fact Packs keep their earlier wording unchanged.

**Tests.**
- Score: 12 of 12 (`score-tests.mjs`). These cover:
  - both organisations' scores and the exact credit;
  - the exclusion rules and the refusal when no scenario can be counted;
  - the agreed wording, word for word;
  - the composed report and its panel;
  - `CONCLUSION-MISSING` with its line repair;
  - `READY`, with good and bad examples;
  - unscored packs left unchanged;
  - the workbook, the operator note and the labels.
- The test fixtures now build the Fact Pack exactly as the pipeline does (scored).
- Unchanged: fulfilment 27 of 27, writer contract 7 of 7, resume 8 of 8, staging fixes 6 of 6, entitlement 4 of 4, publication gates 6 of 6, layout 8 of 8, reconciliation 10 of 10, and excellence 88 of 92. TypeScript is clean.
- A locally rendered Kestrel Essential PDF (15 pages, contents verified) shows the panel and the conclusion page as intended.

**Not done.** The four hosted test reports were produced before this change and say "no score". A scored hosted report needs a generation run, which needs a campaign budget. The Snapshot still issues no score; DR-02 concerns reports.
