// HYPOTHETICAL RESEARCH ONLY. Review of the 17 objectives in coverage map 1.3 that no scenario confirmation covers:
// where each applies, what the reports need from it, and the smallest change to the coverage map that would let the
// proposed scoring frame (every applicable scenario confirmation) represent it. The proposed changes are applied to an
// in-memory copy of the coverage map only; the shipped bank, coverage map and engines are unchanged.
// Run: node scripts/research/objectives/review.mjs [--check]
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BANK, COVERAGE, PROFILES, POLICIES, QI, ROOT, HYPOTHETICAL, practiceValue, factValue, withUnknown } from '../scoring-simulation/lib.mjs';

const require = createRequire(import.meta.url);
const REVIEW16 = require(path.join(ROOT, 'src/lib/readiness-review/vendor/review-engine-build-1.6.cjs'));
const OUT = path.join(ROOT, 'docs/readiness-review/objectives');
const SEED = 'mk-sim';
const ROLE = COVERAGE.questionRole;
const NOW = () => '2026-11-11T08:00:00.000Z';
const LEVEL_CLASS = { 0: 'absent', 1: 'partial', 2: 'partial', 3: 'partial', 4: 'full', 5: 'full' };
const MID = { full: 90, partial: 40, designed: 30, absent: 0 };

// ------------------------------------------------------------------------------------------------ the 17 objectives
const confirmObjectives = new Set(Object.keys(ROLE).filter((id) => ROLE[id].role === 'confirm' && QI.get(id)?.type === 'practice' && !QI.get(id)?.retired).flatMap((id) => ROLE[id].objectives || []));
const ALL_OBJECTIVES = [...COVERAGE.objectives, ...(COVERAGE.crossObjectives || [])];
const practiceObjectives = new Set(Object.keys(ROLE).filter((id) => QI.get(id)?.type === 'practice' && !QI.get(id)?.retired).flatMap((id) => ROLE[id].objectives || []));
const UNCOVERED = ALL_OBJECTIVES.filter((o) => practiceObjectives.has(o.id) && !confirmObjectives.has(o.id)).map((o) => o.id);
const UNCOVERED_SET = new Set(UNCOVERED);

