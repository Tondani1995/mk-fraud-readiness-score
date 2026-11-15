# The existing report engines and the revised assessment

Integration, scoring-methodology and report-quality assessment for MK review, 11 November 2026, on `review/mk-integrated-readiness` at `72fd7a2`.

**Status: assessment only.** No engine, scoring rule, weight, classification, aggregation rule, risk ranking, price, product code, order, payment or fulfilment path has been changed. Nothing was pushed, merged or deployed. Production and shared preview were not touched. Every proposal below that sets a value or a rule is marked as an MK decision and is not implemented.

**What this answers.** MK's instructions of 11 November (15:14 and 15:17): keep the existing Free Snapshot, Essential and Comprehensive engines, their report-generation infrastructure and commercial pathways; adapt them to consume the revised adaptive assessment; substantially enhance their scoring, analysis and report content so that they use the richer bank; preserve unknowns as uncertainty; keep historical results reproducible; and return, before significant code changes, with the pipeline as implemented, the input compatibility, the minimal changes, a quality plan per product, the methodology proposal, and the regression tests and acceptance criteria. It supersedes the direction of the earlier "Phase 2 standard report" (`REPORT-ENGINE-PHASE-2.md`): there will be no second report-generation architecture, and the Phase 1 and 2 assets are reused inside the existing engines (section 10).

## Summary of findings

| # | Finding | Consequence |
|---|---|---|
| F1 | The revised bank cannot be translated mechanically into the 68 MFRS V1.2 questions the current calculator scores. The domain structures differ (only 11 of 68 best wording matches fall in the same domain code), most bank practices use a class scale rather than numbers, and wording similarity finds a strong candidate for only 9 of 68 (appendix). | Running the revised answers through the unchanged calculator would need a construct-by-construct mapping that only MK can author, and would discard most of the new intelligence. It is not the minimal path. |
| F2 | The infrastructure around the calculator is methodology-agnostic: score runs bind to a methodology version, persist domain results, question traces and cap events, support recalculation runs, and the paid engines read the run's own methodology version. | A new, explicitly versioned methodology can be added as a second calculator behind the same tables and contracts. Historical runs stay on their own version untouched. |
| F3 | 97 of the 137 scenario-confirmation controls in the bank are anchored questions on exactly the 0 to 5 scale, with the same six labels, that the current calculator normalises. | A confirmation-based scoring frame can reuse the existing response normalisation for most of its controls without inventing a treatment. The other 40 need MK-set values. |
| F4 | The report content (question playbooks, semantic families, risk pathways, domain playbooks, Snapshot domain content, operating context) is keyed to MFRS question, domain and gateway codes. The same domain code means different things in the two methods (D3 is "Operational Fraud Controls" in MFRS and "Ethics, integrity and anti-corruption" in bank 1.3). | The one essential structural change: report content lookups must be scoped by methodology version. The bank supplies much of the replacement content (scenarios, objectives, owners, target levels, records examples, risks); some playbook fields have no source and need MK content. |
| F5 | The current scoring assumptions that no longer hold: a fixed question set, numeric answers everywhere, applicability only from gateways, unknown handled only as missing data, no "not reached" state, criticality fixed per question with no scenario link, domain weights for another domain structure, and a locked single-respondent submission (section 3). | The proposed methodology (section 4) separates context, applicability, substantive controls, scenarios, dependencies and uncertainty, and scores only a defined frame of confirmation controls. Every value in it is for MK to set. |
| F6 | The revised inputs support materially deeper reports: 122 scenarios with mechanism and consequence, 114 objectives and 12 cross-cutting objectives linking weaknesses across areas, accountable owners for 121 modules, in-place descriptions for 133 practices, records examples for 133, named fraud risks for 755, incident history from 10 event questions, and outstanding information by function (section 5). | The quality plan (section 7) uses these within the existing Essential and Comprehensive pipelines, in the permitted evidence voice ("management should hold"), with no evidence review by MK. |
| F7 | One journey: the revised interview must end in the existing `assessments` record, Snapshot and order path, so customers answer once and orders keep working. The review store currently lives in a separate temporary project, and preview and production still share one project (B2). | A bridge from the review session to the existing assessment record is needed (section 6, C1), and it depends on B2 and the storage decision. |

## 1. The existing reporting pipeline as implemented

### 1.1 Intake and methodology

