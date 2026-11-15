# Readiness review data contract

Contract name `mk-readiness-review`, version **1.3.0**, action schema `mk-readiness-review/actions/1`, for sessions on review engine build 1.5. Sessions on the staged build 1.6 use version **1.4.0** with action schema `mk-readiness-review/actions/2` (section "Staged sessions" below). Defined in `src/lib/readiness-review/contract.ts`; enforced by `scripts/readiness-review-contract-tests.mjs` (C-01 to C-23) and, for 1.4.0, `scripts/readiness-review-build16-tests.mjs` (B16-01 to B16-13 and the journey tests).

The contract covers the adapter between the vendored review engine and everything that reads it: the stored session record, the actions that change it, the role-scoped views the pages and API return, and the export. It does not cover the legacy scored assessment, whose records, scores and reports are untouched.

## Pinned ruleset

| Part | Version | File | SHA-256 |
|---|---|---|---|
| Review engine | build 1.5, additive to the rechecked build 1.4 (`6d374561cd709f873c7649b5ac637b68aa07d88c79940032f3dfda36b8f8e740`) | `vendor/review-engine-build-1.5.cjs` | `7f8ca08f2626108919ef97d664d6b752fe91ae686fdd44639d1e79be5d9395ba` |
| Question bank | 1.3-review | `data/bank-v1.3.json` | `95abc50e743f428e5829c042abc1823c517075b77204ffdf0e538aa5fe5f4419`; loaded digest `80eac8fc77fbc1e90e563c374e2d458918f55f24037eaaa588b4cbb8b8ef21c0` |
| Coverage map | 1.3-review | `data/coverage-map-v1.3.json` | `9081b069f1f15dfea35afe001da69d8636345492810b36b56b30624a302c77a7`; loaded digest `c47f7b42cefa157c851f720273f156d419bf78da6f04a70b8542956c5e2d29e8` |

The loaded digest is the SHA-256 of the data as the build imported it. The service compares both digests with the contract when it starts and refuses to replay or write anything if either differs (`ruleset_unavailable`, HTTP 503).

Respondent screen limit: **95**, including the profile questions. Owner answers and corrections do not count against it. The engine's `followups` option is 2, its reviewed default: at most two second-stage follow-up questions are queued from each source.

Change control: any change to the engine, bank or coverage map changes a hash, and C-01 fails until `contract.ts` is updated deliberately. Any change to the shape of an action, a view or the export increments `version` and is recorded below.

## Ruleset binding

Every record written under contract 1.3.0 stores its complete ruleset once, at creation:

```
ruleset: {
  contract: { name, version, actionSchema },
  engine:   { build, sha256 },
  bank:     { version, sha256, digest },
  coverage: { version, sha256, digest }
}
```

Replay (`validateRecordRuleset` in `session.ts`) refuses, with the reason, a record whose contract name, action schema, engine, bank or coverage differs from this build, whose contract version is not one this build reads (`recordContracts`: 1.3.0), or whose summary fields (`contractVersion`, `engineSha256`, `bankVersion`) disagree with its ruleset. Records written under contracts 1.0.0, 1.1.0 and 1.2.0 have no ruleset. They are read only through an explicit historical reader, which binds them to the one ruleset those versions shipped with (engine `7f8ca08f…`, bank 1.3-review `95abc50e…`, coverage `9081b069…`) and only while this build runs exactly that ruleset. Nothing is migrated or relabelled. C-21 replays a real 1.2.0 record, produced by the verified `1adf1aa` build, to the identical report digest.

## Session record

One JSON document per session (`SessionRecord` in `session.ts`):