// ------------------------------------------------------------------------------------------------ the proposal
// Judgement, for MK's review. A scored confirmation is proposed only where all four hold:
//   (a) the objective describes a control that on its own prevents or detects a material fraud scenario, not a quality
//       attribute, document or maturity feature of another control;
//   (b) it applies to a broad class of organisations;
//   (c) an organisation could report every existing confirmation in place while this control is absent (the P6b
//       pattern), so the frame would otherwise overstate readiness;
//   (d) a reporting promise relies on it (an Essential finding or priority control, or a Comprehensive blueprint).
// Otherwise the objective stays diagnostic (asked in function packages, reported as findings and blueprint current
// state, never scored) or sits outside the scored frame (facts and case history).
const PROPOSAL = {
  'OBJ-D2-identification': {
    relevance: 'Foundational', treatment: 'revised-confirmation',
    change: { scenario: 'FS-D2-01', question: 'D2-I-01', route: { when: { q: 'D2-G-01', in: ['dedicated', 'erm'] } }, removeFollowup: false },
    why: 'FS-D2-01 ("Fraud risks are never identified") is confirmed by D2-G-01, which records only that an assessment exists. An assessment that names general labels ("theft") identifies no scheme a control can be tested against. Adding D2-I-01 as a second confirmation on the route the scenario already uses for organisations with an assessment mirrors its existing route for informal or no assessment (D2-N-04).',
    reports: 'Essential: a priority finding on risk identification and the systemic theme on governance. Comprehensive: the target operating model (risk challenge and coordination) and the blueprint for the risk assessment itself.'
  },
  'OBJ-D4-orders': {
    relevance: 'Foundational', treatment: 'revised-confirmation',
    change: { scenario: 'FS-D4-05', question: 'D4-P-01', route: { when: null }, removeFollowup: false },
    why: 'FS-D4-05 ("Invoices are paid for goods or services not received or not agreed") is confirmed by D4-V-01, the check at the point of payment against "what was approved". Where nothing is approved before the commitment, the check compares the invoice with an approval raised after the event. Approval before commitment (D4-P-01, "through a purchase order or another recorded approval") is the "agreed" half of the scenario and applies to every organisation that buys.',
    reports: 'Essential: a priority control in procurement and a fraud scenario (commitment without approval, split orders). Comprehensive: the procurement blueprint (population, frequency, independent check).'
  },
  'OBJ-D5-verification': {
    relevance: 'Foundational', treatment: 'revised-confirmation',
    change: { scenario: 'FS-D5-02', question: 'D5-V-01', route: { when: null }, removeFollowup: true },
    why: 'FS-D5-02 ("Ghost employees are paid") is confirmed by a review of each payroll run (D5-P-01) or of the bureau report (D5-O-05). Those reviews look at changes and totals; a ghost already on the payroll passes them every month. Matching the people paid to real employees (D5-V-01) is the control that finds one. It is currently a follow-up; it moves from the follow-ups to the confirmations of the same scenario.',
    reports: 'Essential: the payroll priority finding and the ghost-employee scenario, which is one of the most familiar fraud stories for South African organisations. Comprehensive: the payroll blueprint.'
  },
  'OBJ-D5-highrisk': {
    relevance: 'Foundational', treatment: 'revised-confirmation',
    change: { scenario: 'FS-D5-12', question: 'D5-H-01', route: { when: null }, removeFollowup: true },
    why: 'FS-D5-12 ("An insider in a high-risk role works unchecked") is confirmed by mandatory block leave (D5-K-01). Block leave protects only the roles the organisation has identified as high-risk; without D5-H-01 (high-risk roles identified) the confirmation can be reported in place for an undefined population. It is currently a follow-up; it moves to the confirmations of the same scenario.',
    reports: 'Essential: the insider-risk finding. Comprehensive: the operating model (who holds money-moving and master-data rights) and the people-risk blueprint.'
  },
  'OBJ-D3-training': {
    relevance: 'Foundational', treatment: 'revised-confirmation',
    change: { scenario: 'FS-D3-10', question: 'D3-A-03', route: { when: null }, removeFollowup: false },
    why: 'No confirmation asks whether the people most likely to be targeted (finance, procurement, payroll, sales and IT) are trained on the frauds they face. FS-D3-10 ("Staff do not know or understand what is expected") is confirmed by D3-C-04, which concerns standards of conduct. D3-A-03 is added as its second confirmation. FS-D3-10 is tier 3; whether training of high-risk roles warrants a higher tier is left to MK (prioritisation is an open decision).',
    reports: 'Essential: a common first-90-day priority control (targeted awareness for high-risk roles). Comprehensive: the leadership decision on awareness investment and the 12-month plan.'
  },
  'OBJ-D2-ownership': { relevance: 'Supporting', treatment: 'diagnostic', why: 'Management acceptance and participation in the assessment are the conditions under which FS-D2-05 (a response is decided for risks above tolerance, D2-P-01) is met. The confirmation that matters is the response; ownership explains a gap in it.', reports: 'Comprehensive: target operating model (risk challenge and coordination). Essential: context for a risk-assessment finding.' },
  'OBJ-D2-rating': { relevance: 'Maturity', treatment: 'diagnostic', why: 'Rating method, inherent and residual ratings and comparison with tolerance describe how mature the assessment is. FS-D2-05 already confirms that risks above tolerance receive a decided response.', reports: 'Comprehensive: current state of the risk-assessment blueprint.' },
  'OBJ-D2-evidence': { relevance: 'Supporting', treatment: 'diagnostic', why: 'Documentation and links to other risk work make the assessment defensible and shared; they are attributes of the assessment, not a control over a fraud scenario. MK may want legal advice on whether documentation should carry more weight for the PRECCA adequate-procedures position.', reports: 'Comprehensive: blueprint evidence and proof retained; operating model connections.' },
  'OBJ-D3-monitoring': { relevance: 'Maturity', treatment: 'diagnostic', why: 'Review of the ethics programme and trend reporting apply mainly to larger and public organisations and describe the second and third line over the ethics programme, not a control over a scenario.', reports: 'Comprehensive: management scorecard and assurance in the operating model.' },
  'OBJ-D4-receiving': { relevance: 'Supporting', treatment: 'diagnostic', why: 'Confirmation of receipt is already part of the FS-D4-05 confirmation (D4-V-01 asks for a check "against confirmation that the goods or services were received"). D4-R-01 also assumes goods: no fact in bank 1.3 separates organisations that buy only services, so as a confirmation it would be answered as a gap by service-only buyers.', reports: 'Comprehensive: procurement blueprint current state; consistency check candidate (D4-R-03 is already a follow-up of FS-D4-05).' },
  'OBJ-D4-contracts': { relevance: 'Supporting', treatment: 'diagnostic', why: 'FS-D4-13 confirms the decisive control (variations approved before work goes ahead, D4-K-04). The register, tracking and reviews describe how well contracts are administered.', reports: 'Comprehensive: procurement blueprint and scorecard measures.' },
  'OBJ-D4-monitoring': { relevance: 'Supporting', treatment: 'diagnostic', why: 'FS-D4-12 confirms monthly senior review of supplier payments (D4-V-15). Data analysis, reviewer independence and independent examination deepen detection; they describe its quality.', reports: 'Comprehensive: monitoring and detection responsibility in the operating model.' },
  'OBJ-X-11': { relevance: 'Proportionate', treatment: 'diagnostic', why: 'Independent assurance over high-risk processes is third-line activity that tests controls rather than operating one. Many owner-managed organisations have no internal audit and cannot reasonably be expected to. A size-conditioned tier 3 confirmation could be considered, but that conditioning is itself an MK decision.', reports: 'Comprehensive: Audit Committee and board oversight in the operating model.' },
  'OBJ-D5-conduct': { relevance: 'Supporting', treatment: 'diagnostic', why: 'Behavioural indicators, financial-wellness support and lifestyle reviews are sensitive and partly regulated (POPIA, labour law). They inform recommendations; scoring them would reward intrusive practices.', reports: 'Comprehensive: people-risk blueprint, with the lawful-basis caveat.' },
  'OBJ-D4-scope': { relevance: 'Not a control', treatment: 'outside', why: 'A scope objective: its questions switch later modules on or off. Its one practice-typed question (D4-S-07, written contracts for ongoing or significant work) is recorded as a data observation: MK may want it retyped as a fact or moved to OBJ-D4-contracts.', reports: 'Context for applicability only.' },
  'OBJ-D8-gateway': { relevance: 'Not a control', treatment: 'outside', why: 'Establishes which physical things of value the organisation holds. D8-S-04 (how stock is recorded) is a fact that opens the stock controls.', reports: 'Context for applicability only.' },
  'OBJ-D10-lastcase': { relevance: 'Not a control', treatment: 'outside', why: 'Facts about the most recent case. They show how fraud is found and handled here and feed narrative comparisons; one event is not a standing control and would make the frame depend on whether a case happened.', reports: 'Essential and Comprehensive narrative (how the last case was found and handled); the legal reporting duty is confirmed separately in D1.' }
};

