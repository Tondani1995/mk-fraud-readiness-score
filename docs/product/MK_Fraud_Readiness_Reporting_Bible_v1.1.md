# MK Fraud Readiness Reporting Bible v1.1

## Essential R7,500 and Comprehensive R35,000

**Controlling product-construction standard**  
**Supersedes Reporting Bible v1.0**

---

## 1. Purpose and status of this bible

This document is the controlling construction standard for the two paid MK Fraud Readiness reports: **Essential (R7,500 incl. VAT)** and **Comprehensive (R35,000 incl. VAT)**. It defines what each report is, what it is not, how the deterministic analytical engine and AI narrative layer must interact, how the report manuscript is created and validated, the reader journey for each tier, the writing and design rules, and the release standard.

It is deliberately a **product bible**, not an implementation prompt. Code, prompts, templates, quality gates, model calls and report renderers must conform to this document. If an implementation choice conflicts with this bible, the implementation must change unless the owner formally changes the bible.

### 1.1 The v1.1 change

Version 1.1 makes one architectural rule non-negotiable:

> **The report must be written as a validated manuscript before it is designed as a PDF.**

The deterministic engine establishes the analytical truth. AI converts that bounded truth into coherent advisory prose. A validator proves that the prose has not altered the deterministic truth. Only then may the renderer paginate and design the report.

The renderer is not a writer. A template is not a narrative engine. Structured assessment fields must never be stitched together and presented as advisory prose merely because the resulting PDF is technically valid.

### 1.2 Core doctrine

**Deterministic analysis establishes the truth. AI turns that truth into advisory prose. Validation proves that the prose has not changed the truth. The renderer publishes the validated manuscript.**

The corresponding product rule is:

**The narrative carries the report. Exhibits support the narrative. The workbook carries the detailed analytical record.**

A paid MK report is not a dashboard, questionnaire export, database printout or sequence of content cards. It is a coherent advisory explanation that moves the reader from diagnosis to implication to action.

---

## 2. The product ladder and commercial promise

MK Fraud Readiness has four distinct levels. Each must answer a different management question and must not borrow claims that belong to the tier above it.

| Tier | Price | Core management question | Product promise |
|---|---:|---|---|
| Free Snapshot | R0 | Is there enough here for me to worry about? | A concise score, maturity indication and high-level areas of concern. |
| Essential | R7,500 incl. VAT | Where do we stand, what matters most, and what should we fix first? | A decision-grade diagnosis of the self-assessed fraud-control environment, the most material exposure themes, the priority controls and a practical first 90-day response. |
| Comprehensive | R35,000 incl. VAT | What should our fraud-control environment look like, and how do we get from here to there? | A deeper strategic interpretation of the same assessment, converted into a target fraud-control environment, operating model, leadership decisions, management scorecard and 12-month transformation blueprint. |
| Advisory | From R150,000 | Is this really operating, and can you help us implement it? | Evidence requests, interviews, walkthroughs, operating testing, validation and implementation support. |

The simplest public articulation is:

**Essential — Diagnose it.**  
**Comprehensive — Diagnose it, interpret it and design the response.**  
**Advisory — Validate it and implement it.**

Comprehensive must never imply that MK independently verified operating effectiveness unless the engagement was separately scoped to obtain and review evidence. A human editorial or quality review is an internal production control; it is not a client assurance claim.

---

## 3. The five-layer report architecture

Every paid report must be built through five distinct layers. Each layer has one job and may not silently take over the role of another.

### 3.1 Layer 1 — Deterministic analytical engine: the analyst

The deterministic engine is the sole authority for substantive conclusions. It owns, at minimum:

- overall score and maturity;
- domain scores and domain ordering;
- question-level response interpretation;
- the complete finding universe;
- materiality and priority selection;
- critical / major / other classification where defined by methodology;
- risk relationships and priority;
- approved systemic-theme inputs and finding clusters;
- scenario-family selection and the specific control weaknesses that support each scenario;
- control-gap identification;
- approved control-response library and target-control components;
- action priority, dependencies and target periods;
- accountable role families where deterministically mapped;
- management-decision structures and approved option libraries;
- proof-of-progress requirements;
- all counts, ratios, dates and status values shown in the report.

AI may not change any of these.

### 3.2 Layer 2 — Narrative Fact Pack: the bounded source of truth

The deterministic engine must convert the analytical universe into a **Narrative Fact Pack** before AI is called.

The Fact Pack is not the report. It is a structured, machine-readable contract defining what the writer is allowed to say.

At minimum it must include:

- organisation name and any sector facts legitimately supplied by the customer;
- assessment reference and date;
- score, maturity and ten domain positions;
- response coverage and uncertainty facts;
- relative strengths supported by the self-assessment;
- selected systemic themes and the deterministic finding clusters supporting each theme;
- selected findings with factual condition, materiality, why-it-matters basis, approved risk relationships, approved control response, owner family and timing;
- selected risks and their approved causal pathways;
- selected scenario structures with actor class, opportunity, entry point, mechanism, bypassed control, concealment, consequence, warning indicators, containment and long-term response;
- selected control blueprints;
- selected management decisions and approved options/trade-offs;
- roadmap sequencing and dependencies;
- proof-of-progress requirements;
- explicit prohibited claims;
- stable reference IDs for every fact supplied to AI.

