# Scoring methodology for the revised assessment: decision package

For MK review, 11 November 2026, on `review/mk-integrated-readiness`, building on the accepted integration assessment (`REPORT-ENGINES-AND-REVISED-ASSESSMENT.md`).

**Status: controlled simulation only.** Scoring-frame Option A was simulated, not approved or implemented. Every weight, threshold, cap, band, mapping and treatment in this package is **hypothetical**, is labelled as such in every output, and lives only in `scripts/research/scoring-simulation/` and `docs/readiness-review/methodology-simulation/`. Nothing under `src` or `supabase` changed (checked by S-10). No production scoring value, migration, commercial integration or deployment was made. The existing Snapshot, Essential and Comprehensive engines, historical scores, prices, entitlements and product codes are untouched. Nothing was pushed, merged or deployed. Fictional records only. B2, B3, B4, B5, B6, B7, B11 and J-01 remain open.

**What this answers.** MK's instruction of 11 November (16:13), items 1 to 8: frame membership, the 137 confirmations and their non-anchored treatment, the corrected unknown test, a scoring impact assessment, false comfort, comparability, the necessary report-engine changes, and the decisions MK must take, each with a recommendation.

**How to read it.** This document carries the findings, the recommendation and the decisions. The evidence is in `methodology-simulation/SIMULATION-RESULTS.md` (generated tables, cited below as "R§"), `methodology-simulation/membership-matrix.csv` (all 902 live questions), `membership-summary.json` and `results.json`.

## Summary

1. **The frame is clean.** The 137 confirmation controls are exactly the practice questions with the confirmation role: 97 anchored and 40 not (32 practice, 8 choice). Each names exactly one scenario; none is a confirmation of two. Four are also listed as a follow-up or related question of another scenario, and twenty questions in the bank have more than one scenario association (R§1). Option A, as simulated, reads each control once from its own record, so a second scenario association cannot add weight; a scenario-averaged aggregation would have raised one control's weight from 0.94% to 1.42% of the result (R§7.4, check S-02).
2. **Option A over all confirmations does not work at the production screen limit, and fails unevenly.** Run to its own end, the interview takes 151 to 275 screens for every simulated profile except the small owner-managed firm (91 to 97); the limit is 95. Organisations that report gaps are asked follow-ups, which use screens, so at the limit the weak and mixed organisations had answered 56.1% and 54.8% of their applicable confirmations against 82.1% for the strong one. The frame-wide result is then withheld for weak and mixed organisations and shown for strong ones, and where it is calculated it is wrong: 32.9 for the mixed organisation against 55.5 when complete (R§4.2, R§7.2).
3. **Restricting the number to tier 1 confirmations (frame A1) removes that problem.** The engine reserves screens for tier 1 confirmations, and in every simulated profile all applicable tier 1 confirmations were reached within 95 screens (the one exception is a confirmation opened by a correction made after the limit, in P6). The A1 result at the production limit is identical to the result at the interview's end for every complete profile, and close to the full frame A result (strong 88.0 against 87.8, weak 22.3 against 21.6, mixed 56.1 against 55.5, equal-domain comparison) (R§7.2, R§8).
4. **The non-anchored question nearly disappears under A1.** 63 of the 69 tier 1 confirmations are anchored. Across six records the spread between the class treatments is at most 1.6 points under A1, against up to 6.6 under frame A. A direct "label" mapping of classes to 0 to 5 inflates weak results (+5.1 for the weak profile under frame A) and is not recommended (R§3).
5. **Unknowns are never penalised, and removing an answer moves the result either way.** Replacing one known answer at a time with "I don't know" raised the result 43 times and lowered it 42 times (equal domains; 54 and 54 pooled). What always moves in one direction is visibility (R§5, checks S-05, S-06).
6. **"I don't know" can be used strategically, within a bounded window.** Under the recommended configuration a weak organisation that withholds its six worst tier 1 answers moves from 22.2 to 25.5, marked provisional with each withheld confirmation listed; a seventh withholds the result (R§9.6).
7. **False comfort is real and the method as simulated does not catch it.** An organisation whose confirmations are reported in place while its own follow-up answers report gaps scores 88.7, Strategic, under no treatment; 40 of its 45 tier 1 confirmations are contradicted. With the recommended treatment it is 63.6, Structured (R§9.4, R§9.1; the treatments are compared in R§6.3). The engine also cannot reveal a contradiction it never asks about: follow-ups are asked only after a gap is reported, so an organisation reporting everything in place is asked none (in the strong profile, follow-ups were asked for 1 of 73 in-place confirmations whose scenarios have them) (R§6.2).
8. **Comparability holds within the revised method only under stated conditions, and never with MFRS.** With identical answers, four bank personas and the Fictional Retail Group score 55.2 to 57.2 (recommended configuration); the small owner-managed firm scores 75.2 because 46 of its 69 tier 1 confirmations do not apply to it, not because it is better controlled (R§7.1). MFRS and the revised method share no question population, domain meaning or weighting basis; historical MFRS results remain reproducible (all existing scoring suites unchanged) and must not be trended against revised results.
9. **The engines need targeted changes, not a new architecture** (section 8): calculator dispatch by methodology version, additive result fields, method-scoped content, analytical rules for contradictions, outstanding information and scenarios, and new facts and validator rules in the existing Essential narrative and Comprehensive deterministic pipelines.

## The recommended methodology at a glance

Every element is a recommendation for MK's decision (section 9) and is hypothetical until approved. Each is the "recommended configuration" tested in R§9.

