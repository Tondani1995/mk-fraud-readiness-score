# 11 — Content decisions required

# ⚠ CONTENT DECISION REQUIRED — NOT APPROVED FOR PRODUCTION

Everything in this document is **prototype placeholder content**. It was written to
make the adaptive experience demonstrable. It has **not** been reviewed or approved
by the methodology owner, and none of it may ship without explicit sign-off.

No existing approved content was altered. All 68 MFRS-V1.0 questions, their prompts,
weights, critical and hard-gate flags, domain assignments, domain weights and the 0–5
response scale are reproduced **verbatim** from
`supabase/migrations/0003_phase5_methodology_seed.sql`. A test asserts this.

Every placeholder node carries `"methodology_version": "PROTOTYPE_PLACEHOLDER"`.
A test asserts that approved questions never carry that marker and that every
prototype-authored node does.

---

## A. Gateway questions (14) — NOT APPROVED

These do not exist in MFRS-V1.0. The entire adaptive experience depends on them.
They establish operational facts and drive every exclusion and redirect.

| ID | Prompt | Options | Drives |
|---|---|---|---|
| **G01** | Which best describes what your organisation does? | professional services / retail / construction / online / manufacturing / other | Sector framing only |
| **G02** | Roughly how many people work in the organisation? | 1–10 / 11–50 / 51–250 / 250+ / don't know | Excludes 8 employee-dependent questions when `micro` |
| **G03** | Does your organisation buy goods or services from external suppliers or contractors? | manage ourselves / handled by external provider / group or shared service / no / don't know | **8 exclusions or 3 redirects** |
| **G04** | How is buying and procurement handled? | dedicated function / owner-led / external provider / shared service / don't know | 2 exclusions or 1 redirect |
| **G05** | Does your organisation handle physical cash? | regularly / occasionally / no / don't know | Contributes to D3-Q07 |
| **G06** | Does your organisation hold physical stock, inventory or valuable equipment? | yes / no / don't know | Contributes to D3-Q07 |
| **G07** | How is payroll handled? | in-house / external provider / shared service / no payroll / don't know | Adds `OV-G07` |
| **G08** | Do you sell online or accept digital or card payments? | yes / only via a third-party platform / no / don't know | Up to 6 exclusions or 1 redirect |
| **G09** | Do you hold personal information about customers, clients or employees? | yes / no / don't know | Retains identity questions independently of G08 |
| **G10** | Do you process refunds, credit notes or manual adjustments? | yes / no / don't know | 1 exclusion |
| **G11** | Does the organisation operate from more than one site, store or project location? | yes / no / don't know | Dispersion framing |
| **G12** | Do you use temporary, seasonal or subcontracted workers? | yes / no / don't know | Contributes to D3-Q07 |
| **G13** | Do employees work remotely, or do you depend on third-party digital platforms? | yes / no / don't know | Contributes to digital exclusions |
| **G14** | Who approves payments and significant spending? | formal delegation / owner or single director / shared service / don't know | Small-organisation calibration |

### Decisions required

1. **Approve, amend or replace each prompt.** Wording matters — these determine what
   is not asked.
2. **Confirm the applicability semantics of every option.** Specifically: does
   "handled by an external provider" mean the same thing to a customer as it does in
   the methodology?
3. **Confirm G02 `micro` should exclude the eight employee-dependent questions**
   (D6-Q02, D6-Q06, D8-Q03, D9-Q01, D9-Q02, D9-Q04, D9-Q05, D9-Q06). This is the
   largest single block of exclusions and it is the most contestable: an owner-only
   business still has fraud-culture exposure through its own conduct.
4. **Confirm G14 is worth asking.** It currently calibrates tone rather than driving
   exclusions. If it drives nothing, it should be cut.
5. **Decide whether these belong in the methodology or in a separate profiling
   instrument** with its own version lifecycle.
6. **Relationship to the existing 8 exposure factors (EXP-01…08).** Overlap is
   substantial: G03/G04 ≈ EXP-02, G08/G09/G13 ≈ EXP-03/04, G05/G06 ≈ EXP-05,
   G11 ≈ EXP-06, G10 ≈ EXP-07. **Recommendation:** derive exposure bands from the
   gateway answers rather than asking both, so the respondent is not asked the same
   thing twice in different words. This needs methodology approval and would change
   how exposure points are captured.

## B. Oversight variants (6) — NOT APPROVED

Asked **instead of** the in-house question when an activity is outsourced. Each
carries the weight and hard-gate status of the question it replaces.

