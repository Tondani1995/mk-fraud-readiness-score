# 02 — Benchmark findings and adopted design principles

**Status:** Design workstream output. Principles here are proposed for approval.

This is not a competitor summary. It records the interaction patterns worth
borrowing from mature assessment products, why each one exists, and what MK
should do about it. No proprietary interface, visual identity or copy from any
named product has been reproduced.

---

## 1. Where the patterns come from

Four product categories solve problems MK shares:

1. **Professional and psychometric assessment platforms** (SHL-type candidate
   journeys and peers) — high-stakes, timed, one-item-at-a-time, must feel fair.
2. **Regulated financial-services onboarding** (bank and insurer KYC/FICA flows) —
   long, legally consequential, must survive interruption and be auditable.
3. **High-quality form and survey products** (Typeform-class conversational forms) —
   pacing, single-focus screens, perceived effort management.
4. **Mobile-first guided interviews** (tax preparation, medical triage) — branching
   on stated facts, explaining why a question appears, handling "I don't know".

## 2. Principles adopted

### P1 — One decision per screen, and make the decision obvious

*Observed:* Assessment platforms present one item at a time, with the response
control immediately below the stem. The screen carries almost nothing else.

*Why:* Item-level focus reduces anchoring on adjacent questions and makes response
time comparable. It also converts a daunting 68-item form into 68 small acts.

*MK adopts:* One question per screen. Only section context, prompt, optional
guidance, controls, progress, navigation. Nothing else competes.

*MK rejects:* Chat-bubble "conversational" framing. It infantilises a CFO and
inflates reading time. The tone is a consultation, not a chatbot.

### P2 — Branch on stated facts, never on inferred ones

*Observed:* Guided tax and triage interviews branch only on explicit user
statements ("Do you have dependants?"), never on guesses from prior behaviour.

*Why:* An inferred branch that is wrong is invisible to the user and impossible to
contest. A stated branch is auditable and correctable.

*MK adopts:* Gateway questions establish facts. Every skip traces to a specific
gateway answer, carries a `skip_reason_code`, and is shown back at review.
No AI at runtime; the rules are versioned JSON.

### P3 — "I don't know" is data, not a failure

*Observed:* Clinical and diagnostic instruments treat "unknown" as a first-class
response with its own handling, distinct from a negative finding.

*Why:* Forcing a guess corrupts the dataset in the direction of whatever the user
thinks is expected. In a fraud assessment, "I do not know whether we review supplier
bank-detail changes" is itself a finding about governance visibility.

*MK adopts:* An explicit "I do not know" on every maturity question, visually
distinct from the 0–5 scale (dashed border, square marker, amber when selected) so
it never reads as "the lowest score". It is retained in the denominator with zero
credit and reported as reduced confidence rather than as a control weakness.

### P4 — Outsourcing relocates risk; it never deletes it

*Observed:* Third-party risk frameworks and regulated onboarding pivot to
oversight, assurance and contractual questions when an activity sits with a
provider.

*Why:* Treating "we outsource payroll" as "payroll fraud is not applicable" is a
methodology failure. Ghost-employee fraud survives outsourcing; only the control
surface moves.

*MK adopts:* An `outsourced` gateway answer **redirects** to a third-party
governance variant that retains the original weight and hard-gate status. It never
excludes. Tests assert an outsourced organisation cannot score better than an
in-house one for equivalent control quality.

### P5 — Progress must be honest, which means it must be dynamic

*Observed:* Adaptive testing platforms show phase or section progress, or time
remaining, rather than "Question 12 of 40" — because in an adaptive instrument the
denominator is not knowable in advance.

*Why:* A fixed counter that silently drops from 68 to 47 destroys trust precisely
when the product is trying to build it.

*MK adopts:* Current area, areas completed of areas applicable, percentage of the
*active* path, and a time estimate that recalculates as branches open and close.
Never "Question X of Y".

### P6 — Explain the branch at the moment it happens

*Observed:* Guided interviews surface a one-line rationale when a new section
opens, and a summary of what was skipped at the end.

*Why:* Adaptive systems feel arbitrary — or manipulative — unless the logic is
visible. For a R5,000 product the respondent must be able to see the reasoning.