No raw database noise should be supplied merely because it exists. The Fact Pack should contain what is needed to write the report and no more.

### 3.3 Layer 3 — AI manuscript: the writer

AI is a constrained advisory writer and synthesiser. It is allowed to:

- turn deterministic facts into fluent management prose;
- explain what the score and maturity mean in practical terms;
- synthesise related deterministic findings into a cross-cutting management theme where the theme relationship is supplied or approved by the deterministic layer;
- explain why a pattern matters in straightforward fraud-risk language;
- write meaningful answer-first headings;
- write transitions that make the report read as one coherent argument;
- convert approved scenario structures into natural, plausible fraud narratives;
- explain approved control designs in clear operating language;
- explain approved management options and trade-offs without adding new options;
- write a useful management conclusion;
- tailor phrasing to the supplied organisation/sector context without inventing facts.

AI is forbidden to:

- invent a finding, risk, scenario, control gap, management decision or action;
- alter score, maturity, severity, owner, timing or priority;
- invent incidents, transactions, losses, customers, suppliers, systems, evidence or interviews;
- claim that a control is tested, supported, validated or independently verified without a separately scoped evidence-based engagement;
- invent Rand exposure values or loss estimates;
- infer a factual cause merely because it is plausible;
- select a scenario family not supplied by the deterministic engine;
- replace an approved control response with a different control because it sounds stronger;
- convert an uncertain response into a confirmed failure;
- soften a deterministic material finding until the meaning changes;
- make accusatory statements about management motives, competence or conduct.

### 3.4 Layer 4 — Narrative validator: the fact checker

Every AI-authored paragraph and heading must be validated against the Fact Pack before it is eligible for publication.

Validation must check at least:

- every number and percentage;
- score and maturity;
- domain names and positions;
- all factual claims about control condition;
- finding identity and materiality;
- risk and scenario family;
- owners and timing;
- control design meaning;
- decision options and trade-offs;
- uncertainty language;
- self-assessment / assurance boundary;
- invented incidents, facts or evidence;
- unsupported claims of causality;
- unsupported Rand values;
- any change from conditional risk language to factual allegation.

A failed narrative is rejected and regenerated or routed for human review. It is never silently repaired by crude string replacement.

### 3.5 Layer 5 — Report composer: the designer

Only validated manuscript content may be sent to the PDF composer.

The composer may:

- paginate;
- apply MK typography and visual hierarchy;
- insert deterministic scores and approved exhibits;
- insert compact factual panels;
- manage page breaks and whitespace;
- place source/limitations notes where required.

The composer may not create new customer-facing analysis. It may not build narrative sentences by concatenating field values. It may not turn an internal enum, question ID or priority score into customer prose.

---

## 4. Mandatory intermediate artefacts

A paid report generation run is incomplete unless the following artefacts exist internally:

1. **Deterministic analytical universe** — complete analytical output.
2. **Narrative Fact Pack** — bounded facts supplied to the AI writer.
3. **Report Story Plan** — deterministic section order, finding order, scenario order, control order and roadmap order.
4. **Plain-text Manuscript** — headings and narrative prose only.
5. **Narrative Validation Report** — pass/fail traceability for all material claims.
6. **Final PDF** — generated only from the validated manuscript and deterministic exhibits.
7. **Supporting Workbook** — complete detailed analytical record.
8. **Generation Manifest** — assessment reference, product tier, bible version, model/prompt version where applicable, exact source SHA, timestamp and file hashes.

The plain-text manuscript is a first-class product artefact for QA even though the customer normally receives only the designed report.

---

## 5. The manuscript-first release gate

Before PDF composition, export the report as plain text or Markdown containing only:

- headings;
- narrative paragraphs;
- short transition paragraphs;
- concise management implications;
- concise scenario narratives;
- concise conclusion.

Remove tables, cards, charts, scores-as-graphics, labels, colours and layout treatments.

The manuscript must still tell a complete, coherent and persuasive story from diagnosis to action.

### 5.1 Mandatory manuscript test

A manuscript fails if the reader cannot answer, from prose alone:

- Where does the organisation stand?
- What does that position actually mean?
- What are the few patterns driving the result?
- Which findings matter most and why?
- How could those weaknesses translate into fraud exposure?
- What should management do first?
- What should the organisation become over time?
- What should management take away from the report at the end?

If the manuscript fails, **do not generate the PDF**.

### 5.2 No template fallback rule

If the AI manuscript call fails, the system must not fall back to questionnaire-to-paragraph templates such as:

- “Within [domain], the specific control on whether…”;
- “The recorded control condition is engaged through…”;
- “An actor exploits the recorded control condition…”;
- “This recorded weakness affects a methodology hard gate…”;
- “Because the assessed control design does not meet the exact expected standard…” used as a generic risk statement.

A paid report must retry, use a separately owner-approved narrative fallback, or stop for human intervention.

---

## 6. MK narrative voice

MK writing must sound like a senior fraud-risk adviser explaining the organisation's position to capable executives.

The voice is **calm, precise, practical, authoritative and non-accusatory**. It uses South African / UK English. It should feel experienced rather than theatrical; confident rather than aggressive; plain rather than simplistic.

