# Staged assessment, scoring frame and report engines: recommendation and implementation plan

For MK review, 11 November 2026, on `review/mk-integrated-readiness`, continuing from `5b57946`.

**Status: research and plan.** Everything numerical here comes from simulations on fictional records and is **hypothetical**; scoring rules, weights, bands, caps and thresholds remain subject to MK approval. The research hooks wrap an instance of the vendored review engine; the engine file, everything under `src` and `supabase`, prices, entitlements, payment processing, assessment records, report fulfilment, historical assessments and issued reports are unchanged (checks D-08, D-09). Nothing was pushed, merged or deployed, and shared preview and production were not touched. B2, B3, B4, B5, B6, B7, B11 and J-01 remain open.

**What this answers.** MK's direction of 11 November (17:00): stop designing around the 95-screen ceiling; redesign completion so that materially relevant questions are reached through adaptive routing, stages, save and resume, progress and delegation; establish why the 534 related practices are never reached and which should be asked; compare a tier 1 frame, all confirmations and a broader frame; rework the report engines where the richer bank justifies it while keeping the products and their commercial infrastructure; demonstrate on the fictional profiles; and return with the implementation plan. It also answers the three issues set at 16:58: whether tier 1 measures the right things (including Assets, Cash and Inventory), what the unused depth adds to the paid reports, and false comfort with a consistency sample.

**Evidence.** `staged-assessment/RESULTS.md` (generated tables, cited as "S§"), `staged-assessment/depth-matrix.csv` (all 674 follow-up and related practices, classified), `staged-assessment/results.json`, and the earlier `methodology-simulation/` package (cited as "R§").

## Recommendation

**MK should adopt a broader final scoring frame completed through a staged assessment in one session: all applicable scenario-confirmation controls (frame A) as the Fraud Readiness Score, with tier 1 retained only as a labelled core indicator for the Free Snapshot, and the deeper answers used as defined qualifiers rather than as additional scored dimensions.** Of the three options set at 16:58:

| Option | Verdict | Why |
|---|---|---|
| Tier 1 core score only | **Not as the Fraud Readiness Score** | Tier 1 was chosen to fit questioning into 95 screens, not to define core readiness. It leaves out 25 scenarios that apply to every organisation (approval limits, bank mandate changes, journals and write-offs, payment recall, strong sign-in to payment systems, allegation intake, detection beyond accident and others), represents Assets, Cash and Inventory with two exposure-gated scenarios, and cannot supply the ten-domain exhibit both paid reports promise (D8 never has a figure; D3 not for the non-profit) |
| Tier 1 score supplemented by further self-reported analysis | **Right for the Snapshot only** | Tier 1 is complete after 50 to 81 respondent screens in every profile and its result is the same whichever path follows, which suits a free first picture. As the paid score it would leave tier 2 and 3 gaps unscored while the reports discuss them |
| Broader final frame completed through the existing workflow | **Recommended** | With the ceiling removed and the work staged, every simulated profile reaches all, or all but one, of its applicable confirmations (106 to 108; 49 of 50 for the small firm); the result no longer depends on the path; it gives all ten domains a figure; and the respondent's share stays at 94 to 166 screens across two stages, with the rest delegated by function |

Within that recommendation:

- **Frame A as scored**, every applicable confirmation once. The coverage practices (frame A+C) are a credible extension for a later methodology version but are not recommended for the first, because they were not written as confirmations (section 3.3).
- **A fixed ten-scenario consistency sample** in the core stage (one tier 1 scenario per domain), with a contradiction lowering only the confirmation it contradicts (F2) and any tier 1 contradiction limiting the band to Structured (F4); lack of information is reported separately and never treated as a contradiction (section 4).
- **Depth asked only where it reaches the reports**: for the eight priority gaps the reports present, the gap follow-ups and up to four diagnostic practices; the follow-ups of governance and response gaps for the target operating model; and up to two practices for each of the 17 objectives no confirmation covers. Everything else can stay unused without weakening any promised deliverable (section 2).

## 1. Completion logic: from a 95-screen interview to a staged assessment

### 1.1 How the current engine completes

