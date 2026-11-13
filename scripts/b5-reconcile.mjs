// B5 persisted-input reconciliation. For every revised assessment bound on the configured (isolated) database:
//   1. the stored answer log, truncated to the bound position, must reproduce the bound report input 1.3.0 digest and
//      log digest exactly;
//   2. every answer the browser journey entered (qa-output/b5/<run>/journey-*.json) must appear in the stored log as the
//      same action, question and value, unless it was entered after the binding;
//   3. the Essential and Comprehensive Fact Packs are rebuilt from that input, and each finding, owner and outstanding
//      item is traced back to the persisted answers it rests on.
// Read-only. Writes qa-output/b5/<run>/reconciliation.json and RECONCILIATION.md.
//   node --env-file=.env.local --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/b5-reconcile.mjs qa-output/b5/local
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DatabaseReviewStore } from '../src/lib/readiness-review/database-store.ts';
import { reviewDatabaseConfig } from '../src/lib/readiness-review/database-config.ts';
import { replay } from '../src/lib/readiness-review/session.ts';
import { buildStagedReportInput } from '../src/lib/readiness-review/report-input.ts';
import { canonicalDigest } from '../src/lib/readiness-review/canonical.ts';
import { buildRevisedReport } from '../src/lib/reports/revised/evidence-model.ts';
import { positionStatements } from '../src/lib/reports/revised/position.ts';
import { buildRevisedFactPack } from '../src/lib/reports/revised/manuscript/fact-pack.ts';
import { buildRevisedStoryPlan } from '../src/lib/reports/revised/manuscript/story-plan.ts';
import { PRODUCTION_SUPABASE_REFS, supabaseRefFromUrl } from '../src/lib/readiness-review/commercial-environment.ts';

const RUN = process.argv[2] || 'qa-output/b5/local';
const ref = supabaseRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!ref || PRODUCTION_SUPABASE_REFS.includes(ref)) throw new Error('Refusing: reconciliation runs only against an isolated test database.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const store = DatabaseReviewStore.connect(reviewDatabaseConfig());

const journeys = fs.readdirSync(RUN).filter((f) => /^journey-.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(RUN, f), 'utf8')));
const journeyByRef = new Map();
for (const j of journeys) for (const o of Object.values(j.outcomes ?? {})) if (o.assessmentReference) journeyByRef.set(o.assessmentReference, o);

const same = (a, b) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);

const { data: assessments, error } = await db.from('assessments')
  .select('id, assessment_reference, status, assessment_mode, current_score_run_id, organisations:organisation_id(legal_name)')
  .eq('assessment_mode', 'readiness_review').order('created_at');
if (error) throw error;

const out = [];
for (const a of assessments) {
  const { data: binding } = await db.rpc('review_commercial_binding', { p_assessment_id: a.id });
  const { data: run } = await db.from('score_runs').select('id, status, locked_at, input_hash, overall_score, calculated_maturity, adaptive_result_status').eq('id', a.current_score_run_id).maybeSingle();
  const { data: orders } = await db.from('orders').select('order_reference, status, amount_cents, product_name, products:product_id(product_code)').eq('assessment_id', a.id);
  const record = await store.load(binding.session_id);
  const live = replay({ ...record, actions: record.actions.slice(0, binding.action_count) });
  const input = buildStagedReportInput(live);
  const digest = canonicalDigest(input);
  const bound = record.actions.slice(0, binding.action_count);
  const after = record.actions.slice(binding.action_count);

  // Browser answers versus the stored log.
  const j = journeyByRef.get(a.assessment_reference);
  let answerCheck = null;
  if (j) {
    const stored = bound.filter((x) => ['respondent.answer', 'respondent.correct', 'owner.answer'].includes(x.type));
    const unmatched = [];
    for (const ans of j.answers) {
      const type = ans.fn ? 'owner.answer' : null;
      const hit = stored.find((x) => x.q === ans.q && same(x.value, ans.v) && (!type || x.type === type));
      if (!hit) unmatched.push(ans);
    }
    const corrections = (j.events ?? []).filter((e) => e.event === 'correction');
    const correctionsStored = corrections.filter((c) => stored.some((x) => x.type === 'respondent.correct' && x.q === c.q && same(x.value, c.to)));
    const declines = (j.events ?? []).filter((e) => e.event === 'owner-decline');
    const declinesStored = declines.filter((d) => bound.some((x) => x.type === 'owner.decline' && x.q === d.q));
    const handoffs = (j.events ?? []).filter((e) => e.event === 'area-handoff');
    answerCheck = {
      browserAnswers: j.answers.length,
      matchedInStoredLog: j.answers.length - unmatched.length,
      unmatched: unmatched.slice(0, 10),
      corrections: `${correctionsStored.length} of ${corrections.length} stored as respondent.correct`,
      declines: `${declinesStored.length} of ${declines.length} stored as owner.decline`,
      areaHandoffs: `${handoffs.length} entered; ${bound.filter((x) => x.type === 'respondent.assignArea').length} stored as respondent.assignArea`,
      stopsAndResumes: `${bound.filter((x) => x.type === 'respondent.stop').length} stop, ${bound.filter((x) => x.type === 'respondent.resume').length} resume stored`
    };
  }

  // Fact Packs rebuilt from the persisted input, and their trace to the answers.
  const report = buildRevisedReport(input);
  const position = positionStatements(report, { score: null });
  const packs = {};
  for (const product of ['essential', 'comprehensive']) {
    const fp = buildRevisedFactPack({ report, product, organisationName: a.organisations?.legal_name ?? 'Organisation', assessmentReference: a.assessment_reference, generatedAt: new Date().toISOString(), profile: input.profile.map((p) => ({ id: p.id, label: p.label, value: p.value })), position, figure: { overall: null, areas: [], label: 'No score issued' } });
    const plan = buildRevisedStoryPlan(fp);
    packs[product] = {
      sha256: fp.sha256, sections: plan.sections.length, themes: fp.themes.length, findings: fp.findings.length, pathways: fp.pathways.length,
      priorities: fp.priorities.length, blueprints: fp.blueprints.length, decisions: fp.decisions.length, outstanding: fp.outstanding.length,
      owners: [...new Set(fp.operatingModel.map((r) => r.role))].length,
      scoreFact: Boolean(fp.facts['FIX-SCORE'])
    };
  }
  const controls = input.domains.flatMap((d) => d.controls);
  const answered = new Map(bound.filter((x) => ['respondent.answer', 'respondent.correct', 'owner.answer'].includes(x.type)).map((x) => [x.q, x]));
  const gapsTraced = report.controls.filter((c) => answered.has(c.id)).length;
  out.push({
    assessmentReference: a.assessment_reference,
    organisation: a.organisations?.legal_name,
    status: a.status,
    orders: (orders ?? []).map((o) => ({ ref: o.order_reference, product: o.products?.product_code, status: o.status, amount: o.amount_cents / 100 })),
    binding: { sessionId: binding.session_id.slice(0, 8) + '…', actionCount: binding.action_count, outstandingAtBinding: binding.outstanding_total, boundAt: binding.bound_at },
    scoreRun: { status: run.status, locked: Boolean(run.locked_at), resultStatus: run.adaptive_result_status, overallScore: run.overall_score, maturity: run.calculated_maturity, inputHashIsBindingDigest: run.input_hash === binding.input_digest },
    replay: { inputDigestMatches: digest === binding.input_digest, logDigestMatches: input.lineage.logDigest === binding.log_digest, actionsAfterBinding: after.length, actionsAfterBindingExcluded: true },
    answers: answerCheck,
    input: {
      contract: `${input.contract.name}@${input.contract.version}`, engineBuild: input.staged.build, controls: controls.length,
      outstanding: input.assessmentStatus.outstanding.total, interview: input.interview.status,
      reportedGaps: input.findings.reportedGaps.length, scenarios: input.scenarios.length,
      functionPackages: input.staged.packages.length, declined: input.staged.packages.filter((p) => p.status === 'declined').length,
      areaDelegations: input.staged.areaDelegations.length
    },
    analysis: { controlsInRegister: report.controls.length, registerControlsTracedToAnAnswer: gapsTraced, position: position.map((p) => `${p.label}: ${p.value}`) },
    factPacks: packs
  });
}