### 6.1 Narrative characteristics

The prose should:

- use connected paragraphs rather than fragments;
- explain the reasoning fully enough that a non-specialist executive can follow it;
- describe the organisation's position in simple fraud-risk language;
- distinguish clearly between what the assessment records and what that means;
- use organisation-specific synthesis rather than repeating questionnaire wording;
- vary sentence construction and paragraph length naturally;
- use headings that state the insight rather than label the database object;
- challenge management constructively;
- state priority and urgency without sounding accusatory;
- use conditional language where discussing possible fraud events;
- explain controls in operating terms;
- close sections with a management implication or a transition.

### 6.2 Advisory, not accusatory

The report should not write:

> Management failed to implement supplier controls.

Prefer:

> The assessment indicates that supplier controls are not yet designed or applied consistently enough to provide reliable protection against onboarding and payment-manipulation risk.

Do not write:

> The organisation cannot detect fraud.

Prefer:

> Detection capability remains relatively reactive, which increases the likelihood that suspicious activity is identified through complaints, reconciliations or external notification rather than through deliberate monitoring.

Do not write:

> This is a critical failure.

Prefer:

> This is one of the more material weaknesses in the current control environment because it affects both the organisation's ability to prevent misuse and its ability to identify it quickly when prevention fails.

The purpose is not to dilute the finding. The purpose is to communicate the same conclusion in a professional advisory voice.

### 6.3 Prohibited customer-facing language

Narrative prose must not expose:

- raw question IDs such as `D4-Q01`;
- internal finding/risk/action IDs;
- raw enums such as `control_failure`, `maturity_constraint` or internal priority scores;
- methodology implementation terms such as “hard gate”, “cap event” or “aggregate maturity result” unless the methodology section genuinely requires them and they are translated into plain language;
- database language such as “the named record”;
- AI/system language such as “the model identified”, “the engine selected” or “generated interpretation”;
- repeated “self-reported and not independently verified” on every finding;
- “evidence-linked” or “evidence-based” language where no evidence was actually reviewed;
- internal QA language or quality-gate rules.

The self-assessment boundary should be explained clearly once in the executive/methodology context, not repeated mechanically on every page.

---

## 7. Headings and transitions

### 7.1 Headings

Headings are part of the advisory argument. They should make a management claim.

Weak:

- Material finding 3
- Priority exposure 1
- Target control blueprint 2
- Fraud Detection Capability

Stronger:

- **Detection remains too dependent on reactive discovery**
- **Supplier and payment controls create a credible route for payment diversion**
- **Privileged access creates both execution and concealment opportunity**
- **The target state requires a deliberate monitoring capability, not ad hoc exception review**

AI may write the heading, but the heading must cite deterministic fact references internally and pass validation.

### 7.2 Transitions

Every major movement requires a short transition that explains why the reader is moving there.

Example after the executive diagnosis:

> The overall score shows the scale of the readiness gap, but it does not show where management attention will have the greatest effect. The next section therefore looks at the small number of themes that explain most of the organisation's current position.

Example before scenarios:

> These findings do not operate independently. Several can combine to create plausible fraud pathways in which one weakness provides the opportunity and another delays detection or containment. The scenarios below illustrate the pathways most relevant to the current assessment profile.

Transitions should not repeat the section heading. They should connect ideas.

---

## 8. Deterministic Report Story Plan

Before AI writes the manuscript, the deterministic layer must create a report-level Story Plan.

The Story Plan defines:

- the mandatory product movements;
- the order of systemic themes;
- the order of priority findings;
- the order of scenario families;
- the order of priority risks where they appear in the narrative;
- the order of target control designs;
- management-decision order;
- roadmap sequence and dependencies;
- the required conclusion;
- the purpose of every transition.

AI may improve section headings and expression, but it may not reorder material in a way that changes priority or analytical meaning unless the allowed ordering rule explicitly permits it.

### 8.1 Full-document context

#### Implementation addendum — whole-manuscript Blueprint architecture

The v1.1 implementation addendum inserts a deterministic **Report Blueprint** between the Story
Plan / Writer Brief and AI writing. The Blueprint owns the complete customer-facing chapter,
section, subsection, exhibit-placement and analytical-content-assignment contract. A future live
writer receives one complete Blueprint context and returns one complete manuscript; a minimum
coherent chapter partition is permitted only when measured context exceeds the approved model
limit. The earlier spine → independent section → coherence implementation remains a compatibility
path while migration is controlled and is not the target architecture.

This addendum does not change the Reporting Bible's product promise, assurance boundary,
deterministic truth authority, tier scope or renderer rules. Its implementation identifier is
`mk-reporting-bible-1.1-whole-manuscript-blueprint-v2`.

AI must not write isolated content fragments with no awareness of the report around them.

Each section call should receive at least:

- the report-level Story Plan;
- the executive diagnosis summary;
- the previous section's final paragraph or transition context;
- the current section's deterministic Fact Pack subset;
- the next section's purpose;
- the required conclusion for the current section;
- prohibited claims.

A final bounded editorial-coherence pass may improve transitions and remove repetition, but it may not add analytical facts.

---

## 9. Essential report — commercial purpose

Essential is the **diagnostic paid product**.

It must answer:

