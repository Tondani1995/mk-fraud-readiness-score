import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { classifyNarrativeIssue, classifyNarrativeRecoveryIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
import { emptyNarrativeRecoveryBudget, recoveryDecision } from '../../src/lib/reports/narrative/recovery-policy.ts';

const MUST_ALLOW = [
  'Operating effectiveness should then be independently verified before management closes the action.',
  'The control evidence must be independently reviewed before reliance.',
  'Control effectiveness can be independently verified once the evidence pack is complete.',
  'Management should independently review whether activation occurred only after verification and whether exceptions were approved.',
  'The intended measure is a complete custody trail; this is a management control objective, not a statement that evidence has been validated.',
  'The assessment points management toward independent verification.',
  'This assessment directs management towards independent review before closure.',
  'The report guides the organisation toward independent verification of operating effectiveness.',
  'Close the material control weakness recorded for "Refunds, credits, write-offs, stock adjustments, manual journals and overrides receive independent review where used".',
  'Finance and site managers must assign cash custodians, perform opening and closing counts with independent review, reconcile takings to receipts and bankings, record sealed transfers and investigate every shortage or overage against a defined threshold before the next cycle closes.'
];
const MUST_REPAIR = [
  'This assessment has independently verified that evidence exists.',
  'Operating effectiveness has been independently verified before closure.'
];
const MUST_REJECT = [
  'Operating effectiveness was independently verified.',
  'The evidence must be independently verified by MK before closure.',
  'Independent verification is important.',
  'The assessment independently verified control effectiveness.',
  'This report provides independent assurance over operating effectiveness.'
];

function manuscript(text) {
  return { ok: true, markdown: `# Executive\n\n${text}`, errors: [], chapters: [{ chapterId: 'EXEC', title: 'Executive', sections: [{ chapterId: 'EXEC', sectionId: 'POSITION', title: 'Position', permittedClaimRefs: [], paragraphs: [{ text, permittedClaimRefs: [] }], subsections: [] }] }] };
}

test('MUST_ALLOW remains untouched', () => {
  for (const text of MUST_ALLOW) {
    assert.notEqual(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
    const candidate = manuscript(text);
    assert.equal(normaliseProhibitedAssessmentAssurance(candidate), 0, text);
    assert.equal(candidate.chapters[0].sections[0].paragraphs[0].text, text);
  }
});

test('MUST_REPAIR is surfaced as a semantic candidate and remains unchanged before review', () => {
  const issue = classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: true });
  assert.equal(issue.blocking, true);
  assert.equal(issue.repairEligible, true);
  assert.equal(issue.severity, 'REPAIRABLE_SEMANTIC_FAILURE');
  const decision = recoveryDecision({ budget: emptyNarrativeRecoveryBudget(), issueSeverity: issue.severity, issueScope: 'block', fullGenerationRejected: true });
  assert.equal(decision.action, 'TARGETED_REPAIR');
  for (const text of MUST_REPAIR) {
    assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
    const candidate = manuscript(text);
    assert.equal(normaliseProhibitedAssessmentAssurance(candidate), 0, text);
    assert.equal(candidate.chapters[0].sections[0].paragraphs[0].text, text);
    const report = validateBlueprintTextManuscript(candidate, {}, { facts: [] });
    assert.equal(report.hardTruth.issues.length, 0);
    assert.equal(report.semanticCandidates.issues.some((issue) => issue.code === 'assurance_claim'), true);
  }
});

test('MUST_REJECT remains a semantic reviewer decision and deterministic hard truth remains fail-closed', () => {
  for (const text of MUST_REJECT) assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
  for (const text of MUST_REJECT) {
    const candidate = manuscript(text);
    assert.equal(normaliseProhibitedAssessmentAssurance(candidate), 0, text);
    const report = validateBlueprintTextManuscript(candidate, {}, { facts: [] });
    assert.equal(report.hardTruth.issues.length, 0);
    assert.equal(report.semanticCandidates.issues.some((issue) => issue.code === 'assurance_claim'), true);
  }
  for (const code of ['unsupported_numeric_claim', 'invented_finding', 'invented_scenario', 'unknown_claim_ref']) {
    const truth = classifyNarrativeIssue(code);
    assert.equal(truth.severity, 'HARD_TRUTH_FAILURE', code);
    assert.equal(truth.blocking, true, code);
    assert.equal(truth.repairEligible, false, code);
  }
});