| Element | Recommendation | Evidence |
|---|---|---|
| Scoring frame | Applicable **tier 1** scenario-confirmation controls (frame A1), each counted once; tier 2 and 3 confirmations reported beside the number, not in it | R§4, R§7.2, R§9.1 |
| Anchored answers | Level x 20, the existing normalisation | identical scale and labels |
| Practice and choice answers | The range the method itself implies (in place: levels 4 to 5; partly: 1 to 3; set out but not working: 1 to 2; not in place: 0), published at the midpoint, the range disclosed | R§3 |
| "No case has tested it", "not applicable" | Outside the denominator, disclosed, never a gap | section 2.4 |
| Unknown, not reached, applicability not known | Outside the denominator, never a penalty; one "outstanding share"; provisional when anything is outstanding, withheld at 15% or more; every item listed by accountable function | R§5, R§9.2, R§9.3 |
| Overall result | Mean over the scored tier 1 confirmations (pooled), every confirmation weighted once | R§7.3, R§9.2 |
| Domain figures | Shown only with three or more scored tier 1 confirmations; otherwise the class profile and scenario picture | R§8.1 |
| False comfort | A confirmation contradicted by its own follow-up counts no higher than level 3 (F2); any contradicted tier 1 confirmation limits the band to Structured (F4); each is disclosed | R§6.3 |
| Caps | Tier 1 control caps K1 to K3; no domain cap | R§8.1 |
| Bands | The four existing bands at 40, 60 and 80, read from the lower end of the range | R§8 |
| Comparability | Results carry their methodology version; no trend across methods; comparison across organisations at band level, for NORMAL results, with the applicable tier 1 count shown | section 6 |

## 1. Scoring-frame membership (instruction 1)

### 1.1 The matrix

`membership-matrix.csv` lists every live question (902; 912 with 10 retired) with its type, format, stage, coverage-map role, primary scenario, every association as confirmation, follow-up or related question, tiers, objectives, cross-objectives, the frame flag, every gating condition, the accountable owner and whether 144 simulated interviews ever served it, and as what.

| Type and role | Questions | In the frame | Served in simulated interviews |
|---|---|---|---|
| Practice, confirmation | 137 | 137 | 125 (60 as a tier 1 confirmation, 65 as wider coverage, 1 as a follow-up) |
| Practice, follow-up | 140 | 0 | 120, always as a follow-up |
| Practice, related | 534 | 0 | 3, only as a prerequisite another question waits on |
| Applicability, scope / related | 9 / 41 | 0 | 9 / 31, as scope facts |
| Context, scope / related | 1 / 30 | 0 | 1 / 3 |
| Event, related | 10 | 0 | 1 |

Two findings matter for any frame. **The 534 related practices are, in build 1.5, effectively never asked**: the respondent interview asks confirmations, follow-ups after a reported gap, and the facts they depend on. They give depth to reports when answered (owner packages, a future depth path), but no frame can rely on them. **Follow-ups exist only where a gap was reported**, so a frame that included them (Option B) would vary with the answers, which is the problem Option A avoids.

### 1.2 Overlaps, exclusions and multiple associations

| Check | Result |
|---|---|
| Confirmation-role questions that are not practices | 0 |
| Confirmations naming more than one scenario | 0; each confirmation's role scenario is its only route or confirm scenario |
| Confirmations also listed elsewhere | D3-T-02 (related to FS-D1-02), D3-P-01 (follow-up of FS-D3-08), D5-O-03 (related to FS-D5-01), D9-R-02 (related to FS-D9-05). In the frame once, as confirmations; their other listing only qualifies the other scenario |
| Scenarios with more than one confirmation | 14 (alternative or joint routes); 0 without one |
| Questions with any scenario association / with several | 892 / 20 (2 follow-ups listed for two scenarios, D1-A-09 and D6-P-03; 12 related questions; the 4 above; 2 follow-ups also related elsewhere) |
| Excluded from the frame | the 765 questions without the confirmation role: 140 follow-ups, 534 related practices, 50 applicability, 31 context and 10 event questions |

### 1.3 No extra weight for several scenarios

Option A builds the frame from the 137 confirmation records, not from scenarios, so a control is counted once whatever number of scenarios name it. The check adds a confirmation to five further scenarios in a record and confirms the result is unchanged (S-02). For contrast, an aggregation through scenarios (each scenario the mean of its confirmations, the result the mean of scenarios) raised a control associated with a second scenario from 0.94% to 1.42% of the result (R§7.4). The rule to adopt is therefore structural: the calculator reads controls, and scenarios contribute only the picture and the qualifiers.

## 2. The 137 confirmations (instruction 2)

### 2.1 Distribution

| Domain | Anchored | Not anchored | Tier 1 | Tier 2 | Tier 3 | Tier 1 not anchored |
|---|---|---|---|---|---|---|
| D1 Fraud governance and accountability | 15 | 5 | 14 | 3 | 3 | 3 |
| D2 Fraud risk assessment | 6 | 2 | 5 | 2 | 1 | 2 |
| D3 Ethics, integrity and anti-corruption | 9 | 4 | 6 | 5 | 2 | 0 |
| D4 Third parties and supply chain | 10 | 5 | 8 | 6 | 1 | 1 |
| D5 People, payroll and insider risk | 9 | 6 | 8 | 7 | 0 | 0 |
| D6 Finance, banking and financial reporting | 11 | 4 | 7 | 6 | 2 | 0 |
| D7 Customers, revenue and products | 10 | 4 | 8 | 4 | 2 | 0 |
| D8 Assets, cash and inventory | 6 | 5 | 2 | 5 | 4 | 0 |
| D9 Digital, cyber-enabled and identity fraud | 10 | 4 | 5 | 7 | 2 | 0 |
| D10 Detection, speak-up and response | 11 | 1 | 6 | 6 | 0 | 0 |
| **Total** | **97** | **40** | **69** | **51** | **17** | **6** |