- Where does the organisation stand?
- What is driving that position?
- Which weaknesses matter most?
- How could the exposure plausibly materialise?
- What should management fix first over the next 90 days?

It is not a short Comprehensive. It is a complete decision-grade diagnosis in its own right.

### 9.1 Essential target length

Default target: **18–22 pages**.  
Acceptable range: **16–24 pages**.  
Hard maximum: **26 pages** unless the owner approves an exception.

Page count is not a value metric. If the narrative is complete in 19 pages, do not add an appendix merely to reach 22.

### 9.2 Essential reader journey

The report moves through six connected movements:

1. **Executive diagnosis** — where the organisation stands and what the result means.
2. **What is driving the result** — three to five systemic management themes.
3. **The findings that matter most** — priority weaknesses and management implications.
4. **How the exposure could materialise** — two to three plausible fraud scenarios.
5. **What management should do first** — priority controls, decisions and 30/60/90 response.
6. **Management conclusion** — what success over 90 days should look like and what happens next.

---

## 10. Essential report — default manuscript and page blueprint

Pagination may flex where narrative length requires it. The **sequence and purpose** are more important than forcing one object onto every page.

| Indicative pages | Movement | Construction standard |
|---:|---|---|
| 1 | Cover | Premium and restrained. Organisation, report title, reference, date and confidentiality. Do not promise “evidence-linked” analysis unless evidence was actually reviewed. |
| 2 | Contents and orientation | One short paragraph explaining the report journey, then a clean contents list. Do not use a full page to explain product mechanics. |
| 3–4 | Executive summary | Narrative-first. Score, maturity, what the result means, strongest reported areas, material weakness pattern, uncertainty that genuinely matters, and management's immediate priority. Pages must stand alone as an executive briefing. |
| 5 | Readiness profile | One clean ten-domain exhibit with 2–3 paragraphs interpreting the shape of the environment. Do not list scores without explaining the pattern. |
| 6–7 | What is driving the result | Three to five systemic themes. Each theme should synthesise related findings and explain why the pattern matters. |
| 8–13 | Priority findings | Usually five to eight findings. Use advisory narrative, not database cards. One finding may span more than one page if the content genuinely requires it. |
| 14–16 | Fraud scenarios | Two to three organisation-relevant scenarios written as natural fraud pathways. |
| 17–18 | Management priorities | Five or six first-priority control responses, summarised clearly. Detailed 10-element control specifications remain in the workbook. |
| 19–20 | 30/60/90 response | Sequenced management plan with owners, dependencies, deliverables and success measures. Use a readable horizontal or staged design, not narrow columns filled with long control text. |
| 21 | Methodology and limitations, if needed | One concise page at most. Explain self-assessment basis, uncertainty treatment and no independent validation. Suppress if the required disclosures can be handled elsewhere without losing clarity. |
| 22 | Management conclusion | Close the story in narrative form: current position, what must change, what success over 90 days looks like, and next step. |

If the report can close credibly before page 22, it should.

### 10.1 Essential executive-summary rule

The executive summary is the most important writing in the product.

If an executive reads only pages 3–4, they must understand:

- the score and maturity;
- the meaning of that position;
- whether the environment is uniformly weak or uneven;
- the strongest reported area(s);
- the two to four weakness clusters that matter most;
- why those clusters matter in fraud terms;
- what management should do first;
- any uncertainty that genuinely limits interpretation.

Do not issue and then disown the same score. If three responses are uncertain but 65 are known, explain that uncertainty precisely rather than declaring the entire result visibility-limited.

---

## 11. Essential section-writing standards

### 11.1 Systemic themes

Themes are not domain labels and are not individual questions. They are management-level patterns created from related deterministic findings.

A good theme:

- has a claim heading;
- draws on more than one finding where appropriate;
- explains the pattern in 2–4 paragraphs;
- shows how the pattern affects fraud prevention, detection, response or governance;
- closes with a leadership implication.

### 11.2 Priority findings

Each priority finding should read as an advisory observation.

Recommended construction:

1. **Claim heading** — what the finding means.
2. **Recorded position** — one concise sentence describing the relevant self-assessment condition.
3. **Interpretation** — one or two paragraphs explaining what that means in the organisation's broader control environment.
4. **Fraud implication** — how the weakness could create opportunity, delay detection, undermine response or create false comfort.
5. **Management implication** — what leadership should care about now.
6. **Compact factual strip** — domain, materiality, owner and target period.

Do not repeat the same self-assessment sentence in both “Diagnosis” and “Interpretation”.

Do not tell the client that the finding matters because it affects an internal methodology gate.

### 11.3 Fraud scenarios

A scenario must be a plausible fraud story, not a control description.

Every scenario structure must contain:

1. actor or actor class;
2. opportunity;
3. entry point;
4. fraud mechanism;
5. control bypass or weakness relied upon;
6. concealment or delayed-detection mechanism;
7. consequence;
8. warning indicators;
9. immediate containment;
10. long-term response.

The AI narrative should normally be written in connected prose, for example:

> A legitimate supplier's email account is compromised shortly before a scheduled payment. The attacker observes the existing correspondence and submits a bank-detail-change request using the supplier's normal invoice references and tone. If the change can be activated without an independent callback to a trusted contact already held on the vendor master, a genuine payment may be diverted without the fraudster needing to create a fictitious invoice.