| Element | As implemented | Where |
|---|---|---|
| Methodology rows | `methodology_versions`, `domains` (code, name, weight %, core or support), `questions` (code, weight, critical, hard gate, control objective), `response_scale`, `recommendation_rules`, `exposure_factors` | `supabase/migrations/0003_phase5_methodology_seed.sql` and later; MFRS-V1.0, V1.1, V1.2-CANDIDATE-OWNER-CORRECTION |
| Two intake paths | (a) the full questionnaire, scored by `calculateFraudReadinessScore` with exposure factors (`src/lib/scoring/scoring-engine.ts`, called from `/score/api/assessments/{ref}/submit`); (b) the adaptive graph, scored by `calculateAdaptiveReadinessScore` (`src/lib/scoring/adaptive-scoring.ts`, called from `/score/api/adaptive/{ref}/submit`) | `src/lib/scoring/score-assessment.ts`, `src/lib/adaptive/server.ts` |
| Adaptive graph | 17 gateways (operating environment, headcount band, suppliers, procurement, cash, stock, payroll, digital channels, identity data, manual adjustments, sites, temporary workforce, remote access, payment approval, intermediaries), 68 control questions (46 always applicable, 22 factually conditional), 8 oversight variants for outsourced activities, 19 critical, 17 hard gates | `src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json`; activation by `adaptive_activation_policies` |
| Binding | A recorded read (`docs/interaction-release-gate/staging-readiness.md`) shows enabled `customer_start` policies for preview and production in the shared project, both on the V1.2 candidate graph | B2 |
| Responses | Gateway answers (strings); control responses `{ responseState: 'maturity' \| 'unknown', responseValue: 0..5 }`; N/A only from a factual gateway, never from a judgement or an unknown | `src/lib/adaptive/engine.ts` |
| Evidence guidance shown while answering | "What good evidence looks like", example artefacts and likely owner per question (G28 guidance) | `src/lib/adaptive/server.ts` |

### 1.2 Scoring (adaptive calculator)

| Step | Rule |
|---|---|
| Path | `resolveAdaptivePath` marks each control active, excluded (gateway), redirected (to an oversight variant), invalidated or profile-only |
| Normalisation | answer value ÷ 5 × 100, so 0, 20, 40, 60, 80, 100 |
| Domain score | weighted mean of known answers only (unknown and unanswered leave both sums) |
| Overall | weighted mean of scored domains by domain weight %; whole-domain exclusion drops the domain |
| Gaps | critical gap: critical control at 0 to 2; major gap: hard gate at 0 or 1; hard gate at 2 is flagged |
| Maturity | Reactive below 40, Developing 40 to 60, Structured 60 to 80, Strategic 80 and above (`src/lib/scoring/maturity-band.ts`), then caps: hard gate at 0 or 1, three or more critical gaps, or a core domain below 40 caps at Developing; hard gate at 2 or a core domain below 60 caps at Structured |
| Visibility | insufficient (score withheld) when coverage is under 70%, unknown weight 30% or more, or exclusions 40% or more; provisional from 20% unknown weight, any exclusion or redirect, or coverage under 90% |
| Persistence | `complete_adaptive_score_run_atomic`: `score_runs` (with methodology version, input hash, run number, run type `initial`, `admin_recalc`, `correction_recalc` or `test_fixture`), `score_domain_results`, `score_question_traces`, `maturity_cap_events`, adaptive metrics and gateway answers |

Known defect, owner-reserved: the calculator is known-only, but a provisional result carries the sentence "Unknown responses remain within the scored denominator" (`LEGACY-UNKNOWN-SCORING.md`). The visibility-gap text it stores also says the owner is "to be confirmed during evidence review" and recommends that the control evidence be "independently verified", which reaches the Snapshot management view (`src/components/clarity/DomainReadinessMap.tsx`).

### 1.3 Free Snapshot

`loadFreeSnapshotByReference` builds the Snapshot from the current score run (`src/lib/snapshot/free-snapshot.ts`): overall score, calculated and final maturity, domain scores and coverage, critical gap counts, limitations; `buildCommercialSnapshotInsights` adds domain insight text from `DOMAIN_CONTENT_BY_CODE` (MFRS domains) and a priority-area preview; `next-step-recommendation.ts` (rules C1 to C8) suggests Essential or Comprehensive. Catalogue promise: "Overall readiness score and maturity position", "Executive interpretation", "Priority-area preview".

### 1.4 Orders and entitlement

`src/lib/commercial/product-catalogue.ts` is the only place prices live: `free_snapshot` R0, `essential_self_assessment` R7,500 incl. VAT, `mk_validated_assessment` (Comprehensive) R35,000 incl. VAT, Advisory with no product code and a presentation floor of R150,000 excl. VAT. A paid order is created against an existing `assessments` record with its private Snapshot token (`/score/api/assessments/{ref}/paid-order`); Essential and Comprehensive are separate orders; price versions protect older orders (`order-price-entitlement.ts`); EFT payment is verified before fulfilment.

### 1.5 Essential

