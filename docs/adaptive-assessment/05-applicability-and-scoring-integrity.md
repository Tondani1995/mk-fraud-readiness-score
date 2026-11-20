# 05 — Applicability, scoring integrity and comparability

**Status:** Proposed for approval. **Contains the highest-risk decisions in the workstream.**
**Supersedes:** the earlier version of this document, which contained a materially
inaccurate claim. See §1.

---

## 1. Correction of a previous claim

An earlier version of this prototype stated, in code comments, tests, documentation
and the PR description:

> ~~"Skipping never improves the score."~~

**That claim was wrong**, and the test that supported it did not test what it said.
That test scored every control 0 in both the full-scope and reduced-scope runs. With
a uniform 0 the percentage is 0 either way, so the test was structurally incapable of
detecting the effect it claimed to rule out.

Where excluded controls leave the denominator — which is how the existing production
engine already behaves (`denominatorContribution: 0`) — removing a weakly-controlled
area **changes and often raises** the remaining percentage.

### The corrected product contract

> **Exclusion creates no control credit and no control penalty, but it changes the
> assessed scope. The resulting Fraud Readiness Score is valid only for the
> organisation's declared applicability profile and should not be compared directly
> with an organisation whose fraud exposures or applicable control areas differ
> materially.**

This wording is now used verbatim in the engine, the assessment model, the review
screen, the README, the handover, the PR description and every document in this set.

### Measured proof

Journeys J7 and J7-FULL are the same synthetic organisation with the same answers.
The only difference is whether it declares that it uses external suppliers. Its
third-party domain is deliberately its weakest.

| | Applicable controls | Applicable weight | Excluded weight | Fraud Readiness Score |
|---|---|---|---|---|
| **J7-FULL** — declares suppliers | 66 | 81.50 | 2.25 | **76.93** |
| **J7** — declares no suppliers | 56 | 69.25 | 14.50 | **83.39** |

**Excluding the weak domain raised the score by 6.46 points.** A 56-control result is
not comparable with a 66-control result, and the product must never present them as
though they were.

## 2. Two independent axes

Applicability and maturity are different things and must be stored separately.
Collapsing them into a single "Not Applicable" flag is what creates the loophole.

```
   APPLICABILITY (is this control relevant?)      MATURITY (how well is it controlled?)
   ┌──────────────────────────────────┐           ┌──────────────────────────────┐
   │ activity_exists_internal          │           │ 0 not implemented            │
   │ activity_outsourced   → redirect  │     ×     │ 1–2 partially implemented    │
   │ activity_shared_service→ redirect │           │ 3–5 implemented              │
   │ activity_absent       → exclude   │           │ unknown (no credit)          │
   │ unknown               → keep      │           │ unanswered (no conclusion)   │
   └──────────────────────────────────┘           └──────────────────────────────┘
```

## 3. The five response states

Specified in full in `08` and implemented in `src/assessment-model.js`.

### 3.1 Genuinely not applicable

The activity does not exist in the organisation (no cash, no stock, no suppliers,
no online sales).

- Detailed controls for the absent activity are **not asked**
- **Excluded from applicable scope**; no credit, no penalty
- **No control-design recommendation is ever generated**
- Shown in the assessment-scope schedule with its reason and reason code
- The gateway answer that caused it is preserved
- Material or high-impact exclusions raise an integrity signal

Customer wording: *"This area was not assessed because the organisation indicated
that the underlying activity does not form part of its operating model."*

`control_absence_confirmed` is **false** — an absent *activity* is not an absent
*control*. Asserted by test.

### 3.2 Outsourced or shared service

- Risk is **never** treated as absent
- Redirects to a third-party oversight control at **identical weight and hard-gate
  status**
- Assesses retained accountability, service oversight, reconciliation, access,
  exception management and evidence
- Provider-governance recommendations only where the oversight answer is weak

J4 demonstrates the effect: an organisation that outsources supplier management and
procurement answers **69** controls with an applicable weight of **85.00**, against
the fully in-house retailer's **68** controls and **83.75**. Outsourcing makes the
assessment longer, not shorter.

