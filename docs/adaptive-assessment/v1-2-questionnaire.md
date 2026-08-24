# MK Fraud Readiness Adaptive Assessment V1.2 — revised owner-review questionnaire

Candidate version: MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821
Candidate fingerprint: 6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7
Status: revised draft candidate only; not published, not active and not connected to customer start.

## Response scale for every scored capability

| Value | Customer label | Meaning |
|---:|---|---|
| 0 | Not in place | The capability is absent or is not recognised as required. |
| 1 | Informal / reactive | Some activity occurs, but it is informal, reactive or dependent on individual effort. |
| 2 | Partly designed | The capability has been partly designed, but important elements are incomplete or inconsistent. |
| 3 | Implemented in key areas | The capability operates in key areas, but coverage or consistency is not yet organisation-wide. |
| 4 | Consistently operating | The capability is defined, operating consistently and supported by evidence. |
| 5 | Embedded and improving | The capability is measured, governed and deliberately improved over time. |
| — | I don't know / cannot confirm | Separate unconfirmed state; retained in scope and receives no readiness credit. |

Not applicable is never a maturity answer. It is available only when a factual gateway proves the activity is absent.

## Sequential gateways

| # | ID | Customer question | Customer options | Asked when |
|---:|---|---|---|---|
| 1 | G01 | What best describes your organisation’s main operating environment? | Professional services / Retail or consumer-facing / Construction or project delivery / Technology, digital or platform services / Manufacturing or production / Public, nonprofit or member-based / Other or mixed / I don't know / cannot confirm | Always |
| 2 | G02 | How many people work for the organisation, including regular employees? | 1–9 people / 10–49 people / 50–249 people / 250–999 people / 1,000 or more people / I don't know / cannot confirm | Always |
| 3 | G03 | Does the organisation use external suppliers, contractors or service providers? | Yes / No / I don't know / cannot confirm | Always |
| 4 | G04 | Who is primarily responsible for supplier onboarding and ongoing supplier management? | Our organisation / A group or shared-service function / An external service provider / A shared or hybrid model / I don't know / cannot confirm | Only when G03 = Yes |
| 5 | G05 | Who is primarily responsible for procurement and sourcing? | Dedicated internal procurement or sourcing function / Business owners or managers / A group or shared-service function / External service provider / Shared or hybrid model / No defined procurement or sourcing process / I don't know / cannot confirm | Always |
| 6 | G06 | Does the organisation handle physical cash as part of normal operations? | Yes / No / I don't know / cannot confirm | Always |
| 7 | G07 | Does the organisation hold or manage stock, inventory or valuable physical assets? | Yes / No / I don't know / cannot confirm | Always |
| 8 | G08 | Who is primarily responsible for delivering payroll? | Our organisation / A group or shared-service function / An external payroll provider / A shared or hybrid model / The organisation does not run payroll / I don't know / cannot confirm | Always |
| 9 | G09 | Which statement best describes the organisation’s customer or user digital channels? | Our organisation operates them / A third-party platform operates them / Our organisation and third-party platforms both operate them / We do not operate customer or user digital channels / I don't know / cannot confirm | Always |
| 10 | G10 | Does the organisation accept customer or user payments through card, online, app, portal or other digital channels? | Yes / No / I don't know / cannot confirm | Always |
| 11 | G11 | Does the organisation handle personal or identity information about customers, users, employees or suppliers? | Yes / No / I don't know / cannot confirm | Always |
| 12 | G12 | Can people make manual financial, stock or similar record adjustments? | Yes / No / I don't know / cannot confirm | Always |
| 13 | G13 | Does the organisation operate from more than one site, store or project location? | Yes / No / I don't know / cannot confirm | Always |
| 14 | G14 | Does the organisation use temporary, seasonal or subcontracted workers? | Yes / No / I don't know / cannot confirm | Always |
| 15 | G15 | Can people access systems or organisation data remotely? | Yes / No / I don't know / cannot confirm | Always |
| 16 | G16 | Which approval arrangement normally applies to higher-risk payments or significant spending? | One person within the organisation / Two or more people within the organisation / A group or shared-service function / An external service provider / No defined approval arrangement / I don't know / cannot confirm | Always |
| 17 | G17 | Does the organisation use agents, brokers, distributors or other intermediaries? | Yes / No / I don't know / cannot confirm | Always |