A domain, maturity band or control condition can never be the “actor”.

### 11.4 Management priorities

Essential should show the five or six controls management should address first, not reproduce the complete control library.

For each priority, explain:

- why it is first-priority;
- what management needs to establish;
- accountable executive;
- practical owner;
- target period;
- one useful success measure.

The complete operating specification sits in the workbook.

### 11.5 Conclusion

Essential must end with a real advisory conclusion, not methodology, proof tables or a list of actions.

The conclusion should answer:

- What does the organisation need to recognise about its current position?
- Which few changes matter most?
- What should be true within 90 days?
- What is the sensible next step after implementation begins?

---

## 12. Comprehensive report — commercial purpose

Comprehensive is the **Fraud Readiness Strategy and Control Blueprint**.

It uses the same assessment answers as Essential. Its premium value does not come from pretending to have reviewed external evidence. It comes from what MK does with the deterministic diagnosis.

Comprehensive adds three layers of value:

### Diagnosis

Where does the organisation stand and what is driving that position?

### Interpretation

How do the findings interact, where does exposure concentrate, and what does that mean for this organisation?

### Design

What fraud-control environment should management build, how should it operate, what decisions are required and how should implementation progress over 12 months?

### 12.1 What creates the R35,000 value

The premium value comes from:

- deeper cross-domain synthesis;
- a more developed executive diagnosis;
- organisation-relevant fraud pathways;
- a small number of detailed target-state control blueprints;
- a target fraud-risk operating model;
- defined ownership and governance rhythm;
- leadership decisions and trade-offs;
- a 12-month transformation blueprint;
- management effectiveness measures and scorecard;
- a report that can support an executive or board discussion without requiring the customer to interpret a questionnaire.

It does not come from page count.

### 12.2 Comprehensive target length

Default target: **28–34 pages**.  
Acceptable range: **26–36 pages**.  
Hard maximum: **38 pages** unless the owner approves an exception.

The report must be shorter if the story is complete sooner.

---

## 13. Comprehensive report — default manuscript and page blueprint

| Indicative pages | Movement | Construction standard |
|---:|---|---|
| 1 | Cover | “Fraud Readiness Strategy and Control Blueprint”. Organisation, assessment reference, date, confidentiality. No named reviewer or evidence-assurance proposition. |
| 2–4 | Executive diagnosis | Start with what MK concluded, not how to read the product. Explain score/maturity, pattern beneath the score, strengths, material exposure themes and leadership priorities. |
| 5 | Scope and analytical basis | One concise page explaining the self-assessment basis and the boundary: strategic analysis and control design, not independent verification. |
| 6 | Readiness profile | Ten-domain exhibit with interpretation. Explain the shape of the environment, not just the table. |
| 7–8 | Systemic themes | Three to five cross-cutting themes and how they interact. No blank theme pages. |
| 9–14 | Material findings | Usually five to seven material findings in deeper advisory narrative. No raw IDs, enums or internal priority scores. |
| 15–18 | Fraud exposure and scenarios | Three to four organisation-relevant fraud pathways and the exposure themes they demonstrate. |
| 19–23 | Target fraud-control environment | Five priority control blueprints. Explain current state, target state, how each control should operate, what it connects to and how effectiveness should be measured. |
| 24 | Target fraud-risk operating model | Who owns fraud risk, who operates controls, who monitors, who investigates, who escalates and who provides oversight. |
| 25 | Leadership decisions | The few real decisions required from executives, with approved options and trade-offs. |
| 26–29 | 12-month transformation blueprint | 0–30 days, 31–90 days, months 4–6, months 7–12. Show progression, dependencies, owners and outcomes. Do not paste full control specifications into roadmap cells. |
| 30 | Management fraud-readiness scorecard | Practical measures, owners, frequency and escalation thresholds. |
| 31 | Methodology / limitations, if needed | Concise product boundary and scoring interpretation. No evidence-review architecture. |
| 32 | Management conclusion | Narrative close: where the organisation is, the transition required, what success should look like over the next 12 months, and route to Advisory if validation or implementation support is wanted. |

Additional pages are permitted only where the narrative genuinely requires them. No appendix is included by default.

### 13.1 Comprehensive executive-diagnosis rule

By the end of page 4, an executive must understand the full management story.

The report must not spend the first substantive pages explaining:

- product proposition mechanics;
- model architecture;
- evidence categories;
- validation states;
- reviewer process;
- raw methodology.

The customer paid to understand their fraud-readiness position. Answer that first.

### 13.2 Systemic-themes rule

A systemic-theme section may never render with a heading and no content. If the deterministic layer cannot support a meaningful theme, suppress it and adjust the manuscript plan.

### 13.3 Material findings

Comprehensive findings use the same analytical truth as Essential but provide deeper interpretation.

They should explain:

- the recorded condition;
- the broader control-system context;
- how the weakness interacts with other controls;
- the plausible fraud pathway;
- the management consequence;
- why the target-state design matters.

Do not use side-by-side “Diagnosis” and “Interpretation” blocks that repeat the same paragraph.

### 13.4 Target control blueprints

This is one of the main commercial differentiators.

