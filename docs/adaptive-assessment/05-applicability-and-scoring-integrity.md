# 05 — Applicability and scoring integrity

**Status:** Proposed for approval. **This document contains the highest-risk
decisions in the workstream.**

The prototype does not change the production scoring engine. It demonstrates the
state model that engine will need, and proves — by test — that adaptivity can be
added without making the score easier to game.

---

## 1. The core problem

From `01-current-state-audit.md` §3.7: today, marking a question Not Applicable sets
`denominatorContribution: 0`. The question leaves the denominator entirely.

That means **exclusion is never negative and is usually positive**. Removing a
question an organisation would have scored 0 or 1 on raises its weighted average.

Today this is contained: only 11 questions are N/A-eligible, each gated on the
exposure profile, each requiring a written reason, with an admin flag above a 20%
N/A rate. Adaptive skipping removes the friction that was holding this in check —
so the integrity rules must be made explicit before branching ships.

## 2. Two independent axes

The central design move: **applicability and maturity are different things and must
be stored separately.**

```
                    APPLICABILITY (is this question relevant?)
                    ┌──────────────────────────────────────────────┐
                    │ activity_exists_internal                     │
                    │ activity_outsourced      → redirect          │
                    │ activity_shared_service  → redirect          │
                    │ activity_absent          → exclude           │
                    │ unknown                  → keep, never exclude│
                    └──────────────────────────────────────────────┘
                                        ×
                    MATURITY (how well is it controlled?)
                    ┌──────────────────────────────────────────────┐
                    │ 0 not_implemented … 5 implemented            │
                    │ unknown  (uncertainty, zero credit)          │
                    └──────────────────────────────────────────────┘
```

A question has an applicability state *and*, if applicable and answered, a maturity
state. Collapsing them into one field is what makes "Not Applicable" a loophole.

## 3. Scoring statuses

| Status | In denominator? | Credit | Set by |
|---|---|---|---|
| `not_applicable` | **No** | — | Gateway asserts the activity does not exist |
| `outsourced` | **Yes** (as the variant) | scored normally | Gateway says outsourced → redirect |
| `unknown` | **Yes** | **zero** | Respondent selects "I do not know" |
| `not_implemented` | Yes | 0% | Maturity 0 |
| `partially_implemented` | Yes | 20–40% | Maturity 1–2 |
| `implemented` | Yes | 60–100% | Maturity 3–5 |
| `invalidated_by_upstream` | **No** | — | Gateway change orphaned the answer |
| `profile_only` | No | — | Gateway questions never score |
| `scored_as_third_party_governance` | **Yes** | scored normally | Oversight variant |

### 3.1 Why `unknown` stays in the denominator with zero credit

Three options were considered:

| Option | Consequence | Verdict |
|---|---|---|
| Exclude from denominator | "I do not know" becomes the fastest way to raise a score | **Rejected** |
| Score as 0 (`not_implemented`) | Conflates "we have no control" with "I cannot see our control" | **Rejected** |
| **Retain, zero credit, flag separately** | No credit for uncertainty; distinguishable in data and report | **Adopted** |

The brief requires that unknown "must not be treated as strong controls". Zero
credit satisfies that. Retaining it in the denominator additionally ensures
uncertainty cannot be used to shorten or inflate.

The cost — an unknown-heavy respondent scores similarly to a genuinely weak one — is
handled in **reporting, not scoring**: `unknownWeightShare` is carried alongside the
score so a report can say *"this score reflects limited visibility rather than
demonstrated weakness"*. Journey J6 produces a 6.93 provisional score with a 65.37%
unknown share; those two numbers together tell a story neither tells alone.

### 3.2 Why outsourcing redirects

Outsourcing changes *where* a control lives, not whether fraud can occur.
Ghost-employee fraud survives payroll outsourcing; vendor-impersonation loss is
still the customer's loss when a provider executes the payment.

So `outsourced` **replaces** the in-house question with an oversight question of
identical weight and hard-gate status. The denominator is unchanged. A test asserts
an outsourced organisation cannot outscore an in-house one at equal control quality.

`OV-G07` (outsourced payroll oversight) is *additive* — outsourcing payroll makes the
assessment one question **longer**. Outsourcing is never a shortcut.

## 4. Denominator rules

```
denominator = Σ weight  over questions that are
                (a) on the active path, and
                (b) answered (including "I do not know")

numerator   = Σ (credit/100 × weight)   credit = 0 for unknown
```

Excluded from the denominator, always:

