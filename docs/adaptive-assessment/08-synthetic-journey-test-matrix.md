# 08 — Synthetic journey test matrix

**Status:** Test evidence. Reproduce with `npm run journeys` (table) or
`npm run journeys:json`, from `prototypes/adaptive-assessment-v1/`.

All organisations are **fabricated**. No real customer, person or company appears
anywhere. Every figure below is generated output.

---

## 1. Summary — eight journeys plus one comparison fixture

| ID | Journey | Active | Excluded | Redirected | Unknown | Coverage | Visibility | Score | Report status | Est. min |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | Professional-services firm | 67 | 2 | 0 | 0 | 100% | 100% | 56.01 | NORMAL | 41 |
| J2 | Retail organisation | 68 | 0 | 0 | 0 | 100% | 100% | 48.48 | NORMAL | 42 |
| J3 | Construction business | 66 | 2 | 0 | 0 | 100% | 100% | 19.32 | **PROVISIONAL** | 41 |
| J4 | Online business | **69** | 0 | **4** | 0 | 100% | 100% | 55.59 | NORMAL | 43 |
| J5 | Small business | **47** | **21** | 0 | 0 | 100% | 100% | 20.00 | **PROVISIONAL** | **29** |
| J6 | Low-certainty respondent | 68 | 0 | 0 | **45** | 100% | **34.63%** | **Not issued** | **INSUFFICIENT_VISIBILITY** | 42 |
| J7 | Strong controls, weak domain excluded | 56 | **12** | 0 | 0 | 100% | 100% | **83.39** | **PROVISIONAL** | 34 |
| J8 | High unknown, high apparent maturity | 68 | 0 | 0 | **55** | 100% | **19.70%** | **Not issued** | **INSUFFICIENT_VISIBILITY** | 42 |
| J7-FULL | *Comparison fixture — J7 declaring suppliers* | 66 | 2 | 0 | 0 | 100% | 100% | **76.93** | NORMAL | 41 |

## 2. Progressive profiling

Every journey asks exactly **five** broad profile questions before the first control
question: **G01** (organisation type), **G02** (size), **G03** (third parties),
**G08** (digital payments), **G09** (personal information).

Domain gateways are then asked immediately before the domain they serve:

| Block | Gateways | Introduction |
|---|---|---|
| Before **D2** | G13 | "Before we assess how your organisation identifies fraud risk, we need to understand how much of your operation depends on remote working and third-party digital platforms." |
| Before **D3** | G05, G06, G10, G11, G12, G14 | "Before we assess your operational fraud controls, we need to understand where money, stock and people actually move through your business." |
| Before **D7** | G04, G07 | "Before we assess supplier and procurement controls, we need to understand how your organisation purchases goods and services, and how payroll is run." |

Two tests guarantee the restructure is safe:

- `every gateway is asked before the first question that depends on it` — walks the
  realised path and asserts gateway position < dependent position for every condition.
- `progressive ordering yields the SAME applicability profile as gateways-first` —
  builds each journey under both orderings and asserts identical exclusion sets,
  redirect sets and applicable weight.

Note the second test's legacy fixture only answers gateways that are themselves
applicable. Force-answering an excluded gateway (for example G04 when the
organisation has no suppliers) fabricates an applicability state the respondent never
declared — an error caught while building this test.

## 3. The exclusion evidence — J7 against J7-FULL

Same synthetic organisation, same responder, same answers. The only difference is
whether it declares that it uses external suppliers. Its third-party domain is
deliberately its weakest area.

| | Active | Applicable weight | Excluded weight | Exclusion share | **Fraud Readiness Score** |
|---|---|---|---|---|---|
| J7-FULL — declares suppliers | 66 | 81.50 | 2.25 | 2.69% | **76.93** (NORMAL) |
| J7 — declares no suppliers | 56 | 69.25 | 14.50 | 17.31% | **83.39** (**PROVISIONAL**) |

**Excluding the weak domain raised the score by 6.46 points** — and now also costs the
result its `NORMAL` status, because an entire fraud-risk domain was excluded. The higher
number arrives carrying an explicit limitation the honest full-scope result does not.

What the prototype does about it:

- No excluded control receives credit or penalty — all carry
  `finding_class: NOT_APPLICABLE`, `control_absence_confirmed: false`
- The applicable denominator visibly shrinks (81.50 → 69.25)
- All 12 exclusions appear in the scope schedule with reason codes
- D7 is reported as `fullyExcluded`, not silently dropped
- Integrity signals raised: `high_impact_gateway_exclusion`,
  `limited_domain_applicability`, `material_domain_exclusion`,
  `profile_specific_comparability_warning`
- **Report status escalated to `PROVISIONAL`** by the whole-domain/high-impact rule
  (`05` §5.2), with the exclusion limitation stated on the review screen
