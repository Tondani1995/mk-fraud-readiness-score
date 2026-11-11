# Report engine, Phase 2: the standard (self-reported) report

Authorised by MK on 11 November 2026: the complete deterministic rules and template engine for fictional records only, all four layers including scenario analysis, with the Phase 1 review findings incorporated. Corrected by MK the same day, before Phase 2 continued: the standard assessment and the Comprehensive Report rest only on the organisation's own responses and the method; evidence review, verification and specialist conclusions belong to the separately scoped Advisory package. The architecture, templates, release criteria and tests were changed to that boundary first (`REPORT-ENGINE-DESIGN.md`, revision 3), then Phase 2 was built on it.

Not authorised and not done: approving the methodology or any copy, generating customer reports, external delivery, connecting the engine to the Snapshot, the Comprehensive Report or any route, and anything in shared preview or production. No real customer data was used.

## What was built

| File | Does |
|---|---|
| `src/lib/readiness-review/report-input.ts` | Report input **1.2.0**: adds `method` to every practice control (the draft method's in-place answers and description, and the fraud risks it names). Additive; the stored answer log is unchanged |
| `src/lib/readiness-review/report/ledger.ts` | Ledger 0.2.0: every claim tagged `standard` or `advisory`; method-content and records-said claims; the reviewer-based review status split off as an Advisory claim; `standardLedger()` |
| `src/lib/readiness-review/report/document.ts` | Document contract **0.2.0**: the standard pathway only; no evidence, attribution or conclusion fields; coverage categories; reported issues and recommended actions; release criteria with no Advisory criterion |
| `src/lib/readiness-review/report/copy.ts` | Draft copy 0.2.0-draft, 75 templates, unapproved (B7); no evidence-review or reviewer wording |
| `src/lib/readiness-review/report/standard-report.ts` | The rules and assembly for all four layers. Removes every Advisory claim before any rule runs. Fictional records only; imported by nothing outside the engine |
| `src/lib/readiness-review/report/validate.ts` | Twenty checks, V01 to V20, with the pinned sentences |
| `src/lib/readiness-review/report/advisory-record.ts` | The evidence and reviewer functionality, preserved as a separate Advisory capability, with its own draft copy and checks A01 to A06. Not imported by the standard engine |
| `src/lib/readiness-review/report/input-gate.ts`, `shared.ts` | The gate reads 1.2.x; shared helpers |
| `scripts/readiness-review-report-engine-tests.mjs` | The Phase 2 tests below |
| `scripts/lib/readiness-review-report-examples.mjs` | Writes the examples for MK review |
| `scripts/fixtures/readiness-review-report-golden.json` | Pinned digests of the eight golden sessions |

Removed: the Phase 1 draft builder and draft copy (`draft-document.ts`, `draft-copy.ts`). Their evidence and reviewer wording lives on, corrected, in the Advisory record; everything else is replaced by the standard engine.

## How the review findings were addressed

| Finding | What changed | Proved by |
|---|---|---|
| 1 Reviewer authority | Evidence and reviewer records left the standard report entirely, because they are not part of the assessment (12:05 correction). In the Advisory record, a record made under an unverified reviewer account says so and "This is not an MK finding."; authoritative wording is refused entry by entry, so neither a template change nor a status disclaimer can bring it back | V16, A02; mutations M49 to M54 (an Advisory finding marked unverified, the same beside a status disclaimer, a reported issue citing a reviewer record, release tied to reviewer identity, the basis statement changed to claim verification, an evidence level on a statement) and N01 to N03 |
| 2 Assessment coverage | Ten categories, each with its own statement; the supplied session reconciles as 66 reported on, 15 facts, 79 waiting, 413 not reached, 193 applicability not known, 69 depending on an unanswered question and 67 excluded (902). Adaptive routing explained for the interview's stop reason, with "a control that was not asked … is not a finding" | V17, V05; R-06; mutations M55 (three categories merged into "not asked"), M56, M57, M58, M12 |
| 3 Remediation integrity | "Address the reported gap" is gone. Each gap is a reported issue for management consideration, with one recommended action that restates the practice as the draft method describes it in place, verbatim, or an explicit withheld action. No evidence request anywhere; the respondent's own statement about records is reported as self-reported only | V18, V06; R-07; mutations M59 to M64, M08, M14, M15 |
| 4 Executive quality | Six sections, each statement once, no individual control named, no control inventory or score; the per-control record in the annex. The supplied brief has 27 statements (Phase 1: 29 references to 23 statements, 6 repeated) | V19, V12; R-11; mutations M65 to M67, M35, M37 |
| 5 Phase 2 scope | All four layers, including scenario analysis in the method's order within each area; nothing ranked; judgements MK has not recorded withheld explicitly | V10, V13, V20; R-08; mutations M29, M30, M42, M43, M68 to M70 |
| Correction (12:05) | Standard pathway on self-reported information and the method only; release criteria without review, reviewer or evidence; Advisory preserved and kept apart | R-03, R-05, V11, V16, A05 |

## Tests

Run: `node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-report-engine-tests.mjs`. Result: **17 of 17 pass.**

| Test | Shows |
|---|---|
| R-01 | 3,059 claims for the supplied session, each holding against the input at its pointer; 7 Advisory claims, 3,052 standard; none misplaced; ledger digest stable |
| R-02 | The gate accepts 1.2.x rebuilt from its stored log and refuses 10 faulty cases, including 1.1.0 and a changed method content |
| R-03 | Both builders refuse a non-fictional record; nothing under `src` outside the engine imports it; the standard builder does not import the Advisory record |
| R-04 | Eight golden sessions each pass all twenty checks, rebuild byte-identically and match their pinned digests: the supplied session (interview ended at the screen limit, reviewer records), an early stop by the respondent, a full interview with owner answers, every evidence state and conclusion with a disputed conclusion, incomplete reviews and stale evidence after corrections, corrections both ways, targeted scenario routes, every practice in place, and an interview still open |
| R-05 | The standard report is byte-identical when built from the standard claims alone, and identical apart from the log position when every reviewer action is removed from the stored log (supplied: 4 reviewer actions; Advisory session: 12), with the same release classification and criteria |
| R-06 | Coverage reconciliation as above, one executive statement per category; routing explained for the screen limit, the respondent stopping and an open interview |
| R-07 | In every session, each gap is one reported issue with one recommended action quoting the draft method verbatim; none generic or about evidence |
| R-08 | Every scenario once, in method order, worded for its status; nine of the ten statuses reached by recorded sessions; "precluded" shown unreachable with this bank from the coverage map and exercised on a synthetic input |
| R-09 | Corrections: a practice corrected to a gap is an issue shown as a correction and quoting the current version; a gap corrected to in place is no longer an issue; history complete |
| R-10 | Advisory record: every record once, attributed, none worded with MK authority; 3 earlier records, a disputed conclusion and 2 incomplete reviews shown as recorded |
| R-11 | Every brief: each statement in one section, at most 30 statements, no control named |
| R-12 | 70 mutations of the standard report, each caught by its target check; all twenty checks targeted; 53 caught by the target alone |
| R-13 | 8 mutations of the Advisory record, each caught by its target; all six checks targeted |
| R-14 | Damaged provenance shown as "not recorded", and refused if shown as a first answer |
| R-15 | The underlying record is unchanged from Phase 1: the same 205-action log, and the 1.2.0 input without the method content is byte for byte the 1.1.0 input Phase 1 read (`75750947…`) |
| R-16 | The end-to-end trace below |
| R-17 | Every one of the 75 standard templates is used by a golden session or one of seven synthetic fictional variants (each passing all checks); only the Advisory wording for a verified MK reviewer is unused, as no record can have one before B3 |

Other suites on this commit: type-check clean; lint clean on the changed files; contract tests 23 of 23; local database tests 24 of 24 with cleanup verified. S5.1 pins the fixture's new 1.2.0 input digest (`506cf9c0…`) and checks that without the added method content it is still the 1.1.0 digest (`cb2180f5…`), so the only change is the additive one.

## Examples for MK review

In `examples/` (fictional, draft copy, internal interim):

- `fictional-executive-brief.md`: layer 1 of the supplied session, with release criteria and validation.
- `fictional-management-report.md`: all four layers; the annex as summary tables (the full document is in the delivery package as JSON).
- `before-and-after-comparison.md`: the Phase 1 brief and the Phase 2 report built from the same stored log, finding by finding, with the record shown unchanged.
- `fictional-advisory-record.md`: the preserved Advisory capability on the Advisory golden session.
- `fictional-trace-D1-B-01.md`: one answer from the stored log to the brief, the analysis, the issue, the recommended action and the annex, with the Advisory record for the same control kept apart.
- `phase-1/`: the Phase 1 examples, kept for the comparison.

## Assessment

### Engineering validity

- **Established by tests:** the standard report rests only on standard claims and cannot be made to depend on Advisory material without failing (R-05, V16); every statement is traceable to claims that hold against the input; coverage, issues, actions and scenarios are each accounted for exactly once; documents are deterministic and pinned; the checks catch every one of 78 injected faults; the stored answer log and the 1.1.0 projection of the input are unchanged.
- **Limits:** the wording checks compare a template's own words with word lists and pinned sentences. That is reliable for fixed templates and an approved copy table, not for free text, which is why free text is excluded; a synonym the lists do not hold would pass, so approved copy (B7) is still read by a person. Golden sessions are generated by scripted answer patterns, not by real respondents. Seven variants that no recorded session reaches are exercised on synthetic inputs, which test the wording and the checks but not the engine's route to those states. Statement ids are stable for one engine version only. The lineage check runs against an in-memory store; through the database store it is Phase 3. Hosted database verification is still pending (below).

### Methodological assumptions

All are proposals for MK, listed with the decision each needs in `REPORT-ENGINE-MK-DECISIONS.md` (M1 to M18). The most consequential: what counts as a gap (M1); the coverage categories (M3); restating the in-place description as the recommended action, and at which anchored level (M4); withholding any further remediation specificity (M5); counting scenarios by what was established (M7); tiers in the annex only (M8); and the finding that the "precluded" scenario status is unreachable with bank 1.3-review (M10).

### Commercial readiness

None. The engine produces internal interim documents from fictional records only, with unapproved copy and an unapproved method, connected to nothing. Its release criteria list what would have to change: a real record, the interview ended, B4, B7, B5, B6, B2 and B3 (authenticated access for the organisation). None depends on evidence review or reviewer records. The Snapshot and the Comprehensive Report are unchanged, and the Advisory record is not bundled or offered.

### Outstanding MK decisions

`REPORT-ENGINE-MK-DECISIONS.md`: 18 methodological, 9 copy, 3 presentation and 2 commercial decisions; and D1 to D12 in `REPORT-ENGINE-DESIGN.md`.

## Hosted verification

Still pending, and separate from Phase 2. The hosted suite runs with `scripts/readiness-review-hosted-tests.sh` on MK's computer, reading a short-lived secret key from `~/.config/mk-review`, so the key never leaves that computer; no key has been placed there yet. When it is, the run and an independent owner-level check that no session, link, action, run or user remains will be reported with exact pass, fail, blocked and not-applicable totals. Without the key, the suite reports 4 pass, 19 blocked and 1 not applicable, exit code 3, and never counts a blocked test as passed.

## Open release items

B2, B3, B4, B5, B6, B7, B11 and J-01 remain open (`RELEASE-DECISION.md`).
