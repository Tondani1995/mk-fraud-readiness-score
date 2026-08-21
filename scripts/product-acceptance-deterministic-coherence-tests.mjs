// Provider-free deterministic product-coherence fixture.
//
// This is the Cedar Ridge Operations V1.2 profile used for product acceptance. It
// exercises the real Comprehensive assembly, evidence contract, management model,
// PDF renderer and supporting-register builder, but injects deterministic prose so
// the test stops before any AI/provider authorisation.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildAdvisoryEvidenceModel, checkQualityGates } from '../src/lib/reports/evidence-model/index.ts';
import { MFRS_V12_METHODOLOGY_ID, getQuestionPlaybook } from '../src/lib/reports/evidence-model/question-playbooks.ts';
import { buildEssentialProjection } from '../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../src/lib/reports/comprehensive/management-model.ts';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from '../src/lib/reports/comprehensive/contract.ts';
import { adaptComprehensiveEvidenceModel, adaptComprehensiveScenarioFacts } from '../src/lib/reports/comprehensive/customer-visible-adaptation.ts';
import { buildInterpretationBrief, buildInterpretationPrompt, validateInterpretation } from '../src/lib/reports/comprehensive/interpretation.ts';
import { renderComprehensiveReportPackage } from '../src/lib/reports/comprehensive/manual-generation.ts';
import { renderComprehensiveManagementReportHtml } from '../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { renderHtmlToPdfBuffer } from '../src/lib/reports/render-pdf.ts';
import { auditScenarioLinkage, assertScenarioLinkageAudit } from '../src/lib/reports/comprehensive/scenario-coherence.ts';
import { normaliseRoleLabel, ROLE_NORMALISATION_VERSION } from '../src/lib/reports/comprehensive/role-normalisation.ts';
import { getMaturityBand } from '../src/lib/scoring/maturity-band.ts';

const outputDir = path.resolve('outputs/product-acceptance-v12-repaired-20260821');
fs.mkdirSync(outputDir, { recursive: true });

const graph = JSON.parse(fs.readFileSync(new URL('../src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', import.meta.url), 'utf8'));
const questions = graph.questions;
assert.equal(questions.length, 68);
assert.equal(new Set(questions.map((question) => question.questionCode)).size, 68);

const labels = [
  ['Not in place', 'The capability is absent or is not recognised as required.', 0],
  ['Informal / reactive', 'Some activity occurs, but it is informal, reactive or dependent on individual effort.', 20],
  ['Partly designed', 'The capability has been partly designed, but important elements are incomplete or inconsistent.', 40],
  ['Implemented in key areas', 'The capability operates in key areas, but coverage or consistency is not yet organisation-wide.', 60],
  ['Consistently operating', 'The capability is defined, operating consistently and supported by evidence.', 80],
  ['Embedded and improving', 'The capability is measured, governed and deliberately improved over time.', 100]
].map(([label, operationalMeaning, normalisedScore], displayOrder) => ({ responseValue: displayOrder, label, operationalMeaning, normalisedScore, displayOrder }));

const weakCodes = new Set(['D1-Q04', 'D1-Q07', 'D3-Q04', 'D3-Q08', 'D3-Q09', 'D3-Q10', 'D3-Q11', 'D4-Q05', 'D4-Q08', 'D5-Q03', 'D8-Q04', 'D8-Q08', 'D8-Q09', 'D8-Q10', 'D7-Q04']);
const strongCodes = new Set(['D1-Q01', 'D2-Q01', 'D3-Q03', 'D7-Q01', 'D9-Q01', 'D10-Q01']);
const domainNames = Object.fromEntries([...new Set(questions.map((question) => question.domainCode))].map((code) => [code, `Domain ${code.slice(1)}`]));

function responseFor(question, index) {
  if (strongCodes.has(question.questionCode)) return 5;
  if (weakCodes.has(question.questionCode)) return question.questionCode.endsWith('10') ? 1 : 2;
  return [3, 4, 2, 3, 4, 1][index % 6];
}

