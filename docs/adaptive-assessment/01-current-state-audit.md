# 01 — Current-state audit

**Status:** Design workstream input. Observational only — no production behaviour was changed.
**Audited commit:** `fdf4d55` (origin/main)
**Audited by:** Adaptive Assessment Experience workstream

This document records what the MK assessment does today, honestly, including the
things that work well. It is the baseline the prototype is measured against.

---

## 1. Where the assessment lives

| Concern | Location |
|---|---|
| Assessment screen | `src/app/score/assessment/[assessmentRef]/page.tsx` |
| Interaction engine | `src/components/assessment/AssessmentEngine.tsx` (≈26 KB, single component) |
| Entry form | `src/components/assessment/StartAssessmentForm.tsx` |
| Result / snapshot | `src/app/score/assessment/[assessmentRef]/result/page.tsx`, `FreeSnapshot.tsx` |
| Answer persistence | `POST /score/api/assessments/[assessmentRef]/answers` |
| Start / resume | `POST /score/api/assessments/start`, `/resume` |
| Submission | `POST /score/api/assessments/[assessmentRef]/submit` |
| Applicability rules | `src/lib/respondent/na-rules.ts` |
| Scoring | `src/lib/scoring/scoring-engine.ts`, `score-assessment.ts` |
| Resume capability flag | `src/lib/assessment-experience/resume-capability.ts` |
| Methodology content | Supabase — seeded by `supabase/migrations/0003_phase5_methodology_seed.sql` |
| Types | `src/lib/types/domain.ts` |

The question bank is **not** in the repository as content. It lives in Supabase
(`methodology_versions`, `domains`, `questions`, `response_scale`,
`question_applicability_rules`, `exposure_factors`) and is seeded by migration
`0003`. This matters for the handover: branching rules must be versioned alongside
that content, not in component code.

## 2. The approved methodology (MFRS-V1.0)

Reproduced verbatim from the seed. **The prototype does not alter any of it.**

- **10 domains**, weights totalling 100%:
  D1 Governance 12 · D2 Risk Identification 12 · D3 Operational Controls 14 ·
  D4 Detection 14 · D5 Incident Response 10 · D6 Whistleblowing 6 ·
  D7 Third-Party 10 · D8 Digital & Identity 12 · D9 Culture 5 · D10 Continuous Improvement 5
- **68 questions**, each with `weight`, `is_critical`, `is_hard_gate`,
  `n_a_allowed`, `n_a_rule_key`, `trigger_key`, `sort_order`
- **19 critical controls**, **17 hard-gate controls**, **11 conditional-N/A questions**
- **6-point response scale** (0 Not in place → 5 Embedded and improved), normalised 0–100
- **8 exposure factors** (EXP-01…08) as banded selects, 100 points total
- **10 recommendation rules**, including maturity caps and coverage thresholds

## 3. How the experience works today

### 3.1 Presentation model

**Domain-at-a-time, vertically scrolling.** `AssessmentEngine` renders one domain
step at a time (`activeStep`), with every question in that domain stacked on a
single scrolling page. Exposure factors are collected first as their own step.

After each answer, `scrollToItem()` scrolls the next question into view and focuses
its first control — a soft auto-advance within a long page rather than a screen change.

This is competent and it works. It is not one-question-at-a-time, and on a phone
a domain of 8 questions is a long scroll.

### 3.2 Answer types

Two only:

1. **Maturity scale 0–5** (radio), for all 68 questions.
2. **Banded select** for the 8 exposure factors.

Plus a **Not Applicable** checkbox on the 11 eligible questions, which requires a
free-text reason of at least 5 characters before the answer counts as complete
(`isAnswered()`).

**There is no "I do not know" option anywhere.** A respondent who does not know how
a control operates has three bad choices: guess, answer 0 ("Not in place"), or
abandon. Today's data cannot distinguish uncertainty from absence.

### 3.3 Applicability

`evaluateNAEligibility()` in `na-rules.ts` gates N/A against the exposure profile:

- `profile_rule_d2_q05 / d7_q05 / d7_q07` → allowed only if third-party exposure is `none`
- `profile_rule_d2_q08 / d8_q01 / d8_q08` → digital **and** identity exposure both `none`
- `profile_rule_d8_q02 / d8_q05` → digital channel exposure `none`
- `profile_rule_d3_q05 / d3_q07` → high-risk process exposure `none`

This is a genuine, thoughtful guard and it is the seed of adaptivity. Three limits:

1. **Questions are still shown.** N/A suppresses scoring, not presentation. The
   respondent still reads and dismisses every irrelevant question.
2. **Only four of eight exposure factors are wired.** `factorRule()` maps by
   `sortOrder - 1` into a four-element array, so EXP-05…08 (cash/stock, dispersion,
   manual volume, public funds) drive no applicability at all.
