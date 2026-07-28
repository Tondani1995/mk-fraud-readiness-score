# 09 — Edge cases and recovery

**Status:** Proposed for approval. Behaviours marked **prototype** are demonstrated;
those marked **production** need implementation decisions.

---

## 1. Save and connectivity

| Case | Behaviour | Status |
|---|---|---|
| Save succeeds | `saving` → `saved · HH:MM`; advance proceeds | prototype |
| Save fails | State `error`; copy "Not saved. Your answer is safe on this device — retry below."; Continue replaced by **Retry save**; **advance is blocked** | prototype |
| Retry succeeds | Returns to `saved`, then advances to the question that was pending | prototype |
| Offline | Same as save failure. Current production code distinguishes `offline` via `navigator.onLine` — retain that | production |
| Refresh mid-save | Answer is in local state; resume screen shows retained progress | prototype |
| Two tabs open | **Not handled.** Last write wins | production |
| Session token expires | **Not handled** — no auth in prototype | production |
| Storage quota exceeded / private mode | `persist()` returns false → `error` state; answers remain in memory for the session | prototype |

**Advance is never permitted past an unsaved answer.** This is the single most
important recovery rule: a respondent must never believe an answer is recorded when
it is not.

## 2. Resume

| Case | Behaviour | Status |
|---|---|---|
| Return with saved answers | Explicit resume screen: answered count, areas complete, %, minutes remaining, and the area they were in | prototype |
| Resume position | Returns to the **exact active question** via persisted `currentId` and `visited` | prototype |
| Resume after refresh | Verified by test | prototype |
| Resume on a different device | **Not handled.** Requires server-side state — production already has this via the answers API | production |
| Resume after the graph version changed | **Not handled.** See §6 | production |
| Submitted assessment reopened | Stays on the submitted screen; does not re-enter the journey | prototype |

## 3. Branching edge cases

| Case | Behaviour |
|---|---|
| Gateway unanswered | Dependent questions evaluate **false** and are not shown yet. Nothing becomes applicable by accident |
| Gateway answered "I do not know" | Every condition allow-list includes `unknown` → all dependents **remain applicable** |
| Gateway changed, nothing answered downstream | No warning; path reshapes silently (nothing to lose) |
| Gateway changed, answers exist downstream | `alertdialog` with exact count and list; requires confirmation |
| Gateway changed back to the original value | Path shape restored exactly (asserted by test). Answers are **not** auto-restored from audit history — see §7 open decision |
| Gateway change opens *new* questions | Dialog also reports `newlyApplicableCount`; new questions join the path and the estimate rises |
| Every gateway says "no activity" | Journey floors at ~47 questions (J5). A test asserts it can never drop below 30 |
| Conditional gateway (G04) whose parent excludes it | `G04` is itself conditional on `G03 ≠ none`; when excluded it is skipped and any `G04`-dependent question falls back to its own condition |
| Redirect target missing | Engine throws at construction. A test asserts every redirect target resolves |
| Unknown condition node shape | Engine throws rather than silently passing |

## 4. Answer edge cases

| Case | Behaviour |
|---|---|
| Continue pressed with no answer | Button is `disabled`; if activated anyway, `role="alert"` error and focus moves to the first option |
| Answer changed to the same value | No-op; no invalidation check runs |
| Rapid double-tap on two options | Last selection wins; save is fired per change. **Production should debounce** — see §7 |
| Back to an answered question | Previous answer is pre-selected and editable |
| Back past the first question | Back is hidden on the first screen |
| All questions answered | Auto-transition to review |
| Submit with unanswered questions | Submit is `disabled`; review shows an error callout with the count |
| Every question answered "I do not know" | Permitted. Coverage 100%, unknown share ~65%+, provisional score near zero, flagged for reduced confidence |

## 5. Progress and estimate edge cases