// ------------------------------------------------------------------------------------------------ the patched coverage map
function patchedCoverage() {
  const cov = JSON.parse(JSON.stringify(COVERAGE));
  for (const [obj, p] of Object.entries(PROPOSAL)) {
    if (!p.change) continue;
    const { scenario, question, route, removeFollowup } = p.change;
    const s = cov.scenarios.find((x) => x.id === scenario);
    const existing = s.routes.find((r) => JSON.stringify(r.when) === JSON.stringify(route.when));
    if (existing) existing.questions.push(question);
    else s.routes.push({ when: route.when, questions: [question] });
    s.confirm.push([route.when ? `${route.when.q}=${route.when.in.join(',')}` : null, question]);
    if (removeFollowup) s.followups = s.followups.filter((f) => f !== question);
    s.related = (s.related || []).filter((r) => r !== question);
    cov.questionRole[question] = { ...cov.questionRole[question], role: 'confirm', scenario };
  }
  return cov;
}
const PATCHED = patchedCoverage();

// ------------------------------------------------------------------------------------------------ profiles
const ORIGINAL_ROLE = (id) => ROLE[id]?.role;
const PROFILE_RUNS = {
  P1: { name: 'Strong controls', profile: 'R', practice: POLICIES.strong },
  P2: { name: 'Weak controls', profile: 'R', practice: POLICIES.weak },
  P3: { name: 'Mixed controls', profile: 'R', practice: POLICIES.mixed },
  P4: { name: 'Small owner-managed firm', profile: 'S', practice: POLICIES.mixed },
  P5: { name: 'Extensive unanswered information', profile: 'R', practice: withUnknown(POLICIES.mixed, 0.35), truth: POLICIES.mixed },
  // Overstated confirmations, defined on the ORIGINAL roles: the practices proposed for promotion stay weak, as they are
  // in the organisation; promoting them changes what is asked, not what is true.
  P6b: { name: 'Overstated confirmations', profile: 'R', practice: (q, seed) => (ORIGINAL_ROLE(q.id) === 'confirm' ? POLICIES.strong(q, seed) : POLICIES.weak(q, seed)) },
  // Strong everywhere except the practices of the 17 objectives: the case the frame must not miss, a control environment
  // whose only weaknesses sit where no confirmation looks.
  P6c: { name: 'Weak only where no confirmation looks', profile: 'R', practice: (q, seed) => ((ROLE[q.id]?.objectives || []).some((o) => UNCOVERED_SET.has(o)) ? POLICIES.weak(q, seed) : POLICIES.strong(q, seed)) }
};

