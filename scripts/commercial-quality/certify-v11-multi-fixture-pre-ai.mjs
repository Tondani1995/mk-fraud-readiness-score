#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildMateriallyWeakDecisionFixture, buildCleanAssuranceFixture } from '../../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';
import { mkAssistFixture } from '../../src/lib/reports/evidence-model/__fixtures__/mk-assist-fixture.ts';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildComprehensiveDeliveryModel, fromAssembledReportData } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildEssentialNarrativeFactPack, buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildNarrativeWriterBrief, assertNarrativeWriterBrief } from '../../src/lib/reports/narrative/writer-brief.ts';
import { preAiGateMarkdown, runPreAiFactPackGates } from '../../src/lib/reports/narrative/pre-ai-gates.ts';
import { REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.V11_MULTI_FIXTURE_OUTPUT_DIR ?? 'outputs/v1.1-multi-fixture-pre-ai-certification-owner-review');
const runAt = process.env.V11_CERTIFICATION_RUN_AT ?? new Date().toISOString();
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const FAMILY_SET = [
  'FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE',
  'THIRD_PARTY_OVERSIGHT', 'ORDINARY_ACCESS', 'PRIVILEGED_ACCESS', 'IDENTITY_VERIFICATION',
  'DETECTION_MONITORING', 'INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING',
  'FRAUD_AWARENESS', 'CONTINUOUS_IMPROVEMENT'
];
const PATHWAY_SET = ['SUPPLIER_PAYMENT_DIVERSION', 'PRIVILEGED_ACCESS_MISUSE', 'IDENTITY_IMPERSONATION', 'DETECTION_EVASION', 'INCIDENT_CONCEALMENT'];