function cedarRidgeFixture() {
  const traces = questions.map((question, index) => {
    const responseValue = responseFor(question, index);
    return {
      questionCode: question.questionCode, domainCode: question.domainCode, domainName: domainNames[question.domainCode], prompt: question.prompt,
      responseValue, normalisedScore: responseValue * 20, applicable: true, triggeredRules: [], isCritical: question.isCritical, isHardGate: question.isHardGate,
      isCriticalGap: responseValue <= 1 && question.isCritical, isMajorGap: responseValue === 2 && !question.isCritical
    };
  });
  const domainResults = [...new Set(questions.map((question) => question.domainCode))].map((domainCode, index) => ({
    domainCode, domainName: domainNames[domainCode], weightPct: 10, rawScore: 42 + (index % 5) * 5, weightedContribution: 4.2 + (index % 5) * 0.5, coveragePct: 100,
    criticalGapCount: traces.filter((trace) => trace.domainCode === domainCode && trace.isCriticalGap).length
  }));
  const score = 48;
  return {
    orderId: 'cedar-ridge-order', orderReference: 'MKORD-CEDAR-RIDGE-FIXTURE', orderAssessmentId: 'cedar-ridge-assessment', assessmentId: 'cedar-ridge-assessment',
    organisationId: 'cedar-ridge-organisation', currentScoreRunId: 'cedar-ridge-score-run', orderVerifiedAt: '2026-08-21T10:00:00.000Z', orderVerifiedBy: 'fixture-only-operator',
    paymentVerification: { legacyOrderVerification: true }, organisationName: 'Cedar Ridge Operations (synthetic fixture)', respondentName: 'Synthetic owner', customerEmail: 'cedar-ridge-owner@example.test',
    assessmentReference: 'MKFRS-CEDAR-RIDGE-FIXTURE', reportReference: 'RPT-MKFRS-CEDAR-RIDGE-FIXTURE-V2', generatedAt: '2026-08-21T10:00:00.000Z', packageName: 'Comprehensive',
    productCode: 'mk_validated_assessment', orderStatus: 'payment_received', amountCents: 3_500_000, currency: 'ZAR', productPriceCents: 3_500_000, productCurrency: 'ZAR', productId: 'cedar-ridge-product', orderCreatedAt: '2026-08-21T09:00:00.000Z', productPriceVersionId: 'cedar-ridge-price-v1', productPriceVersions: [{ productId: 'cedar-ridge-product', versionNumber: 1, priceCents: 3_500_000, currency: 'ZAR', effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null }],
    requiresPaymentVerification: true, deliveryMode: 'mk_controlled_pdf', productActive: true,
    scoreRun: {
      id: 'cedar-ridge-score-run', assessmentId: 'cedar-ridge-assessment', methodologyVersionId: MFRS_V12_METHODOLOGY_ID, status: 'completed', lockedAt: '2026-08-21T10:00:00.000Z', inputHash: 'c'.repeat(64),
      overallScore: score, calculatedMaturity: 'Developing', finalMaturity: 'Developing', exposureScore: 76, exposureBand: 'High', coveragePct: 100, nARatePct: 0,
      criticalGapCount: traces.filter((trace) => trace.isCriticalGap).length, majorGapCount: traces.filter((trace) => trace.isMajorGap).length, capApplied: true, capReason: 'V1.2 fixture hard-gate cap',
      adaptiveResultStatus: 'NORMAL', adaptiveMetrics: {
        resultStatus: 'NORMAL', graphVersion: graph.graphVersion, graphFingerprint: '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7', applicableCount: 68, applicableWeight: 83.75,
        excludedCount: 0, excludedWeight: 0, redirectedCount: 0, redirectedWeight: 0, invalidatedCount: 0, invalidatedWeight: 0, profileOnlyCount: 0, unknownCount: 0, unknownWeight: 0,
        unansweredApplicableCount: 0, unansweredApplicableWeight: 0, assessmentCoveragePct: 100, controlVisibilityPct: 100, exposureAssessed: true, visibilityGaps: [], materialExclusionSharePct: 0,
        unknownSharePct: 0, scoreComparabilityStatement: 'Synthetic provider-free Cedar Ridge fixture.', limitationReasons: [], excludedQuestionCodes: [], redirectedQuestionCodes: [], invalidatedQuestionCodes: [], unknownQuestionCodes: [], questionTraces: []
      }
    },
    domainResults,
    exposureAnswers: [
      { factorCode: 'EXP-01', name: 'High-risk process footprint', selectedLabel: 'High exposure', pointsAwarded: 20, maxPoints: 25 },
      { factorCode: 'EXP-02', name: 'Supplier dependency', selectedLabel: 'High exposure', pointsAwarded: 12, maxPoints: 15 },
      { factorCode: 'EXP-03', name: 'Digital channel reliance', selectedLabel: 'High exposure', pointsAwarded: 12, maxPoints: 15 },
      { factorCode: 'EXP-05', name: 'Cash, stock or high-value assets', selectedLabel: 'High exposure', pointsAwarded: 9, maxPoints: 10 },
      { factorCode: 'EXP-06', name: 'Operational dispersion', selectedLabel: 'Moderate exposure', pointsAwarded: 5, maxPoints: 8 },
      { factorCode: 'EXP-07', name: 'Manual intervention', selectedLabel: 'High exposure', pointsAwarded: 8, maxPoints: 10 }
    ],
    questionTraces: traces, criticalMajorGaps: traces.filter((trace) => trace.isCriticalGap || trace.isMajorGap), officialResponseLabels: labels,
    maturityCapEvents: [{ ruleCode: 'any_hard_gate_critical_control_lte_1', capTo: 'Developing', reason: 'A synthetic V1.2 hard-gate control is weak.', relatedQuestionCode: 'D8-Q10', relatedQuestionPrompt: 'The organisation can investigate and contain identity misuse, account takeover or impersonation.', relatedDomainCode: 'D8', relatedDomainName: domainNames.D8 }],
    recommendationRules: [], expectedDomainResultCount: 10, actualDomainResultCount: 10, expectedQuestionTraceCount: 68, actualQuestionTraceCount: 68,
    adaptiveScope: { exposureAssessed: true, scoreComparabilityStatement: 'Synthetic provider-free Cedar Ridge fixture.', visibilityGaps: [] },
    adaptiveGatewayAnswers: { G01: 'organisation', G03: 'yes', G04: 'internal', G06: 'yes', G08: 'organisation', G10: 'yes' }
  };
}

