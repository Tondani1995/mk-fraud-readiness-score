import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildCleanAssuranceFixture,
  buildMateriallyWeakDecisionFixture,
  buildModerateDecisionFixture
} from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';
import { buildPremiumReportEvidencePack } from '../src/lib/reports/automation/evidence.ts';
import { buildPremiumReportNarrativeBrief } from '../src/lib/reports/automation/narrative-brief.ts';
import { validatePremiumReportAiEditorialPlan } from '../src/lib/reports/automation/ai-plan-validation.ts';
import { validatePremiumReportNarrative } from '../src/lib/reports/automation/validation.ts';
import { aiPlanToNarrative, narrativeToSelectedContent } from '../src/lib/reports/automation/content.ts';
import { PREMIUM_REPORT_SCHEMA_VERSION } from '../src/lib/reports/automation/types.ts';
import { renderValidatedCommercialPdf } from '../src/lib/reports/render-validated-commercial-pdf.ts';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'output', 'pdf');
const TMP = path.join(ROOT, 'tmp', 'pdfs');
const ARTIFACT = path.join(TMP, 'checkpoint-f-artifact');
const REPEAT = path.join(TMP, 'repeat-renders');
const METADATA = path.join(TMP, 'checkpoint-f-candidates.json');
const POPPLER = process.env.CODEX_PDF_BIN ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override';
const PDFTOPPM = path.join(POPPLER, 'pdftoppm');
const PYTHON = process.env.CODEX_PYTHON ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
process.env.PUPPETEER_EXECUTABLE_PATH = CHROME;

const DOMAIN_FOCUS = {
  D1: 'executive mandate, role separation and governance challenge',
  D2: 'process risk mapping, scenario identification and exposure ownership',
  D3: 'transaction approval, exception handling and preventive operation',
  D4: 'detection logic, alert review and investigative escalation',
  D5: 'incident triage, response authority and evidence preservation',
  D6: 'speak-up access, retaliation protection and case oversight',
  D7: 'supplier onboarding, invoice integrity and bank-detail verification',
  D8: 'identity assurance, privileged access and digital impersonation defence',
  D9: 'workforce awareness, behavioural reinforcement and accountability culture',
  D10: 'control testing, lessons learned and continuous monitoring cadence'
};

function context(data) {
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(advisoryModel.roadmapActions);
  const deterministicContent = selectContent(data, []);
  const evidence = buildPremiumReportEvidencePack(data, advisoryModel, PREMIUM_REPORT_SCHEMA_VERSION);
  const brief = buildPremiumReportNarrativeBrief(evidence);
  return { data, advisoryModel, roadmap, deterministicContent, evidence, brief };
}

function validatedPlan(current, marker) {
  const { data, brief } = current;
  const clean = data.criticalMajorGaps.length === 0;
  const domainByCode = new Map(data.domainResults.map((domain) => [domain.domainCode, domain]));
  const gapByCode = new Map(data.criticalMajorGaps.map((gap) => [gap.questionCode, gap]));
  const plan = {
    executiveEvidenceRefs: [...brief.executive.requiredEvidenceRefs],
    executiveBody: `${marker}. ${data.organisationName} recorded an overall score of ${data.scoreRun.overallScore}, with ${data.scoreRun.finalMaturity} final maturity and ${data.scoreRun.exposureBand} exposure. ${clean ? 'The reported strengths remain assurance priorities until their operating evidence is independently examined.' : 'The cited material risks and control conditions explain why leadership attention must extend beyond the headline result.'} This remains a self-assessment and has not been independently verified.`,
    falseComfortEvidenceRefs: [...brief.falseComfort.requiredEvidenceRefs],
    falseComfortBody: clean
      ? `${data.organisationName} presents a strong self-reported position, but self-assessment alone does not establish independent operating effectiveness. The cited assurance and evidence requirements identify what leadership should validate before relying on the reported strength.`
      : `${data.organisationName} should not treat the headline result as sufficient assurance because the cited gaps, maturity constraints and exposure evidence reveal material conditions beneath it. Independent operating evidence is needed before control effectiveness can be relied upon.`,
    leadershipEvidenceRefs: [...brief.leadership.requiredEvidenceRefs],
    leadershipBody: `${data.organisationName} leadership must make the cited decisions in dependency order, assign the identified accountability categories and require the specified operating evidence. Delay would prolong the risk and assurance conditions already identified by the deterministic advisory model.`,
    domainEvidence: Object.entries(brief.domains).map(([domainCode, sectionBrief]) => {
      const domain = domainByCode.get(domainCode);
      return {
        domainCode,
        evidenceRefs: [...sectionBrief.requiredEvidenceRefs],
        body: `${domain.domainName} has a distinct self-reported position concerning ${DOMAIN_FOCUS[domainCode] ?? domain.domainName.toLowerCase()}. The cited domain, question and advisory evidence should be evaluated through its linked operating records rather than inferred from the aggregate result.`
      };
    }),
    gapEvidence: Object.entries(brief.gaps).map(([questionCode, sectionBrief]) => {
      const gap = gapByCode.get(questionCode);
      return {
        questionCode,
        evidenceRefs: [...sectionBrief.requiredEvidenceRefs],
        body: `${gap.prompt} is the precise control condition recorded by the self-assessment. The cited risk pathway shows how weak operation can enable concealment or delayed escalation, making the linked control treatment and evidence test the immediate priority.`
      };
    })
  };
  assert.equal(validatePremiumReportAiEditorialPlan(plan, current.evidence, current.brief).ok, true);
  const narrative = aiPlanToNarrative(current.data, current.deterministicContent, plan);
  assert.equal(validatePremiumReportNarrative(narrative, current.evidence).ok, true);
  return narrativeToSelectedContent(current.data, narrative, false);
}

