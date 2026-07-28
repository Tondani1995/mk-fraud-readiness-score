# 04 — Question graph and branching specification

**Status:** Proposed for approval. Implementation-ready.
**Source of truth:** `prototypes/adaptive-assessment-v1/data/question-graph.json`
**Graph version:** `PROTO-AAX-V1.0` · **Methodology version:** `MFRS-V1.0`

---

## 1. Design rules

1. **Data, not code.** All branching lives in the graph JSON. `engine.js` contains
   no question identifiers — asserted by a test.
2. **Deterministic.** Same answers ⇒ same path, always. No randomness, no time
   dependence, no network, no AI. Asserted by a test.
3. **Conditions depend only on gateways.** A methodology question may never gate on
   another methodology question. This keeps the graph a shallow two-layer DAG:
   cycles are structurally impossible.
4. **Exclusion needs an assertion of absence.** `unknown` never excludes.
5. **Outsourcing redirects, never excludes.**
6. **Everything is accounted for.** Each of the 68 approved questions is, for every
   answer state, exactly one of: asked, replaced by a variant, or excluded with a
   reason. Asserted by a test.

## 2. Node schema

```jsonc
{
  "question_id": "D7-Q04",
  "methodology_version": "MFRS-V1.0",     // or PROTOTYPE_PLACEHOLDER
  "domain": "D7",
  "section": "Third-Party and Supply Chain Fraud Risk",
  "question_type": "maturity_scale",       // | single_select
  "gateway_status": "standard",            // | gateway | oversight_variant
  "prompt": "…",
  "display_guidance": "…",
  "evidence_prompt": "…",
  "scoring_weight": 1.5,
  "is_critical": true,
  "is_hard_gate": true,
  "applicability_condition": { … } | null, // null = always applicable
  "redirect_when": { "condition": { … }, "redirect_to": "OV-D7-Q04" },
  "skip_reason_code": "gateway_no_third_parties",
  "report_implication": "supplier_payment_verification_gap"
}
```

Fields required by the brief that are computed rather than stored:
`gateway_status` (stored), `scoring_status` (derived from the answer),
`excluded_from_denominator_rule` (derived), `uncertainty_treatment` (global
constant), `next_question_rules` (implicit — see §5).

## 3. Condition grammar

Four node types. Deliberately minimal so rules stay inspectable and serialisable.

```jsonc
{ "question_id": "G03", "in": ["internal", "unknown"] }   // leaf
{ "all": [ …nodes ] }                                     // AND
{ "any": [ …nodes ] }                                     // OR
{ "not": node }                                           // NOT
null                                                       // always true
```

An unanswered gateway evaluates **false** — a question never becomes applicable by
accident. Unknown node shapes throw rather than silently passing.

## 4. Gateway questions (G01–G14)

> **All gateways are `PROTOTYPE_PLACEHOLDER`.** They are not approved production
> content. See `11-content-decisions-required.md`.

| ID | Question | Applicability states | Auto-advance |
|---|---|---|---|
| G01 | What does your organisation do? | sector only | yes |
| G02 | How many people work here? | micro/small/medium/large/unknown | yes |
| **G03** | Do you use external suppliers or contractors? | internal / outsourced / shared_service / **absent** / unknown | **no** |
| **G04** | How is procurement handled? | internal_department / owner_led / outsourced / shared_service / unknown | **no** |
| G05 | Do you handle physical cash? | significant / minor / **absent** / unknown | yes |
| G06 | Do you hold stock or equipment? | yes / **absent** / unknown | yes |
| **G07** | How is payroll handled? | internal / outsourced / shared_service / **absent** / unknown | **no** |
| **G08** | Do you sell online or take digital payments? | yes / platform / **absent** / unknown | **no** |
| G09 | Do you hold personal information? | yes / **absent** / unknown | yes |
| G10 | Do you process refunds or adjustments? | yes / **absent** / unknown | yes |
| G11 | More than one site? | yes / **absent** / unknown | yes |
| G12 | Temporary or subcontracted workers? | yes / **absent** / unknown | yes |
| G13 | Remote work or third-party platforms? | yes / **absent** / unknown | yes |
| **G14** | Who approves payments? | formal_delegation / owner_led / shared_service / unknown | **no** |

Bold = `high_impact`, requiring explicit Continue.

G04 is itself conditional (`not G03 in [none]`) — a gateway gating a gateway, which
the grammar supports.

## 5. Path resolution

`resolvePath(answers)` is a pure function returning `{active, excluded, redirected}`:

1. **Gateways** in declared order, each gated by its own condition.
2. **Methodology questions** sorted by `domain.sortOrder` then `question_id`.
   For each: if `redirect_when` matches → emit the variant (record the redirect);
   else if `applicability_condition` passes → emit the question;
   else → exclude with its `skip_reason_code`.
3. **Standalone variants** (`replaces: null`, e.g. `OV-G07`) whose condition passes.