The non-anchored share rises with tier: 9% of tier 1 (6 of 69), 41% of tier 2 and 76% of tier 3. 85 are core-stage questions and 52 detail-stage. D8 has only two tier 1 confirmations.

### 2.2 What decides applicability

Statically: 37 always apply; 48 depend on an applicability question, 15 on a context fact, 14 on the profile, 11 on a parent practice, and 12 on combinations including proportion to size (R§1.2). Dynamically, across the four bank personas, the Fictional Retail Group and a small owner-managed firm, between 50 and 113 confirmations apply, and between 23 and 49 tier 1 confirmations (R§2). The small firm loses four domains entirely (D4, D5, D7 and D8). Answering the "less common activities" screen adds up to seven confirmations for a persona.

Data observation: persona D records PR-03 as "yes", which is not one of that question's options (pfma, mfma, no). The simulation reads it as "pfma". This needs correcting in the bank's persona data, not in any engine.

### 2.3 Numerical treatment of non-anchored answers

The method itself defines how classes relate to levels for its 133 anchored practices: level 0 is "not in place", levels 1 to 3 "partly", levels 4 and 5 "in place". That is the only bridge the method supplies. "Set out or agreed, but not yet working in practice" has no level counterpart; the closest option labels are "Informal / reactive" (1) and "Partly designed" (2).

| Option | Values (0 to 100) | Basis | Implication (R§3) |
|---|---|---|---|
| T1 Exclude | not scored; shown as a class profile; still drive caps and findings | no assumption | Frame A: 34 or 35 of 106 to 108 known answers drop out of the number in complete interviews. A1: 3 or 4 of 23 to 46. A1 results move by at most 1.2 points |
| **T2 Interval (recommended)** | in place 80 to 100; partly 20 to 60; set out but not working 20 to 40 (assumption H-D); not in place 0; published at the midpoint; range disclosed | the method's own class-to-level relation | A1 ranges at most 2.6 points wide; band read from the lower end |
| T3 Lower end | 80 / 20 / 20 / 0 | conservative | up to 1.3 points below T2's published figure under A1 |
| T4 Midpoint, fixed | 90 / 40 / 30 / 0 | equal to T2's published figure | no range disclosed, so the assumption is invisible |
| T5 Label equivalent (not recommended) | 80 / 60 / 40 / 0 | each class read as the single label its wording resembles | Treats "partly" as level 3 although the method places it anywhere from 1 to 3. Frame A: weak profile +5.1 against T3, uniform answers +6.6 |

Under frame A the choice is material (spreads of up to 6.6 points across six records). Under A1 it is not (0.6 to 1.6), because only six tier 1 confirmations are non-anchored: D1 (3), D2 (2) and D4 (1).

### 2.4 Answers that are neither a level nor a class

"No such case has arisen yet" (anchored) and "not applicable" (where a question offers it) sit outside the denominator and are disclosed; they are not gaps. A reused answer (three reuse links in the coverage map) counts once, from its source. Dependents hidden because their parent practice is reported absent are not scored separately; the parent carries the result (S6 in the integration assessment).

## 3. Unknown responses: the corrected test (instruction 3)

The test no longer asserts that removing information can never reduce a score. It asserts what is true: an unknown carries no value and no penalty, it is outside the denominator, the result is the mean of what is known, and visibility falls.

| Test | Result |
|---|---|
| Denominator (R§5 U1; S-04) | 73 known and 34 unknown confirmations: no unknown carries a value; the result (55.9) equals an independent recalculation over the known answers. Counting unknowns as zero, for contrast only, would give 38.1 |
| Direction (R§5 U2; S-05) | Each of 108 known answers replaced in turn by "I don't know": the result rose 43 times, fell 42 times and was unchanged 23 times (equal domains); 54 rises and 54 falls pooled. An answer below the result raises it when removed; one above lowers it. Rerunning the interview with the unknown given in place changed routing (fewer follow-ups) but not the frame result |
| Visibility (S-06) | Visibility and coverage never improve as answers become unknown |
| Withholding (R§5 U3, R§9.2) | Frame A, equal domains: at 5% unknowns results ranged 54.9 to 60.0 against 55.5 complete; at 30% all ten seeds were withheld. Recommended configuration: deviation from the complete result never exceeded 6.3 points, and the band never differed, in 480 runs at 5% to 20% unknowns |
| Disclosure (R§5 U4) | Every outstanding confirmation listed once under the owner the bank names for its module, grouped into the engine's eight function packages (P5: 10 confirmations across six packages) |
| Strategic use (R§5 U5, R§9.6) | A weak organisation withholding its worst answers: 22.2 to 25.5 after six, provisional, every one listed; withheld after seven |

Proposed rule (hypothetical thresholds, decision MD-6): one "outstanding share" over the tier 1 frame, counting unknown answers, confirmations not reached and confirmations whose applicability is not yet known. Provisional when anything is outstanding; withheld at 15% or more. Scope exclusions by a recorded decision never reduce visibility. The MFRS rules applied to the new frame are unusable: because every organisation legitimately excludes some confirmations, all 20 simulated records came out provisional or insufficient (R§8).

## 4. Scoring impact assessment (instruction 4)

All figures below use the recommended configuration (R§9.1) unless stated. Results are calculated on fictional records; scenario counts are the engine's own statuses for tier 1 scenarios.

### 4.1 Existing fictional fixtures

