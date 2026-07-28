# 03 — Experience blueprint

**Status:** Proposed for approval.

---

## 1. The journey in five phases

```
  ┌──────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────┐   ┌───────────┐
  │ Welcome  │──▶│ Organisation │──▶│  Domain      │──▶│ Review │──▶│ Submitted │
  │          │   │ profile      │   │  assessment  │   │        │   │           │
  │ expect-  │   │ (gateways    │   │  (adaptive,  │   │ what   │   │ what      │
  │ ation    │   │  G01–G14)    │   │  D1→D10)     │   │ we did │   │ happens   │
  │ setting  │   │              │   │              │   │ & why  │   │ next      │
  └──────────┘   └──────────────┘   └──────────────┘   └────────┘   └───────────┘
                        │                   ▲                │
                        │  determines       │                │
                        └───────────────────┘                │
                                   ▲                         │
                                   └──── revisit any answer ──┘
```

**Phase 1 — Welcome.** Sets expectation: one question at a time, only what applies,
answer honestly, "I do not know" is acceptable, you can pause. Four facts, no wall
of text.

**Phase 2 — Organisation profile.** 14 gateway questions establishing operational
facts. This is where the journey is shaped. Feels like the opening of a consultation:
"tell me how you operate" before "tell me what you control".

**Phase 3 — Domain assessment.** The 68 approved methodology questions, filtered to
those that apply, in domain order D1→D10, one per screen, with a transition when
each area completes.

**Phase 4 — Review.** Areas assessed, areas excluded and why, outsourced activities
and how they were assessed instead, unknowns, completeness.

**Phase 5 — Submission.** Confirmation, applicability profile summary, what happens next.

## 2. Why gateways come first

Alternatives considered:

| Option | Verdict |
|---|---|
| Gateways interleaved into each domain | Rejected — the time estimate could not stabilise; respondent re-orients constantly |
| Gateways at the end | Rejected — cannot skip what has already been asked |
| **Gateways up front as a distinct phase** | **Adopted** |

Gathering facts first mirrors how an adviser actually opens an engagement, gives an
honest time estimate before the long stretch begins, and makes the branch visible
("because you told us X…") rather than retroactive.

Cost: 14 questions before the assessment "starts". Mitigated by keeping them short,
concrete, mostly auto-advancing, and framed as profiling rather than testing.

## 3. Screen anatomy

```
┌─────────────────────────────────────────┐
│ MK  [Prototype]   Area · 3 of 10 areas  │  ← sticky, ~52px, quiet
│                   ▓▓▓▓▓▓░░░░  ~18 min   │
├─────────────────────────────────────────┤
│                                         │
│  • Operational Fraud Controls           │  ← eyebrow: where am I
│                                         │
│  Supplier onboarding processes          │  ← the one decision
│  include background checks,             │
│  verification or due diligence.         │
│                                         │
│  Tests supplier legitimacy controls.    │  ← optional guidance
│                                         │
│  ┃ WHY WE ARE ASKING                    │  ← only when branched
│  ┃ Because you indicated you use        │
│  ┃ external suppliers…                  │
│                                         │
│  ○ Not in place                         │
│  ○ Initial / ad hoc                     │  ← 48px targets
│  ○ Partially designed                   │
│  ○ Implemented                          │
│  ○ Consistently operating               │
│  ○ Embedded and improved                │
│  ⊡ I do not know          (distinct)    │
│                                         │
│  Typical evidence: onboarding checklist │
│                                         │
│  [Back]                    [Continue]   │
├─────────────────────────────────────────┤
│ ● All answers saved · 14:32             │
└─────────────────────────────────────────┘
```

Fixed order, every screen: **where am I → what is being asked → why → how do I
answer → what does it mean → how do I move.** Predictability is what lets a
respondent settle into 60+ questions.

## 4. Pacing rules

| Question type | Behaviour | Rationale |
|---|---|---|
| Low-impact gateway (`auto_advance: true`, not `high_impact`) | Auto-advance on select | Cheap to correct |
| High-impact gateway (`high_impact: true`) | Explicit **Continue**, disabled until answered | A mis-tap rewrites the journey |
| Maturity question | Auto-advance on select | Non-branching; back is always available |
| Any question after a save failure | Blocked; **Retry save** replaces Continue | Never advance past unsaved data |