`generatePremiumReport` (`src/lib/reports/premium-report-service-core.ts`): `assembleReportData` reads the order, assessment, current score run, domain results, all question traces, gateway answers, cap events, exposure answers, recommendation rules and price versions into `AssembledReportData` (`src/lib/reports/types.ts`); the deterministic evidence model (`src/lib/reports/evidence-model/`) builds material findings (selection by hard gate, critical control, cap event, gap class, contradictions), risks and pathways, scenarios, leadership decisions, roadmap with dependencies and visibility gaps; the narrative layer (`src/lib/reports/narrative/`) builds the Fact Pack, Story Plan and Report Blueprint, calls the AI writer, validates the manuscript (factual, assurance-boundary, editorial, mechanical-language gates); the PDF is rendered, the eight-sheet workbook built, objects published to private storage, and delivery recorded. Controlling standard: `docs/product/MK_Fraud_Readiness_Reporting_Bible_v1.1.md`.

### 1.6 Comprehensive

Frozen v1.1 design (`docs/comprehensive/PRODUCT_DESIGN_FREEZE_v1.1.md`, `src/lib/reports/comprehensive/product-contract.ts`): deterministic assembly, management model and six registers, rendered without AI; bounded AI adds six interpretation slots in one provider call, validated per field (hard truth, semantic, quality). The contract forbids any reviewer, evidence-intake or sign-off dependency and lists what Comprehensive may analyse (including "evidence that management should hold") and must never claim. Its stated ceiling: "68 question responses on a 0..4 scale [sic: the V1.2 scale is 0 to 5], adaptive scope metadata and the organisation name", so monetary exposure, process-specific design, incident history, systems detail and named owners are out of contract.

### 1.7 Where the MFRS method is hard-wired into report content

| Module | Keyed to | What it supplies |
|---|---|---|
| `evidence-model/question-playbooks.ts` | 76 MFRS question codes | Control objective, expected standard, fraud mechanism, recommended design, accountable executive, process owner, frequency, evidence required, acceptable evidence, dependencies, difficulty, target period, effectiveness measure, escalation threshold, related scenarios |
| `evidence-model/semantic-mappings.ts` | 76 question codes | Semantic family and nine fraud-pathway families |
| `evidence-model/material-findings.ts`, `risk-pathways.ts`, `leadership.ts`, `contradictions.ts` | question and domain codes; domain score threshold 65 for "false comfort" | Selection, pathways, decisions, contradictions |
| `evidence-model/domain-playbooks.ts`, `narrative/premium-projection.ts`, `snapshot/commercial-insights.ts` | 10 MFRS domain codes | Domain narratives and Snapshot insight text |
| `narrative/operating-context.ts` | 17 gateway ids | Operating context for the narrative |
| `recommendation_rules` (database) | methodology and score band | 30, 60 and 90-day actions |

### 1.8 Baseline run here

On `72fd7a2`, without database or provider credentials: `g27:test-adaptive-scoring`, `g27:test-adaptive-correction`, `g25:test-adaptive-engine`, `bounded:test-essential-contract` (22 of 22), `v11:comprehensive-contract-gate`, `v11:snapshot-narrative` (28 of 28), `pdf:test-adaptive-semantics` and `v11:narrative-assurance` (6 of 6) pass. `v11:essential-presentation` needs the Rivonia certification artefact on MK's computer and did not run here. Suites with `--env-file=.env.local` (database, provider, live generation) were not run.

## 2. Input compatibility and mapping assessment