function run(cov, pk, profileKey = null) {
  // Applicability runs answer every practice strongly, so that practice prerequisites open and the question is only
  // whether the organisation's facts bring the objective into scope.
  const p = PROFILE_RUNS[pk] ?? { profile: profileKey, practice: POLICIES.strong };
  const prof = PROFILES[p.profile];
  const e = REVIEW16.create(BANK, cov, { now: NOW });
  const ans = (q) => (q.id === '__assumptions__' ? ['none'] : q.id.startsWith('PR-') ? prof.answers[q.id] ?? factValue(q, 'open') : q.type !== 'practice' ? factValue(q, prof.facts) : practiceValue(q, p.practice(QI.get(q.id), SEED)));
  for (let n = 0; n < 4000; n++) { const st = e.next({ respondentOnly: true }); if (!st || !st.q) break; e.answer(st.q, ans(st.q), st.kind); }
  const screens = e.respondentScreens();
  // The functions answer what the respondent did not know: what the organisation actually does.
  const truth = p.truth || p.practice;
  for (const fn of e.FUNCTIONS) for (let k = 0; k < 400; k++) {
    const st = e.nextOwner(fn);
    if (!st) break;
    const q = st.q;
    e.ownerReturn(q.id, q.type !== 'practice' ? (q.id.startsWith('PR-') ? prof.answers[q.id] ?? factValue(q, 'open') : factValue(q, prof.facts)) : practiceValue(q, truth(QI.get(q.id), SEED)), { by: fn });
  }
  return { e, screens, truth, prof };
}
const valueOf = (q, v) => { if (v === undefined || v === null || v === 'unknown' || (Array.isArray(v) && v.includes('unknown'))) return null; if (q.format === 'anchored' && /^[0-5]$/.test(String(v))) return Number(v) * 20; return null; };
function controlValue(e, id, truth) {
  const q = e.QI[id];
  const a = e.S.ans[id];
  if (a && !a.stale) { if (a.v === 'unknown') return null; const lv = valueOf(q, a.v); if (lv !== null) return lv; return MID[a.cls] ?? null; }
  // Not asked: what the organisation would answer, if the practice applies (used for frames that ask it).
  if (e.scope(q).st !== 'applicable') return null;
  const target = truth(QI.get(id), SEED);
  if (target === 'unknown') return null;
  const v = practiceValue(QI.get(id), target);
  const lv = valueOf(q, v);
  if (lv !== null) return lv;
  const cls = q.format === 'choicePractice' ? q.practiceMap[v] : q.format === 'multi' ? null : v;
  return MID[cls] ?? null;
}
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
function frameIds(rep, cov) {
  const ids = new Set();
  rep.scenarios.filter((s) => s.status !== 'outofscope').forEach((s) => s.confirmations.forEach((c) => { if (!['outofscope', 'proportion', 'precluded', 'retired'].includes(c.state) && cov.questionRole[c.id]?.role === 'confirm') ids.add(c.id); }));
  return [...ids];
}
const COVERAGE_IDS = Object.keys(ROLE).filter((id) => QI.get(id)?.type === 'practice' && !QI.get(id)?.retired && ROLE[id].role !== 'confirm' && (ROLE[id].objectives || []).length && !(ROLE[id].objectives || []).some((o) => confirmObjectives.has(o)));