Each blueprint must contain, in the workbook and deterministic model, the complete operating design:

1. control objective;
2. accountable executive;
3. process owner;
4. population;
5. frequency;
6. evidence/proof retained;
7. independent check or challenge;
8. escalation trigger and recipient;
9. SLA;
10. effectiveness measure;
11. failure response;
12. dependencies and connected controls where relevant.

The PDF should explain the blueprint in readable advisory prose with a compact specification panel. It should not reproduce every field as a full-page database record.

### 13.5 Target operating model

The operating model should explain, proportionately to the assessment:

- executive fraud-risk accountability;
- business/process control ownership;
- risk challenge and coordination;
- monitoring/detection responsibility;
- incident/investigation responsibility;
- escalation routes;
- management information;
- Audit Committee / Board oversight where relevant.

### 13.6 Leadership decisions

Decisions must be genuine executive choices, not generic categories.

For each priority decision the deterministic model should supply:

- decision question;
- at least three approved options where options are appropriate;
- cost/effort;
- benefit;
- trade-off;
- MK recommended route;
- rationale;
- owner;
- target decision date;
- consequence of delay.

AI explains these options; it does not invent them.

### 13.7 Twelve-month blueprint

The roadmap must show progression:

**Stabilise → Establish → Embed → Mature**

A typical progression is:

- **0–30 days:** establish accountability, close urgent control exposures and unblock dependencies;
- **31–90 days:** establish priority controls and first operating cycles;
- **Months 4–6:** embed repeatability, reporting and quality review;
- **Months 7–12:** mature effectiveness measurement, scenario refresh and management oversight.

Each phase should show outcomes, not walls of control text.

### 13.8 Conclusion

Comprehensive must end in narrative prose that answers:

- What does management need to recognise about the current environment?
- What transition is required?
- Which foundations matter most?
- What should success look like by 90 days and by 12 months?
- When would Advisory add value?

The objective is not merely a higher score. It is a control environment that management understands, owns, monitors and improves deliberately.

---

## 14. Tier differentiation

A reader should be able to distinguish Essential from Comprehensive even with the covers removed.

Essential provides:

- management diagnosis;
- cross-cutting themes;
- priority findings;
- two to three fraud scenarios;
- first-priority control response;
- 30/60/90 roadmap;
- concise proof-of-progress requirements.

Comprehensive adds:

- deeper interpretation of interactions between findings;
- more developed fraud-exposure narratives;
- target-state control blueprints;
- control interdependencies;
- target fraud-risk operating model;
- executive decisions and trade-offs;
- 12-month transformation blueprint;
- management fraud-readiness scorecard.

Comprehensive must not simply contain more findings or longer tables.

---

## 15. Appendix policy

There is **no appendix by default** in either paid PDF.

The workbook is the authoritative home for:

- full findings;
- full risk register;
- all question traces;
- detailed control specifications;
- detailed action register;
- proof requirements;
- technical traceability.

An appendix may be added only where it materially helps the reader understand or substantiate the report and cannot be handled cleanly in the workbook or a concise methodology section.

Examples that may justify a short appendix:

- a scoring explanation required for a specific client audience;
- a definitions page where terminology is genuinely necessary;
- a limited methodology note required for governance.

An appendix must never exist merely to increase page count or replicate the workbook.

---

## 16. AI manuscript-generation method

### Stage 1 — Deterministic analysis

Generate the complete analytical universe and selected paid-report subset.

### Stage 2 — Semantic graph

Resolve all relationships between findings, themes, risks, scenario families, controls, actions, owners, decisions and proof requirements.

No downstream artefact may rebuild these relationships independently.

### Stage 3 — Narrative Fact Pack

Create the bounded facts AI is allowed to use. Assign stable references to every material fact.

### Stage 4 — Deterministic Story Plan

Create the report-level sequence and required conclusion of every movement.

### Stage 5 — Executive narrative spine

Generate the executive diagnosis and the key story spine first. This establishes the voice and central argument that later sections must support.

The spine must be validated before the remaining manuscript is drafted.

### Stage 6 — Section manuscript drafting

Generate each major section with whole-report context. Each section receives the Story Plan, relevant Fact Pack, prior transition and next-section purpose.

### Stage 7 — Deterministic narrative validation

Validate every paragraph and heading against the Fact Pack.

### Stage 8 — Editorial coherence pass

Perform one bounded full-manuscript pass to:

- smooth transitions;
- remove repetition;
- standardise terminology;
- improve paragraph rhythm;
- preserve the MK voice.

The coherence pass may not add new analytical content. The resulting manuscript is validated again.

### Stage 9 — Manuscript owner-quality gate

Export `essential-manuscript.md` or `comprehensive-manuscript.md` and review it without layout.

If the manuscript does not read as an advisory report, stop.

### Stage 10 — Layout composition

Build the PDF from the validated manuscript and deterministic exhibits.

### Stage 11 — Visual and factual QA

Check final rendered pages for readability, clipping, whitespace, hierarchy, factual consistency and cross-artefact integrity.

### Stage 12 — Human owner release review

The actual PDF is read cover-to-cover by the owner. Objective gates are necessary but not sufficient.

---

## 17. AI narrative output contract

Every AI-authored section should return structured content equivalent to:

```json
{
  "section_id": "ESS-EXEC-01",
  "heading": {
    "text": "Rivonia's fraud controls are uneven, with the largest weakness concentrated in detection, third-party risk and fraud-risk identification",
    "claim_refs": ["SCORE-001", "DOMAIN-D2", "DOMAIN-D4", "DOMAIN-D7"]
  },
  "paragraphs": [
    {
      "id": "ESS-EXEC-01-P1",
      "text": "Rivonia Health Logistics' self-assessment produces a Fraud Readiness Score of 36 out of 100, placing the organisation in the Reactive maturity band...",
      "claim_refs": ["SCORE-001", "MATURITY-001", "ASSESSMENT-SCOPE-001"]
    }
  ],
  "transition": {
    "text": "The score shows the scale of the gap, but the next section explains the few patterns that are driving it.",
    "claim_refs": []
  }
}
```

The exact schema may differ, but every material claim-bearing paragraph must carry internal provenance.

### 17.1 Numbers

AI should not be responsible for reproducing numeric values from memory where avoidable. Scores, percentages, counts and dates should preferably be injected from deterministic fields into validated manuscript slots or checked exactly after generation.

### 17.2 Headings

AI headings must carry claim references and must be rejected if they overstate the deterministic position.

### 17.3 Scenario prose

AI receives the approved scenario structure and may narrate it, but the validator must confirm the actor, entry point, mechanism, control weakness and consequence family remain unchanged.

---

## 18. Narrative validation standard

Validation has two layers.

### 18.1 Factual validation

Fail the manuscript for:

- unsupported number;
- changed score or maturity;
- wrong domain result;
- invented finding;
- altered materiality;
- incorrect owner or timing;
- unsupported factual organisation statement;
- invented incident/evidence;
- scenario family mismatch;
- control response materially different from the approved deterministic control;
- uncertainty presented as confirmed failure;
- unsupported Rand amount;
- assurance/validation claim outside Advisory.

### 18.2 Advisory/editorial validation

Fail or route for rewrite where:

- executive summary merely repeats metrics;
- the manuscript starts with methodology rather than diagnosis;
- systemic themes are empty or are just domain labels;
- findings repeat questionnaire wording without interpretation;
- the same paragraph construction is used repeatedly;
- “Diagnosis” and “Interpretation” say substantially the same thing;
- scenarios are control descriptions rather than fraud pathways;
- an actor is a domain or maturity status;
- internal methodology terms dominate client prose;
- transitions are missing;
- conclusion is a bullet dump rather than a useful management close;
- the tone becomes accusatory;
- prose sounds like software or a generic LLM;
- the manuscript is technically correct but difficult to read.

The editorial validator may be a combination of deterministic checks and a bounded AI critic, but no AI critic may override deterministic facts.

---

## 19. Report design and readability

Design follows manuscript.

### 19.1 Visual character

MK should feel:

- senior;
- restrained;
- specialist;
- South African and commercially grounded;
- modern without looking like a dashboard product.

### 19.2 Page hierarchy

A typical narrative page should contain:

- one answer-first heading;
- two to four paragraphs;
- at most one primary exhibit or compact panel;
- generous whitespace;
- a clear reading order.

Not every page needs a chart, card or table.

### 19.3 Tables

Tables are used only where comparison or structure genuinely helps the reader.

Do not use a full-width table to avoid writing a narrative explanation.

Do not force long control designs into narrow roadmap columns.

### 19.4 Exhibits

Every exhibit must answer a management question. It should reinforce the manuscript rather than introduce a parallel story.

### 19.5 Footers

Footers should remain restrained: product, confidentiality and page number. Do not place internal QA rules, scenario completeness tests, control-design tests or source-manifest detail in customer footers.

---

## 20. Supporting workbook rules

The workbook is the complete analytical and implementation record.

### 20.1 Essential workbook — locked eight sheets

1. Read me
2. Findings
3. Risks
4. Control Actions
5. Evidence Checklist / Proof of Progress
6. Roadmap
7. Question Trace
8. Control Improvements

### 20.2 Comprehensive workbook — blueprint-oriented eight sheets

1. Read me
2. Summary
3. Material Findings
4. Risk Register
5. Control Blueprints
6. Implementation Blueprint
7. Management Decisions
8. Question Traceability

If the exact Comprehensive names change, the product bible must be updated before the implementation contract changes.

### 20.3 Workbook usability

- business-facing columns first;
- technical IDs to the right;
- freeze panes and filters;
- sensible widths and wrapped text;
- human-readable statuses;
- formula-injection safe;
- no requirement that a customer reads the workbook before understanding the main report.

---

## 21. Objective integrity gates

Objective gates prove correctness. They do not prove commercial excellence.

Generation must fail or block release for at least:

- score/maturity mismatch;
- wrong product tier;
- semantic mismatch between finding, risk, scenario, control, owner or proof;
- scenario title/mechanism mismatch;
- duplicated unrelated risk treatments caused by template cycling;
- raw internal IDs/enums in narrative surfaces;
- prohibited evidence-validation claims;
- impossible arithmetic or conflicting counts;
- missing required priority-control specification in the deterministic model/workbook;
- missing scenario components;
- untraceable AI paragraphs/headings;
- unsupported Rand amounts;
- malformed phrases caused by string replacement;
- blank or overflow pages;
- clipped text or owner names;
- empty thematic sections;
- roadmap phases that are materially duplicated without a valid reason;
- appendix pages that merely duplicate the workbook;
- manual post-generation edits to customer files;
- generation manifest missing bible version, exact SHA, assessment reference and file hashes.