G04 is not asked when G03 is unknown. Supplier exposure remains conservatively in scope without forcing a responsibility answer the respondent cannot logically give. Routing values are implementation metadata and are not customer labels.

## Scored controls

| # | ID | Domain | Customer wording | Construct | Weight | Origin | Applicability | Critical / hard gate |
|---:|---|---|---|---|---:|---|---|---|
| 1 | D1-Q01 | Fraud Leadership and Governance | A named senior owner is accountable for fraud risk management and has authority to drive action. | senior accountability | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 2 | D1-Q02 | Fraud Leadership and Governance | Fraud risk is recognised in the organisation's wider risk or governance framework. | D1-Q02 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 3 | D1-Q03 | Fraud Leadership and Governance | Fraud risks, incidents and control weaknesses are reported to senior leadership or a governance forum on a defined rhythm. | D1-Q03 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 4 | D1-Q04 | Fraud Leadership and Governance | Management owns fraud-risk decisions and control action. | management ownership | 1 | RETAINED | Always applicable | Critical / Hard gate |
| 5 | D1-Q05 | Fraud Leadership and Governance | Written guidance sets out how fraud should be prevented and detected, and how suspected fraud should be reported and handled. | written fraud guidance | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 6 | D1-Q06 | Fraud Leadership and Governance | Leadership receives updates on emerging fraud threats affecting the sector, operating model or customer and supplier environment. | D1-Q06 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 7 | D1-Q07 | Fraud Leadership and Governance | Fraud risk and key controls receive independent review appropriate to the organisation’s size and operating model. | independent assurance | 0.5 | SPLIT from D1-Q04 | Always applicable | Not critical / Not hard gate |
| 8 | D10-Q01 | Continuous Improvement and Fraud Risk Monitoring | The organisation periodically reviews its fraud risks and control environment. | D10-Q01 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 9 | D10-Q02 | Continuous Improvement and Fraud Risk Monitoring | Fraud incidents or control failures are analysed to understand root causes and control weaknesses. | D10-Q02 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 10 | D10-Q03 | Continuous Improvement and Fraud Risk Monitoring | Lessons from investigations or incidents are translated into control, process, training or monitoring improvements. | D10-Q03 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 11 | D10-Q06 | Continuous Improvement and Fraud Risk Monitoring | Leadership periodically reviews whether key fraud controls remain effective, resourced and fit for purpose. | D10-Q06 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 12 | D2-Q01 | Fraud Risk Identification | The organisation has completed a structured fraud risk assessment within the past two years. | D2-Q01 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 13 | D2-Q02 | Fraud Risk Identification | Fraud risks are mapped to the organisation’s important processes. | process-level fraud mapping | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 14 | D2-Q03 | Fraud Risk Identification | New systems, channels, products, services or operational changes include fraud-risk review before implementation. | D2-Q03 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 15 | D2-Q04 | Fraud Risk Identification | Fraud risks are refreshed when the organisation changes how it operates, serves customers or works with suppliers. | D2-Q04 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 16 | D2-Q05 | Fraud Risk Identification | Fraud risks linked to suppliers, contractors, agents, intermediaries or other third parties have been assessed. | D2-Q05 | 1.25 | RETAINED | No external supplier, provider or intermediary exposure was confirmed. | Not critical / Not hard gate |
| 17 | D2-Q06 | Fraud Risk Identification | The organisation monitors emerging fraud threats affecting its industry, geography or operating environment. | D2-Q06 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 18 | D2-Q07 | Fraud Risk Identification | The organisation considers how fraud could occur through misuse of authority, privileged access, approvals, system permissions or operational process gaps. | D2-Q07 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 19 | D2-Q08 | Fraud Risk Identification | The organisation considers how fraud could occur through customer or user platforms, online forms, WhatsApp journeys, loyalty programmes, service portals or other digital channels where relevant. | D2-Q08 | 1 | RETAINED | No relevant customer/user digital channel, digital payment or remote-access exposure was confirmed. | Not critical / Not hard gate |
| 20 | D3-Q01 | Operational Fraud Controls | High-risk processes have segregation of duties between initiation, approval, processing and reconciliation. | D3-Q01 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 21 | D3-Q02 | Operational Fraud Controls | Transactions or operational activities above defined risk or value thresholds require independent review or approval. | D3-Q02 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 22 | D3-Q03 | Operational Fraud Controls | Supplier onboarding verifies business identity, ownership and initial banking information before approval. | supplier onboarding checks | 1.5 | RETAINED | The organisation is not primarily responsible for supplier management; retained provider oversight is assessed where relevant. | Critical / Hard gate |
| 23 | D3-Q04 | Operational Fraud Controls | System and data access is granted against current role requirements. | access provisioning | 1 | RETAINED | Always applicable | Critical / Hard gate |
| 24 | D3-Q05 | Operational Fraud Controls | Refunds, credits, write-offs, stock adjustments, manual journals and overrides receive independent review where used. | manual adjustment review | 1.25 | RETAINED | No manual financial or stock adjustment capability was confirmed. | Not critical / Not hard gate |
| 25 | D3-Q06 | Operational Fraud Controls | Operational processes are periodically reviewed to identify control weaknesses or opportunities for manipulation. | D3-Q06 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 26 | D3-Q07 | Operational Fraud Controls | People in high-risk roles are subject to appropriate oversight, rotation, secondary review or other compensating controls. | D3-Q07 | 1 | RETAINED | No relevant cash, asset, adjustment or contingent-workforce exposure was confirmed. | Not critical / Not hard gate |
| 27 | D3-Q08 | Operational Fraud Controls | System and data access is reviewed periodically and removed when no longer required. | access recertification | 0.5 | SPLIT from D3-Q04 | Always applicable | Not critical / Not hard gate |
| 28 | D3-Q09 | Operational Fraud Controls | Payroll master-file changes and unusual payroll records receive review before payment. | payroll master and ghost-worker review | 0.5 | NEW | The organisation is not primarily responsible for payroll delivery; retained payroll oversight is assessed where relevant. | Not critical / Not hard gate |
| 29 | D3-Q10 | Operational Fraud Controls | Physical cash is counted, safeguarded and reconciled by defined people. | cash custody and reconciliation | 0.5 | NEW | No physical cash exposure was confirmed. | Not critical / Not hard gate |
| 30 | D3-Q11 | Operational Fraud Controls | Stock and physical assets are safeguarded and reconciled by defined people. | stock and asset custody | 0.5 | NEW | No stock or physical-asset exposure was confirmed. | Not critical / Not hard gate |
| 31 | D4-Q01 | Fraud Detection Capability | The organisation monitors transactions or operational activity for unusual patterns, anomalies or red flags. | D4-Q01 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 32 | D4-Q02 | Fraud Detection Capability | Exception reporting provides defined alerts for unusual transactions or activities and a documented review process. | exception reporting and review | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 33 | D4-Q03 | Fraud Detection Capability | Analytics, rules, reports or data checks are used to identify suspicious transactions, behaviour or control exceptions. | D4-Q03 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 34 | D4-Q04 | Fraud Detection Capability | Detection controls are updated when new fraud risks, fraud methods or operational changes emerge. | D4-Q04 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 35 | D4-Q05 | Fraud Detection Capability | Monitoring covers fraud and control misuse by people inside the organisation. | internal misuse monitoring | 0.5 | RETAINED | Always applicable | Not critical / Not hard gate |
| 36 | D4-Q06 | Fraud Detection Capability | People responsible for monitoring suspicious activity know when to escalate concerns and have authority to do so. | D4-Q06 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 37 | D4-Q07 | Fraud Detection Capability | Detection controls are periodically reviewed for effectiveness by management, risk, audit or another independent reviewer. | D4-Q07 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 38 | D4-Q08 | Fraud Detection Capability | Monitoring covers fraud threats from external parties relevant to the organisation. | external fraud monitoring | 0.5 | SPLIT from D4-Q05 | No external supplier, provider or intermediary exposure was confirmed. | Not critical / Not hard gate |
| 39 | D5-Q01 | Fraud Incident Response | The organisation has a documented process for responding to suspected fraud incidents. | D5-Q01 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 40 | D5-Q03 | Fraud Incident Response | Roles and decision rights are defined for fraud triage, investigation, escalation and case closure. | triage, investigation, escalation and closure decision rights | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 41 | D5-Q04 | Fraud Incident Response | Fraud investigations follow documented procedures that protect confidentiality and fair treatment and record key facts, decisions and actions. | investigation records and fair treatment | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 42 | D5-Q05 | Fraud Incident Response | Evidence linked to suspected fraud is identified, preserved and handled appropriately. | D5-Q05 | 1.5 | RETAINED | Always applicable | Critical / Hard gate |
| 43 | D5-Q06 | Fraud Incident Response | External specialists are considered when incidents require forensic, legal, cyber or investigative expertise. | D5-Q06 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 44 | D6-Q01 | Whistleblowing and Reporting Culture | The organisation provides a confidential or anonymous channel for reporting suspected fraud or misconduct. | D6-Q01 | 1.5 | RETAINED | Always applicable | Critical / Not hard gate |
| 45 | D6-Q02 | Whistleblowing and Reporting Culture | Employees know how to recognise suspected fraud and use the reporting channel. | reporting channel awareness | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 46 | D6-Q03 | Whistleblowing and Reporting Culture | Reports submitted through the channel are reviewed independently from the people or teams implicated. | D6-Q03 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 47 | D6-Q04 | Whistleblowing and Reporting Culture | The organisation clearly communicates that retaliation against whistleblowers or people who raise concerns is prohibited. | D6-Q04 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 48 | D6-Q05 | Whistleblowing and Reporting Culture | Relevant external stakeholders have an appropriate way to report suspected fraud or misconduct. | external stakeholder reporting access | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 49 | D7-Q01 | Third-Party and Supply Chain Fraud Risk | Suppliers, contractors or other third parties are subject to due diligence before being engaged. | D7-Q01 | 1.5 | RETAINED | The organisation is not primarily responsible for supplier management; retained provider oversight is assessed where relevant. | Critical / Not hard gate |
| 50 | D7-Q02 | Third-Party and Supply Chain Fraud Risk | Procurement processes include safeguards against collusion, manipulation, bid rigging or favouritism. | D7-Q02 | 1.25 | RETAINED | The organisation is not primarily responsible for procurement; retained provider oversight is assessed where relevant. | Not critical / Not hard gate |
| 51 | D7-Q03 | Third-Party and Supply Chain Fraud Risk | Employees are required to disclose and manage conflicts of interest involving suppliers or third parties. | D7-Q03 | 1.25 | RETAINED | No external supplier, provider or intermediary exposure was confirmed. | Not critical / Not hard gate |
| 52 | D7-Q04 | Third-Party and Supply Chain Fraud Risk | Supplier payments include checks for invoice manipulation, false vendors and supplier bank-detail changes. | supplier payment integrity | 1.5 | RETAINED | The organisation is not primarily responsible for supplier management; retained provider oversight is assessed where relevant. | Critical / Hard gate |
| 53 | D7-Q05 | Third-Party and Supply Chain Fraud Risk | High-risk suppliers or third-party relationships are periodically monitored or reviewed. | D7-Q05 | 1 | RETAINED | The organisation is not primarily responsible for supplier management; retained provider oversight is assessed where relevant. | Not critical / Not hard gate |
| 54 | D7-Q06 | Third-Party and Supply Chain Fraud Risk | Procurement or vendor-management activity is subject to oversight or periodic review. | D7-Q06 | 1 | RETAINED | The organisation is not primarily responsible for procurement; retained provider oversight is assessed where relevant. | Not critical / Not hard gate |
| 55 | D7-Q07 | Third-Party and Supply Chain Fraud Risk | Fraud risks are considered when using agents, brokers, distributors, intermediaries, partners or outsourced service providers where relevant. | D7-Q07 | 1 | RETAINED | No external supplier, provider or intermediary exposure was confirmed. | Not critical / Not hard gate |
| 56 | D8-Q01 | Digital and Identity Fraud Risk | The organisation verifies the identity of customers, users, employees, suppliers or counterparties where identity misuse could create fraud loss or harm. | D8-Q01 | 1.5 | RETAINED | No relevant identity or digital exposure was confirmed. | Critical / Hard gate |
| 57 | D8-Q02 | Digital and Identity Fraud Risk | The organisation monitors suspicious access, account or transaction behaviour across its relevant systems and digital channels, including through provider reporting where a third party operates the channel. | coherent digital monitoring | 1.5 | RETAINED | No relevant customer/user digital channel, digital payment or remote-access exposure was confirmed. | Critical / Hard gate |
| 58 | D8-Q03 | Digital and Identity Fraud Risk | Employees receive training on phishing, social engineering and digital impersonation attempts. | D8-Q03 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 59 | D8-Q04 | Digital and Identity Fraud Risk | Access to sensitive systems, administrator rights and confidential data is restricted. | sensitive access restriction | 1 | RETAINED | Always applicable | Critical / Hard gate |
| 60 | D8-Q06 | Digital and Identity Fraud Risk | Employees and users know how to report suspicious digital activity or account-security concerns. | D8-Q06 | 1 | RETAINED | No relevant customer/user digital channel, digital payment or remote-access exposure was confirmed. | Not critical / Not hard gate |
| 61 | D8-Q07 | Digital and Identity Fraud Risk | Emerging digital fraud risks relevant to the organisation's operations or sector are reviewed periodically. | D8-Q07 | 1 | RETAINED | No relevant customer/user digital channel, digital payment or remote-access exposure was confirmed. | Not critical / Not hard gate |
| 62 | D8-Q08 | Digital and Identity Fraud Risk | The organisation can detect identity misuse, account takeover or impersonation. | identity misuse detection | 1 | RETAINED | No relevant identity or digital exposure was confirmed. | Critical / Hard gate |
| 63 | D8-Q09 | Digital and Identity Fraud Risk | Sensitive access and administrator rights are reviewed periodically. | sensitive access review | 0.5 | SPLIT from D8-Q04 | Always applicable | Not critical / Not hard gate |
| 64 | D8-Q10 | Digital and Identity Fraud Risk | The organisation can investigate and contain identity misuse, account takeover or impersonation. | identity misuse response | 0.5 | SPLIT from D8-Q08 | No relevant identity or digital exposure was confirmed. | Not critical / Not hard gate |
| 65 | D9-Q01 | Fraud Culture and Awareness | Employees receive periodic training or guidance on fraud risks relevant to their roles and the organisation's operating environment. | D9-Q01 | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 66 | D9-Q02 | Fraud Culture and Awareness | Fraud awareness is included in employee onboarding or induction. | D9-Q02 | 1 | RETAINED | Always applicable | Not critical / Not hard gate |
| 67 | D9-Q03 | Fraud Culture and Awareness | Leadership communicates clear expectations on ethical conduct, conflicts of interest, fraud prevention and the consequences of misconduct. | leadership expectations and misconduct consequences | 1.25 | RETAINED | Always applicable | Not critical / Not hard gate |
| 68 | D9-Q05 | Fraud Culture and Awareness | Fraud awareness uses practical examples or scenarios. | scenario-based awareness | 1 | RETAINED | Always applicable | Not critical / Not hard gate |