// ------------------------------------------------------------------------------------------------ measurements
const res = { generated: HYPOTHETICAL, uncovered: UNCOVERED, proposal: PROPOSAL, applicability: {}, frames: {}, burden: {} };
// Applicability across the bank's own personas and the two golden profiles (mixed practice answers).
const ORGS = { A: 'Manufacturer (bank persona A)', B: 'Professional services firm (bank persona B)', C: 'Non-profit (bank persona C)', D: 'Public entity (bank persona D)', R: 'Retail group (golden profile R)', S: 'Small owner-managed firm (golden profile S)' };
for (const k of Object.keys(ORGS)) {
  const { e } = run(COVERAGE, null, k);
  res.applicability[k] = {};
  for (const id of UNCOVERED) {
    const o = ALL_OBJECTIVES.find((x) => x.id === id);
    const qs = (o.questions || []).filter((q) => QI.get(q)?.type === 'practice' && !QI.get(q)?.retired);
    const app = qs.filter((q) => (e.S.ans[q] && !e.S.ans[q].stale) || e.scope(e.QI[q]).st === 'applicable');
    res.applicability[k][id] = { practices: qs.length, applicable: app.length };
  }
}
for (const pk of Object.keys(PROFILE_RUNS)) {
  const base = run(COVERAGE, pk);
  const pat = run(PATCHED, pk);
  const repB = base.e.report(), repP = pat.e.report();
  const aIds = frameIds(repB, COVERAGE), pIds = frameIds(repP, PATCHED);
  const aVals = aIds.map((id) => controlValue(base.e, id, base.truth)).filter((x) => x !== null);
  const cVals = COVERAGE_IDS.map((id) => controlValue(base.e, id, base.truth)).filter((x) => x !== null);
  const pVals = pIds.map((id) => controlValue(pat.e, id, pat.truth)).filter((x) => x !== null);
  const promoted = Object.values(PROPOSAL).filter((p) => p.change).map((p) => p.change.question);
  const promotedApplicable = promoted.filter((id) => pIds.includes(id));
  const A = mean(aVals), AC = mean([...aVals, ...cVals]), AP = mean(pVals);
  const d = (x) => (x === null || A === null ? null : Math.round((x - A) * 10) / 10);
  res.frames[pk] = { A, AplusC: AC, AplusP: AP, deltaC: d(AC), deltaP: d(AP), frameA: aVals.length, coverageScored: cVals.length, frameAP: pVals.length, promotedApplicable };
  res.burden[pk] = { respondentScreensA: base.screens, respondentScreensAP: pat.screens, added: pat.screens - base.screens, breadthA: base.e.stages().breadth.applicableSoFar, breadthAP: pat.e.stages().breadth.applicableSoFar };
}