| ID | Replaces | Prompt (abridged) | Weight | Hard gate |
|---|---|---|---|---|
| **OV-D3-Q03** | D3-Q03 | Obtains assurance that the provider performs supplier vetting to an agreed standard | 1.5 | yes |
| **OV-D7-Q01** | D7-Q01 | Defines and monitors the vetting standard the provider must apply | 1.5 | no |
| **OV-D7-Q02** | D7-Q02 | Retains defined controls over supplier selection, price integrity and conflict disclosure | 1.25 | no |
| **OV-D7-Q04** | D7-Q04 | Independently verifies changes to supplier banking details before payments are released | 1.5 | yes |
| **OV-D8-Q02** | D8-Q02 | Reviews the fraud, dispute and account-security reporting the platform provides | 1.5 | yes |
| **OV-G07** | *(adds)* | Independently reviews the payroll register for unknown, duplicate or altered records | 1.25 | no |

### Decisions required

1. **Approve or rewrite each prompt.**
2. **Confirm weight parity.** The prototype assumes an oversight failure is as
   serious as an in-house control failure. This is a methodology position, not a
   design one.
3. **Confirm hard-gate parity.** OV-D3-Q03, OV-D7-Q04 and OV-D8-Q02 retain hard-gate
   status, so an outsourced organisation can still trip a maturity cap. Intended, but
   must be explicit.
4. **`OV-G07` is additive, not a replacement** — MFRS-V1.0 has no base payroll
   question, so outsourcing payroll makes the assessment one question longer. Confirm
   this is desired.
5. **Decide whether `shared_service` should behave identically to `outsourced`.**
   Currently it mostly follows the in-house path except for payroll. A group shared
   service is arguably closer to in-house than to a third party, but it still
   introduces a governance boundary.

## C. Uncertainty option — NOT APPROVED

Appears on every maturity question and most gateways. No equivalent exists today.

> **I do not know**
> *Recorded as uncertainty. This is not treated as a control being absent, and it is
> not treated as a control being present.*

### Decisions required

1. Approve the label and helper text.
2. **Confirm the scoring treatment**: retained in the denominator, zero credit,
   flagged separately (`05` §3.1). This is the single most consequential methodology
   decision in the workstream.
3. Define `unknownWeightShare` thresholds for provisional or invalid results.
4. Decide the report language for a high-uncertainty result — the intent is
   *"limited visibility"*, not *"weak controls"*.

## D. Framing copy — NOT APPROVED

| Context | Proposed copy |
|---|---|
| Why we are asking | Because you indicated "{option}", this question applies to your organisation. |
| Outsourcing rationale | Because you told us this activity is handled by an external provider, we are asking how you oversee that provider rather than assuming the risk has gone away. |
| Exclusion framing | Excluded questions are removed from your result entirely. They do not count for you or against you. If any of these are wrong, go back and correct the answer that caused them. |
| Unknown framing (review) | These are treated as uncertainty, not as controls being in place. A high number will be reflected in your report as reduced confidence rather than as a weakness. |
| Invalidation warning | Changing this will remove {n} answers… They are kept in the audit history but will not affect your result. |
| Welcome honesty prompt | Answer as things genuinely are today, not as they should be. |
| Score visibility | Your score is calculated after submission and appears in your report. We do not show the calculation here. |

**Decision required:** approve, amend, or route to the commercial copy owner. The
exclusion and uncertainty framing in particular sets customer expectations about what
a R5,000 report will contain.

## E. Evidence prompts (68) — NOT APPROVED

Every question gained a "Typical evidence" line (for example, D7-Q04 → *"Bank detail
change verification procedure"*). These are **new content**, written for the
prototype to make the maturity scale concrete.

They are advisory, do not affect scoring, and could be dropped without changing
behaviour.

**Decisions required:** approve the concept; review all 68 individually; decide
whether they belong in the assessment UI, the report, or both.

## F. Estimated-time constants — NOT APPROVED

Per-domain `estMinutesPerQuestion` of 0.5–0.7 minutes drives the visible time
estimate (29–43 minutes across the six journeys).

These are **invented**. They should be replaced with observed medians once real
respondent telemetry exists. Until then the estimate is a plausible guess presented
to the customer as a fact — a small but real honesty gap.

## G. Summary

| Category | Count | Status |
|---|---|---|
| Approved MFRS-V1.0 questions reproduced verbatim | 68 | unchanged, test-asserted |
| Approved domains, weights, scale | 10 / 100% / 0–5 | unchanged, test-asserted |
| **Gateway questions** | **14** | **NOT APPROVED** |
| **Oversight variants** | **6** | **NOT APPROVED** |
| **Uncertainty option** | **1** | **NOT APPROVED** |
| **Framing copy strings** | **7** | **NOT APPROVED** |
| **Evidence prompts** | **68** | **NOT APPROVED** |
| **Time-estimate constants** | **10** | **NOT APPROVED** |

**Nothing in sections A–F may reach production without methodology sign-off.**