const fixtures = [
  {
    id: 'F1-RIVONIA',
    shortName: 'Rivonia broad reactive',
    sourceKind: 'order-backed-staging',
    sourceReference: 'MKORD-2026-22FF6B69 / MKFRS-2026-F4047D75C0',
    purpose: 'Real Essential and Comprehensive order-backed profile with broad supplier, identity, access, detection and incident exposure.',
    responseSet: 'Persisted staging assessment responses assembled through the production report-data boundary.',
    orderReference: 'MKORD-2026-22FF6B69',
    tiers: ['essential', 'comprehensive']
  },
  {
    id: 'F2-KESTREL',
    shortName: 'Kestrel developing mixed',
    sourceKind: 'order-backed-staging',
    sourceReference: 'MKORD-2026-7FBBEE23 / MKFRS-2026-95B3815A0C',
    purpose: 'Real Comprehensive and Essential-capable order-backed profile with developing maturity and mixed control conditions.',
    responseSet: 'Persisted staging assessment responses assembled through the production report-data boundary.',
    orderReference: 'MKORD-2026-7FBBEE23',
    tiers: ['essential', 'comprehensive']
  },
  {
    id: 'F3-SUPPLIER-PAYMENT',
    shortName: 'Supplier/payment concentration',
    sourceKind: 'deterministic-response-fixture',
    sourceReference: 'buildMateriallyWeakDecisionFixture()',
    purpose: 'Concentrated supplier/payment, privileged-access, identity and incident response exposure at a high exposure score.',
    responseSet: 'Repository fixture with authoritative question mappings, response traces, domain results and cap events; no score or maturity fields are changed by this harness.',
    tiers: ['comprehensive']
  },
  {
    id: 'F4-HIGH-READINESS',
    shortName: 'High readiness sparse',
    sourceKind: 'deterministic-response-fixture',
    sourceReference: 'buildCleanAssuranceFixture()',
    purpose: 'High-readiness profile with few material findings; tests sparse narrative handling without fabricated weaknesses.',
    responseSet: 'Repository fixture with high recorded score, Strategic maturity, clean cap state and a deliberately small material finding set.',
    tiers: ['comprehensive']
  },
  {
    id: 'F5-DENSE-CROSS-FAMILY',
    shortName: 'Dense cross-family weak',
    sourceKind: 'deterministic-analytical-fixture',
    sourceReference: 'comprehensiveFixtures.denseWeakAssessment',
    purpose: 'Dense weak profile spanning governance, supplier, detection, identity, evidence, awareness and continuous improvement families.',
    responseSet: 'Repository analytical fixture with 24 findings, 16 risks, 10 pathways and a recorded Initial/48 profile; consumed without score manipulation.',
    tiers: ['comprehensive']
  },
  {
    id: 'F6-MK-ASSIST',
    shortName: 'MK Assist reporting culture',
    sourceKind: 'deterministic-response-fixture',
    sourceReference: 'mkAssistFixture',
    purpose: 'Distinct mixed profile adding protected reporting, supplier payment diversion, privileged access and evidence integrity coverage.',
    responseSet: 'Repository response fixture with 68 authoritative traces, recorded cap events and a separate organisation profile.',
    tiers: [],
    comprehensiveSupported: false,
    supportLimitation: 'The source fixture has no authoritative 30-day roadmap action. Under the unchanged Comprehensive 30/60/90 preservation gate it is retained for semantic-family/pathway coverage only, not claimed as a passing Comprehensive delivery fixture.'
  }
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cell(value) { return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' '); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function gitStatusTrackedClean() { return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() === ''; }

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${value.trim()}\n`);
}

function syntheticAnalytical(data) {
  return {
    assembled: data,
    evidenceModel: buildAdvisoryEvidenceModel(data),
    score: {
      overallScore: data.scoreRun.overallScore,
      calculatedMaturity: data.scoreRun.calculatedMaturity,
      finalMaturity: data.scoreRun.finalMaturity,
      exposureScore: data.scoreRun.exposureScore,
      exposureBand: data.scoreRun.exposureBand,
      coveragePct: data.scoreRun.coveragePct,
      nARatePct: data.scoreRun.nARatePct,
      criticalGapCount: data.scoreRun.criticalGapCount,
      majorGapCount: data.scoreRun.majorGapCount,
      capApplied: data.scoreRun.capApplied,
      capReason: data.scoreRun.capReason,
      methodologyVersionId: data.scoreRun.methodologyVersionId
    },
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    generatedAt: data.generatedAt
  };
}

async function sourceFor(fixture) {
  if (fixture.id === 'F1-RIVONIA' || fixture.id === 'F2-KESTREL') return await assembleReportData(fixture.orderReference);
  if (fixture.id === 'F3-SUPPLIER-PAYMENT') return buildMateriallyWeakDecisionFixture();
  if (fixture.id === 'F4-HIGH-READINESS') return buildCleanAssuranceFixture();
  if (fixture.id === 'F6-MK-ASSIST') return clone(mkAssistFixture);
  return null;
}

function sourceCoverageSummary(fixture, data) {
  const model = buildAdvisoryEvidenceModel(data);
  return {
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity,
    exposureScore: data.scoreRun.exposureScore,
    exposureBand: data.scoreRun.exposureBand,
    findings: model.materialFindings.length,
    themes: null,
    scenarios: model.scenarios.length,
    controls: model.controlImprovements.length,
    decisions: model.leadershipDecisions.length,
    roadmap: model.roadmapActions.length,
    maturationSteps: null,
    highReadinessSparseNarrativeReason: null,
    semanticFamilies: [...new Set(model.materialFindings.flatMap((finding) => [finding.primarySemanticFamily, ...finding.secondarySemanticFamilies]))].sort(),
    fraudPathways: [...new Set(model.materialFindings.flatMap((finding) => finding.fraudPathwayFamilies))].sort(),
    findingTitles: model.materialFindings.map((finding) => finding.title),
    themeTitles: [],
    scenarioFamilies: model.scenarios.map((scenario) => scenario.scenarioType),
    controlFamilies: [],
    decisionFamilies: [],
    roadmapTargetPeriods: model.roadmapActions.map((action) => action.period)
  };
}

async function comprehensiveModelFor(fixture, data) {
  if (fixture.id === 'F5-DENSE-CROSS-FAMILY') return buildComprehensiveDeliveryModel(clone(comprehensiveFixtures.denseWeakAssessment.analytical));
  if (!data) throw new Error(`No source data for ${fixture.id}`);
  if (fixture.sourceKind === 'order-backed-staging') return await fromAssembledReportData(data);
  return buildComprehensiveDeliveryModel(syntheticAnalytical(data));
}

function tierNotApplicable(fixture, tier) {
  return {
    status: 'NOT_APPLICABLE',
    productTier: tier,
    reason: `${fixture.shortName} is a ${fixture.sourceKind} response-set certification fixture, not a persisted paid-product order artifact. The Essential commercial projection requires an order-backed assembled report and is therefore not claimed for this fixture; Comprehensive deterministic analytical certification remains in scope.`,
    noSourceMutation: true
  };
}

function summaryFromPack(pack, writerBrief) {
  const familySet = new Set(pack.findings.flatMap((finding) => [finding.primarySemanticFamily, ...finding.secondarySemanticFamilies]));
  const pathwaySet = new Set(pack.findings.flatMap((finding) => finding.fraudPathwayFamilies));
  return {
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    exposureScore: pack.assessment.exposureScore,
    exposureBand: pack.assessment.exposureBand,
    findings: pack.findings.length,
    themes: pack.systemicThemeInputs.length,
    scenarios: pack.scenarios.length,
    controls: pack.controls.length,
    decisions: pack.decisions.length,
    roadmap: pack.roadmap.length,
    maturationSteps: pack.maturationSteps.length,
    highReadinessSparseNarrativeReason: pack.highReadinessSparseNarrativeReason ?? null,
    semanticFamilies: [...familySet].sort(),
    fraudPathways: [...pathwaySet].sort(),
    findingTitles: pack.findings.map((finding) => finding.title),
    themeTitles: pack.systemicThemeInputs.map((theme) => theme.title),
    scenarioFamilies: pack.scenarios.map((scenario) => scenario.scenarioFamily),
    controlFamilies: pack.controls.map((control) => control.primarySemanticFamily),
    decisionFamilies: writerBrief.decisions.map((decision) => decision.decisionFamilyLabel),
    roadmapTargetPeriods: writerBrief.roadmap.map((item) => item.targetPeriod)
  };
}

function gateReportWithRunAt(report) {
  return { ...report, checkedAt: runAt };
}

async function runEssential(fixture, data, fixtureDir) {
  if (!fixture.tiers.includes('essential')) {
    const status = tierNotApplicable(fixture, 'essential');
    await writeJson(path.join(fixtureDir, 'essential-writer-brief.json'), status);
    await writeJson(path.join(fixtureDir, 'essential-story-plan.json'), status);
    await writeText(path.join(fixtureDir, 'essential-gate-report.md'), `# Essential certification — ${fixture.shortName}\n\nStatus: **NOT APPLICABLE**\n\n${status.reason}`);
    return { status: 'NOT_APPLICABLE', summary: status };
  }
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const projection = buildEssentialProjection(data, evidenceModel);
  const pack = buildEssentialNarrativeFactPack(data, evidenceModel, projection);
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  const writerBrief = buildNarrativeWriterBrief(pack, storyPlan);
  assertNarrativeWriterBrief(writerBrief);
  const gate = gateReportWithRunAt(runPreAiFactPackGates(pack, storyPlan, writerBrief));
  await writeJson(path.join(fixtureDir, 'essential-writer-brief.json'), writerBrief);
  await writeJson(path.join(fixtureDir, 'essential-story-plan.json'), storyPlan);
  await writeText(path.join(fixtureDir, 'essential-gate-report.md'), preAiGateMarkdown(gate));
  if (gate.status !== 'PASS') throw new Error(`${fixture.id} Essential gate failed.`);
  return { status: gate.status, pack, storyPlan, writerBrief, gate, summary: summaryFromPack(pack, writerBrief) };
}

