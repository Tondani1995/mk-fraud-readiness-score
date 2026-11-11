# Report input contract

Contract name `mk-readiness-report-input`, version **1.2.0**. Defined in `src/lib/readiness-review/report-input.ts`; enforced by contract test C-23 and by database tests S1.3, S4.1, S5.1, S5.2 and S6.1 (`scripts/readiness-review-database-tests.mjs`), on the local and the hosted backend.

This is what a reworked report engine consumes. It replaces nothing in the legacy scored track, whose reports are untouched.

## Principle

The stored answer log is the only source of truth. A report input is built by replaying that log through the review engine it was recorded under, and nothing else: `buildReportInput(replay(record))`. It is a pure function of the log, so the same log always gives the same input, byte for byte, and `reportInputDigest(input)` (SHA-256 of its canonical JSON) identifies it. A report engine that improves later is simply run again over the same stored logs; no stored answer is ever rewritten to suit a report.

The input keeps apart what the method keeps apart, and a report must too:

| Kind of information | Where it is | What it is not |
|---|---|---|
| Scope: whether a control applies and who or what decided | `control.state`, `control.scope`, `scenarios[].status` | A finding about practice |
| Reported practice: what someone said, in which version, through which channel | `control.answer`, `control.history`, `control.class` | Evidence, or MK's view |
| Uncertainty: what is waiting, and why | `control.waiting.provenance`, `openWork` | A gap |
| Method content: what the draft method says a practice looks like in place, and the fraud risks it names (from 1.2.0) | `control.method` | A judgement about the organisation |
| Evidence: what a reviewer recorded about evidence, against which answer version (Advisory only) | `control.evidence` (`current` or earlier) | A conclusion; part of the standard report |
| Review judgement: a reviewer's conclusion (Advisory only) | `control.review` (`current` or earlier) | Final, unless the review is complete; part of the standard report |

Evidence and reviewer records belong to the separately scoped Advisory package. The input still carries them so that nothing recorded is lost, but the standard (self-reported) report never reads them: its claims ledger marks them as Advisory claims, and validation check V16 refuses any standard report that cites one (`REPORT-ENGINE-DESIGN.md`, revision 3).

It carries no score, band, rating, confidence or prediction. `method.scoring.status` is `withheld`: the method produces none until MK approves a supported method, and a report engine must not derive them from this input. C-23 fails if any such field appears.

## Obtaining it

```ts
import { replay } from '@/lib/readiness-review/session';
import { buildReportInput, reportInputDigest } from '@/lib/readiness-review/report-input';

const record = await store.load(sessionId);          // file harness or database store, same shape
const input = buildReportInput(replay(record));       // refuses a record bound to another ruleset
const digest = reportInputDigest(input);
```

When a report is produced (or fails), the database store records the run: `store.recordReportRun({ sessionId, inputContract, inputVersion, inputDigest, logDigest, actionCount, reportEngine, reportEngineVersion, status, output | failure, createdBy })`. The run is tied to the log position it was built at, so the same input can be rebuilt later from the stored log prefix and checked against the recorded digest (D-07).

## Structure

| Field | Contents |
|---|---|
| `contract` | `{ name, version }` of this contract |
| `lineage` | `sessionId`, `createdAt`, `recordContractVersion`, the complete `ruleset` the log was recorded under, `rulesetReader` (`recorded` or `historical-1.0-1.2`), `actionCount`, `firstActionAt`, `lastActionAt`, `logDigest` (SHA-256 of the canonical answer log), `asOf`, `engineReportVersion` |
| `method` | `approval` (the method is not approved by MK), `scoring` (withheld, with the reason), `completeness` (`complete: false` until an authorised reviewer concludes, with why), and `vocabulary`: practice classes, the classes that count as a reported gap, evidence states, conclusions, and the canonical wording of every control state and scenario status |
| `organisation` | `label`, `fictional` |
| `interview` | status, stop reason, respondent screens used and the limit, owner screens, corrections, whether follow-up was sent, review status, questions asked by kind |
| `profile` | each profile fact: id, key, question, label, value, when and through which channel |
| `domains[]` | `id`, `name`, `counts` by state, and `controls[]` (below), every control of the bank including those never asked |
| `scenarios[]` | each fraud scenario: id, name, tier, domain, `status` and its wording, what was established, routes still undecided with the facts they wait on, and the state of each confirming control |
| `findings` | `reportedGaps` (in tier order), `reviewerFindings` (current and earlier evidence and conclusions kept apart), `reviewerTasks`, `reReview` (answers changed after review), `stale` |
| `openWork` | `waiting` (with owner, function and provenance), unresolved material scenarios, owner queue, follow-up plan, owner packages, assumptions to confirm, precluded controls by the answer that precluded them, and the engine's action list |

