# Methodology Copy Review - MK Fraud Readiness Score V1

Date: 2026-07-08  
Branch: `v1/phase0-8-closeout`  
Scope: Copy, sequencing, framing and respondent clarity review for the current 68-question methodology and 8 exposure factors.

## Decision

The current methodology is structurally usable, but it should not be treated as final client-grade copy yet. The 68 questions are coherent enough for scoring, and the 10-domain structure is aligned to the product. The main weakness is that some questions read like internal control-testing statements rather than a polished respondent-facing assessment.

No question text is changed in the closeout branch. That is intentional. The question bank is methodology content and changing it should happen in a dedicated methodology-copy PR so scoring history, test fixtures and report interpretation remain traceable.

## Review Criteria

Each item was reviewed against ten copy gates:

1. Is it understandable to a non-bank, non-technical organisation?
2. Does it test one thing rather than two or three things at once?
3. Is it suitable for a 0-5 maturity answer?
4. Does it avoid audit/compliance jargon where plain fraud-risk language is better?
5. Does it avoid leading the respondent toward a socially desirable answer?
6. Does it fit the MK Fraud positioning around practical readiness, not generic governance?
7. Does it work across sectors such as municipalities, utilities, retail, healthcare, education, logistics, NGOs and SMEs?
8. Does it avoid overclaiming legal, forensic or assurance outcomes?
9. Does it sequence naturally inside its domain?
10. Does the help text explain what is being tested without sounding like hidden examiner notes?

## Overall Findings

The question set is strong in structure but uneven in voice. It covers the right terrain: governance, risk identification, operational controls, detection, incident response, whistleblowing, third parties, digital/identity risk, culture and continuous improvement.

The main improvement needed is not a new methodology. It is a copy pass that makes the questions feel more like a professional MK Fraud assessment. The assessment should sound like a calm expert asking practical questions, not a database seed asking control-test statements.

## Exposure Factor Review

| Code | Current exposure factor | Copy decision | Notes |
| --- | --- | --- | --- |
| EXP-01 | High-risk process footprint | Keep, with guidance text | Strong factor. Needs examples visible in UI: procurement, refunds, claims, stock, payments, grants or service delivery. |
| EXP-02 | Third-party and supplier dependency | Keep | Strong and central to non-financial-sector fraud risk. |
| EXP-03 | Digital channel reliance | Keep | Strong. UI should clarify that this includes portals, apps, WhatsApp journeys, online forms and customer platforms. |
| EXP-04 | Identity and personal-data dependency | Keep, clarify | Strong, but could be clearer for organisations that do not think of themselves as identity businesses. |
| EXP-05 | Cash, stock or high-value asset handling | Keep | Good non-financial-sector exposure factor. |
| EXP-06 | Operational dispersion | Keep, clarify | Good factor, but needs examples such as branches, depots, regions, sites, field teams or remote operations. |
| EXP-07 | Manual intervention and exception volume | Keep | Strong fraud-risk factor and very relevant to operational fraud. |
| EXP-08 | Public funds, regulated payments or vulnerable stakeholders | Keep, clarify | Strong but slightly broad. Consider separating public funds from vulnerable stakeholders in a future scoring version if the data shows distortion. |

## Domain-by-Domain Question Copy Review

### D1 - Fraud Leadership and Governance

| Question | Decision | Comment |
| --- | --- | --- |
| D1-Q01 | Keep with light copy polish | Good hard-gate question. Could say "named senior owner" instead of "senior executive or leadership function". |
| D1-Q02 | Keep | Clear and suitable for 0-5 scale. |
| D1-Q03 | Keep | Strong governance visibility question. |
| D1-Q04 | Keep but simplify | Important concept, but internal audit wording may be too technical for SMEs. |
| D1-Q05 | Keep | Clear policy/guidance question. |
| D1-Q06 | Keep | Good emerging-risk leadership question. |

### D2 - Fraud Risk Identification

| Question | Decision | Comment |
| --- | --- | --- |
| D2-Q01 | Keep | Strong baseline question. |
| D2-Q02 | Keep | Strong and practical. |
| D2-Q03 | Keep | Useful change-risk question. |
| D2-Q04 | Keep | Good refresh-discipline question. |
| D2-Q05 | Keep | Good N/A-controlled third-party question. |
| D2-Q06 | Keep | Strong threat-monitoring question. |
| D2-Q07 | Keep with copy polish | Good insider-risk item, but could use plainer wording. |
| D2-Q08 | Keep with examples | Strong for digital/customer ecosystems. Needs examples for non-financial sectors. |

### D3 - Operational Fraud Controls

| Question | Decision | Comment |
| --- | --- | --- |
| D3-Q01 | Keep | Strong hard-gate preventive-control question. |
| D3-Q02 | Keep | Clear. |
| D3-Q03 | Keep | Strong supplier-control question. |
| D3-Q04 | Keep | Strong access-control question. |
| D3-Q05 | Keep with examples | Good, but should show examples such as refunds, credits, write-offs, manual journals or stock adjustments where relevant. |
| D3-Q06 | Keep | Good process-review question. |
| D3-Q07 | Keep with copy polish | Good high-risk role oversight question; wording could be less formal. |

### D4 - Fraud Detection Capability

| Question | Decision | Comment |
| --- | --- | --- |
| D4-Q01 | Keep | Strong core detection question. |
| D4-Q02 | Keep | Clear and operational. |
| D4-Q03 | Keep but simplify | Strong, but lists many techniques. Could be shorter. |
| D4-Q04 | Keep | Good refresh question. |
| D4-Q05 | Keep | Useful breadth question. |
| D4-Q06 | Keep | Good escalation-authority question. |
| D4-Q07 | Keep with caution | Independent review is useful, but internal audit/risk wording may not fit small organisations. |