Ordering is total and stable, so "next question" needs no separate rule set —
`nextUnanswered()` is simply the first active node without an answer, with a wrap
to catch anything left behind after a back-edit.

## 6. Conditional questions

23 of 68 carry an `applicability_condition`; 45 are unconditional (governance,
detection, incident response, culture and improvement apply to every organisation).

| Gateway | Governs | Effect when "absent" |
|---|---|---|
| G03 suppliers | D2-Q05, D3-Q03, D6-Q05, D7-Q01/03/04/05/07 | 8 excluded |
| G04 procurement | D7-Q02, D7-Q06 | 2 excluded |
| G08/G09/G13 digital & identity | D2-Q08, D8-Q01/02/05/07/08 | up to 6 excluded |
| G10 refunds | D3-Q05 | 1 excluded |
| G05/G06/G10/G12 high-risk handling | D3-Q07 | 1 excluded |
| G02 employees (`micro`) | D6-Q02/Q06, D8-Q03, D9-Q01/02/04/05/06 | 8 excluded |

Note every condition includes `unknown` in its allow-list. **Uncertainty always
keeps the question.**

## 7. Outsourcing redirects

| Gateway | Base question | Oversight variant | Weight | Hard gate |
|---|---|---|---|---|
| G03 = outsourced | D3-Q03 | OV-D3-Q03 | 1.5 | yes |
| G03 = outsourced | D7-Q01 | OV-D7-Q01 | 1.5 | no |
| G04 = outsourced | D7-Q02 | OV-D7-Q02 | 1.25 | no |
| G03 = outsourced | D7-Q04 | OV-D7-Q04 | 1.5 | yes |
| G08 = platform & G13 = no | D8-Q02 | OV-D8-Q02 | 1.5 | yes |
| G07 = outsourced/shared | — (adds) | OV-G07 | 1.25 | no |

Weight and hard-gate status are preserved exactly. `OV-G07` is *additive*: outsourced
payroll **adds** an oversight question rather than replacing one, because there is no
base payroll question in MFRS-V1.0 — outsourcing payroll increases the question count.

## 8. Skip reason codes

| Code | Meaning |
|---|---|
| `gateway_no_third_parties` | No external suppliers or contractors |
| `gateway_no_procurement` | No procurement or buying activity |
| `gateway_no_refunds_or_adjustments` | No refunds, credit notes or manual adjustments |
| `gateway_no_high_risk_handling` | No cash, stock, refunds or temporary workers |
| `gateway_no_digital_footprint` | No online sales, digital payments or platform dependency |
| `gateway_no_digital_or_identity_footprint` | No digital channel and no personal information |
| `gateway_no_employee_base` | No employees beyond the owner |
| `upstream_answer_changed` | A gateway changed; question left the active path |
| `redirected_to_oversight_variant` | Outsourced; governance equivalent asked instead |

Every code has customer-facing prose in `skip_reason_codes` and is shown at review.
A test asserts no code is used without a definition.

## 9. Invalidation

`invalidationPreview(answers, gatewayId, newValue)` resolves the path twice — actual
and hypothetical — and returns:

- `invalidatedIds` — currently **answered** questions that would leave the path
- `newlyApplicableIds` — questions that would join it

Only answered questions are reported, so the warning count matches what the
respondent would actually lose. On confirmation each is written to audit history
with `previous_value` and `cause`, then removed from active answers.

The reverse index (`dependents`) is built at construction from every condition and
redirect tree, so invalidation is O(dependents) rather than a full graph re-walk.

## 10. Structural guarantees (all test-enforced)

| Guarantee | Test |
|---|---|
| 68 questions, 19 critical, 17 hard-gate, weights = 100% | `graph reproduces the approved MFRS-V1.0 methodology exactly` |
| Prototype content is labelled; approved content is not relabelled | `every prototype-authored node is explicitly labelled` |
| Every redirect target exists; conditions reference only gateways | `every redirect target and condition dependency resolves` |
| No unreachable question across the six journeys | `no unreachable required question` |
| No infinite loops (500-iteration guard, never reached) | `all six synthetic journeys terminate without loops` |
| Every skip carries a defined, human-readable reason | `skipping requires an explicit gateway statement of fact` |
| Uncertainty never excludes | `"I do not know" never excludes a question` |
| Exclusion never improves the score | `skipping does not improve the score` |
| Outsourcing never improves the score | `outsourced organisations are not scored more leniently` |
| Restoring a gateway restores the path | `re-selecting the original gateway value restores applicability` |
| Nothing silently vanishes | accounting identity in `every journey produces a complete profile` |

## 11. Extending the graph

To add a conditional question, add one `applicability_condition` and one
`skip_reason_code` entry. No engine change. To add an outsourcing pathway, add an
`OV-*` node and a `redirect_when` clause on the base question.

Because conditions may only reference gateways, adding a question cannot create a
cycle and cannot make an existing question unreachable — the failure mode is caught
by the reachability and accounting tests, not discovered in production.