| Fixture | Tier 1 known / applicable | Outstanding | Result | Note |
|---|---|---|---|---|
| Supplied 1.2.0 session | 45 / 46, 4 applicability not known | 10% | 60.2 (59.6 to 60.9), **Developing**, provisional | Four tier 1 confirmations contradicted by their own follow-ups (F2 applied; F4 limit); K1 to K3 also bind |
| Golden: all in place | 45 / 45 | 0% | 80.7, **Strategic**, normal | no follow-ups were asked |
| Golden: routes | 46 / 46, 3 not known | 6.1% | 78.0, **Developing** (from Structured by K1, K2), provisional | the governance practice reported absent |
| Golden: full interview with owners | 33 / 45 | 28.3% | withheld | owner answers left 12 outstanding |
| Golden: early stop, open interview, Advisory records, corrections | 10 to 20 known | 60.8% to 82.5% | withheld | stopped at 20 to 60 screens |

### 4.2 Representative profiles

Base organisation: the Fictional Retail Group profile (P4 uses a small owner-managed firm). Answers are fixed per question, so a profile describes the same organisation however far its interview runs.

| Profile | Scoring population (tier 1) | Domain coverage and figures | Result | Visibility | Scenario picture (tier 1) | Contradictions |
|---|---|---|---|---|---|---|
| P1 Strong | 45 applicable, 45 known, 24 out of scope | 9 domain figures (80 to 96); D8 profile only (2 confirmations) | 88.7 (88.0 to 89.3), Strategic | normal | 43 confirmed as reported | none found; none could be (no follow-ups asked) |
| P2 Weak | 46 / 46 | 9 figures (5.7 to 32) | 22.2, Reactive | normal | 43 with a gap reported | none |
| P3 Mixed | 45 / 45 | D1 85.7, D2 90, D3 80, D6 92, D10 90; D4 25.7, D5 32, D7 30, D9 16; D8 profile only | 55.8, Developing | normal | 21 confirmed, 22 with a gap | none |
| P4 Limited applicability | 23 / 23; 46 out of scope | D4, D5, D7, D8 wholly out of scope; D3 profile only (2); D9 10 | 75.2 calculated (Structured), **Developing** by K1 and K3 | normal | 17 confirmed, 4 with a gap | none |
| P5 Extensive unanswered | 34 known, 10 unknown, 2 applicability not known | 8 figures; outstanding shown by function | **withheld** (calculated 61.2) | insufficient, 26.1% outstanding | 17 confirmed, 15 with a gap, 11 waiting for an owner | none |
| P5 after owners answer | 44 known, 2 not known | 9 figures | 55.2, Developing | provisional, 4.3% | 20 confirmed, 22 with a gap, 1 waiting | none |
| P6 Contradicting, production limit | 44 / 45, 1 not reached | 8 figures | 80.9 (88.9 untreated), **Structured** by F4 | provisional, 2.2% | 42 "confirmed as reported" by the engine | 13 tier 1 confirmations |
| P6 Contradicting, interview to its end | 45 / 45 | 9 figures, all 60 to 70 | 63.6 (88.7 untreated), Structured | normal | 43 "confirmed as reported" by the engine | 40 tier 1 confirmations |

**Implications for management reporting.**

- **P1 Strong.** The result rests entirely on the organisation's confirmations: no follow-up was asked, so nothing in its own answers tests them. The report should say so plainly, state the self-reported basis, and give for each confirmation the records the method says management should hold (the permitted Comprehensive voice). A strong number is the case where false comfort is least detectable (section 5).
- **P2 Weak.** Under A1 the weak organisation gets a reliable, normal-visibility result at the production limit; under frame A it would have been withheld (56.1% coverage) because its follow-ups used the screens. Priorities can be ordered by tier 1 gaps and accountable function, and the method's own level descriptions give each anchored control its next target state.
- **P3 Mixed.** "Developing" is an average of five strong and five weak areas (85.7 to 92 against 16 to 32). The report must lead with the split by area and scenario, not the average. Frame A at the production limit would have computed 32.9 from the weak areas the interview happened to reach, against 55.5 complete.
- **P4 Limited applicability.** The result covers 23 tier 1 confirmations; four areas do not apply. The same answers in a larger organisation give 55 to 57 (R§7.1): the higher calculated figure reflects scope, not stronger control. The report must state the scope and the excluded areas, and comparisons need the applicable count. The caps bring the band into line with the gaps the organisation did report.
- **P5 Extensive unanswered.** No score or band is shown; the report leads with what is outstanding, by function and owner, and the scenario picture of what is known. When owners answer, a correction recalculation (the existing `correction_recalc` run type) produces 55.2, provisional, within 0.6 of the result the organisation would have had answering everything itself.
- **P6 Contradicting.** Untreated, the method shows Strategic while, across all its confirmations, 69 are contradicted by the organisation's own follow-up answers, 45 of them by a follow-up reported not in place at all (frame A count). The engine's scenario status calls these scenarios "confirmed as reported" because it reads confirmations only, so the report needs a qualifier on each such scenario and finding, worded as the organisation's own answers.

## 5. False comfort (instruction 5)

**Can the method produce an apparently strong result while the responses suggest significant limitations? Yes.** P6 scores 88.7, Strategic, with 40 of 45 tier 1 confirmations contradicted by the organisation's own follow-up answers (R§9.4, before the false-comfort treatment). The supplied fixture has four contradicted tier 1 confirmations (D4-B-12, D5-O-04, D5-O-05, D6-P-05) and seven confirmations reported as gaps whose follow-ups are all in place, which is the opposite risk, understatement (R§6.1).

