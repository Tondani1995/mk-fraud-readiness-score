import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { classifyNarrativeIssue, classifyNarrativeRecoveryIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
import { emptyNarrativeRecoveryBudget, recoveryDecision } from '../../src/lib/reports/narrative/recovery-policy.ts';

const MUST_ALLOW = [
  'Operating effectiveness should then be independently verified before management closes the action.',
  'The control evidence must be independently reviewed before reliance.',
  'Control effectiveness can be independently verified once the evidence pack is complete.',
  'Management should independently review whether activation occurred only after verification and whether exceptions were approved.',
  'The intended measure is a complete custody trail; this is a management control objective, not a statement that evidence has been validated.'
];
const MUST_REPAIR = [
  'This assessment has independently verified that evidence exists.',
  'Operating effectiveness has been independently verified before closure.'
];
const MUST_REJECT = [
  'Operating effectiveness was independently verified.',
  'The evidence must be independently verified by MK before closure.',
  'Independent verification is important.'
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

test('MUST_REPAIR is blocked, bounded and deterministically repaired', () => {
  const issue = classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: true });
  assert.equal(issue.blocking, true);
  assert.equal(issue.repairEligible, true);
  assert.equal(issue.severity, 'REPAIRABLE_SEMANTIC_FAILURE');
  const decision = recoveryDecision({ budget: emptyNarrativeRecoveryBudget(), issueSeverity: issue.severity, issueScope: 'block', fullGenerationRejected: true });
  assert.equal(decision.action, 'TARGETED_REPAIR');
  for (const text of MUST_REPAIR) {
    assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
    const candidate = manuscript(text);
    assert.equal(normaliseProhibitedAssessmentAssurance(candidate), 2, text);
    const repaired = candidate.chapters[0].sections[0].paragraphs[0].text;
    assert.notEqual(repaired, text);
    assert.equal(classifyAssuranceLanguage(repaired), null, repaired);
  }
});

test('MUST_REJECT and hard truth remain fail-closed', () => {
  for (const text of MUST_REJECT) assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
  const issue = classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: false });
  assert.equal(issue.severity, 'HARD_TRUTH_FAILURE');
  assert.equal(issue.repairEligible, false);
  assert.equal(recoveryDecision({ budget: emptyNarrativeRecoveryBudget(), issueSeverity: issue.severity, issueScope: 'block', fullGenerationRejected: true }).action, 'HUMAN_REVIEW_REQUIRED');
  for (const code of ['unsupported_numeric_claim', 'invented_finding', 'invented_scenario', 'unknown_claim_ref']) {
    const truth = classifyNarrativeIssue(code);
    assert.equal(truth.severity, 'HARD_TRUTH_FAILURE', code);
    assert.equal(truth.blocking, true, code);
    assert.equal(truth.repairEligible, false, code);
  }
});
