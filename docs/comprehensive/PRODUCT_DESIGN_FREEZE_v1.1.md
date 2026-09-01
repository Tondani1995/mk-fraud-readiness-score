# MK Fraud Readiness Comprehensive v1.1 — Product Design Freeze

**Status:** FROZEN by owner decision.
**Freeze baseline:** the commit that introduces this record.
**Scope:** product design only. Not a Production deployment, not a launch integration.

---

## Product

MK Fraud Readiness Comprehensive — **R35,000 incl VAT — automated analytical assessment.**
No human review is included. No evidence is independently validated. No operating
effectiveness is tested. No assurance opinion is provided.

The commercial ladder is unchanged and closed: Free Snapshot / Essential R7,500 /
Comprehensive R35,000 / Advisory from R150,000. Comprehensive was migrated in place
from the retired reviewed-engagement definition; `mk_validated_assessment` is retained
as an opaque database join key only.

## Architecture

Deterministic assembly → management model → six registers, rendered without AI.
Bounded interpretation adds six prose slots over that core. The normal path begins
with **one structured initial generation**, then uses the shared bounded reporting
recovery policy where validation justifies it: targeted semantic repair, one complete
regeneration, one quality-model escalation, one coherence pass and technical fallback
are separately limited and accounted. The AI explains the analysis; it never produces it.

| Layer | Origin | May assert |
|---|---|---|
| Six registers | deterministic | organisation facts traceable to responses and scores |
| Six interpretation slots | bounded AI | meaning drawn from the deterministic brief, and nothing else |

The provider receives a summary brief — themes, programmes, decisions, phases and
counts. It never receives the registers: 21–241 register rows were withheld per
certified case, and the engine's narrative-mode token is excluded from the prompt
entirely.

## Freeze basis

| Criterion | Result |
|---|---|
| Final certified Remediation artefact | PASS |
| Mixed | PASS |
| Sustainment | PASS |
| Gates | 14 / 14 green |
| Essential deterministic non-regression | 11 / 11, Rivonia PASS |
| Unsupported organisation facts | 0 |
| Assurance violations | 0 |
| Manufactured weaknesses | 0 |
| Material cross-slot duplication | 0 (worst overlap 0.225 against a 0.55 threshold) |
| Register mutation by AI | 0 |
| Layout failures across the three final PDFs | 0 across 105 pages |
| Bounded AI materially improves the management core | Yes |
| Deterministic registers isolated from AI | Yes |

### Certified artefacts

| Case | Mode | Score | Pages |
|---|---|---|---|
| CASE-05f `MKORD-2026-22FF6B69` | REMEDIATION | 35.55 Reactive | 53 |
| CASE-06 `MKORD-2026-7FBBEE23` | MIXED | 55.3 | 33 |
| CASE-11f `MKORD-2026-O9DT0QTT` | SUSTAINMENT | 100 Strategic | 19 |

Page counts are identical with and without interpretation: the six slots absorb into
the existing page budget rather than extending the document.

## C5 defects fixed — certification evidence

1. **Subject-aware assurance-claim validation.** `claimsVerification` matched literal
   phrases, so `"MK validated"` was caught while `"MK independently validated"` and
   `"MK has verified"` passed. Any adverb or auxiliary defeated the whole list. Now
   anchored on subject-then-verb, which also preserves the distinction that matters:
   "bank-detail changes are independently verified by callback" is a control design and
   passes; "MK independently validated the controls" is an assurance claim and fails.

2. **Currency-prefixed invented-number validation.** The number check used `\b\d+`,
   and there is no word boundary between the `R` and the digits of `R450000` — so
   fabricated rand figures, the single most damaging invention this product could make,
   were never examined. Now anchored on a digit not preceded by a digit, with
   separators stripped before comparison.

3. **Canonical decision-owner labels.** The decision agenda was passed through from
   assembly unnormalised, printing `CEO / Managing Director` and `General Counsel / COO`
   while the governance table printed `Chief Executive / Managing Director`,
   `General Counsel` and `Chief Operating Officer` for the same offices. Two vocabularies
   for one accountability in one document — the condition role normalisation exists to
   remove, reintroduced at the last step. This was a deterministic defect present in the
   C4 renderer output; the AI exposed it. The management-model gate now rejects any
   decision owner that is not a canonical governance role.

4. **Internal mode vocabulary exclusion.** A sustainment report described itself as
   being "in SUSTAINMENT mode". The engine's mode token is now withheld from the prompt
   and replaced by a plain-English posture sentence, with a validator behind it as
   defence in depth.

5. **Customer-specific source-comment removal.** Source comments in the interpretation
   module named the reference customer. Caught by `customer-specific-logic-gate` and
   rewritten to describe the defect rather than the customer;
   `CUSTOMER_SPECIFIC_REPORT_LOGIC = 0` restored.

## Validation model

Each slot is checked on three axes, and only a failing field is repaired — never the
whole report, maximum two repairs per field.

- **HARD_TRUTH** — unsupported number, assurance claim, claimed observation, maturity
  contradiction, manufactured weakness in sustainment, engine vocabulary.
- **SEMANTIC** — duplicate sentence, duplicate responsibility, role label drift.
- **QUALITY** — length bounds, consultancy filler, register recitation.

Twelve negative controls prove each rule fires; positive controls prove none fires on
legitimate prose, including the constructions that broke earlier validators — a denial
of verification, and a control design that uses verification language about the
organisation's own process.

## Process exception

Certification consumed **6 live Comprehensive reports against a stated maximum of 3**
(9 provider calls, 30,444 tokens, $0.0173, 91 seconds). Each additional run followed a
defect found and fixed. The owner has noted this as a process exception which does not
invalidate the certification evidence or block the freeze.

Standing instruction from this point: **the configured bounded recovery policy is the
provider-call authority.** Do not invent a tighter ad hoc ceiling, and do not exceed the
policy. Hard-truth failures remain fail-closed; bounded recovery calls are allowed only
for the safety-net conditions the policy explicitly permits.

## Frozen surface

- `src/lib/reports/comprehensive/product-contract.ts`
- `src/lib/reports/comprehensive/assembly.ts`
- `src/lib/reports/comprehensive/management-model.ts`
- `src/lib/reports/comprehensive/render-comprehensive-html.ts`
- `src/lib/reports/comprehensive/interpretation.ts`
- `src/lib/commercial/product-catalogue.ts` (Comprehensive entry)

Gates: `v11:comprehensive-contract-gate`, `v11:comprehensive-assembly-gate`,
`v11:comprehensive-management-model-gate`, `v11:comprehensive-renderer-gate`,
`v11:comprehensive-interpretation-gate`.