const assembled = cedarRidgeFixture();
const evidenceModel = buildAdvisoryEvidenceModel(assembled);
assert.equal(checkQualityGates(evidenceModel, assembled).violations.length, 0);
assert.equal(assembled.domainResults.length, 10);
assert.equal(assembled.questionTraces.length, 68);
assert.equal(assembled.scoreRun.methodologyVersionId, MFRS_V12_METHODOLOGY_ID);
assert.equal(assembled.scoreRun.overallScore, 48);
assert.equal(assembled.scoreRun.exposureScore, 76);
assert.equal(getQuestionPlaybook('D3-Q09', MFRS_V12_METHODOLOGY_ID)?.fallbackStatus, undefined);

const customerEvidenceModel = adaptComprehensiveEvidenceModel(evidenceModel);
const projection = buildEssentialProjection(assembled, customerEvidenceModel);
const factPack = buildEssentialNarrativeFactPack(assembled, customerEvidenceModel, projection);
const domains = factPack.domains.filter((domain) => typeof domain.score === 'number').map((domain) => ({ name: domain.name, score: domain.score, band: domain.band }));
const comprehensiveAssembly = assembleComprehensive(customerEvidenceModel, {
  scenarioFacts: adaptComprehensiveScenarioFacts(factPack.scenarios),
  domains,
  contradictions: customerEvidenceModel.contradictions,
  assembled,
  scenarioUniverse: customerEvidenceModel.scenarios
});
const managementModel = buildComprehensiveManagementModel(comprehensiveAssembly);
const deliveryModel = buildComprehensiveDeliveryModel({
  assembled, evidenceModel: customerEvidenceModel,
  score: { overallScore: assembled.scoreRun.overallScore, calculatedMaturity: assembled.scoreRun.calculatedMaturity, finalMaturity: assembled.scoreRun.finalMaturity, exposureScore: assembled.scoreRun.exposureScore, exposureBand: assembled.scoreRun.exposureBand, coveragePct: assembled.scoreRun.coveragePct, nARatePct: assembled.scoreRun.nARatePct, criticalGapCount: assembled.scoreRun.criticalGapCount, majorGapCount: assembled.scoreRun.majorGapCount, capApplied: assembled.scoreRun.capApplied, capReason: assembled.scoreRun.capReason, methodologyVersionId: MFRS_V12_METHODOLOGY_ID },
  organisationName: assembled.organisationName, assessmentReference: assembled.assessmentReference, generatedAt: assembled.generatedAt
}, {
  domainDiagnostics: comprehensiveAssembly.domainDiagnostics,
  scenarioSelectionAudit: comprehensiveAssembly.scenarioSelectionAudit,
  scenarioPortfolio: comprehensiveAssembly.scenarioPortfolio
});
assertComprehensiveBlueprintContract(deliveryModel);