**Where contradictions can and cannot appear.** The engine asks a scenario's follow-ups only after one of its confirmations is reported as a gap (up to two per scenario). A contradiction therefore surfaces only when a scenario has two confirmations and the other reported a gap (14 scenarios), a follow-up is shared with another scenario (D1-A-09, D6-P-03; this is how D6-P-05 came to be contradicted in the supplied fixture), the respondent corrects a confirmation after answering its follow-ups (how P6 was built), or an owner answers. In the strong profile, 104 confirmations were reported in place, 73 of them in scenarios that have follow-ups, and follow-ups were asked for one (R§6.2). Nothing a respondent says can contradict a confirmation that is never followed up.

**Treatments tested (R§6.3).**

| Treatment | P6, production limit, frame A1 | P6, interview to its end, frame A1 | Character |
|---|---|---|---|
| F0 none | 87.8, Strategic | 88.0, Strategic | false comfort passes through |
| F1 disclose only | 87.8, Strategic | 88.0, Strategic | honest wording, misleading number |
| F2 contradicted confirmation counts no higher than level 3 | 81.6, Strategic | 63.7, Structured | proportionate to the number contradicted; level 3, "Implemented in key areas", is the highest level consistent with a related practice reported not in place, whereas level 4 means "Consistently operating" |
| F3 blend with the follow-ups | 78.7, Structured | 58.4, Developing (range spans two bands) | lets follow-ups score indirectly; path-dependent, since follow-ups are asked only on gaps |
| F4 band limit at Structured | 87.8, limited to Structured | 88.0, limited to Structured | protects the band, leaves the number |
| **F2 + F4, disclosed (recommended)** | 81.6, Structured (pooled: 80.9) | 63.7, Structured (pooled: 63.6) | number and band both reflect the organisation's own answers |

Recommendation: F2 with F4 and each contradiction disclosed. The reverse case (a gap confirmation with follow-ups in place) is disclosed as possible mitigation but never raises a score, because a follow-up in place does not make the confirmed control operate. The structural gap needs a separate decision (MD-10): a small, fixed consistency sample of follow-ups for tier 1 confirmations reported in place (48 of the 55 tier 1 scenarios have follow-ups). That is a change to the interview, which belongs to a future engine and bank version, not to the report engines; it stays self-reported and involves no evidence review.

## 6. Comparability (instruction 6)

### 6.1 Across organisations

With identical answers to every question, the four bank personas and the Fictional Retail Group score 55.2 to 57.2 under the recommended configuration (44 to 47 tier 1 confirmations apply), against 52.4 to 55.0 under frame A pooled. The small owner-managed firm scores 75.2 on 23 applicable confirmations (R§7.1). Applicability changes what is measured, so a cross-organisation comparison is reasonable only:

- between results under the same methodology version;
- for NORMAL results (nothing outstanding);
- at band level, with the applicable tier 1 count and any wholly excluded area shown beside it.

### 6.2 Across assessment paths

| Path (recommended configuration) | Strong | Mixed | Weak |
|---|---|---|---|
| Production limit, complete tier 1 | 88.7 normal | 55.8 normal | 22.2 normal |
| Interview to its end | 88.7 | 55.8 | 22.2 |
| Respondent stops after 90 screens | 88.7 normal | 53.1 provisional (8.7% outstanding) | 21.9 provisional |
| Respondent stops after 80 screens | 88.7 normal | withheld (23.4%; calculated 57.5) | withheld (22.9%) |
| Respondent stops after 60 screens | withheld (23.4%) | withheld (42%; calculated 62.4) | withheld (41.2%) |

An early stop biases the calculated result towards the domains asked first (the tier 1 loop runs domain by domain). In these runs the withheld results were up to 8.7 points from the complete result (mixed, 40 screens: 64.5 against 55.8); the results still shown were within 2.7 points and marked provisional (R§9.3). Owner answers after the first run produce a correction recalculation that converges on the complete result (R§9.5).

### 6.3 What changes interpretation

| Change | Effect | Rule proposed |
|---|---|---|
| Applicability | Changes the population scored (23 to 49 tier 1 confirmations) | Show the applicable count and excluded areas with every result |
| Answered coverage | Frame A results depend on the path; A1 results do not once tier 1 is complete | Score A1 only; report tier 2 and 3 coverage separately |
| Unknown information | Moves the result either way by up to 6.3 points (5% to 20% unknown); never the band in 480 runs | Provisional above 0%, withheld at 15%; list everything outstanding |
| Class treatment | Up to 1.6 points under A1 | Disclose the range |

### 6.4 MFRS

Historical MFRS results remain reproducible: the existing scoring and report suites were rerun on this branch and produced output identical to the baseline apart from timings (adaptive scoring parity score 60; adaptive engine, correction and semantics suites; Essential contract 22 of 22; Comprehensive contract gate; narrative assurance 6 of 6; Snapshot narrative 28 of 28), and the Phase 2 report-engine suite passes 17 of 17. Nothing under `src` changed.

They cannot be trended against revised results. The two methods differ in what is measured (68 MFRS questions against 23 to 49 applicable tier 1 confirmations), what the domain codes mean (D3 is "Operational Fraud Controls" in MFRS and "Ethics, integrity and anti-corruption" in the bank), how applicability and unknowns are treated, which controls carry caps, and how domains are weighted. Wording similarity finds a strong counterpart for only 9 of the 68 MFRS questions (appendix to the integration assessment). Recommendation (MD-15): every result carries its methodology version; MFRS history is shown separately and labelled; no chart, delta or narrative compares an MFRS score with a revised score. A comparability basis would need the MFRS-to-bank correspondence work (M-11) and a bridging study in which the same fictional or consenting pilot organisations are assessed under both methods; that is for MK to commission or not.

## 7. Aggregation options and maturity-band implications

### 7.1 Overall result