*MK adopts:* A "Why we are asking" line generated from the gateway answers that
made the question applicable, plus a review screen that groups every exclusion by
its reason. One sentence, plain language, never repeated on every screen.

### P7 — Auto-advance only where a mis-tap is cheap

*Observed:* Survey products auto-advance single-selects; assessment platforms
require explicit submission on consequential items.

*Why:* Auto-advance halves interaction cost, but on a branching question a mis-tap
silently rewrites the rest of the journey.

*MK adopts:* Auto-advance on low-impact single-selects. Explicit **Continue** on
gateway questions flagged `high_impact`, on anything requiring explanation, and on
anything where a wrong tap changes the pathway. Never on multi-select.

### P8 — Design for interruption, and prove it

*Observed:* Regulated onboarding assumes the session will be abandoned and
resumed, possibly on another device, and makes the saved state explicit.

*Why:* This assessment takes 25–45 minutes. It *will* be interrupted.

*MK adopts:* Visible per-answer save state; an explicit resume screen that shows
what was retained and returns to the exact active question; retained-on-device
answers with a retry path when saving fails. Navigation position is part of saved
state — a defect found and fixed during prototype testing.

### P9 — Changing your mind must be safe and honest

*Observed:* Regulated flows warn before a change cascades, and keep an audit trail
of superseded answers.

*Why:* In an adaptive instrument, changing one gateway can orphan a dozen answers.
Doing that silently is unacceptable; refusing to allow it is worse.

*MK adopts:* Back navigation is always available. Changing a gateway that would
invalidate answers raises a modal naming the count and listing the affected
questions, requiring confirmation. Invalidated answers leave the active path but
are retained in audit history with their previous value and cause.

### P10 — Review before submission is part of the product, not a formality

*Observed:* High-stakes instruments show a completeness summary before final
submission.

*Why:* It is the last chance to correct a wrong gateway, and the moment the
customer decides whether the output will be worth R5,000.

*MK adopts:* A review screen showing areas assessed, areas excluded **and why**,
outsourced activities and how they were assessed instead, unanswered questions,
every "I do not know", and estimated completeness. Scoring calculations are not
revealed, consistent with the existing product.

### P11 — Restraint reads as expertise

*Observed:* Premium professional tools use narrow measure, generous whitespace,
one accent colour, and motion under ~350 ms with no bounce.

*Why:* Gamification signals a low-stakes toy. This assessment precedes a paid
engagement about fraud exposure.

*MK adopts:* Existing `mk.*` tokens, single brass accent, 42–46 rem measure,
`riseIn` at 320 ms with reduced-motion support, no celebration animation, no
streaks or badges.

### P12 — Accessibility is a trust signal in a compliance product

*Observed:* Assessment vendors publish conformance because buyers are procurement
and risk functions.

*Why:* A risk executive evaluating a fraud product notices whether it is operable.

*MK adopts:* WCAG 2.2 AA as an acceptance gate: keyboard operation, visible focus,
48 px targets, no colour-only signalling, live-region announcements, focus
management and trapping in dialogs, reduced-motion support. Verified by automated
tests, not asserted.

## 3. Deliberately not adopted

| Pattern | Why not |
|---|---|
| Chat/conversational UI | Slow to read, informal, poor for 68 items |
| Timers or countdowns | Creates pressure to guess; corrupts data |
| Gamified progress, badges, streaks | Wrong register for fraud risk |
| Likert grids / matrix questions | Fails on mobile; encourages straight-lining |
| Inferred or AI-driven branching | Not auditable, not reproducible, not defensible |
| Generic "Not applicable" everywhere | The exact loophole this workstream closes |
| Showing live score during the assessment | Invites gaming; not in the current product |

## 4. The design tension, stated plainly

Adaptivity and score integrity pull against each other. Every question removed
makes the journey better and the score weaker. The resolution adopted here:

> **Skipping is a privilege earned by stating a fact, not a shortcut offered to
> the respondent.**

A question is only skippable when a gateway answer asserts the underlying activity
does not exist. Uncertainty never skips. Outsourcing never skips — it redirects.
The exclusion, its reason, and its effect on coverage are all shown back to the
respondent and carried into the report. This is enforced by tests, not convention.