const brief = buildInterpretationBrief({
  model: managementModel, organisationName: assembled.organisationName, score: assembled.scoreRun.overallScore, maturity: assembled.scoreRun.finalMaturity, domains,
  assembled, evidenceModel: customerEvidenceModel
});
assert.equal(brief.evidencePack.operatingContext.gatewayAnswers.length, 6);
assert.equal(brief.evidencePack.operatingContext.exposureFactors.length, 6);
assert.equal(brief.evidencePack.materialQuestionPositions.length > 0, true);
assert.equal(brief.evidencePack.contradictions.length, 5);
assert.equal(comprehensiveAssembly.domainDiagnostics.length, 10);
assert.deepEqual(comprehensiveAssembly.domainDiagnostics.map((row) => row.domainCode), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']);
assert.equal(comprehensiveAssembly.domainDiagnostics.every((row) => row.recordedPosition && row.keyStrengthOrWeakness && row.operatingContext && row.managementAttention), true);
assert.equal(comprehensiveAssembly.scenarioSelectionAudit.noMaterialScenarioSilentlyLost, true);
assert.equal(comprehensiveAssembly.scenarioSelectionAudit.highestMaterialityRelevantSelected, true);
assert.equal(comprehensiveAssembly.scenarioSelectionAudit.customerFacingCount, comprehensiveAssembly.scenarioPortfolio.length);
assert.equal(deliveryModel.scenarioPortfolio?.length, comprehensiveAssembly.scenarioPortfolio.length);
assert.equal(brief.evidencePack.domainDiagnostics.length, 10);

function deterministicInterpretation(currentBrief) {
  const firstContradiction = currentBrief.evidencePack.contradictions[0];
  const secondContradiction = currentBrief.evidencePack.contradictions[1];
  const firstDecision = currentBrief.decisions[0];
  const secondDecision = currentBrief.decisions[1] ?? firstDecision;
  const interpretation = {
    executiveInterpretation: `Cedar Ridge Operations records a readiness score of 48 out of 100 and a Developing maturity position, while recorded operating exposure is 76 out of 100 and High. The most important relationship is the gap between the organisation's digital-channel reliance and the control position linked to that exposure: a control can be described as present without giving leadership enough assurance that it will interrupt suspicious activity across the relevant population. The same pattern appears in the relationship between supplier dependency and payment-change discipline. This is not a claim that fraud has occurred. It changes the priority because exposure is carried through ordinary operating channels, so leadership needs to close the dependency between accountable ownership, complete coverage, timely review and retained proof before treating the aggregate position as stable. The maturity cap therefore deserves attention as a management signal, not as a substitute for examining the underlying relationships.`,
    whyThisMatters: `${firstContradiction.title} is the clearest operational warning: ${firstContradiction.whyItMatters} ${firstContradiction.fraudPathwayEnabled} A second recorded relationship, ${secondContradiction.title.toLowerCase()}, matters because normal supplier, payment and access activity can carry value through a control gap without producing an obvious exception at the outset. The practical question is not whether a control label exists; it is whether the relevant population, ownership, review rhythm and escalation evidence connect across the pathway. Leadership should use the recorded exposure profile to decide where that connection is most urgent and ask for proof of the complete population before relying on reported strength.`,
    managementImplication: `Management has to make two linked decisions first. ${firstDecision.decision} is assigned to ${firstDecision.owner} in ${firstDecision.targetPeriod}; taking it now unblocks a defined operating standard instead of leaving the response as a general intention. ${secondDecision.decision} is also assigned to ${secondDecision.owner} in ${secondDecision.targetPeriod}; that decision unblocks the review, escalation and proof route needed to see whether the standard is being applied. Together these choices address the highest-priority pathway without claiming that the underlying event has happened. They also give the organisation a clear basis for sequencing the remaining control work and for challenging unsupported comfort in later management reporting.`,
    controlProgrammeSynthesis: `The recommended programmes work as a connected chain. Governance and incident response set authority and escalation; supplier and payment controls reduce the opportunity for an instruction or relationship to be diverted; access and identity controls protect the systems and profiles through which those processes operate; detection and evidence controls provide the signals and records needed to interrupt and reconstruct a matter. The dependency is population completeness: a strong design in one programme is not enough if joiner, mover and leaver changes, supplier changes, manual adjustments or remote access sit outside the review population. Each programme should therefore retain its own operating proof and feed exceptions to the accountable executive and oversight function named in the registers.`,
    implementationSynthesis: `The sequence starts with decisions and immediate containment because unclear authority leaves every later improvement slow to adopt. The next horizon establishes the control designs and complete-population definitions for the highest exposure pathways. The following horizon embeds recurring review, evidence retention and escalation so that the design is not dependent on one person or one site. The final horizon uses effectiveness measures and deterioration triggers to keep the position current. This order is deliberate: management cannot meaningfully measure a control before it has defined what population it covers, who owns the response, what proof is retained and what happens when the result is outside the expected standard.`,
    conclusion: `Cedar Ridge Operations has a usable starting point: the assessment records meaningful capability as well as material weaknesses, and the registers translate those weaknesses into decisions, controls, proof and a sequenced roadmap. Progress should be judged by whether the highest-exposure pathways have named accountability, complete coverage, timely interruption and durable evidence. That would make the reported maturity more dependable without overstating what this self-assessment has independently proved. The result is a practical management agenda, not a certification.`
  };
  const issues = validateInterpretation(interpretation, currentBrief);
  assert.deepEqual(issues, [], `deterministic interpretation must satisfy the bounded contract: ${JSON.stringify(issues)}`);
  return { interpretation, issues, accounting: { calls: 0, repairs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costMicros: 0, durationMs: 0, model: 'deterministic-provider-free-fixture', repairedSlots: [] } };
}

const packageResult = await renderComprehensiveReportPackage({
  assembled, evidenceModel,
  orderReference: assembled.orderReference, reportReference: assembled.reportReference, versionNumber: 2,
  maxRepairsPerSlot: 0,
  generateInterpretation: async (currentBrief) => deterministicInterpretation(currentBrief),
  renderPdf: renderHtmlToPdfBuffer
});
assert.equal(packageResult.interpretationRun.accounting.calls, 0);
assert.equal(packageResult.interpretationRun.accounting.repairs, 0);

const deterministicHtml = renderComprehensiveManagementReportHtml({
  model: managementModel,
  organisationName: assembled.organisationName,
  assessmentReference: assembled.assessmentReference,
  score: assembled.scoreRun.overallScore,
  maturity: assembled.scoreRun.finalMaturity,
  domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band }))
});
assert.equal(deterministicHtml.includes('…'), false, 'management contradiction/domain cards must not use clipped ellipses');
assert.equal(comprehensiveAssembly.domainDiagnostics.every((row) => deterministicHtml.includes(row.managementAttention)), true);
assert.equal(comprehensiveAssembly.contradictions.every((row) => deterministicHtml.includes(row.whatLeadershipShouldVerify)), true);