| Option | Mixed profile (R§7.3) | For | Against |
|---|---|---|---|
| **Pooled over tier 1 (recommended)** | 55.8 | Every confirmation weighs the same, the direct extension of "counted once, no automatic extra weight"; most robust to unknowns (R§9.2) | D1 holds 14 of the 69 tier 1 confirmations, so governance can carry about a fifth of the weight |
| Equal domains over tier 1 | 56.1 | Each area counts the same | A confirmation in D8 (two in tier 1) weighs up to seven times one in D1; more sensitive to unknowns in thin domains |
| Tier-weighted, frame A | 52.9 (pooled) | Uses tier 2 and 3 | Depends on the interview path at the production limit |
| MK-set domain weights | not simulated | Expresses priorities | No basis yet; MFRS weights belong to another domain structure |
| No overall figure | n/a | Avoids an average that hides a split | Paid engines, bands and the Snapshot expect one figure |

### 7.2 Domain figures

A domain figure needs at least three scored tier 1 confirmations; otherwise the area is shown as a class profile and scenario picture. Under the current tiering D8 never gets a figure (two tier 1 confirmations), and a small organisation may lose others (P4: D3). This depends on MK's view of the tiering (MD-2).

### 7.3 Caps and bands

The four bands and their thresholds (40, 60, 80) discriminate the profiles cleanly (strong Strategic, mixed Developing, weak Reactive) and keep the meaning customers know; they do not make revised and MFRS results comparable. Reading the band from the lower end of the range prevents an assumed class value from lifting a result across a threshold.

| Caps (frame A1, pooled; R§8.1) | Effect on the 20 records |
|---|---|
| None | P4 Structured, supplied Structured, routes Structured |
| **K1 to K3 (recommended)**: tier 1 confirmation at level 0 or 1 or not in place limits to Developing; at level 2, partly in place or set out but not working, limits to Structured; three or more such confirmations limit to Developing | Those three become Developing, consistent with the gaps they reported; no other record changes |
| K1 to K4 (adds a domain below 40 or 60) | No further change in these records; MFRS's domain cap applied only to core domains, and the revised method designates none |

## 8. The report engines: the genuinely necessary changes (instruction 7)

The architecture stays: score runs bound to a methodology version, `AssembledReportData`, the deterministic evidence model, the Essential narrative pipeline (Fact Pack, Story Plan, Blueprint, AI writer, factual, assurance-boundary, editorial and mechanical gates, composer), the Comprehensive deterministic pipeline (assembly, management model, six registers, six bounded AI interpretation slots validated per field) and the Snapshot. These are the changes the revised method genuinely requires, refined from C1 to C9 of the integration assessment by the simulation. None is implemented.

| # | Change | Where | Why it is necessary | Not changed |
|---|---|---|---|---|
| E1 | Calculator dispatch by methodology version: MFRS assessments keep their two entry points, `scoreSubmittedAssessment` (fixed question set, `calculateFraudReadinessScore`) and `scoreAdaptiveSubmittedAssessment` (adaptive graph pinned to its graph and methodology version); the revised version gets its own entry point and calculator, returning the same result shape to the same score-run persistence | `src/lib/scoring/score-assessment.ts`, `src/lib/scoring/adaptive-scoring.ts` and a new sibling module | A revised run must never pass through MFRS code, and MFRS runs must never pass through the new code | `adaptive-scoring.ts`, `scoring-engine.ts`, `maturity-band.ts`, every historical run |
| E2 | Additive result fields: frame basis, outstanding share and items by function, contradiction count, the range behind the published figure, class-only count; on traces, the answer class and the method's level description | `AdaptiveResultMetrics`, `QuestionTraceRecord`, `GapQuestionRecord` (`src/lib/reports/types.ts`) | Class answers have no single `responseValue`; tier 1 status replaces `isCritical`; K1 and K2 replace hard-gate and critical-gap flags; F4 and K1 to K3 are new cap events | Existing fields and their meaning for MFRS runs |
| E3 | Report input from the review session (Phase 2 report input 1.2.0: answers, provenance, coverage categories, method content) attached to `AssembledReportData` as an additive context | `assemble-report-data.ts`, `report-input.ts` | The engines need scenarios, follow-ups, owners and outstanding items that the MFRS record does not hold | The Phase 2 input contract is reused unchanged |
| E4 | Method-scoped content: question playbooks, semantic families, domain playbooks, Snapshot domain insights and operating context resolved by methodology version | `evidence-model/question-playbooks.ts`, `semantic-mappings.ts`, `domain-playbooks.ts`, `snapshot/commercial-insights.ts`, `narrative/operating-context.ts`, `recommendation_rules` | The same codes mean different things in the two methods (F4 of the integration assessment) | MFRS content |
| E5 | Analytical rules for the revised method: contradictions from follow-ups (F2, F4, the reverse case) in place of the score-threshold masking rule (`STRONG_THRESHOLD = 65`) for revised runs; finding selection from tier 1 caps and gaps; visibility gaps from outstanding information by function (the existing insufficient-visibility path at `evidence-model/index.ts` line 201 is reused); scenarios from the bank's 122 scenarios with the engine's statuses and the contradiction qualifier | `evidence-model/contradictions.ts`, `material-findings.ts`, `visibility-gaps.ts`, `scenarios.ts`, `roadmap-dependencies.ts` | The method's own evidence of false comfort is richer than a domain threshold; scenario statuses ignore follow-ups (P6) | Selection and wording for MFRS runs |
| E6 | Essential narrative pipeline: new Fact Pack facts (frame basis, applicable count and excluded areas, outstanding items by function, scenario statuses with qualifiers, contradiction qualifiers, the published range, the comparability statement); question signals carrying the method's own level descriptions; pre-AI gate and validator rules: an unknown, unreached or not-yet-applicable item is never described as a weakness; no comparison or trend with an MFRS score; a contradiction is worded as the organisation's own answers; numbers only from the Fact Pack; "management should hold", never "MK verified" | `narrative/fact-pack.ts`, `pre-ai-gates.ts`, `narrative/validation.ts` and the quality gates | Accuracy and the assurance boundary with the new inputs; the Phase 2 checks V05, V06, V11, V16 to V18 port directly | AI writer, Story Plan and Blueprint mechanics, renderer |
| E7 | Comprehensive deterministic pipeline: the frozen contract's input statement ("68 question responses on a 0..4 scale") made method-scoped; the question-trace register gains class, state, provenance and outstanding columns; the management model consumes the E5 findings; the six interpretation slots receive the E6 facts | `comprehensive/product-contract.ts`, `register.ts`, `workbook-builder.ts`, `management-model.ts`, `assessment-scope.ts` | The contract would otherwise misstate its own basis; the registers must trace the new states | Deterministic assembly, rendering, per-field validation, no reviewer dependency |
| E8 | Snapshot: domain insights and attention areas from method-scoped content; the free boundary unchanged | `snapshot/*` | Domain codes collide | Snapshot route, token, storage, boundary with paid tiers |
| E9 | Bridge from the review session to the existing assessment record and Snapshot token (C1), so customers answer once and orders work unchanged | review service, new adapter | One journey (F7); depends on B2 and storage | Catalogue, prices, product codes, orders, payment, entitlement, fulfilment |

