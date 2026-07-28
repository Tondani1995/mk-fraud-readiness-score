# 08 — Synthetic journey test matrix

**Status:** Test evidence. Reproduce with
`npm run journeys` (table) or `npm run journeys --json` (machine-readable),
from `prototypes/adaptive-assessment-v1/`.

All six organisations are **fabricated**. No real customer, person or company
appears anywhere. All figures below are generated output, not estimates.

---

## 1. Summary

| ID | Organisation | Asked | Excluded | Redirected | "Don't know" | Est. min (after profile) | Areas | Coverage | Provisional score | Unknown weight share |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | Professional-services firm | 67 | 2 | 0 | 0 | 41 | 11 | 100% | 56.01 | 0% |
| J2 | Retail organisation | 68 | 0 | 0 | 0 | 42 | 11 | 100% | 48.48 | 0% |
| J3 | Construction business | 66 | 2 | 0 | 0 | 41 | 11 | 100% | 19.32 | 0% |
| J4 | Online business | 69 | 0 | 4 | 0 | 43 | 11 | 100% | 55.59 | 0% |
| J5 | Small business | **47** | **21** | 0 | 0 | **29** | 10 | 100% | 20.00 | 0% |
| J6 | Low-certainty respondent | 68 | **0** | 0 | **58** | 42 | 11 | 100% | **6.93** | **65.37%** |

Estimate before any answers: **32 minutes** for every journey — the estimate cannot
differentiate until gateway facts exist, then it moves to between 29 and 43 minutes.

Provisional scores come from deterministic synthetic responders, not from real
organisations. They exist to prove denominator behaviour, not to characterise sectors.

## 2. Journey detail

### J1 — Professional-services firm (Meridian Advisory, synthetic)

*No stock, no cash, limited suppliers, outsourced payroll, office-based.*

- **Asked 67 · excluded 2 · denominator 82.75**
- Excluded: `D3-Q05` (`gateway_no_refunds_or_adjustments`), `D3-Q07`
  (`gateway_no_high_risk_handling`)
- Outsourced payroll (`G07 = outsourced`) **adds** `OV-G07` — the journey is one
  question *longer* than the base 68 minus exclusions. Outsourcing is not a shortcut.
- All 10 domains assessed.

### J2 — Retail organisation (Kopano Retail Group, synthetic)

*Multiple stores, cash, cards, inventory, refunds, temporary employees.*

- **Asked 68 · excluded 0 · denominator 83.75**
- Nothing excluded: every gateway returns an operating activity. This is the control
  case — maximum applicability.
- Used as the invalidation fixture: changing `G03` to "no suppliers" would invalidate
  **9** answered questions.

### J3 — Construction business (Sentinel Civils, synthetic)

*Subcontractors, procurement, project sites, plant, invoice and variation exposure.*

- **Asked 66 · excluded 2 · denominator 81.00**
- Excluded: `D8-Q02`, `D8-Q05` (`gateway_no_digital_footprint` — no online sales, no
  remote/platform dependency)
- Note `D8-Q01`, `D8-Q04`, `D8-Q08` are **retained** because the organisation holds
  personal information (`G09 = yes`). Absence of a sales channel does not remove
  identity risk — the digital domain degrades partially, not wholly.

### J4 — Online business (Nandi Digital, synthetic)

*Online sales via a platform, digital payments, customer data, remote staff.*

- **Asked 69 · excluded 0 · redirected 4 · denominator 85.00** — the *longest* journey
- Redirects (all from `G03`/`G04` = outsourced):
  `D3-Q03 → OV-D3-Q03`, `D7-Q01 → OV-D7-Q01`, `D7-Q02 → OV-D7-Q02`, `D7-Q04 → OV-D7-Q04`
- Plus `OV-G07` for outsourced payroll.
- **This is the key methodology result:** an organisation that outsources supplier
  management and procurement answers *more* questions and carries a *larger*
  denominator (85.00) than the fully in-house retailer (83.75). Outsourcing relocates
  risk; the assessment follows it.

### J5 — Small business (Tumelo Studio, synthetic)

*No procurement department, no payroll, few employees, owner-led approvals.*

- **Asked 47 · excluded 21 · denominator 58.50 · 29 minutes**
- Skip reasons: `gateway_no_third_parties` ×8, `gateway_no_employee_base` ×8,
  `gateway_no_procurement` ×2, `gateway_no_digital_footprint` ×2,
  `gateway_no_refunds_or_adjustments` ×1
- Excluded: D2-Q05, D3-Q03, D3-Q05, D6-Q02/Q05/Q06, D7-Q01…Q07 (all seven),
  D8-Q02/Q03/Q05, D9-Q01/Q02/Q04/Q05/Q06