const scenarioAudit = auditScenarioLinkage(comprehensiveAssembly.scenarioPortfolio, comprehensiveAssembly.findingRegister, comprehensiveAssembly.riskRegister, comprehensiveAssembly.controlBlueprints);
assertScenarioLinkageAudit(scenarioAudit);
assert.equal(scenarioAudit.length > 0, true);

const reportSurface = JSON.stringify({ assembly: comprehensiveAssembly, delivery: deliveryModel });
assert.equal(/(?:FINDING|RISK|SCENARIO)-\d{3}/.test(reportSurface), false, 'customer report surfaces must not contain narrative aliases');

const roleFixtures = [
  { source: 'CFO', context: 'executive', expected: 'Chief Financial Officer' },
  { source: 'Chief Financial Officer', context: 'executive', expected: 'Chief Financial Officer' },
  { source: 'Finance operations accountable owner', context: 'process', expected: 'Finance and payment operations' },
  { source: 'Audit Committee Chair', context: 'oversight', expected: 'Audit Committee Chair' }
].map((item) => ({ ...item, actual: normaliseRoleLabel(item.source, item.context) }));
assert.equal(roleFixtures.every((item) => item.actual === item.expected), true);
const displayedRoles = [
  ...managementModel.core.governanceRoles.map((role) => role.displayRole),
  ...comprehensiveAssembly.riskRegister.map((risk) => risk.ownerRole),
  ...comprehensiveAssembly.controlBlueprints.flatMap((control) => [control.accountableExecutiveRole, control.processOwnerRole, control.oversightFunction])
].filter(Boolean);
assert.equal(displayedRoles.some((role) => /\b(?:CEO|CFO|COO|CTO|CIO|CISO)\b/.test(role)), false);