- **Recommendation classes for J7: none.** The weak third-party controls generate no
  findings because the activity was declared absent. J7-FULL generates
  `CONTROL_STRENGTHENING=4, CONTROL_DESIGN=3` for exactly those controls.

That last line is the honest picture: exclusion does not just move a number, it
removes seven findings the organisation would otherwise have received.

## 4. The uncertainty evidence — J8

A respondent answering "5" on roughly one control in five and "I do not know" on the
rest.

| Measure | Value |
|---|---|
| Active controls | 68 (nothing excluded — uncertainty cannot shorten) |
| Unknown controls | 55 |
| Unknown weight share | 80.30% |
| Assessment coverage | 100% |
| Control visibility | **19.70%** |
| Fraud Readiness Score shown to the customer | **Not issued** |
| Diagnostic Option A (inspection only) | 19.70 |
| Diagnostic Option B (inspection only) | 100.00 |
| Report status | **INSUFFICIENT_VISIBILITY** |
| Recommendation classes | `EVIDENCE_VERIFICATION=55` |

**No numeric score and no maturity band are shown.** The review screen displays
"Not issued" with the reason, and Coverage and Control Visibility carry the result
instead. The Option A and Option B figures remain computed for methodology inspection
but are never presented as the customer's score — asserted by tests in the engine
suite and, on the rendered page, in the browser suite.

**Under Option B this organisation scores a perfect 100** while having confirmed one
control in five. This is the single strongest argument for Option A, and the reason
the recommendation in `05` §4.1 is what it is.

All 55 unknowns produce evidence-verification recommendations. **None produces an
implementation recommendation, and none records `control_absence_confirmed`.**

## 5. Per-journey detail

**J1 — Professional services.** 2 exclusions (`gateway_no_refunds_or_adjustments`,
`gateway_no_high_risk_handling`). Outsourced payroll *adds* `OV-G07`, so the journey
is longer than 68 − 2. Recommendations: `CONTROL_STRENGTHENING=22`,
`PROVIDER_GOVERNANCE=1`.

**J2 — Retail.** Control case: nothing excluded, maximum applicability, weight 83.75.
Also the invalidation fixture — changing G03 to "no suppliers" invalidates 9 answered
controls. Recommendations: `CONTROL_DESIGN=11`, `CONTROL_STRENGTHENING=24`.

**J3 — Construction.** 2 exclusions (`gateway_no_digital_footprint`). D8-Q01, D8-Q04
and D8-Q08 are **retained** because the organisation holds personal data — the digital
domain degrades partially, not wholly. Signals: `high_impact_gateway_exclusion`, which
now also escalates the status to **PROVISIONAL**: one of the two excluded controls is
critical or hard-gate.

**J4 — Online.** The longest journey: 69 controls, weight 85.00, four redirects
(`D3-Q03→OV-D3-Q03`, `D7-Q01→OV-D7-Q01`, `D7-Q02→OV-D7-Q02`, `D7-Q04→OV-D7-Q04`) plus
`OV-G07`. **Outsourcing produced a larger denominator than the fully in-house
retailer.** Recommendations include `PROVIDER_GOVERNANCE=2`.

**J5 — Small business.** 47 controls, 21 excluded, weight 58.50, 29 minutes — 31%
shorter. Exclusion share 30.15% pushes it to **PROVISIONAL**. D7 excluded entirely, so
only 10 areas appear. A test forbids collapsing below 30 controls.

**J6 — Low certainty.** All gateways unknown. **Nothing excluded** — coverage 100%,
visibility 34.63%. **No score is issued** (diagnostic Option A 6.93).
`EVIDENCE_VERIFICATION=45`.

**J7 / J8** — see §3 and §4.

## 6. Integrity signals raised

| Journey | Signals |
|---|---|
| J1 | *(none)* — 2 exclusions, neither critical nor hard-gate, so no escalation |
| J2 | *(none)* |
| J3 | `high_impact_gateway_exclusion`, `profile_specific_comparability_warning` |
| J4 | `profile_specific_comparability_warning` |
| J5 | `material_exclusion_share`, `high_impact_gateway_exclusion`, `limited_domain_applicability`, `material_domain_exclusion`, `profile_specific_comparability_warning` |
| J6 | `high_unknown_weight_share`, `low_control_visibility`, `insufficient_visibility` |
| J7 | `high_impact_gateway_exclusion`, `limited_domain_applicability`, `material_domain_exclusion`, `profile_specific_comparability_warning` |
| J8 | `high_unknown_weight_share`, `low_control_visibility`, `insufficient_visibility` |

## 7. Test coverage — 139 automated tests

### Engine suite — 52 tests, zero dependencies (`npm test`)

Structure and provenance (5) · determinism (2) · journey coverage (3) · skip
integrity (3) · mixed-score exclusion regression (5) · outsourcing (2) ·
invalidation (3) · dynamic progress (2) · applicability profile (2) ·
recommendation contract (10) · measures and score models (2) · **score issuance gate (5)** ·
**high-impact / whole-domain escalation (3)** · progressive profiling (3) · safety rails (3).

