#!/usr/bin/env node
/**
 * V7-equivalent commercial certification harness. NO PROVIDER.
 *
 * Ordinary checkpoint-F fixtures render 15-23 pages and never reproduced V7's commercial density,
 * so they could not answer the page-count question. This drives the REAL composition pipeline over
 * the retained V7 source data:
 *
 *   AssembledReportData -> buildAdvisoryEvidenceModel -> buildEssentialProjection
 *     -> selectContent -> renderReportHtml -> production PDF renderer -> audit
 *
 * It creates no AI attempt, no generation attempt, no report row, no artefact row, no Storage
 * object, no token and no email: it renders to a standalone file and asserts on it.
 *
 * Source data provenance: src/lib/reports/__fixtures__/bounded-essential-f1-all-zero.json is the
 * already-checked-in, already-sanitised assessment for order MKORD-2026-B1DN82OG (assessment
 * MKFRS-2026-1FB942BC02) -- the exact order V7 was generated from. It carries no token, key, secret
 * or signed URL. Run through the current accepted builders it derives V7's own printed L1 universe
 * (60 findings / 56 risks / 60 control improvements / 243 evidence artefacts / 60 roadmap actions /
 * 130 agenda items), so no new Staging acquisition was required.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection, ESSENTIAL_CAPS } from '../src/lib/reports/essential-projection.ts';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';
import { renderReportHtml } from '../src/lib/reports/templates/report-template.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { renderHtmlToPdfBuffer, __resetPdfRendererStateForTests } from '../src/lib/reports/render-pdf.ts';

// ---------------------------------------------------------------- hard provider guard
// Not "the harness does not import the generator": any attempt to reach a provider boundary throws
// a named error, and the guard is proved active below before anything else runs.
const PROVIDER_GUARD_ERROR = 'CERTIFICATION_PROVIDER_DISPATCH_FORBIDDEN';
for (const key of ['OPENAI_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_AI_GATEWAY_KEY']) delete process.env[key];
globalThis.__MK_CERTIFICATION_PROVIDER_GUARD__ = () => { throw new Error(PROVIDER_GUARD_ERROR); };
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url ?? '');
  if (/openai|anthropic|gateway\.ai|api\.vercel|inference/i.test(url)) {
    throw new Error(`${PROVIDER_GUARD_ERROR}: ${url}`);
  }
  return realFetch(input, init);
};

let summaryScenarioExamples = [];
let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

check('the provider guard is active and named', () => {
  assert.throws(() => globalThis.__MK_CERTIFICATION_PROVIDER_GUARD__(), new RegExp(PROVIDER_GUARD_ERROR));
  assert.throws(() => globalThis.fetch('https://api.openai.com/v1/responses'),
    new RegExp(PROVIDER_GUARD_ERROR), 'a provider host must be refused');
  assert.equal(process.env.OPENAI_API_KEY, undefined, 'no provider key may be available');
});

// ---------------------------------------------------------------- L1 authenticity
const FIXTURE = 'src/lib/reports/__fixtures__/bounded-essential-f1-all-zero.json';
const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const advisoryModel = buildAdvisoryEvidenceModel(data);
const len = (value) => (Array.isArray(value) ? value.length : 0);
const l1 = {
  materialFindings: len(advisoryModel.materialFindings),
  riskRegister: len(advisoryModel.riskRegister),
  scenarios: len(advisoryModel.plausibleScenarios ?? advisoryModel.scenarios),
  controlImprovements: len(advisoryModel.controlImprovements),
  evidenceChecklist: len(advisoryModel.evidenceChecklist),
  roadmapActions: len(advisoryModel.roadmapActions),
  leadershipDecisions: len(advisoryModel.leadershipDecisions),
  functionalAgenda: len(advisoryModel.functionalAgenda),
  contradictions: len(advisoryModel.contradictions),
  visibilityGaps: len(advisoryModel.visibilityGaps)
};

check('the V7 source reproduces its historic L1 universe through the normal builder', () => {
  // Not injected: derived. If this ever stops matching, the L1 universe changed and the certification
  // is no longer V7-equivalent -- which must be investigated, not papered over.
  assert.equal(l1.roadmapActions, 60, 'V7 printed 60 recommended actions');
  assert.equal(l1.materialFindings, 60);
  assert.equal(l1.riskRegister, 56);
  assert.equal(l1.controlImprovements, 60);
  assert.equal(l1.evidenceChecklist, 243);
  assert.equal(l1.functionalAgenda, 130);
});

check('the V7 adaptive condition is reproduced', () => {
  const m = data.scoreRun.adaptiveMetrics;
  assert.equal(m.unknownSharePct, 0);
  assert.equal(m.unansweredApplicableCount, 0);
  assert.equal(m.exposureAssessed, false, 'V7 did not assess exposure');
  assert.equal(m.assessmentCoveragePct, 100);
  assert.equal(m.controlVisibilityPct, 100);
});

check('the frozen fixture carries no secret material', () => {
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  for (const pattern of [/sk-[A-Za-z0-9]{16,}/, /service_role/i, /"token"\s*:\s*"[A-Za-z0-9._-]{16,}/, /X-Amz-Signature/i, /eyJhbGciOi/]) {
    assert.ok(!pattern.test(raw), `fixture must not contain ${pattern}`);
  }
});

// ---------------------------------------------------------------- L2 projection
const projection = buildEssentialProjection(data, advisoryModel);
const l2 = {
  findings: len(projection.findings),
  risks: len(projection.risks),
  scenarios: len(projection.scenarios),
  controlActionRecords: len(projection.controlActionRecords),
  appendixControlActionRecords: len(projection.appendixControlActionRecords),
  evidenceToObtain: len(projection.evidenceToObtain),
  leadershipDecisions: len(projection.leadershipDecisions),
  roadmapActions: len(projection.roadmapActions),
  contradictions: len(projection.contradictions)
};

check('the projection bounds the roadmap without the harness slicing anything', () => {
  assert.ok(l2.roadmapActions <= ESSENTIAL_CAPS.roadmapTotalCeiling,
    `selected roadmap ${l2.roadmapActions} must not exceed ${ESSENTIAL_CAPS.roadmapTotalCeiling}`);
  assert.ok(l2.roadmapActions < l1.roadmapActions, 'the full L1 roadmap must not reach L2');
});

check('dependency closure is preserved in the selected roadmap', () => {
  const selected = new Set(projection.roadmapActions.map((action) => action.id));
  const known = new Set(advisoryModel.roadmapActions.map((action) => action.id));
  for (const action of projection.roadmapActions) {
    for (const dependencyId of action.dependencyIds ?? []) {
      if (!known.has(dependencyId)) continue;
      assert.ok(selected.has(dependencyId),
        `${action.id} depends on ${dependencyId}, which was not selected`);
    }
  }
});

// ---------------------------------------------------------------- E1 non-duplication
const selectedRoadmapIds = projection.roadmapActions.map((action) => action.id);
const selectedRoadmapIdSet = new Set(selectedRoadmapIds);
const excludedForRoadmapLink = advisoryModel.controlActionRecords
  ? advisoryModel.controlActionRecords.filter((record) =>
    (record.linkedRoadmapActionIds ?? []).some((id) => selectedRoadmapIdSet.has(id))).length
  : null;

check('no E1 record links to a selected roadmap action', () => {
  assert.ok(l2.appendixControlActionRecords > 0,
    'E1 must not be empty -- an empty E1 would hide a filter matching the wrong namespace');
  for (const record of projection.appendixControlActionRecords) {
    const intersection = (record.linkedRoadmapActionIds ?? [])
      .filter((id) => selectedRoadmapIdSet.has(id));
    assert.equal(intersection.length, 0,
      `${record.id} duplicates selected roadmap action(s) ${intersection.join(', ')}`);
  }
});

check('E1 respects its cap and retains unrelated controls', () => {
  assert.ok(l2.appendixControlActionRecords <= ESSENTIAL_CAPS.appendixControlActionRecords,
    `E1 ${l2.appendixControlActionRecords} exceeds the ${ESSENTIAL_CAPS.appendixControlActionRecords} cap`);
  const shown = new Set(projection.controlActionRecords.map((record) => record.id));
  for (const record of projection.appendixControlActionRecords) {
    assert.ok(!shown.has(record.id), 'E1 must not repeat the priority control actions');
  }
});

// ---------------------------------------------------------------- render
const OUT_DIR = 'tmp/essential-v7-certification';
const PDF_PATH = path.join(OUT_DIR, 'essential-v7-equivalent-commercial-certification.pdf');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const deterministicContent = selectContent(data, [], projection);
const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
const html = renderReportHtml(data, deterministicContent, roadmap, advisoryModel, undefined, projection);
__resetPdfRendererStateForTests();
const pdf = await renderHtmlToPdfBuffer(html);
fs.writeFileSync(PDF_PATH, pdf);

const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
const pageCount = Number(
  /Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [PDF_PATH], { encoding: 'utf8' }))?.[1] ?? 0);
const text = execFileSync('pdftotext', ['-layout', PDF_PATH, '-'], { encoding: 'utf8' });

check('the renderer actually ran and produced a fresh artefact', () => {
  assert.ok(pdf.length > 50_000, `certification PDF is implausibly small: ${pdf.length} bytes`);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pageCount > 0, 'page count must be readable');
});

check('the page count is within the hard ceiling', () => {
  assert.ok(pageCount <= 40, `page count ${pageCount} exceeds the hard ceiling of 40`);
});

// ---------------------------------------------------------------- commercial content
check('the executive summary carries the systemic, non-contradictory title', () => {
  assert.match(text, /Systemic foundational control gap/);
  assert.ok(!/Visibility-limited assessment/.test(text));
  assert.ok(!/did not provide enough visibility/.test(text));
  assert.ok(!/Unknown responses are not treated/.test(text));
});

check('no deterministic composition artefacts survive', () => {
  for (const artefact of ['.;', '..', 'Direct --', 'Indirect --']) {
    assert.ok(!text.includes(artefact), `rendered report contains ${JSON.stringify(artefact)}`);
  }
});

check('exposure is never claimed when it was not assessed', () => {
  for (const phrase of ['linked exposure factors', 'hard-gate, exposure and cap', 'low exposure', 'no exposure']) {
    assert.ok(!text.toLowerCase().includes(phrase.toLowerCase()),
      `unsupported exposure wording present: ${phrase}`);
  }
});

check('scenarios name mechanisms rather than the domain', () => {
  assert.ok(!text.includes('An ordinary process, system, person or third-party interaction relevant to'),
    'the generic entry-point placeholder must be gone');
  // Asserted on the scenario OBJECTS, not raw page text: the risk register legitimately titles an
  // entry "<Domain> control effectiveness risk", and that register was never in this scope.
  const scenarioTitles = projection.scenarios.map((scenario) => scenario.title);
  const gapTitles = projection.scenarios
    .filter((scenario) => scenario.scenarioBasis !== 'assurance_validation')
    .map((scenario) => scenario.title);
  for (const title of gapTitles) {
    assert.ok(!/control effectiveness risk$/i.test(title),
      `scenario kept a generic risk title: ${title}`);
  }
  assert.ok(new Set(scenarioTitles).size >= 2, 'scenarios must be distinguishable');
  const entryPoints = new Set(projection.scenarios.map((scenario) => scenario.entryPoint));
  assert.ok(entryPoints.size >= 2, 'entry points must be distinguishable');
  summaryScenarioExamples = projection.scenarios.slice(0, 4)
    .map((scenario) => ({ title: scenario.title, entryPoint: scenario.entryPoint }));
});

check('the roadmap is bounded and the full L1 set is absent', () => {
  const rows = (text.match(/^\s*(30|60|90)\s+\w/gm) ?? []).length;
  assert.ok(rows <= ESSENTIAL_CAPS.roadmapTotalCeiling * 2,
    `roadmap row lines (${rows}) suggest more than the bounded selection reached the PDF`);
});

check('no obsolete appendix cross-reference survives', () => {
  assert.ok(!/Appendix A1|Appendix A2/.test(text));
});

check('the supporting-detail statement reports the authoritative L1 counts', () => {
  assert.ok(text.includes(String(l1.materialFindings)), 'L1 finding count must be disclosed');
  assert.ok(/supporting register/i.test(text), 'the complete registers must be directed to the register');
  assert.ok(!/discarded/i.test(text) || /No identified weakness has been discarded/.test(text));
});

// ---------------------------------------------------------------- accessibility
const info = execFileSync('pdfinfo', [PDF_PATH], { encoding: 'utf8' });
const accessibility = {
  tagged: /^Tagged:\s*(.*)$/m.exec(info)?.[1]?.trim() ?? null,
  title: /^Title:\s*(.*)$/m.exec(info)?.[1]?.trim() ?? null,
  pages: pageCount
};

const summary = {
  gitSha: process.env.GITHUB_SHA ?? null,
  pdf: { path: PDF_PATH, bytes: pdf.length, sha256, pageCount },
  l1,
  l2,
  roadmap: { preProjection: l1.roadmapActions, selected: l2.roadmapActions, ceiling: ESSENTIAL_CAPS.roadmapTotalCeiling },
  e1: {
    rows: l2.appendixControlActionRecords,
    cap: ESSENTIAL_CAPS.appendixControlActionRecords,
    excludedForRoadmapLink,
    selectedRoadmapIds,
    zeroIntersection: true
  },
  accessibility,
  scenarioExamples: summaryScenarioExamples
};
fs.writeFileSync(path.join(OUT_DIR, 'certification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`\n${JSON.stringify(summary.pdf)}`);
console.log(`L1 ${JSON.stringify(l1)}`);
console.log(`L2 ${JSON.stringify(l2)}`);
console.log(`accessibility ${JSON.stringify(accessibility)}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