### A control

| Field | Meaning |
|---|---|
| `id`, `key`, `text`, `type`, `format` | The question as the bank defines it (bank 1.3-review, unapproved: B4) |
| `domain`, `module` | Where it sits; the domain structure is the existing one |
| `scenario`, `role`, `objectives` | The scenario it confirms or relates to, its role there, and the objectives it serves |
| `state`, `stateLabel` | The engine's state and its canonical wording (table below) |
| `class`, `issue` | For a reported practice: full, partial, designed, absent, noinstance or na; `issue` is true for partial, designed and absent |
| `answer` | The current answer: version, value, label, class, time, channel (`via`: `respondent`, `owner` or `assumptions`, as the engine records it), how it was given (`source`, below), who answered and in which role, and the respondent's optional detail (reach, tested, evidence available, note) |
| `history` | Earlier answer versions, oldest first, each with the same fields. When an owner answers after a respondent's "I don't know", the earlier "I don't know" is kept here; when the respondent corrects an answer, every earlier version is kept here |
| `waiting` | For waiting controls: owner, function and `provenance` (why it is waiting, from what was recorded) |
| `scope` | For scope states: the fact that decided it and its basis |
| `reused` | When a wider answer established it |
| `subPractices` | For multi-part practices, each part's class |
| `evidence`, `review` | MK's evidence state and the reviewer's conclusion, each with the answer version it was made against and whether it is `current` |
| `reReview` | Why a review no longer applies to the current answer |
| `method` | From 1.2.0, for practice controls only (null otherwise): the method's own content, below |

### How an answer version was given (`source`, from 1.1.0)

| Value | Meaning |
|---|---|
| `respondent-answer` | The respondent answered the question when it was asked |
| `respondent-correction` | The respondent changed an earlier answer; the version it replaced is in `history` |
| `owner-answer` | An accountable function answered it |
| `activities-screen` | Set on the activities screen (assumptions to confirm) |

It is read from the engine's own answer log, which records one entry for each answer version, with the same time, value and channel, except those set on the activities screen. Each version is matched to its entry by those three, so a missing entry gives that version `source: null` and never shifts the provenance of another version (database test S1.5). A correction keeps `via: respondent`, so `source` is the field that says it was a correction. A report engine must treat `null` as "not known" and say so; it must not assume a first answer.

### The method's own content (`method`, from 1.2.0)

| Field | Meaning |
|---|---|
| `inPlace.kind` | `anchored-level` (an anchored question), `practice-option` (the standard practice scale) or `choice-options` (a question with descriptive answers) |
| `inPlace.answers` | The answer or answers the method classes as in place, with their labels (for anchored questions, levels 4 and 5) |
| `inPlace.description` | For anchored questions, the method's description of the lowest in-place level; otherwise null |
| `risks` | The fraud risks the method names for the practice, with their names, from the area's risk list |

`inPlace` is null where the method gives no answer to quote (the two multi-select practices, D4-M-13 and D5-V-13). The content is copied from the question bank of the recorded ruleset and never written by the engine. The method is not yet approved by MK (B4), so a report may quote it only as the draft method's own wording.

### Control states

| State | Wording | A report may say |
|---|---|---|
| `reported` | by class, for example "Reported partly in place" | what was reported and by whom; never that MK reviewed or verified it |
| `fact` | Recorded fact | the fact |
| `waiting` | Waiting for an owner | that it is with an accountable function, and why (`provenance`) |
| `waiting-scope` | Whether it applies is waiting for an owner | that applicability is unknown pending a fact |
| `unconfirmed` | Not asked yet | that it was not covered; never that it is absent |
| `scope-unconfirmed`, `prerequisite` | Whether it applies is not yet known; Depends on a question not yet asked | that coverage is incomplete |
| `precluded` | Cannot apply, because a related practice was reported absent | that it follows from a reported gap |
| `assumed` | Assumed not to apply for this sector; to confirm | that it needs confirming |
| `outofscope`, `proportion` | Does not apply; Not expected at this size | that it was excluded, and by what |
| `reused` | Established by a wider answer | the wider answer |