### Browser suite — 29 tests × 3 engines = 87 (`npm run test:browser`)

Layout at 320/390/768/1440 (4) · keyboard, focus order and skip link (2) · save
states and resume (2) · invalidation dialog with focus trap (1) · eight journeys
end-to-end (6) · desktop capture (1) · domain-complete transition (1) · axe WCAG
checks (2) · 400% zoom reflow (1) · progressive profiling in the UI (2) · report
preview and measures (2) · **insufficient-visibility withholds the score (2)** ·
**preview wording is not self-contradictory (1)** · no
recommendation leakage for excluded controls (1) · no external network calls (1) ·
reduced motion (1).

### Requirements traceability

| Required coverage | Test |
|---|---|
| All eight synthetic journeys | engine journey tests + `journey J1…J8 completes end to end` |
| Deterministic branching | `branching is deterministic across repeated evaluations` |
| No unreachable required questions | `no unreachable required question` |
| No infinite loops | 500-iteration guard, never reached |
| Correct skip reasons | `skipping requires an explicit gateway statement of fact` |
| Downstream invalidation | `changing a gateway invalidates…`, `invalidated answers leave the active path…` |
| Save/resume state | `answers survive a page refresh and resume at the same question` |
| Dynamic progress | `progress never presents a misleading fixed denominator` |
| Estimated-time recalculation | `estimated time recalculates as branches open and close` |
| Keyboard interaction | `full keyboard operation with visible focus`, `unknown option is reachable by keyboard` |
| Mobile viewport layout | `layout is sound at {320,390,768,1440}px` |
| Frozen / failed-save presentation | `save-in-progress and save-failed states are presented` |
| No customer data or production endpoints | `prototype contains no production endpoints…`, `makes no network calls to production hosts` |
| No runtime AI branching | `no runtime AI branching…`, `graph JSON is the single source of branching truth` |
| Mixed-score exclusion regression | §3 tests (5) |
| Recommendation contract | tests 1–10 |
| No score issued under insufficient visibility | `J8:…`, `J6:…`, `J6 also withholds the score…` |
| Diagnostics survive for methodology inspection | `the diagnostic score values survive for methodology inspection` |
| NORMAL and PROVISIONAL still issue a score | `NORMAL results still issue a score`, `PROVISIONAL results still issue a score…` |
| Whole-domain/high-impact exclusion escalates | `J7: excluding a whole fraud-risk domain…` |
| Minor exclusions do not escalate | `ordinary minor exclusions do not escalate at all…` |
| Progressive profiling equivalence | `progressive ordering yields the SAME applicability profile` |
| Accessibility | axe (2), zoom reflow (1), reduced motion (1), keyboard (2) |

## 8. Defects found by these tests

1. **Navigation position was not persisted** — a refresh returned the respondent to
   the previously-saved question, not the active one. *(Previous round.)*
2. **Skip link unreachable** — first-paint heading focus jumped past it. *(Previous round.)*
3. **The anti-gaming test proved nothing** — scored every control 0, so it could not
   detect the effect it claimed to rule out. Replaced by §3. *(This round.)*
4. **Horizontal overflow at 320px and 390px** — the journey `<select>` sized itself to
   its longest option (377px in a 320px viewport), breaking the no-horizontal-scroll
   guarantee. Caught by the layout tests when J7/J8 were added. *(This round.)*
5. **Axe reported false contrast failures** — analysis ran mid-fade while `riseIn` was
   still animating. Fixed by waiting for animations to finish. *(This round.)*
6. **A score was displayed where none was defensible.** J6 and J8 rendered a numeric
   Fraud Readiness Score beside a statement that most of the control environment could
   not be confirmed. Now withheld as "Not issued". *(This round.)*
7. **J7 reported `NORMAL` with a whole domain excluded.** Perfect coverage and
   visibility masked the fact that an entire fraud-risk domain had left scope and seven
   findings had disappeared. Now `PROVISIONAL`. *(This round.)*
8. **J8 was not exercising its own responder** — the browser helper filled answers with
   a generic pattern, erasing the uncertainty behaviour the journey exists to test.
   *(This round.)*

## 9. Limits of this evidence

- Responders are deterministic synthetic profiles. Scores demonstrate denominator and
  visibility mechanics; they say nothing about real sector maturity.
- Eight journeys is a design sample, not statistical coverage. Production should add a
  combinatorial sweep over gateway permutations.
- No real user has completed the prototype. Usability claims in `12` are expert
  judgement pending owner review and customer testing.
- Browser evidence is Playwright-driven Chromium, Firefox and WebKit. **Physical
  devices and human screen-reader testing remain pre-production gates.**