| Rule | Applies to |
|---|---|
| `gateway_declared_absent` | Excluded by a gateway asserting absence |
| `invalidated_by_upstream` | Orphaned by a gateway change |
| `unanswered_incomplete` | Not yet answered — a coverage gap, not a score |
| `profile_only` | Gateway questions |

`unanswered_incomplete` deliberately does **not** score zero: an incomplete
assessment is an incompleteness problem, surfaced through coverage, exactly as the
existing engine does at its 80%/90% thresholds.

## 5. Anti-gaming guarantees

| Guarantee | Mechanism | Test |
|---|---|---|
| Skipping cannot improve the score | Exclusion requires a gateway assertion of absence, and is counted and reported | `skipping does not improve the score relative to answering honestly` |
| Uncertainty cannot shorten the journey | Every condition allow-list includes `unknown` | `"I do not know" never excludes a question` |
| Uncertainty earns no credit | `credit = 0`, retained in denominator | `uncertainty is not treated as a control` |
| Outsourcing cannot reduce exposure | Redirect preserves weight and hard-gate status | `outsourced organisations are not scored more leniently` |
| Exclusions are visible | Grouped by reason at review and in the profile | `skipping requires an explicit gateway statement of fact` |
| Nothing vanishes silently | Accounting identity over all 68 questions | `every journey produces a complete, inspectable profile` |

The first test is the load-bearing one. It builds two identical organisations
answering 0 to everything, one truthfully declaring suppliers and one claiming none,
and asserts the evasive path does **not** score better.

## 6. Comparability

Adaptive scores are **not** directly comparable between organisations with different
applicability profiles, and the product must not pretend otherwise.

Each result must therefore carry:

- `applicableCount`, `excludedCount`, `redirectedCount`, `invalidatedCount`
- `coveragePct` (answered ÷ applicable)
- `unknownWeightShare`
- the full per-question profile with `scoring_status` and `excluded_from_denominator_rule`

**Recommendation for production (open decision):** where a domain loses more than
half its weight to exclusions, report the domain as *"limited applicability"* with
its coverage stated, rather than presenting a bare score. Requires methodology
approval — see §9.

## 7. Interaction with existing rules

| Existing rule | Interaction |
|---|---|
| Hard-gate critical ≤1 → cap at Developing | Preserved. Oversight variants retain hard-gate status, so an outsourced organisation can still trip the cap |
| Three or more criticals ≤2 → cap at Developing | Preserved |
| Coverage <80% → do not issue | Denominator is now the *applicable* set, not a fixed 68 |
| Coverage 80–89% → provisional | Unchanged |
| `n_a_rate_20` → admin review | **Should be re-cut.** Gateway-driven exclusion is systematic, not discretionary; the meaningful new signal is `unknownWeightShare` |
| Domain coverage <70% → flag | Unchanged, over the applicable set |

## 8. Audit history

Invalidated answers are retained, never deleted:

```jsonc
{ "event": "invalidated", "question_id": "D7-Q04",
  "previous_value": 3, "cause": "G03", "at": "2026-07-28T13:24:11.204Z" }
```

This supports three things production needs: reconstructing why a question left the
path; detecting a respondent toggling a gateway to shed unfavourable answers; and
restoring answers if the gateway is changed back.

The prototype keeps history in local state. Production needs a durable table — see
`10-production-handover-for-codex.md`.

## 9. Decisions required before production

| # | Decision | Owner | Risk if unresolved |
|---|---|---|---|
| 1 | Confirm unknown = retained, zero credit, flagged | Methodology | Uncertainty becomes a scoring loophole |
| 2 | Confirm outsourcing redirects at equal weight | Methodology | Outsourced organisations under-assessed |
| 3 | Approve the 14 gateway questions as production content | Methodology + Commercial | Prototype cannot ship |
| 4 | Approve the 6 oversight variants | Methodology | Outsourcing pathway incomplete |
| 5 | Define `unknownWeightShare` thresholds for provisional/invalid | Methodology | No guard against unknown-heavy submissions |
| 6 | Decide "limited applicability" domain reporting (§6) | Methodology + Report | Non-comparable scores presented as comparable |
| 7 | Re-cut or retire `n_a_rate_20` | Methodology | Admin flooded with systematic exclusions |
| 8 | Confirm the excluded set is reported to the customer | Commercial | Customer cannot verify what they paid for |

**None of these are decided by this workstream.** The prototype demonstrates
mechanism; the methodology owner decides policy.
