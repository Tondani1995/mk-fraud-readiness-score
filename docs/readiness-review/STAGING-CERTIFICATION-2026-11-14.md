# Controlled staging certification: decision package (14 November 2026)

**Outcome: partial certification.** The staging boundary, the non-chargeable hosted journey and its failure paths, the durable call ledger, the audit checkpoints, the publication gates and private delivery all passed on the protected Preview. One of the four authorised reports was produced (Kestrel Essential v2). Marula Essential was rejected by validation after its repair. Kestrel Comprehensive was stopped by the campaign ledger before its repair call, and under your stop rule the run ended there; Marula Comprehensive was not attempted.

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