### 3.3 I do not know

The control is applicable, but the respondent cannot confirm whether or how it operates.

- Control stays applicable — **uncertainty can never exclude anything**
- Not classified as implemented; not classified as absent
- No maturity credit; no automatic control-design failure
- **Reduces Control Visibility**
- Generates an **evidence-verification** recommendation, never an implementation one

Example output: *"The respondent could not confirm how supplier bank-detail changes
are independently verified. MK could therefore not establish whether an effective
control is operating. Management should identify the process owner and obtain
evidence of the current verification procedure."*

### 3.4 Unanswered

- **Reduces Assessment Coverage**
- No maturity conclusion, no substantive recommendation
- Weakness is never inferred
- Below the coverage threshold the report cannot be issued definitively

**A blank response never becomes a finding.** Asserted by test.

### 3.5 Control absent or partly implemented

Substantively confirmed by the respondent (a 0, 1 or 2 on the approved scale).

- Scored through the approved maturity methodology
- 0 → control-design recommendation; 1–2 → strengthening recommendation
- `control_absence_confirmed` is **true** only for a substantive 0

## 4. Three separate measures

A single percentage cannot carry this much meaning. The product reports three.

### 4.1 Fraud Readiness Score

Maturity of applicable controls for which a substantive control response was given.

```
numerator   = Σ (value/5 × weight)   over controls answered with a maturity value
Option A:  denominator = answered-maturity weight + unknown weight   ← recommended
Option B:  denominator = answered-maturity weight only
```

| | Advantages | Risks |
|---|---|---|
| **A — unknown retained, zero credit** | Uncertainty cannot inflate the score; simple to explain; conservative | Can make uncertainty look like confirmed failure unless reporting separates them. **Under Option A an unknown control sits in the denominator with zero credit — it is not evidence of a control failure, and the report must not describe it as one.** The `INSUFFICIENT_VISIBILITY` gate in §5.1 is what stops the arithmetic being read that way |
| **B — unknown excluded** | Does not invent a control failure; reflects only what was assessed | Repeated "I do not know" inflates the score badly without a strong gate |

**Recommendation: adopt Option A, with Control Visibility and the report-status gate
as a second line of defence.** *(METHODOLOGY DECISION REQUIRED — NOT APPROVED.)*

The evidence is J8. A respondent answering "5" on roughly a fifth of controls and
"I do not know" on the rest produces:

| | Option A | Option B |
|---|---|---|
| J8 Fraud Readiness Score | **19.70** | **100.00** |

Under Option B that organisation scores a perfect 100 while having confirmed
one control in five. The visibility gate does catch it (visibility 19.7% →
`INSUFFICIENT_VISIBILITY`), but a scoring model that depends entirely on a gate to
avoid reporting 100/100 for near-total blindness is the more fragile choice.

Both models are computed by the prototype so the decision can be taken on evidence.

### 4.2 Assessment coverage

Percentage of applicable **weighted** controls that received *any* valid response.
Distinguishes: answered with a maturity response, answered "I do not know", unanswered.

An "I do not know" **counts** towards coverage — the respondent did answer.

### 4.3 Control visibility

Percentage of applicable **weighted** controls where the respondent could confirm how
the control operates. Unknown responses reduce it.

Deliberately **not** called "confidence" — that implies statistical confidence.
Customer label: **Control Visibility**, e.g. *"Control Visibility: 82% — Provisional"*.

J6 shows why the two are distinct: coverage **100%**, visibility **34.63%**.

## 5. Report status

| Status | Meaning | Presentation |
|---|---|---|
| `NORMAL` | Sufficient coverage and visibility, no material unresolved concern | Score and maturity conclusion shown normally, with the declared applicability profile |
| `PROVISIONAL` | Score may be shown, but material uncertainty, incompleteness, exclusions or limited applicability restrict the conclusion | Limitation stated prominently |
| `INSUFFICIENT_VISIBILITY` | Too much of the applicable control environment could not be confirmed | **No definitive overall maturity band.** Explain which material areas could not be confirmed; provide an evidence-verification plan; invite completion |

