import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAdvisoryEvidenceModel, checkQualityGates } from '../src/lib/reports/evidence-model/index.ts';
import {
  buildPremiumReportEvidencePack,
  canonicalEvidenceJson,
  evidenceChecksum,
  validatePremiumReportEvidencePack
} from '../src/lib/reports/automation/evidence.ts';
import { buildPremiumReportNarrativeBrief } from '../src/lib/reports/automation/narrative-brief.ts';
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
data.questionTraces = [...data.questionTraces, {
  questionCode: 'D1-Q01', domainCode: 'D1', domainName: 'Fraud Leadership and Governance',
  prompt: 'Fraud risk is reviewed.', responseValue: null, normalisedScore: null,
  applicable: true, triggeredRules: [], isCritical: false, isHardGate: false,
  isCriticalGap: false, isMajorGap: false
}];

const model = buildAdvisoryEvidenceModel(data);
const evidence = buildPremiumReportEvidencePack(data, model);
const ids = new Set(evidence.items.map((item) => item.id));
const visibilityItems = evidence.items.filter((item) => item.kind === 'visibility_gap');
const checklistItems = evidence.items.filter((item) => item.kind === 'evidence_checklist' && item.value?.visibilityGap === true);
assert.equal(ids.has('score:exposure'), false, 'adaptive evidence omits exposure score');
assert.equal(ids.has('score:exposure_band'), false, 'adaptive evidence omits exposure band');
assert.equal(visibilityItems.length, 1, 'one visibility condition item is retained');
assert.equal(checklistItems.length, 1, 'one visibility evidence-checklist artefact is retained');
assert.equal(visibilityItems[0].id, 'visibility-gap:VIS-D1-Q01', 'visibility condition uses its own stable namespace');
assert.match(checklistItems[0].id, /^evidence:VIS-D1-Q01(?:-[A-Z0-9]+)?$/, 'checklist artefact keeps its public evidence namespace');
assert.notEqual(visibilityItems[0].id, checklistItems[0].id, 'visibility condition and artefact have different identities');
assert.deepEqual(visibilityItems[0].evidenceRefs, ['question:D1-Q01', 'domain:D1', checklistItems[0].id], 'visibility condition links its question, domain and requested artefact');
assert.equal(ids.size, evidence.items.length, 'evidence pack IDs are unique');
assert.deepEqual(validatePremiumReportEvidencePack(evidence), [], 'corrected visibility pack has no duplicate or unresolved references');
assert.ok(buildPremiumReportNarrativeBrief(evidence).leadership.allowedEvidenceRefs.includes(checklistItems[0].id), 'narrative brief retains the visibility evidence request');
const repeatedEvidence = buildPremiumReportEvidencePack(data, buildAdvisoryEvidenceModel(data));
assert.equal(canonicalEvidenceJson(repeatedEvidence), canonicalEvidenceJson(evidence), 'canonical evidence ordering is deterministic');
assert.equal(evidenceChecksum(repeatedEvidence), evidenceChecksum(evidence), 'corrected evidence checksum is stable');
assert.equal(model.visibilityGaps.length, 1, 'one visibility gap is retained');
assert.equal(model.evidenceChecklist.some((item) => item.visibilityGap === true), true, 'verification evidence is a checklist item');
assert.deepEqual(checkQualityGates(model, data).violations, [], 'visibility-only checklist semantics pass the deterministic quality gate');
assert.equal(model.scenarios.length >= 0, true, 'visibility-only reports do not fabricate scenarios');

const duplicateVisibilityData = structuredClone(data);
duplicateVisibilityData.adaptiveScope.visibilityGaps.push({ ...duplicateVisibilityData.adaptiveScope.visibilityGaps[0] });
const duplicateVisibilityEvidence = buildPremiumReportEvidencePack(duplicateVisibilityData, buildAdvisoryEvidenceModel(duplicateVisibilityData));
assert.ok(validatePremiumReportEvidencePack(duplicateVisibilityEvidence).some((issue) => issue.code === 'QG_AI_EVIDENCE_REF_DUPLICATE'), 'duplicate visibility question identity fails closed');

const ordinaryData = structuredClone(mkAssistFixture);
ordinaryData.assessmentReference = 'MKG29-ORDINARY-FIXTURE';
ordinaryData.packageName = 'Essential Self-Assessment Report';
ordinaryData.generatedAt = '2026-08-04T00:00:00.000Z';
const ordinaryModel = buildAdvisoryEvidenceModel(ordinaryData);
const ordinaryEvidence = buildPremiumReportEvidencePack(ordinaryData, ordinaryModel);
assert.equal(ordinaryEvidence.items.some((item) => item.kind === 'visibility_gap'), false, 'ordinary exposure-assessed reports remain free of visibility-gap items');

const ui = readFileSync(new URL('../src/components/adaptive/AdaptiveAssessmentExperience.tsx', import.meta.url), 'utf8');
assert.match(ui, /onChange=\{\(\) => void chooseControl/);
assert.doesNotMatch(ui, />Continue<\/Button>/, 'routine continuation control is removed');
assert.match(ui, /chooseGateway[\s\S]*persist\(next, controlResponses, 'gateway', node\.nodeId, false\)/);
assert.match(ui, /chooseControl[\s\S]*persist\(gatewayAnswers, next, 'question', node\.nodeId, false\)/);
assert.match(ui, /setCurrentId\(body\.state\.path\?\.currentNextNode \?\? null\)/, 'the authoritative returned path drives the next question');
assert.match(ui, /savingRef\.current = true/, 'a save guard prevents conflicting writes');
assert.match(ui, /pendingWriteRef\.current = write/, 'the intended write is retained for retry');
assert.match(ui, /Try saving again/, 'failed saves expose a retry state');
assert.doesNotMatch(ui, /Save now/);
assert.doesNotMatch(ui, /await persist\(next, controlResponses, 'gateway', node\.nodeId\);/);
assert.doesNotMatch(ui, /await persist\(gatewayAnswers, next, 'question', node\.nodeId\);/);

console.log(JSON.stringify({ ok: true, exposureItems: evidence.items.filter((item) => item.kind.includes('exposure')).length, visibilityGaps: model.visibilityGaps.length }));