| Dimension | Existing engines expect | Revised assessment provides (bank 1.3, report input 1.2.0) | Classification |
|---|---|---|---|
| Question identifiers | `D{n}-Q{nn}`, 68 controls, persisted on traces and keyed into content | `D{n}-{module}-{nn}`, 902 live questions (912 with 10 retired) | **Incompatible as keys.** No crosswalk exists in the bank. Needs methodology-scoped keys (narrow change) |
| Domains | 10 MFRS domains with weights and core or support type | 10 different domains (D1 governance; D2 risk assessment; D3 ethics and anti-corruption; D4 third parties; D5 people and payroll; D6 finance and banking; D7 customers and revenue; D8 assets, cash and inventory; D9 digital and identity; D10 detection, speak-up and response), no weights | **Methodological incompatibility.** Domain weights and core status: MK decision |
| Answer structure | One numeric value or unknown per control | Typed answers with versions, `via`, `source`, `by`, optional detail (where it falls short, whether tested, whether a record could be shown) | Translate (current version at the run's log position); detail is additive |
| Response scale | 0 to 5 with six labels, normalised 0 to 100 | Anchored questions (133): the same 0 to 5 scale and labels. Practice (604): classes in place, partly, set out but not working, not in place, no case has tested it, not applicable. Choice (72): options mapped to classes. Multi (2) | **Anchored: compatible as is.** Classes: **MK decision** (no numeric treatment exists) |
| Weights, critical, hard gate | Per question | None. Scenario tiers 1 to 3 (a proposal under B4) set information-gathering order only | **MK decision** |
| Applicability | 17 gateways; N/A only from a gateway | 13 profile questions, 50 applicability questions, `appliesTo` (138), `relevantWhen` (131), `proportion` (133), `expectWhen` (7), sector assumptions; states out of scope, not expected at this size, precluded, assumed, applicability not yet known | Translate to the existing excluded state for recorded scope decisions; **narrow change** for "applicability not yet known" and "assumed" (no existing state) |
| Not applicable answers | Not available from a judgement | A practice may be answered "not applicable" | **MK decision**: treat as a scope decision (excluded) or as a response needing confirmation |
| Unknown | `unknown` response, known-only denominator, visibility thresholds | "I don't know" routes the question to an accountable function; it stays open until answered, then carries the owner's answer with `source: owner-answer` | Compatible in principle (known-only); **narrow change** for the owner route and re-scoring |
| Unanswered | Only an incomplete submission | "Not reached" because the interview ended at its screen limit (413 controls in the fictional sample); "depends on a question not yet answered" (69) | **Narrow change**: a state for each, outside the denominator |
| Dependencies | `redirectWhen` to oversight variants; upstream invalidation | `askWhen` (235), `dependsBecause` (122), precluded dependents | **MK decision** on how a parent's absence treats its dependents (no double count) |
| Scenarios | Nine pathway families derived from question codes | 122 scenarios with mechanism (`how`), consequence (`why`), confirmation, follow-up and related questions, routes and applicability conditions | Additive input; **MK decision** whether to keep the nine families as a presentation grouping |
| Exposure | Exposure factors on the full questionnaire; adaptive results carry `exposureScore: null` | Scenario applicability from profile and context answers; 10 event questions on incidents in the last three years | Additive; no exposure score proposed |
| Corrections | Locked submission; recalculation runs by admin | Versioned corrections in the stored log | Translate: each recalculation is a new run of type `correction_recalc` |
| Respondents | One respondent | Respondent plus accountable functions, each answer attributed | Additive (provenance on traces) |
| Lineage | Methodology version, graph version and fingerprint, input hash, run number | Report input digest, log digest and position, ruleset (engine, bank and coverage map hashes) | Compatible: store both on the run |
| Organisation and order binding | `assessments` row with Snapshot token; orders reference it | Review session in a separate store with role links | **Narrow change** (bridge, C1), dependent on B2 |

**Can the revised answers be translated into the 68 MFRS responses?** Not mechanically. `APPENDIX-MFRS-BANK-CANDIDATES.md` ranks, for each MFRS question, the three most similar bank practices by wording: 9 of 68 reach a similarity of 0.40, 17 fall below 0.25, and only 11 best matches sit in the same domain code. Some obvious human correspondences do not surface at all: "Fraud risks, incidents and control weaknesses are reported to senior leadership…" (D1-Q03) does not list "Board receives fraud reporting" (D1-B-01). A construct-level correspondence is possible for many MFRS questions, but it needs MK to decide each pairing and, where several bank controls answer one MFRS question, how to combine them. It would also leave the other 800 practices unused. It is therefore proposed only as an optional aid for reusing MK's 68 playbooks and for comparability statements (decision M-11), not as the scoring path.

## 3. Existing scoring assumptions that are no longer sufficient

| # | Assumption | Why it no longer holds | Effect if kept |
|---|---|---|---|
| A1 | Every applicable answered control contributes weight to the score | The revised interview asks follow-ups only when an earlier answer makes them necessary, so the number and mix of asked controls varies by organisation | The score would depend on the interview's path: an organisation asked more follow-ups would be scored on a different basis |
| A2 | Every control has a numeric answer | 678 of 811 practices (604 on the practice scale, 72 with descriptive options, 2 multi-select) have no numeric answer | No defensible score for most of the bank without MK-set values |
| A3 | Applicability comes only from 17 factual gateways | Applicability now comes from profile, applicability questions, proportion and sector assumptions, and can be unknown | Controls whose applicability is unknown would be scored as applicable or silently dropped |
| A4 | Unknown is missing data, closed at submission | Unknowns route to accountable functions and may be answered later | Results would freeze an uncertainty that the organisation is in the process of resolving |
| A5 | Unanswered means the respondent skipped | Most unasked controls were not reached because the interview stopped at its limit, or depend on an unanswered question | Not-reached controls could depress coverage percentages that drive "insufficient visibility", and be read as weakness |
| A6 | Criticality is fixed per question | Importance in the revised method comes from which fraud scenarios a control confirms and the organisation's exposure to them | Caps would not follow the organisation's actual scenarios |
| A7 | Domain weights for the MFRS domains | The domain structure changed | Weights cannot be carried over |
| A8 | False comfort is a strong domain score (65 or more) masking a critical weakness | The bank records contradictions directly: a core practice reported in place while its follow-up is reported absent; "set out but not working"; "no case has tested it" | Coarser, score-dependent false-comfort findings than the data allows |
| A9 | The exposure model exists | Adaptive results already carry no exposure score | Exposure statements have no basis; scenario applicability now provides one |
| A10 | One respondent, one locked submission | Several functions answer; answers are corrected with history | Provenance is lost in the traces and the workbook |

## 4. Proposed scoring methodology (for MK approval; nothing implemented)

**Principles.** One explicitly versioned methodology for revised assessments, executed by its own calculator behind the existing score-run contract. Only substantive control questions can contribute to a score, and only those inside a defined frame. Context, applicability and incident questions never score. An unknown, an unasked control or an unknown applicability never lowers a score and never becomes a weakness; it reduces visibility, which is reported. No control is counted twice through its dependents. Every value (frame, class values, weights, caps, thresholds) is set by MK before use.

### 4.1 Question roles

| Role in the revised bank | Count | Proposed treatment |
|---|---|---|
| Profile | 13 (plus the assumptions screen) | Never scored. Decide applicability, proportion and wording; supply the operating context to the narrative (replacing the 17 gateways) |
| Context | 31 | Never scored. Narrative context (for example, who leads the risk assessment, when it was last updated) |
| Applicability | 50 | Never scored. Decide scope. Unknown applicability puts the controls it governs outside the frame and inside "applicability not yet known" |
| Event | 10 | Never scored. Incident history for the narrative and scenario relevance; lifts part of Comprehensive's "actual incident history" exclusion, subject to MK (M-10) |
| Scenario confirmation | 137 (97 anchored, 32 practice, 8 choice) | **Candidate scoring frame** |
| Follow-up | 140 | Qualify a confirmation (explain a partial answer, reveal a contradiction); not added to the score in options A and B |
| Related | 615 | Depth for findings, registers and blueprints; not scored |
| Scope | 20 | Applicability of a scenario or area; not scored |

### 4.2 The scoring frame (decision S1)

| Option | Frame | For | Against |
|---|---|---|---|
| A (proposed) | Confirmation controls of the scenarios that apply to the organisation | Comparable across organisations whatever the path; tied to fraud scenarios; 71% already on the 0 to 5 scale | Detail practices do not move the score; their weight shows in findings and qualifiers |
| B | A plus follow-ups | More of the recorded practice counts | Follow-ups are asked only when needed, so the frame varies by path again |
| C | Every asked practice | Uses everything | Path-dependent; penalises organisations asked more questions; the problem A1 describes |

### 4.3 Response treatment (decision S2)

Anchored answers keep the existing normalisation (0 to 5 to 0 to 100), because the scale and labels are identical; no new treatment is needed. For practice and choice answers MK chooses: (i) a value per class, set by MK; (ii) no numeric value, with those controls reported as a class profile beside the score; or (iii) the frame restricted to anchored confirmations until values are approved. "No case has tested it" and "not applicable" need explicit rules (S3).

### 4.4 Uncertainty (decisions S4, S5)

| State | In the denominator | Reported as |
|---|---|---|
| Known answer in the frame | Yes | Its value |
| Unknown, routed to an accountable function | No | Outstanding information, with the function and why it is waiting |
| Not reached at the screen limit | No | Coverage of the frame |
| Depends on a question not yet answered | No | Coverage |
| Applicability not yet known | No (outside the frame) | Scope to be confirmed |
| Excluded by a recorded scope decision, not expected at this size | No (outside the frame) | Scope |
| Precluded by a parent reported absent | No | Under the parent, which carries the result (S6) |

The existing visibility mechanism is kept (score withheld below a threshold, provisional between thresholds), measured on the frame. MK sets the thresholds and decides whether a whole area with no visibility gets its own restriction. The contradictory limitation sentence and the "evidence review" visibility wording are replaced in the new version only; issued results keep theirs (section 8).

### 4.5 Scenarios, dependencies and qualifiers

- **Scenario layer (S7).** Each applicable scenario is classified from its confirmations: practice reported in place, gap indicated, cannot yet be decided (with why), or not applicable. This is a profile, not a score, and becomes the report's exposure picture. Whether scenario tiers feed criticality or caps is MK's decision; the tiers are currently a proposal setting only information-gathering order.
- **Dependencies (S6).** A dependent hidden because its parent is absent is not scored separately; the parent carries the result. Alternative for MK: dependents inherit the parent's class for display only.
- **Qualifiers (S8).** Candidate rules for "false comfort" from the responses themselves: a confirmation in place whose follow-up is partly or not in place; a practice "set out but not working"; a practice no case has tested; a policy reported in place within an objective whose operating practices are reported absent. Each would be a qualifier on a finding, never a separate penalty, and needs MK approval.

### 4.6 Areas, overall result and maturity (decisions S9 to S11)

Area results over the frame, by area, with their visibility. Overall result: MK chooses domain weights, equal weighting, or no overall figure until weights are approved. Maturity: the four-band contract (Reactive, Developing, Structured, Strategic) and its thresholds are kept for continuity unless MK changes them; caps are re-specified on the new frame (for example from tier 1 confirmations reported absent), which needs MK.

### 4.7 Runs and corrections

Each run is computed at a log position of the review session and stored with the report input digest, the log digest and the ruleset hashes beside the existing methodology version and input hash. Owner answers and corrections after the Snapshot create a new run of the existing type `correction_recalc`; a paid report binds to the run it was generated from.

## 5. What the revised inputs make possible in the reports

| Insight | Source | Existing stage that would use it | Products |
|---|---|---|---|
| Scenario-based exposure picture | 122 scenarios: applicability, confirmations, status, mechanism and consequence text | `evidence-model/scenarios.ts`, `risk-pathways.ts`; Fact Pack scenario structures | Snapshot (counts only), Essential, Comprehensive |
| Relationships between weaknesses | 12 cross-cutting objectives (for example "Changes to payment details are verified through a route the requester does not control", spanning D4, D5, D6, D7 and D9), 114 objectives, `dependsBecause` | Systemic themes, contradictions, control interdependencies | Essential themes; Comprehensive interactions |
| Why a practice falls short | Answer detail (where it falls short, whether tested) and follow-ups | Finding interpretation in the Fact Pack | Essential, Comprehensive |
| Target state | In-place level descriptions for 133 anchored practices | Expected standard and blueprint target state | Essential priorities; Comprehensive blueprints |
| What management should hold | Records examples for 133 practices; the respondent's own statement that a record could be shown | Proof-of-progress and evidence-requirement registers, in the permitted voice | Essential (proof requirements), Comprehensive (evidence requirements) |
| Ownership | Accountable owner for each of 121 modules; the function each waiting question went to | Accountable executive and process owner | Essential, Comprehensive operating model |
| Fraud risks named by the method | 755 practices linked to area risk lists | Risk register | Essential, Comprehensive |
| Incident context | 10 event questions | Executive diagnosis and scenario relevance | Essential, Comprehensive (M-10) |
| Outstanding information | Waiting items with function and provenance | Visibility section; first 30-day actions to obtain answers, never weaknesses | All three |
| Provenance | Answer versions, corrections, who answered | Question trace sheet in the workbook | Essential, Comprehensive |

Playbook fields the bank does not supply: operating frequency, minimum acceptable evidence characteristics, implementation difficulty, target period, effectiveness measure, escalation threshold and service levels. They need MK content for the frame controls, or reuse of the 68 MFRS playbooks where MK approves a correspondence (M-11); until then those fields are withheld, not generated.

## 6. Minimal code changes required (after MK approval)

| # | Change | Module | Why | Not changed |
|---|---|---|---|---|
| C1 | Bridge the revised interview into the existing `assessments` record, Snapshot token and score run, so customers answer once and orders work unchanged | new adapter beside `src/lib/scoring/score-assessment.ts`; review service | One journey; existing orders, entitlement and fulfilment | Catalogue, prices, product codes, order creation, payment, fulfilment |
| C2 | Register the revised methodology as a new version (domains, frame questions, response scale, rules), as a draft until MK approves | migration, methodology loader | Score runs and reports already resolve content by methodology version | MFRS rows |
| C3 | Calculator dispatch by methodology version; a new calculator producing the existing result shape plus additive metrics (scenario profile, outstanding information, frame coverage) | `src/lib/scoring` | Scoring for the new method without touching the old | `adaptive-scoring.ts`, `scoring-engine.ts` |
| C4 | Methodology-scoped content registry: question content, semantic grouping, domain content, operating context, recommendation rules | `evidence-model`, `snapshot/commercial-insights.ts`, `narrative/operating-context.ts` | Domain and question codes collide between methods (F4) | MFRS content |
| C5 | Additive `revisedAssessment` context on `AssembledReportData`, loaded from report input 1.2 (1.3 adds scenario text, objectives, owners, records examples, events) | `assemble-report-data.ts`, `report-input.ts` | Gives the engines the new intelligence | Existing fields |
| C6 | Evidence-model adapters for the new method: finding selection from the frame and qualifiers, scenarios from the bank, contradictions from qualifier rules, visibility from outstanding information | `evidence-model/*` | Better findings without a new engine | Selection for MFRS runs |
| C7 | Fact Pack facts and validator rules for the new inputs, porting the Phase 2 checks (unknown not weak, coverage kept distinct, no verification claim, provenance honest) into the existing gates | `narrative/fact-pack.ts`, `narrative/validation.ts`, quality gates | Accuracy and boundary | AI writer, renderer |
| C8 | Snapshot content for the new method and its paid boundary | `snapshot/*` | Clearer first picture without disclosing the paid diagnosis | Snapshot route, token, storage |
| C9 | Workbook question-trace sheet with states, provenance and outstanding information | `supporting-register-workbook.ts`, `comprehensive/workbook-builder.ts` | Traceability | Sheet structure of MFRS reports |

## 7. Report-quality improvement plan

| Product | Today | Improvement within the existing engine | Depends on |
|---|---|---|---|
| Free Snapshot | Score, maturity, domain scores, priority-area preview, next step | A clearer first picture: the result with its visibility stated once; areas in plain language; how many applicable scenarios are addressed, open or undecided; what is outstanding and with whom; what was not asked and why that is not a weakness. Boundary: no named findings list, no prioritised actions, no roadmap, no records guidance (those stay paid) | S1 to S11 for any score; C8 |
| Essential | Diagnosis, themes, 5 to 8 findings, 2 to 3 scenarios, 5 or 6 priorities, 30/60/90, eight-sheet workbook | Diagnosis grounded in the scenario picture; themes from cross-cutting objectives; each finding explained with the response detail and follow-ups; false comfort from qualifier rules; scenarios from the bank's own mechanism and consequence; priorities restating the in-place description with accountable owners from the method; proof of progress from records examples; first 30 days include obtaining outstanding answers; workbook trace with provenance | S1, S7, S8, M-4 to M-9; C4 to C7, C9 |
| Comprehensive | Six registers, management model, six interpretation slots, blueprints, 12-month programme | Interactions between weaknesses through shared objectives and dependencies; scenario register with status and why; treatment direction per scenario; blueprints with target state from level descriptions, records management should hold, owners and connected controls; governance guidance from the oversight objectives; implementation sequence that respects `dependsBecause`; registers for outstanding information and scope | Same, plus playbook content for blueprint fields (M-11) |

All outputs remain self-reported analysis: no evidence is reviewed and no assurance is given, in the existing contract's words; evidence review remains Advisory.

## 8. Historical reproducibility and versioning

| Mechanism | Existing | Proposed addition |
|---|---|---|
| Method binding | `score_runs.methodology_version_id`; reports read the run's own version, never the active one | New version for revised assessments, activated only after MK approval |
| Calculator | One calculator per path | Dispatch by methodology version; MFRS calculators frozen, with their tests pinned |
| Inputs | `input_hash`, graph version and fingerprint | Plus report input digest, log digest and position, ruleset hashes |
| Content | MFRS-keyed libraries | Content registry keyed by methodology version; MFRS content unchanged |
| Reports | Generation manifest with source SHA, bible version and file hashes | Plus methodology version and input digest |
| Issued results | Immutable | Never recalculated or regenerated under a new method; any correction is a new versioned run or report |

## 9. Side by side

| Aspect | Current methodology | Limitation | Proposed | Effect on reports |
|---|---|---|---|---|
| What is scored | 68 fixed controls | Path-independent only because the set is small | Confirmation frame of applicable scenarios (S1) | Scores comparable across organisations; findings reach the detail |
| Scale | 0 to 5 everywhere | Most new practices are classes | Anchored kept; classes by MK (S2) | No invented numbers |
| Applicability | 17 gateways | Coarse; no "not yet known" | Profile, applicability and proportion; unknown scope outside the frame | Scope stated precisely; nothing penalised for being unknown |
| Unknowns | Known-only; contradictory wording | Frozen at submission | Known-only on the frame; owner route; recalculation runs | Outstanding information shown as such, with owners |
| Criticality | Fixed flags | Not tied to scenarios | MK rules on scenario tiers (S7, S10) | Caps and priorities follow the organisation's scenarios |
| Exposure | Unused in adaptive | No basis | Scenario applicability and events | Exposure described, not scored |
| False comfort | Domain score threshold | Coarse | Qualifier rules from follow-ups and classes (S8) | Specific, explainable false-comfort findings |
| Relationships | Nine pathway families | Generic | Objectives, cross-cutting objectives, dependencies | Real cross-domain themes |
| Ownership | Playbook role families | Generic | Method owners and the functions that answered | Named accountable roles per finding |
| Records | Playbook evidence lists for 76 questions | Limited | Records examples for 133 practices, in the permitted voice | Practical "what management should hold" |

## 10. Reuse of the Phase 1 and Phase 2 work

| Asset | Use inside the existing engines |
|---|---|
| Report input 1.2.0 (replay-based, digest-bound) | The canonical input of the bridge (C1, C5) |
| Input gate and lineage check | Refuse a run whose input differs from one rebuilt from the stored log |
| Claims ledger and pointers | Stable fact references for the Fact Pack and provenance for the workbook trace |
| V04, V05, V14, V16, V17 and their mutation tests | Ported into the existing narrative and quality gates (C7) |
| Golden fictional sessions and pinned digests | Fixtures for the new calculator and the before-and-after examples |
| Coverage categories and routing explanation | Snapshot and methodology-section wording |
| Advisory record | Kept for Advisory; never in a fulfilment path (the Comprehensive contract already forbids it) |
| Standard report builder | Kept as a test oracle only; it is not a customer output and will not become one |

## 11. Regression tests and acceptance criteria

**Baseline (before any change).** The suites in 1.8, plus the environment-bound suites on an isolated environment once B2 allows: Essential real cases, Comprehensive gates, report lineage, entitlement and access suites.

**New tests.**

| Test | Proves |
|---|---|
| Historical replay | Every MFRS fixture and certified case (Rivonia, CASE-05f, CASE-06, CASE-11f, the six archetypes) produces byte-identical score runs, Fact Packs and deterministic registers before and after the change |
| Entitlement | Orders, price versions and report access behave identically; a revised-assessment order uses the same product codes and prices |
| Uncertainty properties | Turning a known answer into unknown, not reached or applicability unknown never lowers any score or adds a finding; an owner answer creates a new run |
| Path independence | Under option A, asking more follow-ups does not change the frame score |
| No double count | A parent reported absent does not also score its precluded dependents |
| Version isolation | A revised run never reads MFRS content, and an MFRS run never reads revised content |
| Boundary | No output claims MK reviewed or verified anything (existing `claimsVerification` plus the ported Phase 2 checks) |
| Fidelity | Every finding, scenario status and outstanding item in a report traces to the revised answers at the run's log position |
| Before and after | Fictional Snapshot, Essential and Comprehensive reports from the same revised sessions, before and after, assessed against the Reporting Bible's release dimensions |

**Acceptance criteria.** Historical outputs unchanged; entitlements unchanged; no score moves except through an MK-approved rule; unknowns never penalised; every new report claim traceable; the Bible's objective gates pass; MK's owner review at 9.5 on every material dimension; tier differentiation preserved (Snapshot shows no paid diagnosis; Comprehensive is distinguishable from Essential without covers).

## 12. Decisions reserved for MK

| # | Decision |
|---|---|
| S1 | The scoring frame (options A, B, C) |
| S2 | Values for practice classes and choice options, or no numeric value |
| S3 | Treatment of "no case has tested it" and of a practice answered "not applicable" |
| S4 | Visibility thresholds on the frame; whether a fully unconfirmed area has its own restriction |
| S5 | Whether a score is shown while accountable-function questions are outstanding, and for how long a paid report may wait for them |
| S6 | Dependents of a parent reported absent |
| S7 | Whether scenario tiers carry criticality |
| S8 | Qualifier ("false comfort") rules |
| S9 | Domain weights, equal weighting, or no overall figure |
| S10 | Maturity caps on the new frame |
| S11 | Whether the four bands and their thresholds carry over |
| M-1 | Whether the revised method replaces MFRS for new assessments, and from when |
| M-2 | The Snapshot's content and its boundary with Essential |
| M-3 | Prioritisation rule for Essential's first priorities and roadmap (the method sets none today) |
| M-4 to M-9 | Use of objectives for themes; owners from modules; level descriptions as target states; records examples as proof requirements; risk links; the nine pathway families or the bank's scenarios |
| M-10 | Use of incident-history answers in reports |
| M-11 | Whether to author MFRS-to-bank correspondences for playbook reuse and comparability (appendix) |
| M-12 | Whether the legacy unknown-wording defect is corrected for future MFRS runs (`LEGACY-UNKNOWN-SCORING.md`) |

## 13. Release blockers

The integration depends on, and closes none of: B1 (hosted verification of the review store; the bridge needs the review store and the assessment tables in the same isolated environment), B2 (staging isolation: preview and production share the project the customer-start policy binds), B3 (authenticated access for respondents, functions and management), B4 (method approval: section 12), B5 (commercial path: how revised assessments reach the existing products, now through the existing codes and prices), B6 (terms: several respondents, owner follow-up, outstanding information), B7 (copy: Snapshot and report wording), B11 (hydration error on large review pages) and J-01 (an unregistered answer). B8 to B10 remain as recorded.

## 14. Sequence once MK has decided

1. Baseline: run every existing suite on an isolated environment and pin the historical outputs (needs B2).
2. C2 and C3 with MK's methodology values; calculator tests and uncertainty properties.
3. C1 bridge and C5 context, behind the existing assessment and order paths.
4. C4, C6 and C7: content registry, evidence-model adapters, Fact Pack and gates.
5. C8 and C9: Snapshot and workbooks.
6. Before-and-after fictional reports for MK's owner review; iterate to the 9.5 standard.