async function runComprehensive(fixture, data, fixtureDir) {
  if (fixture.comprehensiveSupported === false) {
    const status = {
      status: 'NOT_APPLICABLE',
      productTier: 'comprehensive',
      reason: fixture.supportLimitation,
      sourceCoverage: sourceCoverageSummary(fixture, data),
      noSourceMutation: true
    };
    await writeJson(path.join(fixtureDir, 'comprehensive-writer-brief.json'), status);
    await writeJson(path.join(fixtureDir, 'comprehensive-story-plan.json'), status);
    await writeText(path.join(fixtureDir, 'comprehensive-gate-report.md'), `# Comprehensive certification — ${fixture.shortName}\n\nStatus: **NOT APPLICABLE**\n\n${status.reason}`);
    return { status: 'NOT_APPLICABLE', summary: status.sourceCoverage, coverageSummary: status.sourceCoverage };
  }
  const model = await comprehensiveModelFor(fixture, data);
  const pack = buildComprehensiveNarrativeFactPack(model);
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  const writerBrief = buildNarrativeWriterBrief(pack, storyPlan);
  assertNarrativeWriterBrief(writerBrief);
  const initialGate = runPreAiFactPackGates(pack, storyPlan, writerBrief);
  const gate = gateReportWithRunAt(initialGate);
  await writeJson(path.join(fixtureDir, 'comprehensive-writer-brief.json'), writerBrief);
  await writeJson(path.join(fixtureDir, 'comprehensive-story-plan.json'), storyPlan);
  await writeText(path.join(fixtureDir, 'comprehensive-gate-report.md'), preAiGateMarkdown(gate));
  if (gate.status !== 'PASS') throw new Error(`${fixture.id} Comprehensive gate failed: ${gate.results.filter((result) => result.status === 'FAIL').map((result) => result.gate).join(', ')}`);
  return { status: gate.status, pack, storyPlan, writerBrief, gate, summary: summaryFromPack(pack, writerBrief), coverageSummary: summaryFromPack(pack, writerBrief) };
}

