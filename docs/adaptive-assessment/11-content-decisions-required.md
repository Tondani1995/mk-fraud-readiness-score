# 11 — Content decisions required

# ⚠ CONTENT DECISION REQUIRED — NOT APPROVED FOR PRODUCTION

**Five items were added this round (C38–C42)** covering score withholding and the two
wording corrections. Revised wording is still placeholder wording.

Everything in this document is **prototype placeholder content**, written to make the
adaptive experience demonstrable. None of it has been reviewed or approved by the
methodology owner. Revised wording in this round is still placeholder wording — it has
**not** become approved methodology by being improved.

No approved content was altered. All 68 MFRS-V1.0 questions, prompts, weights,
critical and hard-gate flags, domain assignments, domain weights and the 0–5 scale are
reproduced **verbatim** from `supabase/migrations/0003_phase5_methodology_seed.sql`,
and a test asserts it. Every placeholder node carries
`"methodology_version": "PROTOTYPE_PLACEHOLDER"`, also test-asserted in both directions.

---

## 1. Decision table

| ID | Item | Current placeholder | Proposed final wording | Why needed | Affects | Scoring implication | Report implication | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|
| **C1** | G01 organisation type | "Which best describes what your organisation does?" | unchanged | Sector framing | narrative only | none | sector language | Methodology | **NOT APPROVED** |
| **C2** | G02 size | "Roughly how many people work in the organisation?" | unchanged | Proportionality | D6, D8, D9 (8 controls) | `micro` excludes 8 controls | exclusion schedule | Methodology | **NOT APPROVED** |
| **C3** | G03 third parties | "Does your organisation buy goods or services from external suppliers or contractors?" | unchanged | Largest single branch | D2, D3, D6, D7 (8 controls, 3 redirects) | up to 8 exclusions or 3 redirects | scope + oversight | Methodology | **NOT APPROVED** |
| **C4** | G04 procurement | "How is buying and procurement handled?" | unchanged | Procurement fraud is a primary vector | D7-Q02, D7-Q06 | 2 exclusions or 1 redirect | scope | Methodology | **NOT APPROVED** |
| **C5** | G05 cash | "Does your organisation handle physical cash?" | unchanged | Cash exposure | D3-Q07 | contributes | exposure weighting | Methodology | **NOT APPROVED** |
| **C6** | G06 stock | "Does your organisation hold physical stock, inventory or valuable equipment?" | unchanged | Asset misappropriation | D3-Q07 | contributes | exposure weighting | Methodology | **NOT APPROVED** |
| **C7** | G07 payroll | "How is payroll handled?" | unchanged | Ghost-employee risk survives outsourcing | adds `OV-G07` | +1 control when outsourced | oversight finding | Methodology | **NOT APPROVED** |
| **C8** | G08 digital payments | "Do you sell online or accept digital or card payments?" | unchanged | Digital fraud applicability | D2, D8 (6 controls) | up to 6 exclusions or 1 redirect | scope | Methodology | **NOT APPROVED** |
| **C9** | G09 personal information | "Do you hold personal information about customers, clients or employees?" | unchanged | Identity risk independent of sales channel | D2-Q08, D8-Q01, D8-Q08 | retains identity controls | scope | Methodology | **NOT APPROVED** |
| **C10** | G10 refunds | "Do you process refunds, credit notes or manual adjustments?" | unchanged | Common internal-fraud route | D3-Q05, D3-Q07 | 1 exclusion | scope | Methodology | **NOT APPROVED** |
| **C11** | G11 sites | "Does the organisation operate from more than one site, store or project location?" | unchanged | Dispersion | none currently | none | narrative | Methodology | **NOT APPROVED** |
| **C12** | G12 temporary workers | "Do you use temporary, seasonal or subcontracted workers?" | unchanged | Access and oversight | D3-Q07 | contributes | narrative | Methodology | **NOT APPROVED** |
| **C13** | G13 remote / platforms | "Do employees work remotely, or do you depend on third-party digital platforms?" | unchanged | Platform dependency | D2-Q08, D8-Q02/05/07 | contributes | scope | Methodology | **NOT APPROVED** |
| **C14** | G14 approvals | "Who approves payments and significant spending?" | unchanged | Small-org calibration | none currently | none | proportionality language | Methodology | **NOT APPROVED** |
| **C15** | OV-D3-Q03 | Provider supplier-vetting assurance | unchanged | Outsourced vetting | replaces D3-Q03 | weight 1.5, hard gate | oversight gap | Methodology | **NOT APPROVED** |
| **C16** | OV-D7-Q01 | Vetting standard defined and monitored | unchanged | Retained control | replaces D7-Q01 | weight 1.5 | oversight gap | Methodology | **NOT APPROVED** |
| **C17** | OV-D7-Q02 | Retained procurement controls | unchanged | Collusion risk at provider | replaces D7-Q02 | weight 1.25 | oversight gap | Methodology | **NOT APPROVED** |
| **C18** | OV-D7-Q04 | Independent bank-detail verification | unchanged | Vendor impersonation | replaces D7-Q04 | weight 1.5, hard gate | oversight gap | Methodology | **NOT APPROVED** |
| **C19** | OV-D8-Q02 | Platform fraud reporting reviewed | unchanged | Marketplace dependency | replaces D8-Q02 | weight 1.5, hard gate | oversight gap | Methodology | **NOT APPROVED** |
| **C20** | OV-G07 | Payroll register independently reviewed | unchanged | Ghost employees | **adds** a control | weight 1.25 | oversight gap | Methodology | **NOT APPROVED** |
| **C21** | Uncertainty option | "I do not know — Recorded as uncertainty. This is not treated as a control being absent, and it is not treated as a control being present." | unchanged | No equivalent exists today | all 68 + most gateways | zero credit, reduces visibility | reduced-confidence language | Methodology | **NOT APPROVED** |
| **C22** | Profile block intro | "First, five short questions about how your organisation operates…" | unchanged | Progressive profiling | opening screen | none | none | Commercial copy | **NOT APPROVED** |
| **C23** | D2 block intro | "Before we assess how your organisation identifies fraud risk, we need to understand how much of your operation depends on remote working and third-party digital platforms." | unchanged | Explains the gateway | before D2 | none | none | Commercial copy | **NOT APPROVED** |
| **C24** | D3 block intro | "Before we assess your operational fraud controls, we need to understand where money, stock and people actually move through your business." | unchanged | Explains the gateway | before D3 | none | none | Commercial copy | **NOT APPROVED** |
| **C25** | D7 block intro | "Before we assess supplier and procurement controls, we need to understand how your organisation purchases goods and services, and how payroll is run." | unchanged | Explains the gateway | before D7 | none | none | Commercial copy | **NOT APPROVED** |
| **C26** | Exclusion explanation | "This area was not assessed because the organisation indicated that the underlying activity does not form part of its operating model." | unchanged | Scope transparency | review + report | none | scope schedule | Methodology + Commercial | **NOT APPROVED** |
| **C27** | Comparability statement | "Your score reflects the controls applicable to the operating profile you declared. It should not be compared directly with an organisation whose fraud exposures and applicable control areas differ materially." | unchanged | **Required by the corrected scoring contract** | review, submission, report | none | mandatory qualifier | Methodology + Commercial | **NOT APPROVED** |
| **C28** | NORMAL status copy | "Coverage and control visibility are sufficient for a full conclusion." | unchanged | Report status | review + report | none | status | Methodology | **NOT APPROVED** |
| **C29** | PROVISIONAL status copy | "A score can be shown, but the conclusion is limited." + generated reason | unchanged | Report status | review + report | none | prominent limitation | Methodology | **NOT APPROVED** |
| **C30** | INSUFFICIENT_VISIBILITY copy | "Too much of the applicable control environment could not be confirmed for a defensible overall maturity conclusion." | unchanged | Report status | review + report | blocks definitive band | no maturity band | Methodology | **NOT APPROVED** |
| **C38** | Score withheld | "MK could not issue a defensible overall Fraud Readiness Score because too much of the applicable control environment could not be confirmed." | needs owner review | Shown in place of the number under INSUFFICIENT_VISIBILITY | review + submission + report | no score issued | **no numeric score, no maturity band** | Methodology + Commercial | **NOT APPROVED** |
| **C39** | Score-withheld label | "Not issued" | needs owner review | The word that replaces the number | review + report | none | must not read as a zero or a failure | Commercial copy | **NOT APPROVED** |
| **C40** | Fraud Readiness Score note | "Readiness across applicable controls. Under the proposed methodology, controls that could not be confirmed receive no maturity credit and are reported separately through Control Visibility." | needs owner review | **Replaces inaccurate wording.** The previous note said "maturity of the applicable controls you were able to confirm", which is wrong under Option A — unconfirmed controls stay in the denominator | review + report | none | describes the score accurately | Methodology | **NOT APPROVED** |
| **C41** | Preview framing | "This is a preview based on your current answers. Your final report is generated after submission." | needs owner review | **Replaces a self-contradiction.** The screen previously displayed a score while saying the calculation was not shown | review | none | none | Commercial copy | **NOT APPROVED** |
| **C42** | High-impact exclusion limitation | "This result is provisional because the declared operating profile excluded an entire fraud-risk domain or one or more high-impact controls. The excluded scope is listed below and may require confirmation." | needs owner review | Carries the new escalation rule | review + report | none | prominent limitation | Methodology | **NOT APPROVED** |
| **C31** | Evidence-verification template | "The respondent could not confirm how this control operates… identify the process owner and obtain evidence of the current procedure for: {control}" | unchanged | Prevents inventing findings | every unknown | none | verification action | Methodology | **NOT APPROVED** |
| **C32** | Control-design template | "The organisation confirmed this control is not in place. Design and implement a control covering: {control}" | unchanged | Substantive 0 | every 0 | none | remediation | Methodology | **NOT APPROVED** |
| **C33** | Strengthening template | "This control exists but is not operating consistently or is not evidenced…" | unchanged | Substantive 1–2 | every 1–2 | none | remediation | Methodology | **NOT APPROVED** |
| **C34** | Provider-governance template | "Oversight of the external provider is not adequate…" | unchanged | Outsourced weakness | oversight variants | none | provider action | Methodology | **NOT APPROVED** |
| **C35** | Completion template | "This question was not answered. Complete it so the assessment can reach a conclusion on: {control}" | unchanged | Silence is not a finding | every unanswered | none | completion request | Methodology | **NOT APPROVED** |
| **C36** | Evidence prompts (68) | e.g. D7-Q04 → "Bank detail change verification procedure" | individual review required | Makes the scale concrete | all 68 | none | may inform report | Methodology | **NOT APPROVED** |
| **C37** | Time constants (10) | 0.5–0.7 min per question per domain | replace with observed medians | Drives the visible estimate | all screens | none | none | Product + Data | **NOT APPROVED** |