## Retained oversight variants

| # | ID | Base control | Customer wording | Weight policy |
|---:|---|---|---|---|
| 1 | OV-D3-Q03 | D3-Q03 | The organisation retains assurance over supplier identity, ownership and initial banking checks performed on its behalf. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 2 | OV-D7-Q01 | D7-Q01 | The organisation defines and monitors the third-party due-diligence standard managed on its behalf. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 3 | OV-D7-Q02 | D7-Q02 | The organisation retains oversight of supplier selection, price integrity and conflict controls delivered on its behalf. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 4 | OV-D7-Q04 | D7-Q04 | The organisation independently verifies supplier payment controls, including bank-detail changes, performed on its behalf. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 5 | OV-D7-Q05 | D7-Q05 | The organisation receives and reviews risk information about high-risk third parties managed on its behalf. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 6 | OV-D7-Q06 | D7-Q06 | The organisation reviews procurement and vendor-management activity delivered on its behalf. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 7 | OV-D8-Q02 | D8-Q02 | The organisation reviews fraud, dispute and account-security reporting from the third-party platform it uses. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
| 8 | OV-G07 | D3-Q09 | The organisation independently reviews a payroll register processed on its behalf for unknown, duplicate or altered records. | Inherits the base control weight; shared/hybrid remains direct to avoid double-weighting. |
