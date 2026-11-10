# Readiness review data contract

Contract name `mk-readiness-review`, version **1.2.0**, action schema `mk-readiness-review/actions/1`. Defined in `src/lib/readiness-review/contract.ts`; enforced by `scripts/readiness-review-contract-tests.mjs` (C-01 to C-18).

The contract covers the adapter between the vendored review engine and everything that reads it: the stored session record, the actions that change it, the role-scoped views the pages and API return, and the export. It does not cover the legacy scored assessment, whose records, scores and reports are untouched.

## Pinned ruleset

| Part | Version | File | SHA-256 |
|---|---|---|---|
| Review engine | build 1.5, additive to the rechecked build 1.4 (`6d374561cd709f873c7649b5ac637b68aa07d88c79940032f3dfda36b8f8e740`) | `vendor/review-engine-build-1.5.cjs` | `7f8ca08f2626108919ef97d664d6b752fe91ae686fdd44639d1e79be5d9395ba` |
| Question bank | 1.3-review | `data/bank-v1.3.json` | `95abc50e743f428e5829c042abc1823c517075b77204ffdf0e538aa5fe5f4419` |
| Coverage map | 1.3 | `data/coverage-map-v1.3.json` | `9081b069f1f15dfea35afe001da69d8636345492810b36b56b30624a302c77a7` |

Respondent screen limit: **95**, including the profile questions. Owner answers and corrections do not count against it. The engine's `followups` option is 2, its reviewed default: at most two second-stage follow-up questions are queued from each source.

Change control: any change to the engine, bank or coverage map changes a hash, and C-01 fails until `contract.ts` is updated deliberately. Any change to the shape of an action, a view or the export increments `version` and is recorded below.

## Session record

One JSON document per session (`SessionRecord` in `session.ts`):

| Field | Meaning |
|---|---|
| `sessionId` | Random identifier. |
| `createdAt` | ISO time. |
| `contractVersion`, `engineSha256`, `bankVersion` | The ruleset the session was recorded under. |
| `organisationLabel` | The organisation name as typed. |
| `fictional` | Always `true` in this candidate; the harness refuses anything else. |
| `tokens` | Role links: `respondent`, `management`, `reviewer`, `links`, and `owners` keyed by accountable function. |
| `actions` | Append-only list of stored actions. |

The state of a session is never stored. It is recomputed by replaying `actions` through the engine. A record whose `engineSha256` differs from the current engine is refused (`ReplayError`, HTTP 410) rather than reinterpreted under different rules.

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

### Snapshot counts

| Key | Value | Denominator shown |
|---|---|---|
| `reported-gaps` | controls reported not in place, partly in place, or set out but not yet working | controls with a reported answer |
| `waiting` | questions answered "I don't know", or opened by an owner's answer, now with the accountable function | none |
| `open-scenarios` | tier 1 and tier 2 failure scenarios that apply or may apply where the deciding fact or control is not yet established | material scenarios that apply or may apply |
| `evidence` | controls reported in place or partly in place on an essential confirmation, or where a record could be shown, not yet reviewed by MK | essential confirmations with a reported answer |

No view or export contains a score, maturity band, rating, confidence label or inferred control state (C-06, J-05).

## Export

`GET /review/api/s/{token}/export` returns:

```
{ contract: { name, version, actionSchema }, engine, bank, coverage, approval,
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

In the layered branch these changes sit in the single engine commit; the working history is kept on `review/mk-integrated-readiness-worklog`.