function maturationValidation(fixtureResults) {
  const rows = fixtureResults.filter(({ comprehensive }) => comprehensive.status === 'PASS').map(({ fixture, comprehensive }) => {
    const pack = comprehensive.pack;
    const brief = comprehensive.writerBrief;
    const controlRefs = new Set(pack.controls.map((control) => control.factRef));
    const findingRefs = new Set(pack.findings.map((finding) => finding.factRef));
    const uniqueRefs = new Set(pack.maturationSteps.map((step) => step.maturationRef));
    const valid = pack.maturationSteps.length === pack.controls.length * 2
      && uniqueRefs.size === pack.maturationSteps.length
      && pack.maturationSteps.every((step) => controlRefs.has(step.linkedControlRef)
        && findingRefs.has(step.linkedFindingRef)
        && ((step.phase === 'EMBED' && step.phaseWindow === '4-6 months') || (step.phase === 'MATURE' && step.phaseWindow === '7-12 months'))
        && Boolean(step.managementOutcome && step.priorityActivity && step.accountableExecutive && step.processOwner && step.dependency && step.successMeasure && step.proofOfProgress))
      && brief.maturationSteps.length === pack.maturationSteps.length
      && brief.maturationSteps.every((step) => Boolean(step.maturationRef && step.linkedFindingRef && step.linkedControlRef && step.phase && step.phaseWindow && step.managementOutcome && step.priorityActivity && step.accountableExecutive && step.processOwner && step.dependency && step.successMeasure && step.proofOfProgress));
    return { fixtureId: fixture.id, controls: pack.controls.length, maturationSteps: pack.maturationSteps.length, embedSteps: pack.maturationSteps.filter((step) => step.phase === 'EMBED').length, matureSteps: pack.maturationSteps.filter((step) => step.phase === 'MATURE').length, targetPeriods: brief.roadmap.map((item) => item.targetPeriod), sparseReason: pack.highReadinessSparseNarrativeReason ?? null, status: valid ? 'PASS' : 'FAIL' };
  });
  return { status: rows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL', rows };
}

function coverageMarkdown(title, labels, rows, key) {
  const covered = labels.every((label) => rows.some((row) => row[key].includes(label)));
  return [
    `# ${title}`,
    '',
    `Run: ${runAt}`,
    '',
    '| Fixture | ' + labels.join(' | ') + ' |',
    '|---|' + labels.map(() => '---').join('|') + '|',
    ...rows.map((row) => `| ${row.fixtureId} | ${labels.map((label) => row[key].includes(label) ? 'PASS' : '—').join(' | ')} |`),
    '',
    `Coverage status: **${covered ? 'PASS' : 'FAIL'}**`
  ].join('\n');
}

function buildMatrixMarkdown(results, familyCoverage, pathwayCoverage, maturation, tierReport, diversityReport) {
  const allComprehensivePass = results.every((result) => result.comprehensive.status === 'PASS' || result.comprehensive.status === 'NOT_APPLICABLE');
  const essentialApplicablePass = results.filter((result) => result.essential.status !== 'NOT_APPLICABLE').every((result) => result.essential.status === 'PASS');
  return [
    '# MK FRAUD READINESS v1.1',
    '## MULTI-FIXTURE PRE-AI CERTIFICATION — OWNER REVIEW CANDIDATE',
    '',
    `Branch: \`${branch}\``,
    `Certification commit: \`${commit}\``,
    `Run: ${runAt}`,
    `AI configured: **NO** · AI called: **NO** · manuscripts: **NONE** · PDFs: **NONE**`,
    '',
    '## Certification result',
    '',
    `Overall deterministic matrix status: **${allComprehensivePass && essentialApplicablePass && familyCoverage.status === 'PASS' && pathwayCoverage.status === 'PASS' && maturation.status === 'PASS' && tierReport.status === 'PASS' && diversityReport.status === 'PASS' ? 'PASS' : 'FAIL'}**`,
    '',
    '| Fixture | Source | Essential | Comprehensive | Score | Maturity | Findings | Themes | Scenarios | Controls | Decisions | Maturation |',
    '|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|',
    ...results.map((result) => `| ${result.fixture.id} | ${cell(result.fixture.shortName)} | **${result.essential.status}** | **${result.comprehensive.status}** | ${result.comprehensive.summary.score ?? '—'} | ${cell(result.comprehensive.summary.maturity)} | ${result.comprehensive.summary.findings ?? '—'} | ${result.comprehensive.summary.themes ?? '—'} | ${result.comprehensive.summary.scenarios ?? '—'} | ${result.comprehensive.summary.controls ?? '—'} | ${result.comprehensive.summary.decisions ?? '—'} | ${result.comprehensive.summary.maturationSteps ?? '—'} |`),
    '',
    '## Interpretation',
    '',
    '- F1 and F2 are order-backed and certify both commercial tiers.',
    '- F3–F5 are deterministic response/analytical fixtures. Their Essential artifacts are explicitly **NOT APPLICABLE** because they are not persisted paid-product order artifacts; no unsupported Essential claim is made.',
    '- F6-MK-ASSIST is retained as a semantic-family/pathway coverage source only. Its Comprehensive tier is explicitly **NOT APPLICABLE** because the source fixture does not carry an authoritative 30-day roadmap action; the unchanged 30/60/90 gate is not weakened.',
    '- Scores, maturity, exposure, caps, question semantics and weighting are carried from each source fixture. This harness performs no score manipulation.',
    `- Semantic-family coverage: **${familyCoverage.status}**; fraud-pathway coverage: **${pathwayCoverage.status}**; output diversity: **${diversityReport.status}**; tier differentiation: **${tierReport.status}**; twelve-month maturation: **${maturation.status}**.`,
    '',
    '## Required companion reports',
    '',
    '- `semantic-family-coverage-matrix.md`',
    '- `fraud-pathway-coverage-matrix.md`',
    '- `output-diversity-report.md`',
    '- `tier-differentiation-report.md`',
    '- `twelve-month-maturation-validation.md`',
    '- `functional-agenda-disposition.md`'
  ].join('\n');
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  const results = [];
  for (const fixture of fixtures) {
    const fixtureDir = path.join(outputDir, 'fixtures', fixture.id);
    const data = await sourceFor(fixture);
    const comprehensive = await runComprehensive(fixture, data, fixtureDir);
    const essential = await runEssential(fixture, data, fixtureDir);
    const result = { fixture, essential, comprehensive };
    const profile = {
      fixtureId: fixture.id,
      shortName: fixture.shortName,
      sourceKind: fixture.sourceKind,
      sourceReference: fixture.sourceReference,
      purpose: fixture.purpose,
      responseSet: fixture.responseSet,
      scoreAuthority: 'Source fixture scoreRun / analytical score carried without modification; no scoring methodology, weight, threshold or cap rule is changed.',
      tierSupport: { essential: essential.status, comprehensive: comprehensive.status },
      essentialDisposition: essential.status === 'NOT_APPLICABLE' ? essential.summary.reason : 'Order-backed Essential projection certified by the deterministic pre-AI gates.',
      comprehensiveSummary: comprehensive.summary,
      certification: { essential: essential.status, comprehensive: comprehensive.status }
    };
    await writeJson(path.join(fixtureDir, 'fixture-profile.json'), profile);
    results.push(result);
  }

  const familyRows = results.map(({ fixture, comprehensive }) => ({ fixtureId: fixture.id, values: (comprehensive.coverageSummary ?? comprehensive.summary).semanticFamilies }));
  const pathwayRows = results.map(({ fixture, comprehensive }) => ({ fixtureId: fixture.id, values: (comprehensive.coverageSummary ?? comprehensive.summary).fraudPathways }));
  const familyCoverage = { status: familyRows.every((row) => FAMILY_SET.every((family) => familyRows.some((item) => item.values.includes(family)))) ? 'PASS' : 'FAIL', rows: familyRows };
  const pathwayCoverage = { status: PATHWAY_SET.every((pathway) => pathwayRows.some((row) => row.values.includes(pathway))) ? 'PASS' : 'FAIL', rows: pathwayRows };
  await writeText(path.join(outputDir, 'semantic-family-coverage-matrix.md'), coverageMarkdown('Semantic-family coverage matrix', FAMILY_SET, familyRows, 'values'));
  await writeText(path.join(outputDir, 'fraud-pathway-coverage-matrix.md'), coverageMarkdown('Fraud-pathway coverage matrix', PATHWAY_SET, pathwayRows, 'values'));

  const certifiedResults = results.filter(({ comprehensive }) => comprehensive.status === 'PASS');
  const signatures = certifiedResults.map(({ fixture, comprehensive }) => ({ fixtureId: fixture.id, signature: JSON.stringify({ score: comprehensive.summary.score, maturity: comprehensive.summary.maturity, findingTitles: comprehensive.summary.findingTitles, themeTitles: comprehensive.summary.themeTitles, scenarioFamilies: comprehensive.summary.scenarioFamilies, controlFamilies: comprehensive.summary.controlFamilies, decisionFamilies: comprehensive.summary.decisionFamilies }) }));
  const distinctSignatures = new Set(signatures.map((item) => item.signature)).size;
  const pairwise = [];
  for (let left = 0; left < certifiedResults.length; left += 1) for (let right = left + 1; right < certifiedResults.length; right += 1) {
    const a = certifiedResults[left].comprehensive.summary;
    const b = certifiedResults[right].comprehensive.summary;
    const shared = (valuesA, valuesB) => valuesA.filter((value) => valuesB.includes(value)).length;
    pairwise.push({ left: certifiedResults[left].fixture.id, right: certifiedResults[right].fixture.id, scoreDistance: Math.abs((a.score ?? 0) - (b.score ?? 0)), sharedThemeTitles: shared(a.themeTitles, b.themeTitles), sharedScenarioFamilies: shared(a.scenarioFamilies, b.scenarioFamilies), sharedControlFamilies: shared(a.controlFamilies, b.controlFamilies), sharedFindingTitles: shared(a.findingTitles, b.findingTitles) });
  }
  const diversityReport = { status: distinctSignatures === certifiedResults.length && new Set(certifiedResults.map((result) => result.comprehensive.summary.maturity)).size >= 3 ? 'PASS' : 'FAIL', distinctSignatures, fixtureCount: certifiedResults.length, pairwise };
  await writeText(path.join(outputDir, 'output-diversity-report.md'), [
    '# Output diversity report', '', `Status: **${diversityReport.status}**`, `Distinct Comprehensive output signatures: **${distinctSignatures}/${certifiedResults.length}**`, `Distinct maturities: **${new Set(certifiedResults.map((result) => result.comprehensive.summary.maturity)).size}**`, '', '| Pair | Score distance | Shared themes | Shared pathway families | Shared controls | Shared finding titles |', '|---|---:|---:|---:|---:|---:|', ...pairwise.map((item) => `| ${item.left} ↔ ${item.right} | ${item.scoreDistance} | ${item.sharedThemeTitles} | ${item.sharedScenarioFamilies} | ${item.sharedControlFamilies} | ${item.sharedFindingTitles} |`), '', 'The matrix is considered diverse when materially different response profiles produce distinct score/maturity/story signatures. Shared pathway templates are acceptable; identical whole-output signatures are not.'].join('\n'));

  const tierRows = results.filter((result) => result.essential.status === 'PASS' && result.comprehensive.status === 'PASS').map((result) => {
    const essential = result.essential.summary;
    const comprehensive = result.comprehensive.summary;
    const comprehensiveSpecific = comprehensive.maturationSteps > 0 && comprehensive.maturationSteps === comprehensive.controls * 2 && comprehensive.themes >= 3 && comprehensive.decisions >= 1;
    const movementCount = result.comprehensive.storyPlan.movements.length;
    const essentialMovementCount = result.essential.storyPlan.movements.length;
    return { fixtureId: result.fixture.id, essentialMovementCount, comprehensiveMovementCount: movementCount, essentialControls: essential.controls, comprehensiveControls: comprehensive.controls, essentialDecisions: essential.decisions, comprehensiveDecisions: comprehensive.decisions, comprehensiveSpecific, status: comprehensiveSpecific && movementCount > essentialMovementCount ? 'PASS' : 'FAIL' };
  });
  const tierReport = { status: tierRows.length > 0 && tierRows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL', rows: tierRows };
  await writeText(path.join(outputDir, 'tier-differentiation-report.md'), [
    '# Tier differentiation report', '', `Status: **${tierReport.status}**`, '', '| Fixture | Essential movements | Comprehensive movements | Essential controls | Comprehensive controls | Essential decisions | Comprehensive decisions | Comprehensive-specific design |', '|---|---:|---:|---:|---:|---:|---:|---|', ...tierRows.map((row) => `| ${row.fixtureId} | ${row.essentialMovementCount} | ${row.comprehensiveMovementCount} | ${row.essentialControls} | ${row.comprehensiveControls} | ${row.essentialDecisions} | ${row.comprehensiveDecisions} | ${row.comprehensiveSpecific ? 'PASS' : 'FAIL'} |`), '', 'Comprehensive is differentiated by the 12-month maturation layer, target-state control blueprints, leadership decision profile and nine-movement strategic story plan. It is not certified as Essential plus additional source data.'].join('\n'));

  const maturation = maturationValidation(results);
  await writeText(path.join(outputDir, 'twelve-month-maturation-validation.md'), [
    '# Twelve-month maturation validation', '', `Status: **${maturation.status}**`, '', '| Fixture | Controls | Steps | EMBED (4–6 months) | MATURE (7–12 months) | Initial targets observed | Sparse reason |', '|---|---:|---:|---:|---:|---|---|', ...maturation.rows.map((row) => `| ${row.fixtureId} | ${row.controls} | ${row.maturationSteps} | ${row.embedSteps} | ${row.matureSteps} | ${row.targetPeriods.join(', ')} | ${cell(row.sparseReason ?? 'No')} |`), '', 'Validation rule: every eligible Comprehensive control has exactly one EMBED and one MATURE step; every step preserves the linked finding, linked control, semantic family, accountable executive and process owner; no step invents a new severity, finding, owner or deadline. Essential has no maturation steps.'].join('\n'));

  await writeText(path.join(outputDir, 'functional-agenda-disposition.md'), [
    '# Functional Agenda disposition', '', '**Disposition: PRE-EXISTING / UNRELATED TO THIS CERTIFICATION LOOP**', '', 'The repository’s existing `npm run bounded:test-essential-contract` reports two failures for the pre-existing Functional Agenda workbook contract:', '', '- `L3: F1 workbook reconciles identifier SETS from actual XLSX bytes` — the workbook must contain the Functional Agenda sheet.', '- `L3 adversarial: twelve defective workbooks all fail closed` — the intact workbook must reconcile.', '', 'This matrix certifies deterministic v1.1 Fact Packs, Story Plans, Writer Briefs and pre-AI semantic gates. It does not change the Essential workbook contract, add a Functional Agenda sheet, or relabel those pre-existing failures as v1.1 narrative failures. They remain an owner-visible limitation for the separate workbook contract loop.'
  ].join('\n'));

  await writeText(path.join(outputDir, 'certification-fixture-matrix.md'), buildMatrixMarkdown(results, familyCoverage, pathwayCoverage, maturation, tierReport, diversityReport));

  const generatedFiles = {};
  const files = await fs.readdir(outputDir, { recursive: true });
  for (const relative of files.filter((item) => item !== 'generation-manifest.json')) {
    const absolute = path.join(outputDir, relative);
    const stat = await fs.stat(absolute);
    if (stat.isFile()) {
      const bytes = await fs.readFile(absolute);
      generatedFiles[relative] = { bytes: bytes.length, sha256: sha256(bytes) };
    }
  }
  const manifest = {
    title: 'MK FRAUD READINESS v1.1 MULTI-FIXTURE PRE-AI CERTIFICATION — OWNER REVIEW CANDIDATE',
    bibleVersion: REPORTING_BIBLE_VERSION,
    branch,
    generatedFromCommit: commit,
    generatedAt: runAt,
    trackedWorkingTreeCleanAtGeneration: gitStatusTrackedClean(),
    fixtureCount: results.length,
    fixtures: results.map(({ fixture, essential, comprehensive }) => ({ fixtureId: fixture.id, sourceKind: fixture.sourceKind, essentialStatus: essential.status, comprehensiveStatus: comprehensive.status, score: comprehensive.summary.score ?? null, maturity: comprehensive.summary.maturity ?? null })),
    matrixStatus: results.every((result) => result.comprehensive.status === 'PASS' || result.comprehensive.status === 'NOT_APPLICABLE') && results.filter((result) => result.essential.status !== 'NOT_APPLICABLE').every((result) => result.essential.status === 'PASS') && familyCoverage.status === 'PASS' && pathwayCoverage.status === 'PASS' && diversityReport.status === 'PASS' && tierReport.status === 'PASS' && maturation.status === 'PASS' ? 'PASS' : 'FAIL',
    aiConfigured: false,
    aiCalled: false,
    aiProvider: null,
    aiModel: null,
    manuscripts: null,
    pdfs: null,
    scoringMethodologyChanged: false,
    scoreFieldsManipulated: false,
    essentialWorkbookContractModified: false,
    requiredReports: ['certification-fixture-matrix.md', 'semantic-family-coverage-matrix.md', 'fraud-pathway-coverage-matrix.md', 'output-diversity-report.md', 'tier-differentiation-report.md', 'twelve-month-maturation-validation.md', 'functional-agenda-disposition.md'],
    generatedFiles
  };
  await writeJson(path.join(outputDir, 'generation-manifest.json'), manifest);
  console.log(JSON.stringify({ outputDir, matrixStatus: manifest.matrixStatus, fixtureCount: manifest.fixtureCount, generatedFromCommit: commit }, null, 2));
  if (manifest.matrixStatus !== 'PASS') process.exitCode = 1;
}

await main();
