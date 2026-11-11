# Report engine, Phase 1: contract, gate, ledger and validation

> Accepted by MK on 11 November 2026 as the technical foundation. Superseded in part by Phase 2 (`REPORT-ENGINE-PHASE-2.md`): the draft builder and draft copy below were replaced by the standard report engine, and the evidence and reviewer wording moved, corrected, to the separate Advisory record. The Phase 1 examples are kept in `examples/phase-1/`.

Authorised by MK on 11 November 2026: the typed report document contract, the input gate, the claims ledger, the validation framework and automated mutation tests, with draft templates and fictional examples for MK review. Not authorised and not done: approving the methodology, generating customer reports, external delivery, and any connection to the commercial products. Design: `REPORT-ENGINE-DESIGN.md` (revision 2).

## What was built

| File | Does |
|---|---|
| `src/lib/readiness-review/report/document.ts` | The report document contract `mk-readiness-management-report` 0.1.0 (draft): four layers, statements, the three registers and reviewer follow-ups, the annex rows, evidence levels, attribution, counts with universes, release classification |
| `src/lib/readiness-review/report/input-gate.ts` | Accepts report input 1.1.x only; requires scoring withheld and a fictional record (Phase 1); recomputes the digest; with a store, rebuilds the input from the stored log prefix and requires the same digest |
| `src/lib/readiness-review/report/ledger.ts` | The claims ledger: 2,300 typed claims for the fictional session, each with a JSON pointer, the copied value, and for evidence and reviewer records the evidence level and attribution |
| `src/lib/readiness-review/report/validate.ts` | The fifteen checks V01 to V15 |
| `src/lib/readiness-review/report/shared.ts` | Helpers shared by the checks and the draft builder |
| `src/lib/readiness-review/report/draft-copy.ts` | Draft templates, version `0.1.0-draft`, marked unapproved (B7); no template contains a number of its own |
| `src/lib/readiness-review/report/draft-document.ts` | A draft builder for fictional examples only: it refuses any record not marked fictional and is imported by no route, page or service |
| `scripts/readiness-review-report-engine-tests.mjs` | The Phase 1 tests below |
| `docs/readiness-review/examples/phase-1/` | The trace and the draft executive brief built from the supplied fictional session |

## Tests

Run: `node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-report-engine-tests.mjs`. Result: 8 of 8 pass.