| Case | Behaviour |
|---|---|
| Before any gateway answers | Estimate is the full-path figure (32 min); it cannot differentiate yet |
| Branch closes | Estimate drops immediately (J5: 32 → 29) |
| Branch opens | Estimate rises (J4: 32 → 43) |
| Last question answered | Estimate floors at 1 minute, never 0, while anything remains; review shows "Almost there" |
| Areas total changes mid-journey | Recomputed from the active path on every render; D7 disappearing takes the total from 11 to 10 |

Because progress is always derived from the *current* active path, it can move
backwards when a branch opens. This is honest and preferable to a counter that only
ever advances while the denominator secretly changes.

## 5a. Measures, statuses and recommendations

| Case | Behaviour |
|---|---|
| Every applicable control answered "I do not know" | Coverage 100%, visibility ~0%, `INSUFFICIENT_VISIBILITY`, 68 evidence-verification recommendations, **no absence findings** |
| Strong answers on a minority, unknown on the rest | J8: Option A 19.70, Option B 100.00, status `INSUFFICIENT_VISIBILITY`. The gate is what stops Option B reporting a perfect score |
| A whole domain excluded | Domain reported `fullyExcluded`; `limited_domain_applicability` and `material_domain_exclusion` raised; no recommendations for it |
| Exclusion raises the percentage | Expected and unavoidable (J7: 76.93 → 83.39). Mitigated by the comparability statement and the scope schedule, not prevented |
| Nothing applicable in a domain | Domain omitted from "areas assessed" and listed in the exclusion schedule |
| No recommendations at all | Possible for a strong organisation; the recommendation preview section is simply absent |
| Coverage 100% but visibility low | Distinct measures; status driven by visibility |
| Unanswered controls at review | Submit disabled; error callout with the count; no findings generated |

## 6. Versioning and migration

| Case | Recommended production behaviour | Status |
|---|---|---|
| Graph changes mid-assessment | Pin the assessment to `graph_version` at start; in-flight assessments finish on the pinned version | **decision needed** |
| Methodology version changes | Already handled — `methodology_version` is on every answer |
| Question removed from the graph | Retain answered rows in history; exclude from the active path with a `graph_version_changed` reason | **decision needed** |
| Question added | Do not inject into in-flight assessments; applies to new ones only | **decision needed** |
| Skip reason code renamed | Codes are contractual — treat as append-only | **decision needed** |

## 7. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | Restore invalidated answers when a gateway is changed back? | **Yes, with confirmation.** Audit history retains `previous_value`, so restoration is possible. Prototype does not implement it |
| 2 | Debounce or lock during rapid selection? | **Yes.** Production already has `interactionLockRef` in `AssessmentEngine`; carry it forward |
| 3 | Concurrent sessions in two tabs? | Server-side last-write-wins with a version check; warn on conflict |
| 4 | Abandonment threshold for cleanup? | Product decision; interacts with data-retention policy |
| 5 | Cap on gateway changes? | **No hard cap**, but log the count — repeated toggling of the same gateway is a review signal |
| 6 | Show invalidated answers back to the respondent at review? | Recommend **no** in the customer view, **yes** in the admin view |

## 7a. Progressive-profiling edge cases

| Case | Behaviour |
|---|---|
| Respondent reaches a domain whose gateway block is empty | No intro shown; straight into the domain |
| A domain gateway is itself excluded (G04 when G03 = none) | Not asked; its dependents fall back to their own conditions and are excluded with their own reason codes |
| Gateway changed after its domain was passed | Normal invalidation flow; the block is not re-shown |
| All of a block's gateways already answered (journey loader) | Block intro suppressed; the walk continues |

## 8. Not handled by the prototype

Explicitly out of scope, listed so nothing is assumed:

- Authentication, tokens, session expiry
- Multi-user or multi-device concurrency
- Server-side persistence, retries, idempotency keys
- Real score calculation, report generation, payment
- Email, notifications, fulfilment
- Admin surfaces, audit-log UI, methodology administration
- Internationalisation, RTL, locales beyond `en-ZA`
- Analytics and telemetry