// ------------------------------------------------------------------------------------------------ output
mkdirSync(OUT, { recursive: true });
const name = (id) => ALL_OBJECTIVES.find((o) => o.id === id)?.name ?? id;
const md = [];
const p = (t = '') => md.push(t);
const tbl = (head, rows) => { p(`| ${head.join(' | ')} |`); p(`|${head.map(() => '---').join('|')}|`); rows.forEach((r) => p(`| ${r.join(' | ')} |`)); p(); };
p('# The 17 objectives without a scenario confirmation (generated)');
p();
p(`> ${HYPOTHETICAL}. Generated by \`scripts/research/objectives/review.mjs\` from bank ${BANK.bankVersion}, coverage map 1.3 and review engine build 1.6. The proposed changes are applied to an in-memory copy of the coverage map only. Fictional organisations only. Frame figures are a pooled mean of midpoint values (anchored level x 20; full 90, partial 40, designed 30, not in place 0) with no caps, no treatment for contradictions and no visibility rule, so the three frames can be compared on the same basis; they are not proposed scores.`);
p();
p('## Test used');
p();
p('A scored confirmation is proposed only where all four hold: (a) the objective describes a control that on its own prevents or detects a material fraud scenario, not a quality attribute, document or maturity feature of another control; (b) it applies to a broad class of organisations; (c) an organisation could report every existing confirmation in place while this control is absent, so the frame would otherwise overstate readiness; (d) a reporting promise relies on it. Otherwise the objective stays diagnostic (asked in function packages, reported as findings and blueprint current state, never scored), or sits outside the scored frame (facts and case history).');
p();
p('## Classification');
p();
const T = { 'revised-confirmation': 'Confirmation added to an existing scenario', diagnostic: 'Remains diagnostic', outside: 'Outside the scored frame' };
tbl(['Objective', 'Practices', 'Applies to (of 6 fictional organisations)', 'Relevance', 'Treatment', 'Reporting promise it serves'], UNCOVERED.map((id) => {
  const pr = PROPOSAL[id];
  const orgs = Object.keys(ORGS).filter((k) => res.applicability[k][id].applicable > 0);
  return [`${id}: ${name(id)}`, String(res.applicability.R[id].practices), orgs.length === 6 ? 'All 6' : `${orgs.length}: ${orgs.join(', ')}`, pr.relevance, T[pr.treatment], pr.reports];
}));
p('## Why each objective is treated as it is');
p();
UNCOVERED.forEach((id) => { const pr = PROPOSAL[id]; p(`**${id}: ${name(id)}.** ${T[pr.treatment]}. ${pr.why}`); p(); });
p('## The minimal coverage-map change');
p();
p('Five questions already in bank 1.3 change role from related or follow-up to confirmation on the scenario they already belong to. No question text, level description, option, scenario, tier or weight changes, and no new question or scenario is added. Two promoted questions are removed from their scenario\'s follow-ups so they are not asked twice; the consistency check then uses the remaining follow-ups.');
p();
tbl(['Scenario (tier)', 'Question added as a confirmation', 'Route', 'Was'], Object.values(PROPOSAL).filter((x) => x.change).map((x) => {
  const s = COVERAGE.scenarios.find((y) => y.id === x.change.scenario);
  return [`${s.id} (${s.tier}): ${s.name}`, `${x.change.question}: ${QI.get(x.change.question).text}`, x.change.route.when ? `${x.change.route.when.q} is ${x.change.route.when.in.join(' or ')}` : 'Always, where the scenario applies', ROLE[x.change.question].role];
}));
p('## Effect on the frame');
p();
p('A is every applicable scenario confirmation today. A+C adds every applicable practice of the 17 objectives (the comparison that moved P6b). A+P is the frame after the five changes. Differences are in points against A on the same basis. P6c is added for this review: strong everywhere except the practices of the 17 objectives.');
p();
const sg = (x) => (x === null ? 'n/a' : `${x > 0 ? '+' : ''}${x}`);
tbl(['Profile', 'A', 'A+P (change)', 'A+C (change)', 'Confirmations in A / A+P', 'Promoted that apply', 'Respondent screens A / A+P'], Object.keys(PROFILE_RUNS).map((pk) => {
  const f = res.frames[pk], b = res.burden[pk];
  return [`${pk} ${PROFILE_RUNS[pk].name}`, String(f.A), `${f.AplusP} (${sg(f.deltaP)})`, `${f.AplusC} (${sg(f.deltaC)}, ${f.coverageScored} practices added)`, `${f.frameA} / ${f.frameAP}`, String(f.promotedApplicable.length), `${b.respondentScreensA} / ${b.respondentScreensAP} (+${b.added})`];
}));
const f6b = res.frames.P6b, f6c = res.frames.P6c;
p(`What the numbers show. The five changes move P6b by ${sg(f6b.deltaP)} points against ${sg(f6b.deltaC)} under A+C, and P6c by ${sg(f6c.deltaP)} against ${sg(f6c.deltaC)}. Most of the A+C movement comes from adding ${f6b.coverageScored} practices that describe how mature, documented or thorough a control is; scoring them would make the number measure the depth of a domain's question set as much as the presence of its key controls, and would penalise organisations in domains where the bank asks more detail. The five promoted controls are the ones whose absence the frame could not see at all: each now counts once as a confirmation. They do not, and are not meant to, reproduce the A+C figure.`);
p();
p('P6b and P6c give the same figures on every frame because the frames read only the confirmations and the practices of the 17 objectives, which the two profiles answer identically; they differ only in the supporting practices of confirmed scenarios, which no frame reads. The consistency check is what tells them apart (`staged-assessment/INFORMATION-GAIN-AND-CONSISTENCY.md`, section 5).');
p();
p('The overstatement P6b models (every confirmation reported in place, every supporting practice reported weak) is a contradiction between answers, not a gap in the frame. Build 1.6 surfaces it through the consistency check, which records each contradiction it finds without changing any figure; whether contradictions should limit a score or a band (F2 and F4) stays inactive until MK decides. The respondent pays for the five changes with one extra screen per promoted question that applies.');
p();
p('## What stays open for MK');
p();
p('- Whether these five changes are adopted, and whether any diagnostic objective (in particular OBJ-X-11, independent assurance, for organisations above a size MK sets) should also be confirmed.');
p('- The tier of FS-D3-10 once it carries training of high-risk roles (tier 3 today).');
p('- D4-S-07 is typed as a practice inside a scope objective; MK may want it retyped as a fact or moved to OBJ-D4-contracts.');
p('- Bank and coverage-map changes need a new coverage-map version, a new ruleset hash and a regression run before any session uses them; none of that is done here.');
p();
writeFileSync(path.join(OUT, 'OBJECTIVES-REVIEW.md'), md.join('\n'));
writeFileSync(path.join(OUT, 'objectives-review.json'), JSON.stringify(res, null, 2) + '\n');
const changes = Object.values(PROPOSAL).filter((x) => x.change).map((x) => ({ ...x.change, objective: Object.keys(PROPOSAL).find((k) => PROPOSAL[k] === x), fromRole: ROLE[x.change.question].role, toRole: 'confirm' }));
writeFileSync(path.join(OUT, 'proposed-coverage-changes.json'), JSON.stringify({ status: 'Proposed for MK review; not applied to coverage map 1.3', changes }, null, 2) + '\n');
if (process.argv.includes('--check')) {
  const errors = [];
  if (UNCOVERED.length !== 17) errors.push(`expected 17 uncovered objectives, found ${UNCOVERED.length}`);
  for (const id of UNCOVERED) if (!PROPOSAL[id]) errors.push(`no treatment for ${id}`);
  const shipped = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/coverage-map-v1.3.json'), 'utf8'));
  if (JSON.stringify(shipped) !== JSON.stringify(COVERAGE)) errors.push('the shipped coverage map was modified');
  if (res.frames.P6b.AplusP >= res.frames.P6b.A) errors.push('P6b frame did not move');
  console.log(errors.length ? `FAIL ${errors.join('; ')}` : `PASS objectives review: 17 classified (${changes.length} confirmations proposed), shipped coverage map unchanged, P6b A ${res.frames.P6b.A} -> A+P ${res.frames.P6b.AplusP} (A+C ${res.frames.P6b.AplusC})`);
  if (errors.length) process.exitCode = 1;
} else console.log(JSON.stringify(res.frames), JSON.stringify(res.burden));
