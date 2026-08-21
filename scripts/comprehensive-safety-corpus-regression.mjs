#!/usr/bin/env node
/**
 * Comprehensive extension of the proven Essential false-positive corpus.
 * Provider-free: this exercises the deterministic interpretation boundary and the shared
 * Essential cascade only. It intentionally does not render, call a provider or touch storage.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ASSURANCE_MUST_ALLOW, ASSURANCE_MUST_REPAIR, ASSURANCE_MUST_REJECT } from '../src/lib/reports/narrative/assurance-corpus.ts';
import { adjudicateAssuranceProposition } from '../src/lib/reports/narrative/assurance-adjudication.ts';
import { validateComprehensiveInterpretationSafety } from '../src/lib/reports/comprehensive/safety.ts';
import { INTERPRETATION_CONTRACTS } from '../src/lib/reports/comprehensive/interpretation.ts';

const outputDir = path.resolve(process.env.CERT_OUTPUT_DIR ?? 'outputs/comprehensive-safety-corpus-20260821');
fs.mkdirSync(outputDir, { recursive: true });

const brief = {
  organisationName: 'Cedar Ridge Operations (synthetic fixture)',
  score: 48,
  maturity: 'Developing',
  narrativeMode: 'MIXED',
  domains: [{ name: 'Operations', score: 48, band: 'Developing' }],
  managementThemes: [{ title: 'Supplier and payment integrity', findings: 3, critical: 1, hardGate: 1, question: 'Can value be redirected before anyone challenges it?' }],
  exposureThemes: [{ title: 'Supplier and payment exposure', risks: 3, question: 'Where could value leave through ordinary activity?' }],
  controlProgrammes: [{ title: 'Supplier and payment integrity', controls: 3, evidence: 3, measures: 2, owner: 'Chief Financial Officer', horizons: ['30 days'] }],
  governance: [{ role: 'Chief Financial Officer', type: 'EXECUTIVE_ACCOUNTABILITY', controls: 3, decisions: 2 }],
  decisions: [{ decision: 'Approve the supplier-change standard', whyNow: 'It closes the priority dependency.', owner: 'Chief Financial Officer', targetPeriod: '30 days' }],
  phases: [{ phase: '30 days', actions: 3, programmes: ['Supplier and payment integrity'] }],
  totals: { findings: 3, risks: 3, controls: 3, evidenceItems: 3, actions: 3 },
  evidencePack: {
    assessment: {
      methodologyVersionId: 'v1.2', graphVersion: 'v1.2', graphFingerprint: 'f'.repeat(64), coveragePct: 100,
      uncertaintyRatePct: 0, exposureScore: 76, exposureBand: 'High', capApplied: true, capReason: 'hard-gate cap', criticalGapCount: 1, majorGapCount: 2
    },
    operatingContext: { gatewayAnswers: [{ gatewayCode: 'G01', recordedValue: 'organisation' }], exposureFactors: [{ factorCode: 'EXP-01', factor: 'Supplier dependency', selectedValue: 'High exposure', pointsAwarded: 12, maxPoints: 15 }] },
    materialQuestionPositions: [], prioritisedFindings: [], prioritisedRisks: [], materialStrengths: [], contradictions: [{ id: 'CX-01', pattern: 'mismatch', title: 'A recorded strength depends on a weaker review route', drivingResponses: 'A strong approval position sits alongside a weaker exception review position.', whyItMatters: 'The dependency can create false comfort.', falseComfortRisk: 'A signed approval may look complete while exceptions remain unseen.', whatLeadershipShouldVerify: 'Leadership should verify the complete exception population and escalation record.', fraudPathwayEnabled: 'A conditional diversion could remain routine-looking.', linkedFindingIds: [], linkedRiskId: null, evidenceRefs: ['question:D1-Q01'] }], evidenceReferences: ['question:D1-Q01']
  }
};

const factPack = { facts: [] };
const slots = ['Position', 'Exposure', 'Decision', 'Programme', 'Sequence', 'Outcome'];
const fillers = [
  'The recorded position should be read as management evidence about design and coverage, not as a completed operating conclusion.',
  'The significance is the relationship between an ordinary process and the point at which an exception becomes visible to an accountable role.',
  'A decision is useful when it assigns authority, defines the population and gives the next control activity a basis for escalation.',
  'The recommended design connects prevention, detection, evidence and oversight without stating that any of those elements already operates.',
  'The sequence follows dependency: ownership and scope precede repeatable review, retained proof and later effectiveness measurement.',
  'Progress would be visible in records that management can produce and challenge, while the assessment boundary remains explicit.'
];
function pad(text, target, index) {
  let output = text;
  while (output.trim().split(/\s+/).length < target) output += ` ${fillers[index % fillers.length]}`;
  return output;
}
function interpretation(overrides = {}) {
  const values = {
    executiveInterpretation: `Cedar Ridge's recorded self-assessment places the organisation at a Developing position. Supplier dependency and manual intervention matter because a strong approval step can still give false comfort when the exception route and complete review population are weaker. This is a conditional management interpretation, not an incident allegation. ${fillers[0]}`,
    whyThisMatters: `The recorded contradiction is the important relationship: an apparent strength depends on a weaker review route. That can allow a routine supplier or payment change to progress before an exception is visible. Leadership should verify the population, escalation record and retained evidence rather than treating the approval label as sufficient. ${fillers[1]}`,
    managementImplication: `Management should decide who owns the supplier-change standard and what exception route applies. That choice unblocks a defined population, an accountable reviewer and an escalation path. The decision is a recommendation for management, not a statement that the control already operates. ${fillers[2]}`,
    controlProgrammeSynthesis: `The recommended supplier and payment programme connects authority, trusted-channel verification, exception review and retained proof. Its value depends on the population being complete and the oversight route being separate from process ownership. These are target designs, not evidence that current operation is effective. ${fillers[3]}`,
    implementationSynthesis: `The sequence begins with ownership and scope, then establishes the review and evidence standard, and only then measures whether the process is working consistently. Later monitoring cannot compensate for an undefined population or unclear escalation authority. ${fillers[4]}`,
    conclusion: `A credible next state would let management show who approved a supplier or payment change, what population was reviewed and what happened to exceptions. That would make the recorded position more useful without turning a self-assessment into assurance. ${fillers[5]}`
  };
  const merged = { ...values, ...overrides };
  return Object.fromEntries(INTERPRETATION_CONTRACTS.map((contract, index) => [
    contract.id,
    pad(merged[contract.id], contract.minWords + 5, index)
  ]));
}

function runCase(id, category, overrides) {
  const result = validateComprehensiveInterpretationSafety({ interpretation: interpretation(overrides), brief, factPack });
  return {
    id,
    category,
    publishable: result.publishable,
    repairs: result.repairs,
    issues: result.issues.map((issue) => ({ slot: issue.slot, kind: issue.kind, code: issue.code })),
    blockingCodes: result.cascade.blockingCodes,
    heldForReviewCodes: result.cascade.heldForReviewCodes,
    candidateTrace: result.candidateTrace
  };
}

const results = [];
results.push(runCase('allow-qualified-self-assessment', 'MUST_ALLOW', {}));
results.push(runCase('allow-conditional-pathway', 'MUST_ALLOW', {
  whyThisMatters: pad('A supplier change could progress through an ordinary payment route if the dependent review population is incomplete; leadership should verify the exception path before relying on the apparent approval strength.', 100, 1)
}));
results.push(runCase('allow-contradiction-and-strength-caveat', 'MUST_ALLOW', {}));
results.push(runCase('allow-evidence-still-to-verify', 'MUST_ALLOW', {
  conclusion: pad('Management should independently verify whether the complete supplier population is covered before closing the action; the evidence requirement is a future proof criterion, not a completed assurance statement.', 80, 5)
}));
results.push(runCase('repair-role-label-drift', 'MUST_REPAIR', {
  managementImplication: pad('The CFO should decide who owns the supplier-change standard and what exception route applies. That choice unblocks a defined population and an accountable reviewer without claiming that the control already operates.', 100, 2)
}));
results.push(runCase('repair-overstated-assurance', 'MUST_REPAIR', {
  executiveInterpretation: pad('This assessment has independently verified that evidence exists for the supplier-change process, so management can rely on the reported position.', 120, 0)
}));
results.push(runCase('repair-ambiguous-tense', 'MUST_REPAIR', {
  whyThisMatters: pad('The supplier review is independently verified before closure, although the surrounding assessment language does not state who performed that work or for which population.', 100, 1)
}));
results.push(runCase('reject-invented-incident', 'MUST_REJECT', {
  executiveInterpretation: pad('Cedar Ridge suffered a supplier fraud loss and management detected the incident after payment release.', 120, 0)
}));
results.push(runCase('reject-invented-benchmark', 'MUST_REJECT', {
  executiveInterpretation: pad('Cedar Ridge is below the industry average and behind its peers on fraud readiness.', 120, 0)
}));
results.push(runCase('reject-unsupported-number', 'MUST_REJECT', {
  executiveInterpretation: pad('The organisation processes 847 supplier payments a month and therefore needs a larger control team.', 120, 0)
}));
results.push(runCase('reject-wrong-maturity-and-exposure', 'MUST_REJECT', {
  executiveInterpretation: pad('The organisation is in the Strategic maturity band and has Low exposure despite the recorded position.', 120, 0)
}));
results.push(runCase('reject-raw-identifier', 'MUST_REJECT', {
  managementImplication: pad('The D4-Q03 finding links to RISK-CONTROL-D4-Q03 and should be assigned to the owner.', 100, 2)
}));
results.push(runCase('reject-secret-infrastructure', 'MUST_REJECT', {
  conclusion: pad('The AI_GATEWAY_API_KEY and Supabase deployment configuration are part of the report-generation basis.', 80, 5)
}));

const assuranceCorpus = [
  ...ASSURANCE_MUST_ALLOW.map((entry) => ({ ...entry, expected: 'ALLOW' })),
  ...ASSURANCE_MUST_REPAIR.map((entry) => ({ ...entry, expected: 'REPAIR' })),
  ...ASSURANCE_MUST_REJECT.map((entry) => ({ ...entry, expected: 'REJECT' }))
].map((entry) => ({
  id: entry.id,
  expected: entry.expected,
  actual: adjudicateAssuranceProposition(entry.text).disposition,
  text: entry.text,
  source: entry.source
}));
for (const row of assuranceCorpus) {
  if (row.expected === 'ALLOW') assert.equal(row.actual, 'ALLOW', `${row.id} shared adjudicator`);
  if (row.expected === 'REPAIR') assert.notEqual(row.actual, 'ALLOW', `${row.id} shared adjudicator`);
  if (row.expected === 'REJECT') assert.notEqual(row.actual, 'ALLOW', `${row.id} shared adjudicator`);
}

const summary = {
  policyVersion: 'mk-comprehensive-essential-safety-v1',
  providerCalls: 0,
  stagingMutations: 0,
  cases: results,
  counts: {
    mustAllowPublishable: results.filter((row) => row.category === 'MUST_ALLOW' && row.publishable).length,
    mustRepairClosedOrHeld: results.filter((row) => row.category === 'MUST_REPAIR' && (!row.publishable || row.repairs.length > 0)).length,
    mustRejectBlocked: results.filter((row) => row.category === 'MUST_REJECT' && !row.publishable).length
  },
  sharedAssuranceCorpus: {
    entries: assuranceCorpus.length,
    allow: assuranceCorpus.filter((row) => row.expected === 'ALLOW').length,
    repair: assuranceCorpus.filter((row) => row.expected === 'REPAIR').length,
    reject: assuranceCorpus.filter((row) => row.expected === 'REJECT').length,
    results: assuranceCorpus
  }
};
assert.equal(summary.counts.mustAllowPublishable, 4);
assert.equal(summary.counts.mustRepairClosedOrHeld, 2);
assert.equal(summary.counts.mustRejectBlocked, 6);
fs.writeFileSync(path.join(outputDir, 'comprehensive-safety-corpus.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, sharedAssuranceCorpus: { ...summary.sharedAssuranceCorpus, results: undefined } }, null, 2));
console.log('\nPASS: Comprehensive safety corpus and shared Essential assurance corpus are green without provider calls.');