| Test | Shows |
|---|---|
| R-01 | Every one of 2,300 claims holds against the input at its pointer; ids unique; the ledger digest is stable; every control and answer version is a claim; no claim carries independent validation; every evidence and reviewer record is attributed as unverified |
| R-02 | The gate accepts the session rebuilt from its stored log and refuses 10 faulty cases: another contract, versions 1.0.0 and 2.0.0, scoring not withheld, a non-fictional record, an unexpected digest, a missing session, a changed log, a position beyond the log, and a changed input |
| R-03 | The draft builder refuses a non-fictional record; no file under `src` outside the engine imports it |
| R-04 | The draft document of the supplied session passes all fifteen checks and is byte-identical when built again |
| R-05 | Draft documents of three more fictional sessions (an early stop; a full interview with owner answers; every evidence state and conclusion, a follow-up without a conclusion, and a correction that makes reviewed evidence no longer current) pass every check |
| R-06 | 44 mutations, each an injected fault, are each caught by their target check; all fifteen checks are targeted; 39 are caught by the target alone |
| R-07 | A damaged log (an answer's provenance entry missing) is shown as "how it was given is not recorded", passes, and fails V14 if shown as a first answer |
| R-08 | The end-to-end trace below |

Two defects in the checks themselves were found by R-05 and corrected before this record: V03 compared counted items with their universe by claim id rather than by subject, and its number check removed quoted values shortest-first, so a number inside a digest broke it; and V06 applied the "current evidence only" rule to a status statement that legitimately refers to all reviewer records.

## The end-to-end trace

`examples/phase-1/fictional-trace-D1-B-01.md`, produced and checked by R-08 on the supplied fictional session ("Fictional Retail Group", contract 1.2.0 record):

1. **The reported answer.** Action 15 in the stored log: `respondent.answer` for D1-B-01, value `2`.
2. **In the report input.** `/domains/0/controls/9/answer`: version 1, "Some fraud information is reported, but not on a set schedule or in a set format.", class `partial`, source `respondent-answer`.
3. **In the claims ledger.** `control:D1-B-01`, `answer:D1-B-01:v1`, `gap:D1-B-01`, `evidence:D1-B-01` (level reviewed, outcome insufficient, attributed to the fictional harness reviewer, identity not verified) and the method's action `action:address:D1-B-01:0`. Each holds against the input.
4. **The executive statements.** "Fraud governance and accountability: 2 of the 10 practices reported on were reported as not fully in place." "For “Board receives fraud reporting”, MK reviewed the evidence supplied and found it insufficient." "Management has been told by its own respondent that 22 of the 66 practices reported on are not fully in place. This is what was reported; it has been checked against evidence only where stated."
5. **Analysis and register.** "“Board receives fraud reporting”: Reported partly in place, as reported by Respondent. MK reviewed the evidence supplied and found it insufficient." Remediation item 1 (unranked): "Address the reported gap: Board receives fraud reporting. For management consideration; based on what was reported."
6. **Supporting evidence reference.** Annex rows for the control, answer version 1 and the evidence record (by, time, answer version, basis "Only head office records were supplied", identity not verified).

## Assessment

### Engineering validity

- **Established by tests:** the ledger is a faithful, checkable copy of the input; the gate fails closed on every fault tried and ties an input to the stored log; the checks fail on every injected fault and pass on four differently shaped fictional sessions; documents are deterministic; type-check and lint are clean.
- **Limits:** the wording checks match the template's own words against word lists. They are reliable for fixed templates and an approved copy table, and would not be enough for free text, which is why free text is excluded. Quoted values (reviewer basis, control names) are excluded from the wording checks on purpose, because they are the record's own words and are attributed; a reviewer's quoted words can therefore contain terms the engine itself may not use. The lineage check was exercised with an in-memory store holding the fixture; through the database store it is Phase 3. The draft builder exists to exercise the checks and to show MK the structure; it is not the Phase 2 rules engine and covers only the executive brief, area analysis, registers and annex (scenario analysis is not drafted). Statement ids depend on the order of claims, so they are stable for one engine version, not across versions.
- **Hosted store:** the hosted integration suite is still blocked for want of a short-lived secret key (below).

### Methodological assumptions

Each of these is a proposal embedded in Phase 1 for MK to confirm or change; none is an approved method.

1. Reported exposure is the method's issue classes as reported (absent, partly in place, set out but not working). Practices reported "no case has tested it yet" or "not applicable" are not exposure.
2. "Practices reported on" means controls in the `reported` state. Recorded facts and practices established by a wider answer are not counted in it.
3. "Not asked" groups not asked yet, applicability not yet known and depends on an unasked question; "excluded" groups does not apply, not expected at this size, cannot apply because a related practice was reported absent, assumed not to apply, and retired.
4. Evidence levels map the method's evidence states: requested and unavailable to "requested"; supplied to "recorded"; reviewed sufficient, insufficient and contradicted to "reviewed for sufficiency". The respondent's own statement that evidence exists is "said to exist". Independent validation does not exist in the method and is never claimed.
5. "Material" scenarios are those the engine lists as unresolved and material; in the sample they are tiers 1 and 2. Tiers are a method proposal (B4) and set only the sequence of information gathering.
6. The information-gathering sequence groups by accountable function in alphabetical order, with unassigned questions last, then by tier and question order. It is administrative.
7. Remediation recommendations are the method's own action wording for reported gaps ("Address the reported gap: …"), unranked. Reviewer follow-ups are quoted as recorded and not classified.
8. Management decisions are derived from structural facts: questions without an accountable function, reported practice without reviewed evidence, assumptions to confirm, and an incomplete review.
9. Presentation limits in the executive brief (at most five evidence items and five conclusions, ten named controls, three per statement) are placeholders for D2 and D4.
10. Reviewer identity is treated as unverified because the input carries no verified identity. Every conclusion is shown as recorded and keeps the document internal.

### Commercial readiness

None. Phase 1 produces no customer report and cannot: the gate refuses non-fictional records, the builder is draft and fictional-only, every document is classified internal interim, and nothing is connected to a route, a delivery channel or the Snapshot and Comprehensive products. Before any commercial use: B2 (staging isolation), B3 (authenticated access and verified reviewer identity), B4 (method approval), B5 (commercial path), B6 (terms and privacy), B7 (copy approval), the hosted store verification, Phases 2 to 4, and the decisions below. The scoring prohibition is a constraint of this stage while the method is unapproved, not a commercial policy.

### Outstanding MK decisions

- D1 to D10 in `REPORT-ENGINE-DESIGN.md`, in particular D3 (sequencing, and when a prioritisation methodology may be approved), D4 (counts in the brief at low coverage), D5 (internal-only interim release), D6 (verified reviewer identity), D7 (evidence levels, and whether to add independent validation), D8 (immutable report records and retention), D9 (copy and any later commentary process).
- The ten methodological assumptions above.
- Under B4: the scenario tiers, what counts as material, the answer mappings and exclusions.
- Under B7: every draft template in `draft-copy.ts`.

## Hosted verification

Blocked. No short-lived secret key has been placed at `~/.config/mk-review` on MK's computer. The hosted suite runs with `scripts/readiness-review-hosted-tests.sh` on that computer, so the key does not leave it; the local shell there has Node 22.23 and reaches both the temporary project and the npm registry. When the key is in place, the run and an independent owner-level check that no session, link, action, run or user remains will be reported with exact pass, fail, blocked and not-applicable totals.