## 2. Specific decisions that change behaviour

Beyond wording, these need explicit rulings:

1. **C2 / G02 `micro` excludes 8 fraud-culture and awareness controls**
   (D6-Q02, D6-Q06, D8-Q03, D9-Q01/02/04/05/06). This is the largest single block of
   exclusions and the most contestable — an owner-only business still has fraud-culture
   exposure through the owner's own conduct. **Recommend narrowing or removing this
   exclusion.**

2. **C11 / G11 and C14 / G14 currently drive nothing.** They are asked but affect no
   applicability. Either wire them to controls or cut them. Asking a question that
   changes nothing costs respondent goodwill.

3. **C20 / OV-G07 is additive.** Outsourcing payroll makes the assessment one control
   *longer*. Confirm this is intended.

4. **`shared_service` currently behaves like in-house except for payroll.** A group
   shared service is arguably closer to in-house than to a third party, but it still
   introduces a governance boundary. Needs an explicit ruling.

5. **Overlap with the 8 existing exposure factors (EXP-01…08).** G03/G04 ≈ EXP-02,
   G08/G09/G13 ≈ EXP-03/04, G05/G06 ≈ EXP-05, G11 ≈ EXP-06, G10 ≈ EXP-07.
   **Recommendation: derive exposure bands from gateway answers rather than asking both**,
   so the respondent is not asked the same thing twice in different words. This changes
   how exposure points are captured and needs methodology approval.

6. **C37 / time constants are invented** and shown to customers as fact. This is a small
   but real honesty gap until replaced with observed medians.

## 3. Summary

| Category | Count | Status |
|---|---|---|
| Approved MFRS-V1.0 questions reproduced verbatim | 68 | unchanged, test-asserted |
| Approved domains, weights, scale | 10 / 100% / 0–5 | unchanged, test-asserted |
| **Gateway questions** | **14** | **NOT APPROVED** |
| **Oversight variants** | **6** | **NOT APPROVED** |
| **Uncertainty option** | **1** | **NOT APPROVED** |
| **Progressive block introductions** | **4** | **NOT APPROVED** |
| **Framing / status / comparability copy** | **8** | **NOT APPROVED** |
| **Recommendation templates** | **5** | **NOT APPROVED** |
| **Evidence prompts** | **68** | **NOT APPROVED** |
| **Time-estimate constants** | **10** | **NOT APPROVED** |

**Nothing in this document may reach production without methodology sign-off.**