- Only **10** areas appear, because D7 (Third-Party) is excluded in full — correctly,
  for an organisation with no external suppliers.
- **The journey shrinks by 31% and roughly 13 minutes**, which is the point of the
  workstream. A test asserts it cannot collapse below 30 questions, so core
  governance, detection and incident-response coverage always survives.

### J6 — Low-certainty respondent (Unnamed Holdings, synthetic)

*Answers "I do not know" throughout, including on every gateway.*

- **Asked 68 · excluded 0 · unknown responses 58 · unknown weight share 65.37% ·
  provisional score 6.93**
- **Nothing is excluded.** Every applicability condition includes `unknown` in its
  allow-list, so uncertainty cannot shorten the assessment.
- The attempt to use non-applicability as a shortcut fails by construction: the only
  route to exclusion is a gateway answer asserting an activity does *not exist*, and
  "I do not know" is not that answer.
- The pairing of a 6.93 score with a 65.37% unknown share is what a report needs to
  say *"this reflects limited visibility, not demonstrated absence of controls"*.

## 3. Invalidation behaviour

Fixture: J2, fully answered, then `G03` ("do you use external suppliers?") changed
from `internal` to `none`.

- **9** answered questions invalidated: `G04`, `D2-Q05`, `D3-Q03`, `D6-Q05`,
  `D7-Q01`, `D7-Q03`, `D7-Q04`, `D7-Q05`, and one more
- Each written to audit history with `previous_value` and `cause: G03`
- All removed from the active path; none contribute to the denominator
- Re-selecting `internal` restores the original path shape exactly (asserted)

Verified both at engine level (`node --test`) and through the real UI dialog
(Playwright), including Escape-cancel leaving answers untouched.

## 4. Test coverage

**44 automated tests, all passing.**

### Engine suite — 25 tests, zero dependencies (`npm test`)

Structure (4) · determinism (2) · journey coverage (3) · skip integrity (4) ·
outsourcing (2) · invalidation (3) · dynamic progress (2) · applicability profile (2) ·
safety rails (3).

### Browser suite — 19 tests, Playwright (`npm run test:browser`)

Layout at 320/390/768/1440 (4) · keyboard and focus (2) · save states and resume (2) ·
invalidation dialog (1) · six journeys end-to-end (6) · desktop capture (1) ·
domain-complete transition (1) · no external network calls (1) · reduced motion (1).

### Requirements traceability

| Required coverage | Test |
|---|---|
| All six synthetic journeys | `journey J1…J6 completes end to end` + engine journey tests |
| Deterministic branching | `branching is deterministic across repeated evaluations` |
| No unreachable required questions | `no unreachable required question` |
| No infinite loops | `all six synthetic journeys terminate without loops` (500-iteration guard) |
| Correct skip reasons | `skipping requires an explicit gateway statement of fact` |
| Correct downstream invalidation | `changing a gateway invalidates…`, `invalidated answers leave the active path…` |
| Save/resume state | `answers survive a page refresh and resume at the same question` |
| Dynamic progress | `progress never presents a misleading fixed denominator` |
| Estimated-time recalculation | `estimated time recalculates as branches open and close` |
| Keyboard interaction | `full keyboard operation with visible focus`, `unknown option is reachable by keyboard` |
| Mobile viewport layout | `layout is sound at {320,390,768,1440}px` |
| Frozen / failed-save presentation | `save-in-progress and save-failed states are presented` |
| No customer data or production endpoints | `prototype contains no production endpoints…`, `makes no network calls to production hosts` |
| No runtime AI branching | `no runtime AI branching: the engine performs no network calls`, `graph JSON is the single source of branching truth` |

## 5. Defects found and fixed during testing

1. **Navigation position was not persisted.** After answering and auto-advancing, a
   refresh returned the respondent to the *previously saved* question, not the active
   one — because `goToNext()` mutated `currentId` without persisting. Found by
   `answers survive a page refresh…`. Fixed by persisting on every navigation.
2. **Skip link was unreachable.** Focusing the screen heading on first paint pushed
   focus past the skip link, so the first Tab landed on a button. Found by
   `full keyboard operation with visible focus`. Fixed by suppressing heading focus
   on the first render only.

Both were real accessibility/recovery defects that manual review had not surfaced.

## 6. Limitations of this evidence

- Responders are deterministic synthetic profiles, not real respondents. Scores show
  denominator mechanics; they say nothing about actual sector maturity.
- Six journeys is a design sample, not statistical coverage. A production graph
  should add a combinatorial reachability sweep over gateway permutations.
- No real user has completed the prototype. Usability claims in
  `12-prototype-evaluation-scorecard.md` are expert judgement pending customer testing.