`high_impact` gateways: **G03** (suppliers), **G04** (procurement), **G07**
(payroll), **G08** (digital sales), **G14** (approvals). These five carry the
largest downstream consequences.

Transition motion is `riseIn`: 8 px rise, 320 ms, `cubic-bezier(.22,.61,.36,1)`,
opacity only. No horizontal slide (implies undo-able direction), no bounce, no
completion celebration. Suppressed entirely under `prefers-reduced-motion`.

## 5. Progress model

Displayed: **current area**, **areas completed of areas applicable**, **percent of
the active path**, **estimated minutes remaining**.

Never displayed: "Question X of Y".

Estimation uses per-domain `estMinutesPerQuestion` (0.5–0.7 min, higher for
judgement-heavy domains D3/D4/D7/D8) summed over *unanswered active* nodes. It
recalculates on every answer, so closing a branch visibly reduces it. Floor of 1
minute while any question remains — never show "0 min left".

Measured: a full retail profile estimates ~42 minutes; the small-business profile
~29 minutes.

## 6. Domain-complete transition

Shown when the last question of an area is answered and the next question belongs
to a different domain. Names the completed area, restates areas complete and time
remaining, offers **Continue** and **Save and finish later**.

It exists to give the journey a rhythm of closure — 10 short stretches rather than
one 68-question climb — and to place a natural, dignified exit point roughly every
4–6 minutes.

## 7. Uncertainty

"I do not know" appears on every maturity question and most gateways. Deliberately
**not** part of the 0–5 scale: dashed border, square marker, sits below a small gap,
turns amber (not brass) when selected.

Copy: *"Recorded as uncertainty. This is not treated as a control being absent, and
it is not treated as a control being present."*

At review, unknowns are grouped under "Worth confirming before you submit", each
with a **Revisit** link. The framing is an invitation to improve the input, never
an accusation.

## 8. Outsourcing

When a gateway returns `outsourced`, the base question is replaced by an oversight
variant carrying the same weight and hard-gate status. The respondent sees a
"Third-party oversight" chip and a rationale line:

> *Because you told us this activity is handled by an external provider, we are
> asking how you oversee that provider rather than assuming the risk has gone away.*

At review these appear under "Activities you outsource" with the base question they
replaced.

## 9. Exclusion

Only a gateway answer asserting an activity **does not exist** excludes questions.
Never uncertainty. Never outsourcing.

Exclusions are grouped at review by reason code, with a count and this framing:

> *Excluded questions are removed from your result entirely. They do not count for
> you or against you. If any of these are wrong, go back and correct the answer that
> caused them.*

## 10. Back navigation and invalidation

Back is available from the second screen onward and walks the visited history.

Changing a gateway that would orphan answered questions raises an `alertdialog`:

> **Changing this will remove 9 answers**
> Because you are changing "Does your organisation buy goods or services from
> external suppliers or contractors?", the following answers no longer apply and
> will be removed. They are kept in the audit history but will not affect your result.
> *(list, capped at 5 with "…and N more")*
> **[Keep my original answer] [Change my answer]**

Escape and backdrop click both cancel. Focus is trapped and restored. Confirming
writes `{event, question_id, previous_value, cause, at}` to audit history and
removes the answers from the active path. Re-selecting the original value restores
the path shape (asserted by test).

## 11. Save and resume

Per-answer save with visible state: *Your progress saves automatically* → *Saving
your answer…* → *All answers saved · HH:MM* → *Not saved. Your answer is safe on
this device — retry below.*

Failure blocks advancement and swaps Continue for **Retry save**. Navigation
position is persisted alongside answers, so a refresh resumes at the exact active
question. Resume is an explicit screen, not a silent restoration — it shows what was
retained before continuing.

## 12. Tone

Second person, present tense, plain South African English. Short sentences.

- **Do:** "Answer as things genuinely are today, not as they should be."
- **Do:** "Outsourcing moves the activity, not the risk."
- **Don't:** "Oops! Looks like you skipped something 😅"
- **Don't:** "Your organisation has failed to implement adequate controls."

The voice is a senior adviser: direct, unhurried, unimpressed by jargon, never
scolding. Findings are stated as facts about the organisation, not judgements about
the respondent.