### Waiting provenance

`respondent-unknown`, `owner-unknown`, `area` (sent with its area), `not-reached` (second-stage follow-up), `owner-opened` (opened by an owner's answer), `scope-waiting`, `assigned`. Each carries the sentence the Snapshot shows.

## Rules for a report engine

1. Read only this input. Do not read the answer log, the engine or the bank directly, so that every report can be traced to an input digest.
2. Record every run, generated or failed, with the input digest and log position.
3. Never present a score, band, rating, confidence or prediction, and never infer one from counts.
4. Never treat a control that was not asked, is waiting or is out of scope as a gap. Gaps are `findings.reportedGaps` only, and they are gaps indicated by the organisation's responses, not verified control deficiencies.
5. The standard report reads no evidence or reviewer record (`control.evidence`, `control.review`, `findings.reviewerFindings`, `findings.reviewerTasks`, `findings.reReview`), and neither its generation nor its release depends on them. They are for the separately scoped Advisory record, which presents evidence and conclusions as current only when `current` is true; earlier ones are history. A record with `forVersion: null` was made against no answer at all and is never current (database test S6.2).
6. `method.completeness` describes a reviewer-based review, an Advisory matter. The standard report does not use it; it states its own basis (the organisation's responses, not verified) and its own release criteria.
7. Use the canonical wording in `method.vocabulary` for states and statuses, or wording MK approves in its place.

## Versioning

Additive fields raise the minor version. Any change to the meaning of an existing field, or a removal, raises the major version, and report runs record the version they consumed. The input of a session recorded under contract 1.0.0 to 1.2.0 is built through the historical reader and says so in `lineage.rulesetReader`.

| Version | Change |
|---|---|
| 1.0.0 | First version (`392859e`). Its documentation listed `correction` and `owner-followup` as values of `via`; the builder never produced them, because the engine records corrections with `via: respondent`. |
| 1.1.0 | Adds `source` to every answer version, so a correction is identifiable; corrects the documented values of `via`. No other field changes. Inputs built under 1.0.0 differ only by the new field. |
| 1.1.0, implementation correction | `source` is matched by time, value and channel rather than by position in the engine's log. The output for every intact log is unchanged (the pinned digests of the S5.1 fixture and of the 1.2.0 sample are identical before and after); only a damaged log, which the service never produces, now gives `null` instead of a shifted attribution. No version change. |
| 1.2.0 | Adds `method` to every control: the draft method's own in-place description, in-place answers and named fraud risks for practice controls, so that the standard report can restate a practice as the method describes it without reading the bank. Additive; no other field changes. The 1.2.0 input with `method` removed and the version set to 1.1.0 is byte for byte the 1.1.0 input: the S5.1 fixture still gives `cb2180f5…` and the supplied 1.2.0 sample `75750947…` that way (database test S5.1, report engine test R-15). The pinned 1.2.0 digests are `506cf9c0…` and `77f4cbd1…`. |
| 1.3.0 | Built only from a staged (build 1.6) session by `buildStagedReportInput`: the 1.2.0 input with `interview.respondentScreenLimit` set to `null` and a `staged` record of the stages, the consistency checks (each outcome with its label, the population and the number not tested; outcomes are recorded, never applied), workload by actor, package sends, every package item (function, suggested owner, status, origin, kind, scenario, decline reason), area delegations and the number of open depth candidates. Additive; 1.5 sessions keep producing 1.2.0 exactly. It carries no score. `revised-adapter.ts` (0.1.0) reads 1.2.0 or 1.3.0 and returns a methodology-neutral context whose `scoring.status` is `inactive`. |

## Size

A full session produces about 1.1 MB of input (about 0.8 MB before the method content of 1.2.0), because every one of the bank's 902 controls is listed with its text and state. That is deliberate: a report must be able to say what was not covered as well as what was.