| Mechanism | How it works now | Effect |
|---|---|---|
| Screen limit | `respondentScreenLimit: 95` (`contract.ts`); the engine ends with reason "ceiling" | A ceiling stop cannot be resumed (`resume()` refuses it) |
| Routing | Profile; reconfirmations; queued gap follow-ups (up to two per scenario, only after a confirmation reports a gap); tier 1 confirmations domain by domain; the activities screen; tier 2 and 3 confirmations | Follow-ups run first whenever room remains, so weaker organisations spend screens on follow-ups and reach fewer confirmations (R§4) |
| Reserve | Follow-ups run only while room remains for every open tier 1 confirmation | Tier 1 always completes within 95 screens unless the respondent stops |
| Delegation | The respondent can assign an area to an owner; "I don't know" assigns the question to the module's owner; "send to owners" packages the confirmation questions of unresolved tier 1 and 2 scenarios by eight functions | No package ever contains a related practice, a tier 3 scenario or a follow-up of a scenario reported in place |
| Save and resume | Every action is stored; respondent and owner links persist; `respondent.resume` reopens a stopped interview | Already sufficient for multi-session completion once the ceiling no longer ends the interview |
| Progress | Counted in screens against the 95 limit (`view-model.ts`) | Measures screens, not completion |

### 1.2 The staged design (D2)

One session, one record, the same links and the same delegation mechanisms. The ceiling is replaced by stages with explicit stopping conditions.

| Stage | Who | What | Complete when |
|---|---|---|---|
| 1 Core | Respondent | Profile, scope facts, every applicable tier 1 confirmation, the ten-scenario consistency sample, the activities screen | Every applicable tier 1 confirmation is answered or assigned. Produces the Snapshot's core indicator |
| 2 Breadth | Respondent, or delegated area by area to the accountable function | Tier 2 and 3 confirmations and the scope facts they need | The engine's plan has no further confirmation. Produces the Fraud Readiness Score |
| 3 Function packages | The eight accountable functions, each by its own link | Answers to "I don't know"; for the eight priority gaps, up to two follow-ups and, where the gap is partial or not yet working, up to four diagnostic practices; follow-ups of governance and response gaps; up to two practices per uncovered objective | Each package is answered or declined, or an MK-set period passes |

Gap follow-ups move from the respondent to the functions: the function that owns the control is better placed to say what else is in place, and the respondent's core no longer grows with every gap reported. Progress is shown by stage ("Core: 38 of 45 confirmations so far"; "Finance: 9 of 12"), with "so far" because answers can open further questions.

### 1.3 The three designs on the same organisations (S§3)

Respondent screens are shown as core / total; function screens as total (functions engaged; most for one function).

| Profile | D0 95 screens | D1 no limit | D2 staged |
|---|---|---|---|
| P1 Strong | 95 respondent; 69 of 109 confirmations known; frame A withheld | 161 in one interview; 108 of 108 | 81 / 166; functions 40 (7; 14); 108 of 108 |
| P2 Weak | 95; 46 of 107; withheld | 264 in one interview; 106 of 106 | 73 / 156; functions 42 (8; 13); 106 of 106 |
| P3 Mixed | 95; 46 of 109; withheld | 219; 108 of 108 | 76 / 161; functions 45 (7; 15); 108 of 108 |
| P4 Limited applicability | 95; 49 of 52 | 97; 49 of 50 | 50 / 94; functions 23 (4; 9); 49 of 50 |
| P5 Extensive unknowns | 95; 34 of 110 | 200; 73 of 109, withheld | 72 / 158; functions 80 (8; 17) including 35 owners' answers to "I don't know"; 107 of 108 |
| P6b Overstated confirmations | 95; 69 of 109 | 161; 108 of 108; nothing contradicts | 80 / 165; functions 39 (7; 14); 108 of 108; 10 contradictions found |

If the respondent delegates the breadth stage area by area, it spreads over seven or eight functions, at most 21 screens for any one (S§3). MK has no pilot timing data, so burden is stated in screens only.

## 2. The 534 related practices

### 2.1 Why they are never reached

They are unreachable by construction. No step of the respondent plan or of the owner packages serves a question whose coverage-map role is "related"; the coverage map lists them under each scenario but no routing rule reads that list. A related practice is asked only when a confirmation waits on it as a prerequisite, which happened for 3 of 534 in 144 simulated interviews. Applicability is not the reason: 379 have no condition of their own and 99 wait only on a profile, applicability or context fact. The rest wait on a parent practice: 18 on a confirmation, 34 on another related practice and 4 on a follow-up (S§1).

### 2.2 What each could add