### D5 - Fraud Incident Response

| Question | Decision | Comment |
| --- | --- | --- |
| D5-Q01 | Keep | Strong hard-gate response-process question. |
| D5-Q02 | Keep | Practical and clear. |
| D5-Q03 | Keep | Good ownership question. |
| D5-Q04 | Keep | Strong procedural discipline question. |
| D5-Q05 | Keep | Strong evidence-handling hard gate. |
| D5-Q06 | Keep | Useful external specialist escalation question. |
| D5-Q07 | Keep | Strong post-incident learning question. |

### D6 - Whistleblowing and Reporting Culture

| Question | Decision | Comment |
| --- | --- | --- |
| D6-Q01 | Keep | Strong channel-availability question. |
| D6-Q02 | Keep | Clear awareness question. |
| D6-Q03 | Keep | Good independence question. |
| D6-Q04 | Keep | Good anti-retaliation question. |
| D6-Q05 | Keep with explanation | Good N/A-controlled external stakeholder question, but needs clear examples for suppliers/customers/contractors. |
| D6-Q06 | Keep | Clear guidance/training question. |

### D7 - Third-Party and Supply Chain Fraud Risk

| Question | Decision | Comment |
| --- | --- | --- |
| D7-Q01 | Keep | Strong third-party onboarding question. |
| D7-Q02 | Keep | Strong procurement integrity question. |
| D7-Q03 | Keep | Strong conflict-of-interest question. |
| D7-Q04 | Keep | Strong hard-gate supplier payment question. |
| D7-Q05 | Keep | Good ongoing-monitoring question. |
| D7-Q06 | Keep | Good oversight question. |
| D7-Q07 | Keep with examples | Important for intermediaries, agents and distributors; examples would help non-corporate respondents. |

### D8 - Digital and Identity Fraud Risk

| Question | Decision | Comment |
| --- | --- | --- |
| D8-Q01 | Keep with examples | Strong hard-gate identity question. Needs examples beyond banking/KYC. |
| D8-Q02 | Keep | Strong monitoring question. |
| D8-Q03 | Keep | Clear training question. |
| D8-Q04 | Keep | Strong access-governance question, though similar to D3-Q04. Distinction should be explained in help text. |
| D8-Q05 | Keep | Strong digital misuse question. |
| D8-Q06 | Keep | Good digital reporting-pathway question. |
| D8-Q07 | Keep | Good emerging digital-risk question. |
| D8-Q08 | Keep with copy polish | Strong identity misuse question, but currently broad. Could separate identity misuse from account takeover in a future version. |

### D9 - Fraud Culture and Awareness

| Question | Decision | Comment |
| --- | --- | --- |
| D9-Q01 | Keep | Good general fraud-awareness question. |
| D9-Q02 | Keep | Clear onboarding question. |
| D9-Q03 | Keep | Strong leadership tone question. |
| D9-Q04 | Keep | Good consequence-awareness question. |
| D9-Q05 | Keep | Good scenario-based awareness question. |
| D9-Q06 | Keep with careful wording | Strong speak-up culture question, but may be hard for one respondent to answer objectively. |

### D10 - Continuous Improvement and Fraud Risk Monitoring

| Question | Decision | Comment |
| --- | --- | --- |
| D10-Q01 | Keep | Strong hard-gate continuous review question. |
| D10-Q02 | Keep | Good root-cause question. |
| D10-Q03 | Keep | Good lessons-to-controls question. |
| D10-Q04 | Keep | Good trend-monitoring question. |
| D10-Q05 | Keep | Good change-control fraud lens. |
| D10-Q06 | Keep | Good leadership effectiveness-review question. |

## Items That Need the Most Copy Attention

These are not blockers for scoring, but they should be prioritised in the dedicated methodology-copy PR:

1. D1-Q04: simplify distinction between management ownership and internal audit assurance.
2. D2-Q07: make insider/access-abuse wording more practical.
3. D2-Q08: add examples for customer platforms, loyalty, digital forms or service ecosystems.
4. D3-Q05: add examples for sensitive manual activities.
5. D3-Q07: simplify high-risk role oversight language.
6. D4-Q03: shorten the list of detection methods.
7. D4-Q07: make independent review relevant for small/non-corporate organisations.
8. D6-Q05: clarify when external stakeholder whistleblowing is applicable.
9. D7-Q07: add examples for partnerships and intermediaries.
10. D8-Q01: clarify identity verification outside financial services.
11. D8-Q04: distinguish sensitive-system access from general operational access in D3-Q04.
12. D8-Q08: tighten identity misuse/account takeover wording.
13. D9-Q06: avoid asking one respondent to overstate how all employees feel.

## Recommended Next Methodology PR

Create a dedicated PR called:

`Polish V1 methodology question copy and exposure guidance`

That PR should:

- keep the same 10 domains, 68 question codes and weights;
- preserve current critical and hard-gate flags unless deliberately approved;
- refine prompts and help text only;
- add visible examples to exposure-factor guidance;
- update fixtures only if wording snapshots are asserted;
- avoid changing scoring logic;
- include a migration/seed update and a clear note that wording changed but methodology structure stayed stable.

## Not Changed and Why

No question text was changed in the closeout branch because question wording is methodology content. Changing it casually inside a route-polish PR would make it harder to explain which scoring version respondents saw, especially once real client data exists.

The right path is a clean methodology-copy PR with reviewable wording changes and a clear approval decision.