Observed across the journeys: J1, J2, J4 and J7-FULL `NORMAL`; J3, J5 and J7
`PROVISIONAL`; J6 and J8 `INSUFFICIENT_VISIBILITY`.

### 5.1 Score issuance — INSUFFICIENT_VISIBILITY issues no score

**A status of `INSUFFICIENT_VISIBILITY` withholds the customer-facing score entirely.**
Reporting "19.70 / 100" next to "we could not confirm four controls in five" invites the
reader to treat the figure as a readiness measurement. It is not one.

| Status | Numeric score | Maturity band | Coverage | Visibility | Verification actions |
|---|---|---|---|---|---|
| `NORMAL` | shown | shown | shown | shown | as applicable |
| `PROVISIONAL` | **shown**, with the limitation stated prominently | shown, qualified | shown | shown | as applicable |
| `INSUFFICIENT_VISIBILITY` | **"Not issued"** | **none** | **shown** | **shown** | **shown** |

Withheld wording:

> *"MK could not issue a defensible overall Fraud Readiness Score because too much of the
> applicable control environment could not be confirmed."*

The model separates the two concerns explicitly:

- `scoreIssued` (boolean) and `customerFacingScore` (number or **null**) — the only
  values a customer-facing surface may render.
- `fraudReadinessScore`, `scoreOptionA`, `scoreOptionB` — retained and always computed,
  but **diagnostic only**, for methodology inspection. They must never be presented as
  the customer's score.

Withholding the score does not withhold the assessment. Coverage, visibility, the scope
schedule, the integrity signals and every evidence-verification action remain in full.

### 5.2 High-impact and whole-domain exclusion escalate to PROVISIONAL

**METHODOLOGY DECISION REQUIRED — NOT APPROVED FOR PRODUCTION**

The status is raised to at least `PROVISIONAL` where either holds:

1. a domain is **fully excluded**; or
2. one or more **critical or hard-gate** controls are excluded.

J7 is the case this exists for. It has perfect coverage and perfect visibility, so under
the previous rules it reported `NORMAL` — while an entire fraud-risk domain had been
excluded, seven findings had disappeared, and the percentage had risen from 76.93 to
83.39. "Normal" was the wrong word for that result.

Limitation reason:

> *"This result is provisional because the declared operating profile excluded an entire
> fraud-risk domain or one or more high-impact controls. The excluded scope is listed
> below and may require confirmation."*

The rule discriminates rather than blanket-escalating: J1 and J7-FULL each exclude two
controls that are neither critical nor hard-gate and remain `NORMAL`. J3 escalates
because one of its two exclusions is high-impact.

**Exclusion never reaches `INSUFFICIENT_VISIBILITY`.** That status is about what could
not be *confirmed*, not about what does not *apply*. A test asserts this across every
journey.

### Proposed thresholds
**METHODOLOGY DECISION REQUIRED — NOT APPROVED FOR PRODUCTION**

| Threshold | Proposed |
|---|---|
| Coverage — insufficient | < 80% |
| Coverage — provisional | < 90% |
| Control visibility — insufficient | < 60% |
| Control visibility — provisional | < 85% |
| Material exclusion share | ≥ 25% of total control weight |
| Material domain exclusion | ≥ 50% of a domain's weight |
| High unknown weight share | ≥ 15% |
| Repeated gateway toggling | ≥ 3 changes to one gateway |

## 6. Comparability

Adaptive scores are **not** directly comparable between organisations with different
applicability profiles.

Every result must therefore carry: applicable / excluded / redirected / invalidated
counts and weights, coverage, visibility, unknown weight share, material exclusion
share, and the full per-control profile with `finding_class`,
`recommendation_class` and `excluded_from_denominator_rule`.

The comparability statement is shown on the review screen, the submission screen and
must appear in the report:

> *"Your score reflects the controls applicable to the operating profile you declared.
> It should not be compared directly with an organisation whose fraud exposures and
> applicable control areas differ materially."*

**Open recommendation:** where a domain loses ≥50% of its weight to exclusions, report
it as *"limited applicability"* with its coverage stated, rather than as a bare score.
Requires methodology approval.

## 7. Interaction with existing rules

| Existing rule | Interaction |
|---|---|
| Hard-gate critical ≤1 → cap at Developing | Preserved. Oversight variants keep hard-gate status, so outsourcing can still trip the cap |
| Three or more criticals ≤2 → cap | Preserved |
| Coverage <80% → do not issue | Now measured over the *applicable* weighted set, not a fixed 68 |
| Coverage 80–89% → provisional | Preserved |
| Domain coverage <70% → flag | Preserved, over the applicable set |
| `n_a_rate_20` → admin review | **Should be re-cut.** Gateway-driven exclusion is systematic, not discretionary. The meaningful new signals are `unknownWeightShare` and `materialExclusionShare` |

## 8. Anti-gaming: what is and is not achieved

| Property | Status | Evidence |
|---|---|---|
| Uncertainty cannot shorten the assessment | **Achieved** | Every condition allow-list includes `unknown`; J6 and J8 answer all 68 |
| Uncertainty earns no credit | **Achieved** | Option A; J8 scores 19.70 |
| Uncertainty cannot buy a definitive conclusion | **Achieved** | J8 → `INSUFFICIENT_VISIBILITY` |
| Silence never becomes a finding | **Achieved** | Unanswered → `COMPLETION_REQUIRED` only |
| Outsourcing cannot reduce exposure | **Achieved** | Redirect at equal weight; J4 has the largest denominator |
| No recommendation for an absent activity | **Achieved** | Test 1; J7 generates none for the excluded domain |
| Exclusions are visible and attributable | **Achieved** | Scope schedule, reason codes, integrity signals |
| **Exclusion cannot change the score** | **NOT ACHIEVED, and not achievable** | J7 vs J7-FULL: 76.93 → 83.39 |
| **A false factual declaration cannot be prevented** | **NOT ACHIEVED, and not achievable in self-assessment** | Documented limit |

The last two are honest limits, not defects. The mitigation is transparency and
comparability control, not a claim of immunity: the exclusion, its cause, its weight
and its effect on scope are all recorded and reported, and the result is explicitly
marked profile-specific.

## 9. Decisions required before production

**METHODOLOGY DECISION REQUIRED — NOT APPROVED FOR PRODUCTION**

| # | Decision | Owner | Risk if unresolved |
|---|---|---|---|
| 1 | Adopt Option A for the Fraud Readiness Score | Methodology | Option B reports 100/100 for near-total blindness |
| 2 | Confirm unknown = applicable, zero credit, visibility-reducing | Methodology | Uncertainty becomes a scoring loophole |
| 3 | Confirm unanswered never generates a finding | Methodology | Silence misread as weakness |
| 4 | Confirm outsourcing redirects at equal weight and hard-gate status | Methodology | Outsourced organisations under-assessed |
| 5 | Approve all report-status thresholds (§5) | Methodology | No defensible issuance gate |
| 6 | Approve the comparability statement and where it appears | Methodology + Commercial | Non-comparable scores presented as comparable |
| 7 | Decide "limited applicability" domain reporting (§6) | Methodology + Report | Domain scores over tiny denominators |
| 8 | Re-cut or retire `n_a_rate_20` | Methodology | Admin flooded with systematic exclusions |
| 9 | Confirm the excluded set is disclosed to the customer | Commercial | Customer cannot verify what they paid for |
| 10 | Approve the recommendation-class contract (`08`) | Methodology | Report invents or omits findings |
| 11 | Set the material-exclusion admin-review trigger | Methodology + Ops | Systematic under-scoping goes unreviewed |

None of these are decided by this workstream. The prototype demonstrates mechanism;
the methodology owner decides policy.