| Field | Meaning |
|---|---|
| `sessionId` | Random identifier. |
| `createdAt` | ISO time. |
| `contractVersion`, `engineSha256`, `bankVersion` | Summary of the ruleset the session was recorded under; must agree with `ruleset`. |
| `ruleset` | The complete ruleset (1.3.0); absent on 1.0.0 to 1.2.0 records, which use the historical reader. |
| `organisationLabel` | The organisation name as typed. |
| `fictional` | Always `true` in this candidate; the harness refuses anything else. |
| `tokens` | Role links: `respondent`, `management`, `reviewer`, `links`, and `owners` keyed by accountable function. |
| `actions` | Append-only list of stored actions. |

The state of a session is never stored. It is recomputed by replaying `actions` through the engine. A record bound to any other ruleset is refused (`ReplayError`, HTTP 410) rather than reinterpreted under different rules.

## Storage

Two stores keep the same contract: the fictional file harness (below), and the database store, which holds the same record in transactional storage on an isolated project (`DATABASE-DESIGN.md`). A record read from either is the same record, and replays to the same report input (database test D-02). Every store reports its log length, and the service checks it before using a cached session when other processes may write to the same store.

### Fictional file harness

Creation is one transaction over the shared link index: an in-process queue and a lock file shared by every process using the harness directory. The session file is written, then the index; if the index cannot be written, the session file is removed and the start fails with "Nothing was created". Temporary files are uniquely named and replaced by rename. A missing index is empty; an unreadable or damaged index or session file is reported (`store_unavailable`, HTTP 503) and never overwritten or treated as empty. Appends hold the same per-session lock and check the expected length. This is a single-host file harness; production storage needs database transactions, tenancy, retention and its own multi-instance tests.

## Actions