function synthetic(base, organisation, assessmentReference, reportReference) {
  const data = structuredClone(base);
  data.organisationName = organisation;
  data.assessmentReference = assessmentReference;
  data.reportReference = reportReference;
  data.generatedAt = '2026-07-23T08:00:00.000Z';
  data.respondentName = 'Synthetic Review Respondent';
  data.customerEmail = 'synthetic-review@example.test';
  return data;
}

const candidates = [
  {
    name: 'mk-essential-v7-materially-weak-ai',
    fixture: 'materially-weak',
    mode: 'ai',
    organisation: 'Checkpoint F Weak AI Organisation',
    assessmentReference: 'CPF-WEAK-AI-ASSESSMENT',
    reportReference: 'CPF-WEAK-AI-REPORT',
    base: buildMateriallyWeakDecisionFixture(),
    aiMarker: 'Checkpoint F validated editorial narrative'
  },
  {
    name: 'mk-essential-v7-materially-weak-fallback',
    fixture: 'materially-weak',
    mode: 'fallback',
    organisation: 'Checkpoint F Weak Fallback Organisation',
    assessmentReference: 'CPF-WEAK-FALLBACK-ASSESSMENT',
    reportReference: 'CPF-WEAK-FALLBACK-REPORT',
    base: buildMateriallyWeakDecisionFixture(),
    aiMarker: 'Checkpoint F validated editorial narrative'
  },
  {
    name: 'mk-essential-v7-moderate-ai',
    fixture: 'moderate',
    mode: 'ai',
    organisation: 'Checkpoint F Moderate AI Organisation',
    assessmentReference: 'CPF-MODERATE-AI-ASSESSMENT',
    reportReference: 'CPF-MODERATE-AI-REPORT',
    base: buildModerateDecisionFixture(),
    aiMarker: 'Checkpoint F validated editorial narrative'
  },
  {
    name: 'mk-essential-v7-clean-assurance-ai',
    fixture: 'clean',
    mode: 'ai',
    organisation: 'Checkpoint F Clean Assurance AI Organisation',
    assessmentReference: 'CPF-CLEAN-AI-ASSESSMENT',
    reportReference: 'CPF-CLEAN-AI-REPORT',
    base: buildCleanAssuranceFixture(),
    aiMarker: 'Checkpoint F validated editorial narrative'
  }
];