**What the richer questionnaire adds to the paid reports, within those changes.** Interpretation: the scenario picture (how each applicable fraud scenario stands, from 122 with their mechanism and consequence) and the split by area, instead of an average. Practical recommendations: the method's own description of the practice in place for 133 practices and the next level description for each anchored control, as the target state. Governance guidance: accountable owners for 121 modules grouped into eight function packages, outstanding information by function, and 12 cross-objectives linking weaknesses across areas. Implementation detail: records examples for 133 practices worded as what management should hold, named fraud risks for 755 questions, and incident history from 10 event questions (subject to M-10). Contradictions become qualified findings in the organisation's own words. None of this is evidence review: every statement rests on the organisation's answers and the method.

**Tests that would accompany E1 to E9.** Every existing suite unchanged on MFRS fixtures (the nine baseline suites, one of which needs MK's local certification fixture); a dispatch test proving an MFRS run never reaches the new calculator and the reverse; golden revised runs from the Phase 2 sessions with pinned results; contract tests that the persisted shape is unchanged for MFRS and additive for revised runs; validator tests for each new rule; and the Phase 2 checks ported into the Essential and Comprehensive gates.

## 9. Decisions required from MK

Each decision is independent unless noted. The integration assessment's S1 to S11 map as shown; M-1 to M-12 remain as listed there.

**MD-1 Scoring frame (S1).**
Options: (a) frame A, all applicable confirmations, which requires the frame to be completed beyond the 95-screen limit (151 to 275 screens in the simulations, 91 to 97 for the small firm) or by owners; (b) **frame A1, applicable tier 1 confirmations, each counted once, with tier 2 and 3 reported beside the number**; (c) whatever confirmations the interview reached.
Recommendation: (b). Tier 1 is always complete within the production limit in the simulations, its result does not depend on the path, it is 91% anchored, and it tracks the full frame closely. Trade-off: tier 2 and 3 answers do not move the number; their weight shows in findings, the scenario picture and coverage. Option (c) is not defensible: it withheld weak organisations and mis-stated the mixed one by 22.6 points.

**MD-2 Tiers become a scoring classification (S7).**
Options: (a) **approve the current tiering (55, 50 and 17 scenarios) as the definition of the scored minimum, after MK reviews D8 (two tier 1 confirmations) and any scenario MK considers misplaced**; (b) re-tier before release; (c) keep tiers for questioning order only and use frame A with tier weights.
Recommendation: (a). Under A1 the tiering decides what is scored, which until now it did not; any later re-tiering is a new methodology version. Trade-off: D8 has no domain figure under the current tiering.

**MD-3 Practice and choice answers (S2).**
Options: T1 exclude; **T2 interval from the method's class-to-level relation, published at the midpoint with the range disclosed**; T3 lower end; T4 fixed midpoint; T5 label equivalent.
Recommendation: T2. It uses only the relation the method itself states, keeps every tier 1 confirmation in the number and shows the uncertainty. T1 is the acceptable alternative if MK prefers no assumption at all (under A1 it moves results by at most 1.2 points). T5 is not recommended.

**MD-4 "Set out or agreed, but not yet working in practice" (assumption H-D).**
Options: (a) **levels 1 to 2 (20 to 40)**; (b) the same range as "partly" (20 to 60); (c) exclude this answer only.
Recommendation: (a), from the option labels "Informal / reactive" and "Partly designed"; it affects no tier 1 result in the simulations.

**MD-5 "No case has tested it", "not applicable" and reused answers (S3).**
Recommendation: outside the denominator, disclosed, never a gap; a reused answer counts once, from its source.

**MD-6 Unknown and outstanding information, and its thresholds (S4).**
Options: (a) **one outstanding share over the tier 1 frame (unknown, not reached, applicability not known); provisional above 0%, withheld at 15% or more; every item listed by function and owner; never a value or penalty**; (b) the MFRS thresholds (20% and 30% unknown, any exclusion provisional); (c) separate thresholds for each kind of outstanding item.
Recommendation: (a). (b) makes every revised result provisional or worse. With the 15% threshold every result still shown stayed within 4.7 points of its complete value in 480 runs with unknowns, and within 2.7 points after an early stop, while early stops up to 8.7 points off were withheld. Trade-off: most results with any unknown will be provisional; MK may prefer a different threshold, and R§9.2 shows the deviation at each rate.

**MD-7 Paid reports while information is outstanding (S5).**
Options: (a) **generate on a provisional result with the outstanding list, and re-issue after owners answer through the existing `correction_recalc` run**; (b) wait a fixed period for owners; (c) no score until nothing is outstanding.
Recommendation: (a), with the commercial handling of re-issues for MK. An insufficient result still delivers the scenario picture, findings and outstanding list, as the engines do now for insufficient visibility.

**MD-8 Dependents of a parent reported absent (S6).**
Recommendation: as proposed in the integration assessment: the parent carries the result; dependents are disclosed under it and not scored.

**MD-9 False comfort (S8).**
Options: F0 to F4, or **F2 with F4, each contradiction disclosed**.
Recommendation: F2 + F4. Trade-off: an organisation whose follow-up gap is narrower than its confirmation's scope loses credit it may deserve; F4 reacts to a single tier 1 contradiction. The reverse case is disclosed and never raises a score.

**MD-10 A consistency sample in a future interview version.**
Options: (a) none; (b) **approve in principle a small fixed sample of follow-ups for tier 1 confirmations reported in place, for a future engine and bank version**; (c) follow up every in-place confirmation.
Recommendation: (b), sized by MK against the screen budget. Without it, contradictions can surface only by routing accident, and the strongest-looking results are the least tested. Not part of the report-engine work and not evidence review.

**MD-11 Overall aggregation (S9).**
Options: **pooled over tier 1**; equal domains; tier-weighted; MK-set domain weights; no overall figure.
Recommendation: pooled. Trade-off: governance (D1) carries about a fifth of the potential weight.

**MD-12 Domain figures.**
Recommendation: shown only with three or more scored tier 1 confirmations; otherwise the class profile and scenario picture.

**MD-13 Caps (S10).**
Options: none; **K1 to K3 on tier 1 confirmations**; K1 to K4.
Recommendation: K1 to K3, the revised method's equivalent of hard gates and critical controls. No domain cap unless MK designates core domains.

**MD-14 Bands (S11).**
Recommendation: keep Reactive, Developing, Structured and Strategic at 40, 60 and 80 for meaning, not comparability; read the band from the lower end of the published range.

**MD-15 Comparability and history.**
Recommendation: every result carries its methodology version; MFRS history is reproduced and shown separately; no trend, delta or narrative across methods; cross-organisation comparison only at band level, for NORMAL results, with the applicable tier 1 count. A bridging study only if MK commissions M-11.

**MD-16 Report-engine scope.**
Recommendation: approve E1 to E9 as the implementation scope once MD-1 to MD-15 are decided, with the tests in section 8, behind the existing release gates; no new report architecture; no evidence review in any automated product.

## 10. Limits of this simulation

- All records are fictional. Answer patterns are scripted and keyed by question, not drawn from real respondents; real answer distributions may cluster differently.
- The contradiction profile (P6) was built by correcting confirmations after weak follow-ups. That path is reachable in the product, but how often real respondents do it is unknown.
- The extended screen limit is a research device to see the complete frame; the product limit is 95.
- Thresholds (15%, three confirmations, the cap rules and the band thresholds) are hypotheses chosen to make the trade-offs visible, not calibrated values.
- The simulation uses review engine build 1.5 with bank 1.3 and coverage map 1.3; a bank change (tiers, follow-ups, routes) changes the findings, which is why each methodology version must pin its bank and engine.
- The class interval rests on the method's own relation for anchored questions and on assumption H-D for "set out but not working".
- Hosted database verification is still pending, separately: no key has been placed on MK's computer.

## 11. Files, reproduction and checks

| File | What it is |
|---|---|
| `scripts/research/scoring-simulation/lib.mjs` | Engine, bank, fictional profiles, deterministic answer policies |
| `scripts/research/scoring-simulation/membership.mjs` | The membership matrix and its summary |
| `scripts/research/scoring-simulation/calculator.mjs` | The hypothetical frame calculator: frames, treatments, weighting, aggregation, false comfort, visibility, caps, bands |
| `scripts/research/scoring-simulation/fixtures.mjs` | The supplied session and the seven golden sessions, copied from the Phase 2 tests and checked against their pinned log digests |
| `scripts/research/scoring-simulation/run.mjs` | Every simulation in this package; writes `methodology-simulation/` |
| `scripts/research/scoring-simulation/check.mjs` | Twelve invariant checks |
| `docs/readiness-review/methodology-simulation/` | `SIMULATION-RESULTS.md`, `membership-matrix.csv`, `membership-summary.json`, `results.json` |

Run, from the repository root with Node 22 or later:

```
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/scoring-simulation/run.mjs
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/scoring-simulation/check.mjs
```

Results on this commit: the simulation is deterministic (S-12) and the checks pass 12 of 12. Existing suites rerun unchanged against the baseline: g27 adaptive scoring, g27 adaptive correction, g25 adaptive engine, adaptive semantics 7 of 7, Essential contract 22 of 22, Comprehensive contract gate, narrative assurance 6 of 6, Snapshot narrative 28 of 28; Phase 2 report engine 17 of 17. The ninth baseline suite (Essential presentation) still needs MK's local certification fixture.

## 12. Constraints observed

No production or shared-preview change; no push, merge or deployment; no real customer data; no production scoring value, weight, classification, aggregation rule, risk ranking, migration or commercial integration; existing engines, historical scores, prices, entitlements and product codes untouched; the secret key not requested or moved. B2, B3, B4, B5, B6, B7, B11 and J-01 remain open.