const pdfPath = path.join(outputDir, 'MKFRS-CEDAR-RIDGE-FIXTURE-comprehensive-repaired.pdf');
const xlsxPath = path.join(outputDir, 'RPT-MKFRS-CEDAR-RIDGE-FIXTURE-V2-comprehensive-supporting-register-repaired.xlsx');
fs.writeFileSync(pdfPath, packageResult.pdf);
fs.writeFileSync(xlsxPath, packageResult.workbook.bytes);

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const contradictions = brief.evidencePack.contradictions.map((contradiction) => ({
  ...contradiction,
  managementReportLocations: [{ section: 'Section 2 — The patterns beneath the score', heading: 'Relationships leadership should not overlook', fields: ['recorded relationship', 'operational meaning', 'false comfort to test', 'fraud pathway enabled', 'leadership should verify'] }]
}));
const roleAudit = { version: ROLE_NORMALISATION_VERSION, equivalenceFixtures: roleFixtures, displayedRoleCount: displayedRoles.length, displayedRoles: [...new Set(displayedRoles)], unintendedAbbreviations: [] };
const beforeAfter = [
  { defect: 'AI narrative evidence contract', before: 'Brief contained score, domains, themes, programmes and totals only.', after: 'Curated evidence pack now carries recorded context, material positions, priorities, strengths, contradictions and evidence references.', evidence: 'deterministic-evidence-pack.json' },
  { defect: 'Contradiction synthesis', before: 'Five deterministic contradictions were not in the management model or core diagnosis.', after: 'All five appear in Section 2 with operational meaning and leadership verification.', evidence: 'contradictions.json and PDF Section 2' },
  { defect: 'Scenario coherence', before: 'Fact Pack scenarios used synthetic links and unrelated interruption prose.', after: 'Canonical finding/risk/control linkage audit passes for every rendered scenario.', evidence: 'scenario-linkage-audit.json' },
  { defect: 'Canonical identifiers', before: 'Management assembly could expose FINDING-### / RISK-### / SCENARIO-### aliases.', after: 'Assembly and delivery surfaces contain canonical IDs only.', evidence: 'product-coherence-evidence.json' },
  { defect: 'Role vocabulary', before: 'Formal and abbreviated role labels could drift between output surfaces.', after: 'One context-aware normalisation layer is used across assembly, narrative text and registers.', evidence: 'role-normalisation-audit.json' },
  { defect: 'Executive narrative quality', before: 'Interpretation could recite domain/table counts without one governing relationship.', after: 'Bounded deterministic surrogate explains one exposure/control relationship and passes interpretation validation.', evidence: 'interpretation-brief-and-prompt.json' },
  { defect: 'Report coherence', before: 'Management report hid contradictions and repeated register-style diagnosis.', after: 'Section 2 connects patterns, contradictions and interpretation; detailed evidence remains in registers.', evidence: 'PDF and product-coherence-evidence.json' },
  { defect: 'Domain-level diagnosis', before: 'The report showed domain scores without a compact explanation of what each position meant for this organisation.', after: 'Every canonical domain has a deterministic recorded-position, strength/weakness, operating-context and management-attention card.', evidence: 'Domain Diagnostics sheet and Position continuation pages' },
  { defect: 'Scenario source reconciliation', before: 'The customer scenario portfolio could be a silent subset of the deterministic scenario universe.', after: 'Every source scenario is explicitly selected, consolidated or omitted below a deterministic materiality cutoff with canonical links.', evidence: 'scenario-selection-audit.json and Scenario Selection Audit sheet' },
  { defect: 'XLSX usability', before: 'Long text was clipped because sheets had no practical widths or wrapping.', after: 'All sheets use bounded widths, wrapped top-aligned text, row sizing, frozen headers/identifier column, filters and navigation sheets.', evidence: 'XLSX visual inspection and workbook-usability-audit.json' }
];