### 21.1 Manuscript-specific gates

The generation pipeline must additionally fail if:

- no plain-text manuscript exists;
- a PDF contains substantive narrative that is not present in the validated manuscript;
- the executive summary contains no multi-paragraph narrative;
- the report contains repeated mechanical constructions above the approved threshold;
- the conclusion contains no narrative paragraph;
- more than a small defined percentage of body pages are primarily structured field labels rather than prose/exhibits;
- the report uses questionnaire wording as the main narrative for multiple findings;
- any narrative paragraph lacks provenance metadata in the manuscript artefact.

---

## 22. Human owner release standard

MK's release standard remains **9.5/10 on every material quality dimension**. No average can compensate for one weak dimension.

The owner reviews the actual manuscript and the actual PDF.

At minimum score:

1. immediate buyer value;
2. executive readability;
3. narrative flow;
4. quality of executive diagnosis;
5. analytical grounding;
6. fraud-specific insight;
7. cross-domain synthesis;
8. finding quality;
9. scenario realism;
10. risk reasoning;
11. control-design specificity;
12. implementation practicality;
13. owner correctness;
14. timing realism;
15. management-decision usefulness;
16. transition quality;
17. advisory / non-accusatory tone;
18. absence of mechanical cadence;
19. absence of generic AI voice;
20. South African operating relevance;
21. visual hierarchy;
22. typography;
23. whitespace and page rhythm;
24. exhibit usefulness;
25. editorial finish;
26. workbook usability;
27. cross-artefact consistency;
28. factual/count integrity;
29. tier differentiation;
30. Essential price justification;
31. Comprehensive price justification;
32. MK brand/reputation standard;
33. willingness to keep reading after page 2;
34. overall willingness to send the report to a CEO/CFO/Audit Committee without explanation or apology.

**Release rule:** any material dimension below 9.5 blocks release.

---

## 23. Permanent construction anti-patterns

The following are prohibited:

- starting with product mechanics or a dashboard instead of executive diagnosis;
- using a sequence of cards as a substitute for a narrative spine;
- listing many individual controls before explaining the management pattern;
- rendering raw question IDs, enums or priority scores in client prose;
- repeating the same finding paragraph with only the subject changed;
- explaining a finding mainly through methodology terminology;
- rendering empty theme/interactions pages;
- using “Diagnosis” and “Interpretation” columns containing substantially identical text;
- treating a control-domain label as a fraud actor or opportunity;
- using the assessment question itself as the scenario entry point;
- giving different risks the same generic treatment;
- mapping owners/evidence by row order or cycling templates;
- using evidence-review language where no evidence was reviewed;
- allowing AI to derive findings or change deterministic meaning;
- allowing deterministic templates to masquerade as AI narrative fallback;
- turning the roadmap into narrow columns containing full control specifications;
- ending the report with methodology, proof tables or a bullet dump rather than a conclusion;
- creating an appendix merely to reproduce workbook content;
- padding to reach a page target;
- confusing more pages with more value;
- declaring a paid report complete because the PDF rendered and automated gates passed.

---

## 24. Change control and implementation authority

This bible is version-controlled product policy.

Changes to the following require explicit owner approval:

- tier promise;
- price-linked scope;
- deterministic / AI analytical boundary;
- manuscript-first architecture;
- evidence-validation boundary;
- Essential or Comprehensive reader journey;
- target report length;
- required control/scenario standards;
- 90-day versus 12-month differentiation;
- appendix policy;
- Advisory boundary;
- human 9.5 release rule.

Implementation teams may improve code structure, prompt wording, model choice, rendering technology and internal test design without changing these product rules.

Every production generator must record the Reporting Bible version used to construct the report.

---

## 25. Final construction test

Before either report is released, read the **plain-text manuscript first**, then the designed PDF, and answer:

- Does the first substantive page tell me what MK concluded?
- If I stop after the executive summary, do I understand the organisation's position and what management should care about?
- Does the manuscript explain the pattern beneath the score rather than merely repeat the score?
- Does each section naturally create the need for the next?
- Could I understand the management story if every exhibit and table disappeared?
- Are findings written as advisory observations rather than questionnaire exports?
- Do scenario narratives contain real actors, opportunities, mechanisms and consequences?
- Are the controls and owners connected to the right fraud problem?
- Does Essential stay focused on diagnosis and first response?
- Does Comprehensive clearly design the target environment and 12-month blueprint?
- Does the report make any claim of validation that MK did not actually perform?
- Does any paragraph sound like software stitching fields together?
- Does any paragraph sound accusatory rather than advisory?
- Is the conclusion genuinely useful?
- Is every appendix page necessary?
- Would a serious executive keep reading after page 2?
- Would Tondani be comfortable sending every page to the CEO, CFO or Audit Committee of a serious South African organisation with the MK invoice attached?

If any answer is no, the report is not finished.