| Class | Practices | When its answer changes something |
|---|---|---|
| Follow-up | 135 | Under a gap: what else is in place. Under a confirmation reported in place: a gap here contradicts it |
| Diagnostic | 427 | Under a partial gap: which part exists and which is missing, which changes the recommendation. Under a control reported not in place: little; the practice is the design content of the recommendation and need not be asked |
| Detail of a detail | 23 | Only after another related practice is in place; implementation detail for registers and blueprints |
| Coverage | 89 (84 related, 5 follow-ups) | The 17 objectives no confirmation covers, among them purchase orders and approval, receiving goods and services, contract management, payroll verification, high-risk roles, how fraud risks are identified and rated, and ethics training: the only possible source of a finding there |

Wording similarity found no practice that repeats a confirmation; the 12 closest pairs are distinct controls or in-house and outsourced variants of the same check (S§1.1).

### 2.3 What materially changes the reports (S§6)

The paid reports present a bounded set: Essential five to eight priority findings, two or three scenarios and five or six priority controls; Comprehensive five to seven deeper findings and five control blueprints. Depth matters when it lands there.

| Depth | D2 (recommended) | D2+ (everything) | Verdict |
|---|---|---|---|
| Gap follow-ups | 4 to 22 asked: those of the priority set, plus governance and response follow-ups (16 of the weak profile's 22) | 4 to 106; for the weak profile 6 of 106 in the top eight | Ask for the priority set and for governance and response gaps; the rest reach only the workbook |
| Diagnostic practices | 0 to 8 asked, all in the top eight | 7 to 204; for the weak profile none of 204 in the top eight | Ask up to four per partial priority gap; never for a control reported not in place |
| Coverage practices | 10 to 28 asked; 1 to 27 reveal a gap no confirmation could | 26 to 81; adds 0 to 6 objectives with a gap | Ask up to two per uncovered objective; the third and later add little |
| Function screens in total | 23 to 80 | 39 to 354 | D2+ costs up to 312 more screens for almost nothing a report presents |

Against D0, the staged design moves the content the reports need (S§3):

- Objectives with at least one answer, in the five larger profiles: 29 to 52 (D0) and 65 to 86 (D1) of 93 to 101 applicable, against 92 to 99 (D2); the small firm 38 against 43 of 47.
- Uncovered objectives with a reported gap: 0 or 1 (D0), against 1 to 16 (D2).
- Every partial gap in the top eight has a specific diagnosis in every profile under D2, against 2 of 4 (P4) and 3 of 5 (P5) at 95 screens.
- The current state of the five blueprint candidates is described in full for four profiles and for 3 of 4 in the other two, against 3 of 5 (P5) and 4 of 5 (P4) at 95 screens. A control reported not in place needs no further description.
- Governance and response operating detail for the weak organisation: 12 objectives, against 5 at 95 screens.
- Answered practice pairs that define an implementation dependency stay few under any design (2 to 6 in D2, 0 to 3 at 95 screens, up to 21 with D2+). Sequencing in the 12-month plan should therefore come from the method's own gating relations, used as content, rather than from answers.

What can stay unused without compromising a promised deliverable: diagnostic depth for controls reported not in place; depth for gaps outside the priority set; follow-ups of tier 2 and 3 gaps outside governance and response; detail-of-detail practices; coverage practices beyond two per objective. They remain in the bank as design content for recommendations and blueprints, used in the "what good looks like" voice without being asked.

## 3. The scoring frame

### 3.1 Does tier 1 measure core fraud readiness? (S§2)

No. Tier 1 is the method's order of questioning, sized to a respondent budget. Its gaps are substantive:

- **Assets, Cash and Inventory.** Two tier 1 scenarios, both exposure-gated: cash takings stolen, and stock stolen and hidden in the counts. Missing assets, scrap sold off, goods released to an impostor, fuel and fleet misuse (tier 2), goods lost in transit, organised theft of high-value materials, pilfered consumables and "losses are never tracked" (tier 3, applies to every organisation) never enter a tier 1 score. For a mining, logistics or manufacturing organisation the omitted scenarios are often its main exposure; the tiers do not move with sector.
- **Universal foundational controls in tier 2 and 3**: 25 scenarios apply to every organisation yet sit outside tier 1, including approval limits and exceptions, bank mandate or account changes, journals and write-offs concealing fraud, recalling a fraudulent payment, strong sign-in to systems that move money, help desk resets, allegation intake, investigation independence, detection only by accident, disclosure timelines, and consequences and recovery.
- **The promised ten-domain exhibit.** With tier 1, D8 has no domain figure for any profile and D3 none for the non-profit (two tier 1 confirmations apply); with all confirmations, every applicable domain has one (10 of 10, or 6 of 6 for the small firm).

If MK keeps a core indicator for the Snapshot, its definition should be revisited on materiality rather than questioning order (MD-B2): every universal foundational scenario, and at least one exposure-gated scenario per domain in which the organisation reports material exposure.

### 3.2 Frames compared on the staged design (S§7, S§3)

| Profile | Tier 1 (A1) | All confirmations (A) | A plus coverage practices (A+C) | Depth as a scored dimension |
|---|---|---|---|---|
| P1 Strong | 88.7 Strategic | 87.7 Strategic | 86.8 | 85.0 on 40 answers |
| P2 Weak | 22.2 Reactive | 21.0 Reactive | 20.2 | 16.4 on 42 |
| P3 Mixed | 55.8 Developing | 52.4 Developing | 51.0 | 35.8 on 45 |
| P4 Limited applicability | 75.2 Developing | 75.3 Developing | 76.9 | 47.8 on 23 |
| P5 Extensive unknowns, after owners | 55.2 Developing | 51.5 Developing, provisional | 50.2 | 35.8 on 45 |
| P6b Overstated confirmations | 83.1 Structured | 85.0 Structured | **71.2** | 17.9 on 39 |

- **Stability.** With the ceiling removed, A is identical in D1 and D2 for every profile and does not depend on the order of stages. A1 is identical across all three designs. A after the core stage alone is withheld (57% to 58% outstanding), so the Snapshot cannot carry A without the breadth stage.
- **Completeness and unknowns.** Under the outstanding-share rule A is provisional or withheld until the breadth stage completes; owners' answers then bring P5 to 51.5 against 52.4 had the organisation answered everything itself.
- **Scope.** A gives the small firm a figure in each of its six applicable domains; its result describes fewer exposures, which the report must state (R§7.1).
- **False comfort.** A and A1 move only through the consistency sample. A+C is the only frame that reflects the overstated organisation's weak operating practices across the objectives no confirmation covers (85.0 to 71.2).
- **Why depth cannot be a scored dimension.** Depth is asked mainly where a gap was reported, so its mean measures which questions were selected as much as how the organisation operates (16.4 to 85.0, driven by selection). It belongs in qualifiers and diagnosis.

### 3.3 Recommended frame and its interpretation

Frame A for the Fraud Readiness Score, each applicable confirmation once, with known-only scoring and the class interval (R§3). Interpretation rules (values for MK): the outstanding share decides provisional or withheld; scope is stated as the applicable confirmation count and the wholly excluded areas; contradictions found by the consistency sample apply F2 and F4 and are disclosed with the number tested; reverse contradictions (a gap whose follow-ups are in place) are disclosed as possible mitigation and never raise the score.

A+C is the natural second version. It scores the coverage practices by a fixed rule, so it has no selection bias. It takes the scored set from 106 to 108 confirmations to 126 to 136 items in the larger profiles and makes the score reflect every objective, not just those with a confirmation. It needs the function packages complete before the score, and MK would need to accept practices not written as confirmations into the scored set. Both are decisions to take after pilot data (MD-B4).

## 4. False comfort and scoring stability

### 4.1 What happened in P6 (S§5)

The same organisation scored 80.9 at 95 screens and 63.6 with no limit, under F2 and F4, because 21 follow-ups were answered in one run and 113 in the other: 13 contradictions against 40. F2 lowers each contradicted confirmation, so a penalty applied wherever a contradiction happens to be found makes the result a function of the path. That is a property of the routing, not of the organisation, and it is why F2 was not approved.

### 4.2 A fixed consistency sample (S§4)

One follow-up is asked straight after a sampled tier 1 confirmation reported fully in place. The sample is the same for every organisation.

| Sample | Extra respondent screens (strong profile) | At 95 screens: tier 2 and 3 confirmations displaced | Overstated organisation: contradictions, 95 screens / staged | Its tier 1 result with F2 and F4, 95 / staged |
|---|---|---|---|---|
| None | 0 | 0 | 0 / 0 | 88.7 Strategic / 88.7 Strategic |
| Universal (6: D1, D2, D3, D6, D9, D10) | 6 | 5 | 4 / 4 | 86.2 Structured / 86.2 Structured |
| **Per domain (10)** | 10 | 9 | 8 / 8 | 84.0 Structured / 84.0 Structured |
| All (42 applicable of 48) | 42 | 23 | 23 / 40 | 73.6 / 64.0 |

- **Completion.** At 95 screens no sample reduced tier 1 completion (D-05). The per-domain sample costs 10 screens and, under the old limit, would displace 9 tier 2 and 3 confirmations; under the staged design it displaces nothing.
- **Stability.** The per-domain sample finds the same eight contradictions at 95 screens and staged (D-06), so the result is the same on every path. Testing every confirmation is not stable under a limit, and costs 42 screens.
- **Honest organisations.** No contradictions in the strong, mixed or weak profiles with the per-domain sample (one with the full sample for the strong profile).
- **Contradiction or missing information.** A sampled follow-up answered "I don't know" is "consistency not established", listed for its owner, and changes nothing in the score (in the grid: 2 or 4 cases for P5 with the full sample, 0 contradictions). A confirmation not sampled is "untested" and is disclosed as such.

Is the result more defensible? Yes, on three grounds. Every organisation receives the same test, so results are comparable. Only actual conflicting answers move a value, and only the value of the confirmation they contradict, which keeps known-only scoring. And the report can state the basis plainly: "8 of 10 tested confirmations were contradicted by the organisation's own follow-up answers." What it cannot do is detect overstatement outside the sample. That limit belongs in the methodology statement, and validating operation belongs to Advisory.

## 5. Products, boundaries and the reports

### 5.1 One assessment, three automated products

| Product | Promise (Reporting Bible) | Stage required (recommendation) | What it draws on |
|---|---|---|---|
| Free Snapshot | A concise score, maturity indication and high-level areas of concern | Core | Tier 1 core indicator, clearly labelled, its band and areas of concern; consistency results withheld for the paid tiers |
| Essential R7,500 | Where do we stand, what matters most, what should we fix first | Breadth | Fraud Readiness Score (frame A), the ten-domain exhibit, five to eight priority findings from all applicable confirmations, two or three scenarios, five or six priority controls, the 90-day plan with owners by function, uncertainty from outstanding items |
| Comprehensive R35,000 | Target fraud-control environment, operating model, leadership decisions, scorecard and 12-month blueprint | Function packages (or an MK-set period) | Everything in Essential plus the diagnostic depth of the priority gaps (current state of each blueprint), governance and response depth (operating model), coverage findings, consistency results, dependency pairs for sequencing |

The products stay distinct without separate assessments: the purchase decides which stage must be complete before fulfilment. All three rest on self-reported answers; no stage involves evidence review, and the consistency sample is the organisation answering a further question about its own practice. Evidence review stays in Advisory.

### 5.2 What changes in the report engines

The products, prices, entitlements, payment processing, assessment records, storage and delivery stay. The analytical and content layers are reworked where the richer bank justifies it:

| Layer | Change |
|---|---|
| Scoring | A new calculator for the revised method behind version dispatch (E1); additive result fields for the outstanding share, stages, consistency results and the range (E2) |
| Deterministic analysis | Findings selected from all applicable confirmations and ranked (tier, then severity, then method order; MK decision M-3); a current-state description from diagnostic depth; contradiction and mitigation qualifiers in place of the score-threshold masking rule; coverage findings; scenario statuses with qualifiers; implementation dependencies from the method's gating relations; owners by function |
| Fact Pack and narrative (Essential) | New facts: stage and outstanding items by function, scope, consistency results, qualifiers, diagnosis per priority finding, coverage findings, dependencies; validator rules: unknown, untested or unreached never described as weakness; a contradiction worded as the organisation's own answers; no comparison with MFRS scores |
| Comprehensive | No longer bound to 68 questions or six interpretation slots. The deterministic model gains the operating model (from governance and response depth), five blueprints with described current and target states, a dependency-sequenced 12-month plan, and the consistency statement. Interpretation is generated section by section under the existing per-field validation, as many sections as the blueprint needs. The frozen contract's input statement becomes method-scoped |
| Registers and workbook | Question-trace register with stage, state, provenance, consistency result and outstanding owner; a register of depth answers per priority finding |
| Snapshot | Core indicator and areas of concern from method-scoped content; the free boundary unchanged |

## 6. Implementation plan

### 6.1 Can start immediately (no methodology or commercial decision needed)

All behind the review track, on fictional records, versioned so that historical sessions replay unchanged through the existing ruleset binding.

1. **Calculator dispatch and a methodology registry** beside `scoreSubmittedAssessment` and `scoreAdaptiveSubmittedAssessment`, with the revised calculator registered but inactive (no production values; parity tests prove MFRS runs unchanged). Authorised at 16:58.
2. **Input adapters**: report input 1.3.0 (additive): stage status, consistency results, depth answers by kind, priority set, outstanding items by function; the 1.2.0 projection pinned byte for byte.
3. **Method-scoped content registry** for playbooks, semantic families, domain content and operating context, with MFRS content resolving exactly as now.
4. **Regression fixtures**: the six staged profiles and the eight existing sessions as golden revised runs, with the MFRS suites as non-regression.
5. **Engine build 1.6 in the review harness**: stages in place of the ceiling, resume after any stop, gap follow-ups routed to function packages, the consistency sample, depth packages (priority, operating model, coverage), stage progress, all parameterised so MK's values drop in.
6. **Progress and resume interface** for stages and packages in the review track (preview-only), replacing "screen n of 95".

### 6.2 Needs MK's decision first

| # | Decision | Recommendation |
|---|---|---|
| MD-B1 | The scored frame | Frame A, each applicable confirmation once; tier 1 only as the Snapshot core indicator |
| MD-B2 | The core indicator's definition | Redefine on materiality: universal foundational scenarios plus exposure-gated ones per domain with material exposure; or keep tier 1 with D8 reviewed |
| MD-B3 | Tier review | Review D8 and the 25 universal tier 2 and 3 scenarios before any tier carries weight or caps |
| MD-B4 | A+C | Not in the first version; revisit with pilot data |
| MD-B5 | Consistency sample | Ten scenarios, one per domain, fixed; F2 with F4; "not established" and "untested" disclosed, never penalised |
| MD-B6 | Depth rules | Priority set of eight; up to two follow-ups and four diagnostic practices per partial priority gap; governance and response follow-ups; two per uncovered objective |
| MD-B7 | Stage required per product, and when fulfilment starts | Snapshot after core; Essential after breadth; Comprehensive after function packages or an MK-set period, with gaps disclosed |
| MD-B8 | Package expiry and reminders | MK sets the period; an expired package leaves its items outstanding, never scored |
| MD-B9 | Respondent burden policy | No hard cap; stage targets disclosed to the customer; delegation by area offered at the start of breadth |
| MD-B10 | Snapshot labelling | The core indicator labelled as such, with its band; the full score on completion |
| MD-B11 | Values carried from the earlier package | Class interval, outstanding thresholds, caps K1 to K3, bands, aggregation (MD-3 to MD-14 in `METHODOLOGY-DECISION-PACKAGE.md`), re-tested on frame A |

### 6.3 Sequence

Infrastructure (6.1 items 1 to 4) first, because every option needs it; engine build 1.6 and the stage interface next, on fictional records; then, once MD-B1 to MD-B11 are decided, the revised calculator values, the analytical and content rework of section 5.2, and an end-to-end certification of the three products on fictional assessments under the existing release gates. B2 and the storage decision still precede any customer use.

## 7. Limits

- Answers are scripted and keyed per question. The overstated profile (P6b) assumes every non-confirmation practice is weak, which overstates its contrast; real answer patterns, and the time each screen takes, need a pilot.
- The depth rules, the sample and every threshold are hypotheses chosen to make trade-offs visible.
- Engine build 1.6 behaviour was simulated by hooks around build 1.5; the real build must reproduce it and be tested on its own.
- The priority ranking used to select depth is itself an MK decision (M-3).

## 8. Files and checks

| File | What it is |
|---|---|
| `scripts/research/depth/classify.mjs` | The static classification of 674 follow-up and related practices |
| `scripts/research/depth/staged.mjs` | Designs D0, D1 and D2 with the consistency sample and depth packages, as hooks around the vendored engine |
| `scripts/research/depth/run.mjs` | Every simulation in this plan; writes `staged-assessment/` |
| `scripts/research/depth/check.mjs` | Nine checks, all passing: D0 reproduces the production path; no question asked twice or outside scope; consistency questions only after an in-place sampled confirmation; tier 1 completion never reduced; the same contradictions at 95 screens and staged; depth never moves the score except through a contradiction; labels; `src`, `supabase` and the vendored engine unchanged |

Run from the repository root: `node scripts/research/depth/run.mjs`, then `node scripts/research/depth/check.mjs`.