async function renderCandidate(candidate) {
  const data = synthetic(candidate.base, candidate.organisation, candidate.assessmentReference, candidate.reportReference);
  const current = context(data);
  const content = candidate.mode === 'ai'
    ? validatedPlan(current, candidate.aiMarker)
    : current.deterministicContent;
  const input = { data, content, roadmap: current.roadmap, evidenceModel: current.advisoryModel };
  const first = await renderValidatedCommercialPdf(input);
  const second = await renderValidatedCommercialPdf(input);
  const firstPath = path.join(ARTIFACT, 'pdf', `${candidate.name}.pdf`);
  const outputPath = path.join(OUTPUT, `${candidate.name}.pdf`);
  const repeatPdf = path.join(TMP, `${candidate.name}-repeat.pdf`);
  await writeFile(firstPath, first);
  await writeFile(outputPath, first);
  await writeFile(repeatPdf, second);
  const renderDir = path.join(ARTIFACT, 'renders', candidate.name);
  const repeatDir = path.join(REPEAT, candidate.name);
  await mkdir(renderDir, { recursive: true });
  await mkdir(repeatDir, { recursive: true });
  execFileSync(PDFTOPPM, ['-png', '-r', '200', firstPath, path.join(renderDir, 'raw')], { stdio: 'inherit' });
  execFileSync(PDFTOPPM, ['-png', '-r', '200', repeatPdf, path.join(repeatDir, 'raw')], { stdio: 'inherit' });
  const { readdir, rename } = await import('node:fs/promises');
  for (const directory of [renderDir, repeatDir]) {
    const files = (await readdir(directory)).filter((file) => /^raw-\d+\.png$/.test(file)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    for (const [index, file] of files.entries()) await rename(path.join(directory, file), path.join(directory, `page-${String(index + 1).padStart(3, '0')}.png`));
  }
}

console.log('V7 Checkpoint F — rendered PDF commercial review');
await rm(ARTIFACT, { recursive: true, force: true });
await rm(REPEAT, { recursive: true, force: true });
await mkdir(path.join(ARTIFACT, 'pdf'), { recursive: true });
await mkdir(OUTPUT, { recursive: true });
for (const candidate of candidates) {
  console.log(`  rendering twice: ${candidate.name}`);
  await renderCandidate(candidate);
}
await writeFile(METADATA, JSON.stringify({ candidates: candidates.map(({ base: _base, ...item }) => item) }, null, 2));
execFileSync(PYTHON, [path.join(ROOT, 'scripts', 'checkpoint-f-pdf-audit.py'), ARTIFACT, METADATA], { stdio: 'inherit' });
await cp(
  path.join(ROOT, 'docs', 'v7', 'checkpoint-f-rendered-pdf-review.md'),
  path.join(ARTIFACT, 'inspection', 'commercial-review.md')
);

const audit = JSON.parse(await readFile(path.join(ARTIFACT, 'inspection', 'pdf-audit.json'), 'utf8'));
const text = Object.fromEntries(await Promise.all(candidates.map(async (candidate) => [
  candidate.name,
  await readFile(path.join(ARTIFACT, 'extracted-text', `${candidate.name}.txt`), 'utf8')
])));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const models = candidates.map((candidate) => context(synthetic(candidate.base, candidate.organisation, candidate.assessmentReference, candidate.reportReference)).advisoryModel);

const tests = [
  ['F1 real render seam produced four valid PDF signatures', () => assert.equal(Object.keys(audit.candidateResults).length, 4)],
  ['F2 every PDF is A4 portrait and non-trivial', () => assert.ok(audit.checks.filter((x) => ['PDF_PAGE_SIZE_NOT_A4', 'PDF_FILE_TOO_SMALL'].includes(x.code)).every((x) => x.passed))],
  ['F3 every physical page has a 200-DPI raster', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_RENDER_PAGE_COUNT_MISMATCH').every((x) => x.passed))],
  ['F4 repeated renders are pixel-identical', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_VISUAL_NONDETERMINISM').every((x) => x.passed))],
  ['F5 no blank, footer-only or visually blank pages exist', () => assert.ok(audit.checks.filter((x) => /BLANK/.test(x.code)).every((x) => x.passed))],
  ['F6 all required commercial sections are present', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_REQUIRED_SECTION_MISSING').every((x) => x.passed))],
  ['F7 organisation and report references render correctly', () => assert.ok(audit.checks.filter((x) => /ORGANISATION_MISSING|REPORT_REFERENCE_MISSING/.test(x.code)).every((x) => x.passed))],
  ['F8 forbidden legacy copy and internal identifiers are absent', () => assert.ok(audit.checks.filter((x) => x.code.startsWith('PDF_FORBIDDEN_')).every((x) => x.passed))],
  ['F9 PII, secrets, URLs and AI provenance are absent', () => assert.ok(audit.checks.filter((x) => /EMAIL|SECRET|URL|AI_PROVENANCE/.test(x.code)).every((x) => x.passed))],
  ['F10 AI narratives render only in AI candidates', () => assert.ok(audit.checks.filter((x) => /AI_BODY_NOT_RENDERED|FALLBACK_RENDERED_AS_AI/.test(x.code)).every((x) => x.passed))],
  ['F11 AI and fallback use identical deterministic authority', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_AI_FALLBACK_AUTHORITY_MISMATCH').every((x) => x.passed))],
  ['F12 clean assurance avoids false failure language', () => assert.ok(audit.checks.filter((x) => x.code === 'PDF_CLEAN_FALSE_FAILURE_LANGUAGE').every((x) => x.passed))],
  ['F13 risk, decision and roadmap authority contains no semantic duplicates', () => { for (const model of models) for (const key of ['riskRegister', 'leadershipDecisions', 'roadmapActions']) { const values = model[key].map((item) => sha(JSON.stringify(item))); assert.equal(new Set(values).size, values.length); } }],
  ['F14 every evidence checklist item renders its required status', () => { for (const [index, candidate] of candidates.entries()) assert.ok((text[candidate.name].match(/Not yet requested/g) ?? []).length >= models[index].evidenceChecklist.length); }],
  ['F15 the audit has zero blocking failures and publishes the complete review tree', async () => { assert.equal(audit.passed, true); for (const relative of ['pdf', 'renders', 'contact-sheets', 'inspection/pdf-audit.json', 'inspection/page-by-page-review.md', 'inspection/section-map.json', 'extracted-text']) await import('node:fs/promises').then((fs) => fs.stat(path.join(ARTIFACT, relative))); }]
];

for (const [name, test] of tests) {
  await test();
  console.log(`  ok — ${name}`);
}
console.log(`Checkpoint F passed: ${tests.length}/${tests.length} tests; artifacts: ${ARTIFACT}`);
process.exit(0);