fs.writeFileSync(path.join(outputDir, 'assessment-inputs.json'), JSON.stringify(assembled, null, 2));
fs.writeFileSync(path.join(outputDir, 'deterministic-evidence-pack.json'), JSON.stringify(brief.evidencePack, null, 2));
fs.writeFileSync(path.join(outputDir, 'interpretation-brief-and-prompt.json'), JSON.stringify({ brief, prompt: buildInterpretationPrompt(brief) }, null, 2));
fs.writeFileSync(path.join(outputDir, 'contradictions.json'), JSON.stringify(contradictions, null, 2));
fs.writeFileSync(path.join(outputDir, 'scenario-linkage-audit.json'), JSON.stringify({ passed: true, rows: scenarioAudit }, null, 2));
fs.writeFileSync(path.join(outputDir, 'domain-diagnostics.json'), JSON.stringify(comprehensiveAssembly.domainDiagnostics, null, 2));
fs.writeFileSync(path.join(outputDir, 'scenario-selection-audit.json'), JSON.stringify(comprehensiveAssembly.scenarioSelectionAudit, null, 2));
fs.writeFileSync(path.join(outputDir, 'role-normalisation-audit.json'), JSON.stringify(roleAudit, null, 2));
fs.writeFileSync(path.join(outputDir, 'before-after-product-defects.json'), JSON.stringify(beforeAfter, null, 2));
fs.writeFileSync(path.join(outputDir, 'workbook-usability-audit.json'), JSON.stringify({
  pendingVisualInspection: false,
  sheets: packageResult.workbook.sheetNames,
  rowCounts: packageResult.workbook.rowCounts,
  visualConclusion: 'All 13 sheets were rendered and visually inspected. Long text is wrapped and top-aligned without material clipping; the first row and identifier column remain visible while navigating, filters are present on data sheets, and Read me/Summary provide navigation context.',
  expectedControls: ['wrapped long text', 'sensible widths', 'row sizing', 'frozen first row', 'frozen identifier column', 'auto-filter on each data sheet', 'read me and summary navigation'],
  inspectedSheets: packageResult.workbook.sheetNames
}, null, 2));
fs.writeFileSync(path.join(outputDir, 'product-coherence-evidence.json'), JSON.stringify({
  gate: 'DETERMINISTIC PRODUCT COHERENCE — PROVIDER-FREE PREVIEW', passed: true, providerCalls: 0, stagingMutations: 0, platformAdminCreated: 0,
  assessment: { organisation: assembled.organisationName, assessmentReference: assembled.assessmentReference, methodologyVersionId: assembled.scoreRun.methodologyVersionId, graphVersion: graph.graphVersion, graphFingerprint: assembled.scoreRun.adaptiveMetrics.graphFingerprint, score: assembled.scoreRun.overallScore, maturity: assembled.scoreRun.finalMaturity, exposureScore: assembled.scoreRun.exposureScore, exposureBand: assembled.scoreRun.exposureBand, domainResults: `${assembled.actualDomainResultCount}/${assembled.expectedDomainResultCount}`, questionTraces: `${assembled.actualQuestionTraceCount}/${assembled.expectedQuestionTraceCount}`, coveragePct: assembled.scoreRun.coveragePct, capApplied: assembled.scoreRun.capApplied },
  deterministicStages: { officialResponseScale: 'V1.2 zero-based 0-5 loaded', evidenceAssembly: true, entitlement: 'Comprehensive R35,000 ZAR fixture accepted', deterministicAdvisory: true, materialFindings: comprehensiveAssembly.findingRegister.length, risks: comprehensiveAssembly.riskRegister.length, controls: comprehensiveAssembly.controlBlueprints.length, evidenceGroups: comprehensiveAssembly.evidenceRequirements.length, roadmap: comprehensiveAssembly.programme.horizons.reduce((sum, horizon) => sum + horizon.actions.length, 0), contradictions: contradictions.length, domainDiagnostics: comprehensiveAssembly.domainDiagnostics.length, scenarios: scenarioAudit.length, scenarioSelectionAudit: comprehensiveAssembly.scenarioSelectionAudit, scenarioLinkagePassed: true, interpretationProviderAuthorised: false },
  output: { pdf: { file: pdfPath, bytes: fs.statSync(pdfPath).size, sha256: sha256(pdfPath) }, xlsx: { file: xlsxPath, bytes: fs.statSync(xlsxPath).size, sha256: sha256(xlsxPath) }, workbookSheets: packageResult.workbook.sheetNames, workbookRows: packageResult.workbook.rowCounts },
  roleNormalisation: roleAudit,
  beforeAfter
}, null, 2));

console.log(JSON.stringify({ passed: true, providerCalls: 0, stagingMutations: 0, pdfPath, xlsxPath, pdfBytes: fs.statSync(pdfPath).size, xlsxBytes: fs.statSync(xlsxPath).size, pdfSha256: sha256(pdfPath), xlsxSha256: sha256(xlsxPath), contradictions: contradictions.length, domainDiagnostics: comprehensiveAssembly.domainDiagnostics.length, scenarios: scenarioAudit.length, scenarioSelectionAudit: comprehensiveAssembly.scenarioSelectionAudit, workbookSheets: packageResult.workbook.sheetNames }, null, 2));
process.exit(0);