3. **Binary model.** A question is applicable or not. There is no representation of
   *outsourced*, *shared service*, or *unknown*.

### 3.4 Progress

`calculate()` produces a fixed denominator: `68 questions + 8 exposure factors = 76`.
Progress is `answered / 76`. There is no time estimate and no notion of areas
completed. Because the denominator never changes, the counter is honest today — but
it becomes actively misleading the moment questions can be skipped.

### 3.5 Save and resume

Genuinely solid, and the strongest part of the current build:

- Every answer POSTs immediately; `saveState` is `idle | saving | saved | error | offline`.
- On failure the payload is written to `sessionStorage` under
  `mk-assessment-pending:<ref>` and a retry closure is held in `retryRef`.
- `interactionLockRef` prevents double-submission during a save.
- Navigation position (`activeDomainKey`, `activeQuestionId`, `completionPercentage`)
  is persisted server-side, so resume returns to the right place.
- On load, pending local answers are merged back and the state is marked `offline`.

The prototype keeps this model and should not regress it.

### 3.6 Mobile behaviour

Responsive via Tailwind, and it does not break. But it is a scaled-down desktop
form: long domain pages, `scrollIntoView` jumps that can disorient on a small
viewport, and a submit action that lives at the bottom of a long column.

### 3.7 Scoring dependencies

From `scoring-engine.ts`:

- Weighted numerator/denominator **per domain**, then weighted by `domainWeightPct`.
- **N/A sets `denominatorContribution: 0`** and raises
  `valid_not_applicable_excluded_from_score`.
- Coverage thresholds: `<80%` invalid, `80–89%` provisional, domain `<70%` flagged.
- Maturity caps on hard-gate criticals ≤1 and ≤2, and on three or more criticals ≤2.
- `n_a_rate_20` flags an N/A rate above 20% for admin review.

**The most important finding in this audit:** because N/A removes weight from the
denominator rather than scoring zero, *every* exclusion is score-neutral-to-positive.
An organisation that excludes its weakest areas raises its average. Today the only
brakes are the exposure-profile gate and a post-hoc admin flag.

This is a property of the existing engine, and it **cannot be engineered away** while
excluded controls leave the denominator. Adaptive skipping multiplies the exposure. The
response adopted in `05` is therefore transparency and comparability control rather than
a claim of immunity: the exclusion, its cause, its weight and its effect on scope are
recorded and reported, and the result is explicitly marked profile-specific.

### 3.8 How answers reach the report

`submit` → score run → snapshot → `report_requested` → admin generation
(`/score/api/admin/orders/[orderReference]/generate-report`) → PDF. The report
consumes scored answers and `report_implication` keys. Applicability state is not
currently carried through as a first-class reporting dimension.

## 4. Branding and design tokens

From `tailwind.config.ts`:

| Token | Value |
|---|---|
| `mk.ink` / `mk.charcoal` | `#001030` |
| `mk.brass` / `mk.brassDark` | `#1d3658` |
| `mk.slate` | `#405050` |
| `mk.cream` | `#F8FAFC` |
| `mk.paper` | `#FFFFFF` |
| `mk.line` | `#E2E8F0` |
| `mk.muted` | `#475569` |
| `mk.danger` | `#9B2C2C` |
| `mk.success` | `#2F6B4F` |
| Font | `var(--font-poppins)` |
| Shadow | `soft: 0 18px 45px rgba(0,16,48,0.10)` |

Note that `mk.ink` and `mk.charcoal` are the same value, as are `mk.brass` and
`mk.brassDark` — the palette has collapsed and offers no darker brass for hover or
pressed states. The prototype derives one locally (`#16294a`) and flags it as a
token gap.

Shared UI primitives exist in `src/components/ui/` (`Button`, `Card`, `Badge`).

## 5. Summary judgement

**Working well:** methodology rigour; save/resume and offline handling; the
exposure-driven N/A guard; consistent tokens; no accessibility disasters.

**Holding the product back:**

1. All 68 questions are presented to every organisation regardless of relevance.
2. No way to express *uncertainty* — the single biggest data-quality gap.
3. No way to express *outsourced* — outsourcing reads as either full applicability
   or, via the exposure profile, as absence of risk.
4. Domain-at-a-time scrolling reads as a long form, not a consultation.
5. Fixed progress denominator will mislead as soon as branching exists.
6. Exclusion is score-positive by construction.
7. Half the exposure factors drive no applicability logic.
8. No audit trail for answers invalidated by a changed upstream answer, because
   upstream answers cannot currently invalidate anything.

Items 1–6 are what the prototype sets out to answer.