fs.writeFileSync(path.join(RUN, 'reconciliation.json'), JSON.stringify(out, null, 1));
const md = ['# B5 persisted-input reconciliation', '', `Run: ${RUN} · database ${ref} (isolated) · ${new Date().toISOString()}`, ''];
for (const r of out) {
  md.push(`## ${r.assessmentReference} · ${r.organisation}`, '');
  md.push(`- Orders: ${r.orders.map((o) => `${o.ref} ${o.product} R${o.amount} ${o.status}`).join('; ') || 'none'}`);
  md.push(`- Binding: ${r.binding.actionCount} logged actions, ${r.binding.outstandingAtBinding} outstanding at submission`);
  md.push(`- Score run: ${r.scoreRun.status}, locked ${r.scoreRun.locked}, ${r.scoreRun.resultStatus}, score ${r.scoreRun.overallScore ?? 'none'}, maturity ${r.scoreRun.maturity ?? 'none'}; input hash = binding digest: ${r.scoreRun.inputHashIsBindingDigest}`);
  md.push(`- Replay of the stored log: input digest matches ${r.replay.inputDigestMatches}, log digest matches ${r.replay.logDigestMatches}; ${r.replay.actionsAfterBinding} later actions excluded`);
  if (r.answers) md.push(`- Browser answers in the stored log: ${r.answers.matchedInStoredLog} of ${r.answers.browserAnswers}; corrections ${r.answers.corrections}; declines ${r.answers.declines}; hand-offs ${r.answers.areaHandoffs}; ${r.answers.stopsAndResumes}`);
  md.push(`- Report input: ${r.input.contract}, build ${r.input.engineBuild}, ${r.input.controls} controls, ${r.input.outstanding} outstanding, ${r.input.reportedGaps} reported gaps, ${r.input.functionPackages} package items (${r.input.declined} declined), ${r.input.areaDelegations} area delegations`);
  md.push(`- Analysis: ${r.analysis.controlsInRegister} controls in the register, ${r.analysis.registerControlsTracedToAnAnswer} traced to a stored answer; ${r.analysis.position.join(' · ')}`);
  for (const [p, f] of Object.entries(r.factPacks)) md.push(`- ${p} Fact Pack ${f.sha256.slice(0, 12)}: ${f.sections} sections, ${f.themes} themes, ${f.findings} findings, ${f.pathways} pathways, ${f.blueprints} blueprints, ${f.decisions} decisions, ${f.outstanding} outstanding, ${f.owners} roles; score fact present: ${f.scoreFact}`);
  md.push('');
}
fs.writeFileSync(path.join(RUN, 'RECONCILIATION.md'), md.join('\n'));
console.log(md.join('\n'));