Every stored action carries `id` (the client's action ID), `seq` (its position), `at` (server time) and `actor` (`respondent`, `owner`, `organisation`, `reviewer` or `system`).

| Action | Fields | Allowed for | Rule |
|---|---|---|---|
| `respondent.serve` | `q` | system | Records which question the respondent was shown, so replay serves the same question. |
| `respondent.answer` | `q`, `value`, `detail?` | respondent | Only the question currently served; counts one respondent screen. `detail` holds the optional reach, tested and evidence answers. |
| `respondent.assignArea` | `domain`, `owner` | respondent | Sends the rest of an area to its accountable function after "I don't know". |
| `respondent.correct` | `q`, `value` | respondent | Changes an earlier respondent answer. The earlier value stays in history; reviewer records on it become not current. Does not reopen an ended interview. |
| `respondent.stop` | none | respondent | Ends the interview early. Everything not reached stays open. |
| `respondent.resume` | none | respondent | Only after a respondent stop, not after the 95-screen limit. |
| `owner.serve` | `fn`, `q` | system | Records the question shown to an owner. |
| `owner.answer` | `fn`, `q`, `value` | that function's link | `fn` is taken from the link, not the request. |
| `organisation.sendToOwners` | none | respondent, management | Creates the owner packages after the interview. |
| `reviewer.evidence` | `q`, `state`, `basis` | reviewer | Bound to the answer version current at the time. |
| `reviewer.review` | `q`, `conclusion`, `basis`, `followUp`, `limitation` | reviewer | A follow-up can be saved with no conclusion. Bound to the answer version. |

`value` is a string for single-choice questions and an array for multi-select. `"unknown"` (or `["unknown"]`) means "I don't know" and sends the question to its owner; it is never treated as absent, zero or not applicable.

### Submission and errors

`POST /review/api/s/{token}` with `{ actionId, expectedSeq, action }`.

| Case | Result |
|---|---|
| Accepted | 200 `{ seq, duplicate: false, current }` where `current` is the role's fresh view. |
| Same `actionId` again | 200 `{ duplicate: true, current }`; nothing is applied twice. |
| `expectedSeq` is stale | 409 `conflict`; the page reloads the current view. |
| Not the served question, invalid value, action not allowed for the link | 422 `stale_question`, `invalid_value`, `not_allowed`, `unknown_question` or `invalid_input`; nothing stored. |
| Save failure (fault injection only) | 503 `save_failed`; nothing stored; the same `actionId` can be retried. |
| Unknown link, or harness not enabled | 404. |
| Storage unreadable, damaged, busy or failed to write | 503 `store_unavailable`; the message says nothing was created or recorded. |
| Loaded ruleset differs from the contract | 503 `ruleset_unavailable`; nothing is replayed or written. |
| Recorded under another engine build | 410. |

All review responses send `Cache-Control: no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

## Routes

| Route | Method | Returns |
|---|---|---|
| `/review/api/sessions` | POST `{ organisationLabel, fictionalConfirmed: true }` | `{ sessionId, links, respondent }` |
| `/review/api/s/{token}` | GET | `{ role, view }` for the link's role |
| `/review/api/s/{token}` | POST | as above |
| `/review/api/s/{token}/snapshot` | GET | `{ view }` Snapshot view |
| `/review/api/s/{token}/export` | GET | export document, as an attachment |
| `/review`, `/review/s/{token}`, `/review/s/{token}/snapshot` | GET | pages built from the same views |

## Views

All views are produced in `view-model.ts` from one engine report (`reportFor`). Pages, API and export call the same functions, which is what C-05 and J-04 check.

| View | Read by | Main contents |
|---|---|---|
| `RespondentView` | respondent | `status`, current `step` (question, choices, area, phase, optional detail rules, suggested owner), `lastSaved` (with the area handoff offer), `history` (answers with value, choices, and whether they can still be changed), `areas` (1.2.0), `canResume`, `seq` |
| `SnapshotView` | respondent, management | four counts with definitions and denominators, reported gaps, waiting items, open material scenarios, evidence still to review, reported in place, scope and assumptions, status |
| `OwnerView` | one function | its package items with status and suggested role, the current question with the reason it reached this function, counts |
| `ReviewerView` | reviewer | controls with answer versions, evidence and conclusions marked current or not, queues (evidence to review, reviewer findings, follow-ups, needs re-review, all), tasks |
| `ManagementView` | management | needs an answer, needs evidence, needs remediation, who acts next, completion conditions |
| Links view | links page | role links and one link per accountable function |

### Why a question is waiting (1.3.0)

Each Snapshot waiting item carries `provenance: { kind, label }`, and the Snapshot carries `waitingBySource` (count per kind). The kind is taken from what was recorded, in the engine's own order:

| Kind | Recorded basis |
|---|---|
| `respondent-unknown` | the respondent's live answer is "I don't know" |
| `owner-unknown` | an accountable function's live answer is "I don't know" |
| `scope-waiting` | the question applies only if a fact that is itself waiting for an owner holds (engine state `waiting-scope`) |
| `owner-opened` | an owner's answer opened this confirmation (engine `ownerFollowup`) |
| `not-reached` | the interview did not reach it and it was sent as a second-stage follow-up (assignment origin `follow-up`) |
| `area` | the respondent sent the rest of its area (domain assignment, no individual assignment) |
| `assigned` | any other recorded assignment, with the engine's recorded reason |

The management view's "needs an answer" list and the export use the same reasons.

### Snapshot counts

| Key | Value | Denominator shown |
|---|---|---|
| `reported-gaps` | controls reported not in place, partly in place, or set out but not yet working | controls with a reported answer |
| `waiting` | questions now with an accountable function for any of the reasons above; each item says which | none |
| `open-scenarios` | tier 1 and tier 2 failure scenarios that apply or may apply where the deciding fact or control is not yet established | material scenarios that apply or may apply |
| `evidence` | controls reported in place or partly in place on an essential confirmation, or where a record could be shown, not yet reviewed by MK | essential confirmations with a reported answer |

No view or export contains a score, maturity band, rating, confidence label or inferred control state (C-06, J-05).

## Staged sessions (contract 1.4.0, build 1.6)

Fictional harness only, inactive for customers and never selected in production. A session is created on build 1.6 only when `MK_READINESS_REVIEW_HARNESS=fictional-local` and `MK_READINESS_REVIEW_ENGINE=1.6` are both set; its ruleset records engine build 1.6, contract 1.4.0 and action schema 2, and replay refuses it under any other engine. Build 1.5 sessions are unaffected.

| Part | Version | File | SHA-256 |
|---|---|---|---|
| Review engine | build 1.6, composing build 1.5 (`7f8ca08f…`) unchanged | `vendor/review-engine-build-1.6.cjs` | as `contract.ts` `stagedBuild.engine.sha256` (B16-01 fails on any difference) |
| Question bank, coverage map | as for 1.3.0 | | |

Changes against 1.3.0, all additive:

| Area | Change |
|---|---|
| Respondent limit | None. `status.limit` and `status.pctOfLimit` are `null`; `status.stages` gives the core and breadth stages (answered, with a function, declined, not known by the function, open, applicable so far, complete, share reached), the current stage, function progress and outstanding information. |
| `owner.decline` | New. Fields `fn`, `q`, `reason` (required, at most 300 characters). Allowed for that function's link (`fn` is taken from the link) on a question assigned to the function or the delegated-area question on its screen. The question stays outstanding with the reason and is not served again or reassigned. Refused in 1.5 sessions. |
| `organisation.sendToOwners` | Accepts `depth`: `"recommended"` (default), `"none"` or a list of current candidate ids (at most 200). Allowed once the core stage is complete and repeatable; a question already with a function is never assigned twice. |
| `respondent.correct` | As in 1.3.0; in a staged session a correction that brings questions into scope reopens a completed interview and serves them. |
| Owner view | Adds `progress` (open, answered, declined, not known, areas) and `canDecline`; items carry `declineReason`. |
| Snapshot and management views | Add `staged`: whether packages can be sent, how many sends so far, the recommended ids and up to 80 candidates (title, function, kind, scenario). |
| Waiting provenance | Adds the kind `declined`, labelled with the function and its reason. |
| Export | Unchanged in shape; the report carries `engineBuild: '1.6'` and `staged`. |

## Export

`GET /review/api/s/{token}/export` returns:

```
{ contract: { name, version, actionSchema },          // the export format of this build
  ruleset: { recorded, reader },                      // the session's validated ruleset; reader 'recorded' or 'historical-1.0-1.2'
  engine, bank, coverage,                             // from the recorded ruleset, not from this build
  approval,
  session: { sessionId, organisationLabel, fictional, createdAt, asOf, actions },
  report,                       // the engine report itself
  views: { snapshot, management } }
```

## Version history

| Version | Commit (working history) | Change |
|---|---|---|
| 1.0.0 | `3ba543a` | Adapter, actions, replay, views and export. |
| 1.1.0 | `5eb2418` | HTTP error mapping; respondent `history` items carry `value`, `format`, `choices` and `changeable` so Back can show and change a saved answer; `lastSaved.unknownArea` carries the area handoff offer. |
| 1.2.0 | `a195a8e` | Respondent view adds `areas` (name, the respondent's own answers in the area, where it was sent, current) for the interview's area rail. It is orientation only and does not measure completeness. |
| 1.3.0 | `a1a0aad`, `a7df17a` | Records store their complete ruleset and replay validates it, with an explicit historical reader for 1.0.0 to 1.2.0 records; the export reports the recorded ruleset and reader; storage failures are reported as `store_unavailable`; waiting items carry `provenance` and the Snapshot `waitingBySource`. |
| 1.4.0 | this delivery | Staged sessions on build 1.6 only, with action schema 2: no respondent limit, stage progress, `owner.decline`, depth selection on `organisation.sendToOwners`, function progress, the `staged` send view and the `declined` waiting provenance. 1.3.0 sessions are unchanged. |

Versions 1.0.0 to 1.2.0 sit in the single engine commit of the layered branch; their working history is kept on `review/mk-integrated-readiness-worklog`. Version 1.3.0 was added on the layered branch in response to the independent review.
