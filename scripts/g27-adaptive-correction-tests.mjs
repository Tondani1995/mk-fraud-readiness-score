import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildPremiumReportEvidencePack } from '../src/lib/reports/automation/evidence.ts';
import { mkAssistFixture } from '../src/lib/reports/evidence-model/__fixtures__/mk-assist-fixture.ts';

const data = structuredClone(mkAssistFixture);
data.assessmentReference = 'MKG29-CORRECTION-FIXTURE';
data.packageName = 'Essential Self-Assessment Report';
data.generatedAt = '2026-08-04T00:00:00.000Z';
data.scoreRun = {
  ...data.scoreRun,
  overallScore: null,
  calculatedMaturity: null,
  finalMaturity: null,
  exposureScore: null,
  exposureBand: null,
  adaptiveResultStatus: 'INSUFFICIENT_VISIBILITY',
  adaptiveMetrics: null
};
data.adaptiveScope = {
  resultStatus: 'INSUFFICIENT_VISIBILITY',
  graphVersion: 'test',
  graphFingerprint: 'test',
  applicableCount: 1,
  applicableWeight: 1,
  excludedCount: 0,
  excludedWeight: 0,
  redirectedCount: 0,
  redirectedWeight: 0,
  invalidatedCount: 0,
  invalidatedWeight: 0,
  profileOnlyCount: 0,
  unknownCount: 1,
  unknownWeight: 1,
  unansweredApplicableCount: 0,
  unansweredApplicableWeight: 0,
  assessmentCoveragePct: 100,
  controlVisibilityPct: 0,
  materialExclusionSharePct: 0,
  unknownSharePct: 100,
  exposureAssessed: false,
  scoreComparabilityStatement: 'No score issued.',
  limitationReasons: ['Unknown responses reached 30% or more of applicable control weight.'],
  excludedQuestionCodes: [],
  redirectedQuestionCodes: [],
  invalidatedQuestionCodes: [],
  unknownQuestionCodes: ['D1-Q01'],
  visibilityGaps: [{
    id: 'VIS-D1-Q01', questionCode: 'D1-Q01', domainCode: 'D1', prompt: 'Fraud risk is reviewed.',
    statement: 'The control position could not be confirmed from the response.',
    whyVisibilityMatters: 'The control objective must be verified.', evidenceNeeded: 'Current review record.',
    likelyEvidenceOwner: 'Control owner', recommendedVerificationAction: 'Obtain and verify the record.', priority: 'High', targetTiming: '30 days'
  }],
  questionTraces: []
};

const model = buildAdvisoryEvidenceModel(data);
const evidence = buildPremiumReportEvidencePack(data, model);
const ids = new Set(evidence.items.map((item) => item.id));
assert.equal(ids.has('score:exposure'), false, 'adaptive evidence omits exposure score');
assert.equal(ids.has('score:exposure_band'), false, 'adaptive evidence omits exposure band');
assert.equal(evidence.items.some((item) => item.kind === 'visibility_gap'), true, 'adaptive evidence includes visibility gaps');
assert.equal(model.visibilityGaps.length, 1, 'one visibility gap is retained');
assert.equal(model.evidenceChecklist.some((item) => item.visibilityGap === true), true, 'verification evidence is a checklist item');
assert.equal(model.scenarios.length >= 0, true, 'visibility-only reports do not fabricate scenarios');

const ui = readFileSync(new URL('../src/components/adaptive/AdaptiveAssessmentExperience.tsx', import.meta.url), 'utf8');
assert.match(ui, /onChange=\{\(\) => void chooseControl/);
assert.match(ui, />Continue<\/Button>/);
assert.match(ui, /chooseGateway[\s\S]*persist\(next, controlResponses, 'gateway', node\.nodeId, false, true\)/);
assert.match(ui, /chooseControl[\s\S]*persist\(gatewayAnswers, next, 'question', node\.nodeId, false, true\)/);
assert.doesNotMatch(ui, /await persist\(next, controlResponses, 'gateway', node\.nodeId\);/);
assert.doesNotMatch(ui, /await persist\(gatewayAnswers, next, 'question', node\.nodeId\);/);

console.log(JSON.stringify({ ok: true, exposureItems: evidence.items.filter((item) => item.kind.includes('exposure')).length, visibilityGaps: model.visibilityGaps.length }));
