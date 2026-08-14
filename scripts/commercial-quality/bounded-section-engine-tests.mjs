#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  BOUNDED_SECTION_ENGINE_ARCHITECTURE,
  BOUNDED_SECTION_ENGINE_SCHEMA_VERSION,
  BoundedGenerationFailure,
  BoundedTechnicalFailure,
  buildNarrativeSectionContract,
  buildNarrativeSlotPlan,
  buildReportThesis,
  compileApprovedNarrativeSlots,
  generateBoundedNarrativeReport,
  validateNarrativeSlotResult
} from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { BOUNDED_SECTION_ARCHITECTURE, selectNarrativeArchitecture } from '../../src/lib/reports/narrative/architecture.ts';
import { parseBoundedNarrativeSlotText } from '../../src/lib/reports/narrative/bounded-section-writer.ts';

const fact = (id, kind, value) => ({ id, kind, value, sourceRefs: [`SOURCE-${id}`] });
const facts = [
  fact('FACT-SCORE', 'score', 35.55),
  fact('FACT-MATURITY', 'maturity', 'Reactive'),
  fact('DOMAIN-REPORTING', 'domain', { name: 'Whistleblowing and Reporting Culture', score: 73.57 }),
  fact('DOMAIN-DETECTION', 'domain', { name: 'Fraud Detection Capability', score: 20 }),
  fact('DOMAIN-OPERATIONS', 'domain', { name: 'Operational Fraud Controls', score: 50.97 }),
  fact('THEME-GOVERNANCE', 'theme', 'Governance enables the connected response.'),
  fact('FINDING-SUPPLIER', 'finding', 'Supplier and payment challenge require connected treatment.'),
  fact('FINDING-IDENTITY', 'finding', 'Identity and transaction challenge require connected treatment.'),
  fact('FINDING-CONTAINMENT', 'finding', 'Containment and learning require connected treatment.'),
  fact('SCENARIO-SUPPLIER', 'scenario', 'A supplier payment pathway could redirect value conditionally.'),
  fact('SCENARIO-IDENTITY', 'scenario', 'An identity and transaction pathway could create exposure conditionally.'),
  fact('SCENARIO-CONTAINMENT', 'scenario', 'A delayed containment pathway could extend consequences conditionally.'),
  fact('CONTROL-RESPONSE', 'control', 'A target control response has an accountable executive and proof.'),
  fact('DECISION-OWNER', 'decision', 'Leadership must choose the ownership route.'),
  fact('ROADMAP-30', 'roadmap', { phase: 'STABILISE', targetPeriod: '30 days', action: 'Preserve evidence and set incident intake.' }),
  fact('ROADMAP-60', 'roadmap', { phase: 'ESTABLISH', targetPeriod: '60 days', action: 'Establish verification.' }),
  fact('ROADMAP-90', 'roadmap', { phase: 'ESTABLISH', targetPeriod: '90 days', action: 'Operate and review.' })
];

const section = (sectionId, title, role, refs, optionalSubsections = []) => ({
  sectionId,
  order: 1,
  title,
  purpose: `Explain ${title} for management.`,
  requiredManagementTakeaway: `Management has a bounded takeaway for ${title}.`,
  requiredFacts: refs,
  claimRefs: refs,
  optionalSubsections,
  narrativeRole: role
});
const subsection = (subsectionId, title, ref) => ({
  subsectionId,
  order: 1,
  title,
  purpose: `Explain the conditional ${title} pathway.`,
  requiredManagementTakeaway: `The ${title} pathway remains conditional.`,
  requiredFacts: [ref],
  claimRefs: [ref],
  narrativeRole: 'EXPOSURE_ILLUSTRATION'
});
const chapter = (chapterId, order, title, role, sections) => ({
  chapterId,
  order,
  title,
  purpose: `Chapter purpose for ${title}.`,
  requiredManagementTakeaway: `Chapter takeaway for ${title}.`,
  requiredFacts: sections.flatMap((item) => item.requiredFacts),
  claimRefs: sections.flatMap((item) => item.claimRefs),
  linkedFindingIds: [],
  linkedScenarioIds: [],
  linkedControlIds: [],
  linkedDecisionIds: [],
  linkedRoadmapIds: [],
  narrativeRole: role,
  exhibits: [],
  sections
});

const blueprint = {
  schemaVersion: 'mk-reporting-bible-1.1-report-blueprint-v3',
  bibleVersion: '1.1',
  reportTitle: 'Rivonia Health Logistics (Pty) Ltd — Essential Fraud Readiness Report',
  reportTier: 'essential',
  narrativeMode: 'REMEDIATION',
  organisation: { name: 'Rivonia Health Logistics (Pty) Ltd', sectorFacts: [] },
  assessmentPosition: { reference: 'MKFRS-2026-F4047D75C0', score: 35.55, maturity: 'Reactive', exposureScore: 25, exposureBand: 'High', summary: 'Recorded position.', assuranceBoundary: "The assessment is based on management's recorded self-assessment and deterministic scoring inputs. It is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness." },
  executiveStory: 'Explain the position and management implication.',
  chapters: [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'JUDGEMENT', [
      section('EXECUTIVE-POSITION', 'Rivonia readiness position', 'JUDGEMENT', ['FACT-SCORE', 'FACT-MATURITY', 'DOMAIN-REPORTING']),
      section('EXECUTIVE-DRIVERS', 'What shapes the position', 'JUDGEMENT', ['THEME-GOVERNANCE']),
      section('EXECUTIVE-TAKEAWAY', 'What this means for management', 'JUDGEMENT', ['FACT-SCORE'])
    ]),
    chapter('DIAGNOSIS', 2, 'What is shaping readiness', 'DIAGNOSIS', [section('DIAGNOSIS-SECTION', 'The systemic pattern', 'DIAGNOSIS', ['THEME-GOVERNANCE', 'DOMAIN-REPORTING', 'DOMAIN-DETECTION'])]),
    chapter('EXPOSURES', 3, 'Priority fraud exposures', 'EXPOSURE', [
      section('EXPOSURE-SUPPLIER', 'Value diversion through supplier and payment processes', 'EXPOSURE', ['FINDING-SUPPLIER']),
      section('EXPOSURE-IDENTITY', 'Weak challenge at identity and transaction points', 'EXPOSURE', ['FINDING-IDENTITY']),
      section('EXPOSURE-CONTAINMENT', 'Limited containment and learning', 'EXPOSURE', ['FINDING-CONTAINMENT'])
    ]),
    chapter('SCENARIOS', 4, 'How exposure could materialise', 'EXPOSURE_ILLUSTRATION', [section('SCENARIO-SECTION', 'Conditional exposure pathways', 'EXPOSURE_ILLUSTRATION', ['SCENARIO-SUPPLIER', 'SCENARIO-IDENTITY', 'SCENARIO-CONTAINMENT'], [
      subsection('PATHWAY-SUPPLIER', 'Supplier payment pathway', 'SCENARIO-SUPPLIER'),
      subsection('PATHWAY-IDENTITY', 'Identity transaction pathway', 'SCENARIO-IDENTITY'),
      subsection('PATHWAY-CONTAINMENT', 'Containment learning pathway', 'SCENARIO-CONTAINMENT')
    ])]),
    chapter('RESPONSE', 5, 'What management should change', 'RESPONSE', [section('RESPONSE-SECTION', 'Connected target response', 'RESPONSE', ['CONTROL-RESPONSE', 'DECISION-OWNER'])]),
    chapter('IMPLEMENTATION', 6, 'First 90 days', 'IMPLEMENTATION', [
      section('IMPLEMENT-30', '30 days — STABILISE', 'IMPLEMENTATION', ['ROADMAP-30']),
      section('IMPLEMENT-60', '60 days — ESTABLISH', 'IMPLEMENTATION', ['ROADMAP-60']),
      section('IMPLEMENT-90', '90 days — OPERATE AND REVIEW', 'IMPLEMENTATION', ['ROADMAP-90'])
    ]),
    chapter('CONCLUSION', 7, 'Management conclusion', 'CONCLUSION', [section('CONCLUSION-SECTION', 'Management conclusion', 'CONCLUSION', ['ROADMAP-90'])])
  ],
  findingClusters: [
    { clusterId: 'CLUSTER-1', title: 'Value diversion through supplier and payment processes', whyTogether: 'Connected value diversion pattern.', semanticFamilies: [], findingRefs: ['FINDING-SUPPLIER'], sourceRefs: ['FINDING-SUPPLIER'] },
    { clusterId: 'CLUSTER-2', title: 'Weak challenge at identity and transaction points', whyTogether: 'Connected challenge pattern.', semanticFamilies: [], findingRefs: ['FINDING-IDENTITY'], sourceRefs: ['FINDING-IDENTITY'] },
    { clusterId: 'CLUSTER-3', title: 'Limited containment and learning', whyTogether: 'Connected containment pattern.', semanticFamilies: [], findingRefs: ['FINDING-CONTAINMENT'], sourceRefs: ['FINDING-CONTAINMENT'] }
  ],
  contentAssignments: [
    ['theme', 'THEME-GOVERNANCE', 'DIAGNOSIS', 'DIAGNOSIS-SECTION'],
    ['finding', 'FINDING-SUPPLIER', 'EXPOSURES', 'EXPOSURE-SUPPLIER'],
    ['finding', 'FINDING-IDENTITY', 'EXPOSURES', 'EXPOSURE-IDENTITY'],
    ['finding', 'FINDING-CONTAINMENT', 'EXPOSURES', 'EXPOSURE-CONTAINMENT'],
    ['scenario', 'SCENARIO-SUPPLIER', 'SCENARIOS', 'SCENARIO-SECTION'],
    ['scenario', 'SCENARIO-IDENTITY', 'SCENARIOS', 'SCENARIO-SECTION'],
    ['scenario', 'SCENARIO-CONTAINMENT', 'SCENARIOS', 'SCENARIO-SECTION'],
    ['control', 'CONTROL-RESPONSE', 'RESPONSE', 'RESPONSE-SECTION'],
    ['decision', 'DECISION-OWNER', 'RESPONSE', 'RESPONSE-SECTION'],
    ['roadmap', 'ROADMAP-30', 'IMPLEMENTATION', 'IMPLEMENT-30'],
    ['roadmap', 'ROADMAP-60', 'IMPLEMENTATION', 'IMPLEMENT-60'],
    ['roadmap', 'ROADMAP-90', 'IMPLEMENTATION', 'IMPLEMENT-90']
  ].map(([contentType, contentRef, chapterId, sectionId]) => ({ contentType, contentRef, chapterId, sectionId, assignmentType: 'primary_home', narrativeRole: 'EVIDENCE' })),
  narrativeCrossReferences: [],
  narrativeRoleUsage: { factUsage: {}, findingUsage: {}, scenarioUsage: {}, controlUsage: {}, ledger: [] },
  transformationSequence: [],
  deterministicRules: [],
  prohibitedClaims: [],
};

const pack = {
  schemaVersion: 'mk-reporting-bible-1.1-fact-pack-v1',
  bibleVersion: '1.1',
  productTier: 'essential',
  narrativeMode: 'REMEDIATION',
  organisation: { name: 'Rivonia Health Logistics (Pty) Ltd', sectorFacts: [] },
  assessment: { reference: 'MKFRS-2026-F4047D75C0', generatedAt: '2026-08-14T00:00:00.000Z', score: 35.55, maturity: 'Reactive', calculatedMaturity: 'Reactive', exposureScore: 25, exposureBand: 'High', coveragePct: 100, uncertaintyRatePct: 0, criticalGapCount: 0, majorGapCount: 3, uncertaintyFacts: [] },
  domains: [
    { factRef: 'DOMAIN-REPORTING', code: 'D4', name: 'Whistleblowing and Reporting Culture', score: 73.57, maturity: 'Structured', weightPct: 10, coveragePct: 100, criticalGapCount: 0 },
    { factRef: 'DOMAIN-DETECTION', code: 'D7', name: 'Fraud Detection Capability', score: 20, maturity: 'Reactive', weightPct: 10, coveragePct: 100, criticalGapCount: 0 },
    { factRef: 'DOMAIN-OPERATIONS', code: 'D5', name: 'Operational Fraud Controls', score: 50.97, maturity: 'Developing', weightPct: 10, coveragePct: 100, criticalGapCount: 0 }
  ],
  relativeStrengths: [],
  systemicThemeInputs: [{ factRef: 'THEME-GOVERNANCE', themeFamily: 'FRAUD_GOVERNANCE', managementQuestion: 'How is ownership connected?', title: 'Governance enables the connected response', findingRefs: [], domainCodes: [], semanticFamilies: [], riskRefs: [], scenarioRefs: [], managementImplicationBasis: 'Connect ownership.', fraudRiskRelationship: 'Governance connects response.', whyTogether: 'Connected governance pattern.' }],
  standaloneFindingReasons: {},
  findings: [],
  sustainmentPriorities: [],
  risks: [],
  scenarios: [],
  controls: [],
  decisions: [],
  roadmap: [],
  proofOfProgress: [],
  maturationSteps: [],
  prohibitedClaims: [],
  narrativeBounds: { themeCount: 1, findingCount: 3, scenarioCount: 3, controlCount: 1, decisionCount: 1, managementResponseCount: 1 },
  facts
};

const thesis = buildReportThesis(pack, blueprint);
const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
assert.equal(plan.architecture, BOUNDED_SECTION_ENGINE_ARCHITECTURE);
assert.equal(plan.slots.filter((slot) => slot.narrativeRole === 'EXPOSURE').length, 3);
assert.equal(plan.slots.filter((slot) => slot.narrativeRole === 'EXPOSURE_ILLUSTRATION').length, 3);
assert.equal(plan.slots.some((slot) => slot.title === 'What is shaping readiness'), true);
assert.equal(selectNarrativeArchitecture({ MK_REPORT_NARRATIVE_ARCHITECTURE: BOUNDED_SECTION_ARCHITECTURE }), BOUNDED_SECTION_ARCHITECTURE);

function fillerWords(seed, count) {
  const alphabet = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu'.split(' ');
  const out = [];
  const slotMarker = alphabet[seed % alphabet.length];
  for (let index = 0; index < count; index += 1) out.push(`${slotMarker} ${alphabet[(seed + index) % alphabet.length]} context provides a distinct management lens for this bounded narrative.`);
  return out;
}

function goodResult(contract, seed = 0) {
  const markers = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray', 'yankee', 'zulu'];
  const excerpts = contract.requiredInsights.map((item, index) => `For the ${contract.title} context ${markers[(seed + index) % markers.length]}, this section addresses ${item.instruction.toLowerCase()}.`);
  const target = contract.fit.targetWords;
  const narrative = [...excerpts, ...fillerWords(seed, Math.max(0, Math.ceil(target / 17)))].join(' ');
  const implicationMarkers = ['amber', 'blue', 'coral', 'green', 'indigo', 'jade', 'khaki', 'lilac', 'mint', 'navy', 'ochre', 'pearl', 'quartz', 'rose', 'silver', 'teal', 'umber', 'violet', 'white', 'xanthic', 'yellow', 'zinc', 'aqua', 'bronze', 'copper', 'denim'];
  const implication = `The immediate implication for ${implicationMarkers[seed % implicationMarkers.length]} is to keep ownership, challenge, information and review visible as the connected report advances.`;
  const implementationRoute = contract.narrativeRole === 'IMPLEMENTATION'
    ? 'The route is 30 days — STABILISE, 60 days — ESTABLISH, and 90 days — OPERATE AND REVIEW, with incident and evidence-preservation discipline in the first horizon.'
    : '';
  return { contractVersion: BOUNDED_SECTION_ENGINE_SCHEMA_VERSION, slotId: contract.slotId, centralJudgement: 'The recorded pattern requires a connected management response.', narrative: `${narrative} ${implementationRoute}`.trim(), managementImplication: implication, usedClaimRefs: contract.primaryContentRefs.length ? contract.primaryContentRefs : contract.permittedClaimRefs.slice(0, 1), requirementCoverage: contract.requiredInsights.map((item, index) => ({ requirementId: item.requirementId, supportingExcerpt: excerpts[index] })), transitionCue: '' };
}

function metadata(contract, callType = 'INITIAL', repairNumber = 0) {
  return { provider: 'test', model: 'test/bounded', promptVersion: 'test', generationMode: 'test-injected', generatedAt: new Date(0).toISOString(), totalTokens: 10, providerCostMicros: 1, callType, repairNumber };
}

for (const slot of plan.slots) {
  const contract = buildNarrativeSectionContract(slot, pack, thesis);
  const result = goodResult(contract, slot.order);
  const validation = validateNarrativeSlotResult(result, contract);
  assert.equal(validation.ok, true, `${slot.slotId}: ${validation.issues.map((item) => item.message).join('; ')}`);
}

const firstContract = buildNarrativeSectionContract(plan.slots[0], pack, thesis);
const failure = (result) => validateNarrativeSlotResult(result, firstContract);
assert.equal(failure({ ...goodResult(firstContract), usedClaimRefs: ['UNKNOWN-CLAIM'] }).issues.some((item) => item.code === 'PROVENANCE_VIOLATION'), true);
assert.equal(failure({ ...goodResult(firstContract), narrative: `${goodResult(firstContract).narrative} The score is 99.` }).issues.some((item) => item.code === 'HARD_TRUTH_FAILURE'), true);
assert.equal(failure({ ...goodResult(firstContract), narrative: `${goodResult(firstContract).narrative} MK independently verified operating effectiveness.` }).issues.some((item) => item.code === 'ASSURANCE_LANGUAGE'), true);
assert.equal(failure({ ...goodResult(firstContract), requirementCoverage: [] }).issues.some((item) => item.code === 'MISSING_REQUIRED_INSIGHT'), true);
assert.equal(failure({ ...goodResult(firstContract), narrative: 'too short' }).issues.some((item) => item.code === 'FIT_UNDERFLOW'), true);
assert.equal(failure({ ...goodResult(firstContract), narrative: `${goodResult(firstContract).narrative} `.repeat(20) }).issues.some((item) => item.code === 'FIT_OVERFLOW'), true);
const validSlotResult = goodResult(firstContract);
assert.deepEqual(parseBoundedNarrativeSlotText(JSON.stringify(validSlotResult)), validSlotResult, 'raw JSON text must parse');
assert.deepEqual(parseBoundedNarrativeSlotText(`\`\`\`json\n${JSON.stringify(validSlotResult)}\n\`\`\``), validSlotResult, 'one outer JSON fence must parse');
for (const invalidText of [
  `leading prose ${JSON.stringify(validSlotResult)}`,
  `${JSON.stringify(validSlotResult)} trailing prose`,
  `${JSON.stringify(validSlotResult)}\n${JSON.stringify(validSlotResult)}`,
  '{ malformed',
  JSON.stringify({ ...validSlotResult, narrative: undefined })
]) {
  assert.throws(() => parseBoundedNarrativeSlotText(invalidText), (error) => error?.kind === 'TECHNICAL_OUTPUT_PARSE_FAILURE', 'invalid provider text must fail as technical parse');
}
assert.equal(failure(parseBoundedNarrativeSlotText(JSON.stringify({ ...validSlotResult, usedClaimRefs: ['UNKNOWN-CLAIM'] }))).issues.some((item) => item.code === 'PROVENANCE_VIOLATION'), true, 'unknown refs remain a downstream provenance failure');
assert.equal(failure(parseBoundedNarrativeSlotText(JSON.stringify({ ...validSlotResult, slotId: 'SLOT-WRONG' }))).issues.some((item) => item.code === 'STRUCTURE_FAILURE'), true, 'wrong slot identity remains a downstream validation failure');
assert.equal(failure(parseBoundedNarrativeSlotText(JSON.stringify({ ...validSlotResult, centralJudgement: 'The recorded position is 99 / 100 with Stable maturity.' }))).issues.some((item) => item.code === 'HARD_TRUTH_FAILURE'), true, 'wrong score or maturity remains a downstream hard-truth failure');
const technicalFailureProvider = {
  provider: 'test',
  model: 'test/bounded',
  async generate() {
    throw new BoundedTechnicalFailure({ kind: 'TECHNICAL_OUTPUT_PARSE_FAILURE', diagnostics: { errorName: 'SyntaxError', errorMessage: 'invalid JSON', rawText: '{ malformed' } });
  },
  async repair() {
    throw new Error('technical parse failure must not consume semantic repair');
  }
};
await assert.rejects(
  () => generateBoundedNarrativeReport({ reportGenerationId: 'technical-parse-run', pack, blueprint, thesis, plan, provider: technicalFailureProvider }),
  (error) => {
    assert.equal(error instanceof BoundedGenerationFailure, true);
    assert.equal(error.accounting.initialCalls, 1);
    assert.equal(error.accounting.repairCalls, 0);
    assert.equal(error.accounting.technicalOutputParseFailureCount, 1);
    assert.equal(error.accounting.technicalProviderFailureCount, 0);
    assert.deepEqual(error.accounting.technicalFailures[0].slotId, plan.slots[0].slotId);
    return true;
  }
);

let repairedSlot = null;
const fakeProvider = {
  provider: 'test',
  model: 'test/bounded',
  async generate(contract) {
    const slotNumber = plan.slots.find((slot) => slot.slotId === contract.slotId)?.order ?? 0;
    const result = goodResult(contract, slotNumber);
    if (contract.slotId === plan.slots[1].slotId) return { result: { ...result, usedClaimRefs: ['UNKNOWN-CLAIM'] }, metadata: metadata(contract) };
    return { result, metadata: metadata(contract) };
  },
  async repair(contract, rejected, repairNumber) {
    repairedSlot = contract.slotId;
    const slotNumber = plan.slots.find((slot) => slot.slotId === contract.slotId)?.order ?? 0;
    return { result: goodResult(contract, slotNumber + 20 + repairNumber), metadata: metadata(contract, 'REPAIR', repairNumber) };
  }
};
const compiled = await generateBoundedNarrativeReport({ reportGenerationId: 'test-run', pack, blueprint, thesis, plan, provider: fakeProvider });
assert.equal(compiled.validation.ok, true);
assert.equal(repairedSlot, plan.slots[1].slotId);
assert.equal(compiled.accounting.repairCalls, 1);
assert.equal(compiled.accounting.qualityEscalations, 0);
assert.equal(compiled.approvedSlots.length, plan.slots.length);
assert.deepEqual(compiled.approvedSlots.map((slot) => slot.contract.slotId), plan.slots.map((slot) => slot.slotId));
const immutableNarrative = compiled.approvedSlots[0].result.narrative;
assert.equal(compiled.approvedSlots[0].result.narrative, immutableNarrative, 'approved slot must remain immutable after another slot repair');
assert.match(compiled.markdown, /30 days — STABILISE[\s\S]*60 days — ESTABLISH[\s\S]*90 days — OPERATE AND REVIEW/);
assert.match(compiled.markdown, /evidence|custody|incident/i);

const normalProvider = {
  provider: 'test',
  model: 'test/bounded',
  async generate(contract) { return { result: goodResult(contract, plan.slots.find((slot) => slot.slotId === contract.slotId)?.order ?? 0), metadata: metadata(contract) }; },
  async repair() { throw new Error('normal provider must not repair'); }
};
const normalRun = await generateBoundedNarrativeReport({ reportGenerationId: 'normal-run', pack, blueprint, thesis, plan, provider: normalProvider });
assert.equal(normalRun.accounting.repairCalls, 0);
let carriedGenerateCount = 0;
const carriedProvider = {
  provider: 'test',
  model: 'test/bounded',
  async generate(contract) {
    carriedGenerateCount += 1;
    return { result: goodResult(contract, plan.slots.find((slot) => slot.slotId === contract.slotId)?.order ?? 0), metadata: metadata(contract) };
  },
  async repair() { throw new Error('carried provider must not repair'); }
};
const carriedRun = await generateBoundedNarrativeReport({
  reportGenerationId: 'carried-run',
  pack,
  blueprint,
  thesis,
  plan,
  provider: carriedProvider,
  preApprovedSlots: [compiled.approvedSlots[0]]
});
assert.equal(carriedGenerateCount, plan.slots.length - 1, 'the smoke-approved slot must not be regenerated');
assert.equal(carriedRun.accounting.initialCalls, plan.slots.length, 'carried smoke call remains in total accounting');
assert.equal(carriedRun.approvedSlots[0].result.narrative, compiled.approvedSlots[0].result.narrative, 'carried approved slot remains immutable');

const exhaustedProvider = {
  provider: 'test',
  model: 'test/bounded',
  async generate(contract) { return { result: { ...goodResult(contract), usedClaimRefs: ['UNKNOWN-CLAIM'] }, metadata: metadata(contract) }; },
  async repair(contract, rejected, repairNumber) { return { result: { ...goodResult(contract, repairNumber), usedClaimRefs: ['UNKNOWN-CLAIM'] }, metadata: metadata(contract, 'REPAIR', repairNumber) }; }
};
await assert.rejects(
  () => generateBoundedNarrativeReport({ reportGenerationId: 'exhausted-run', pack, blueprint, thesis, plan, provider: exhaustedProvider }),
  /failed closed/
);

console.log(JSON.stringify({
  passed: true,
  architecture: BOUNDED_SECTION_ENGINE_ARCHITECTURE,
  slots: plan.slots.length,
  exposureClusters: blueprint.findingClusters.length,
  scenarioSlots: plan.slots.filter((slot) => slot.narrativeRole === 'EXPOSURE_ILLUSTRATION').length,
  reportWords: compiled.validation.totalWordCount,
  repairs: compiled.accounting.repairCalls,
  checks: ['one contract per slot', 'primary-home ownership', 'strict permitted refs', 'required insight excerpts', 'unknown ref rejection', 'hard-truth rejection', 'assurance rejection', 'fit overflow/underflow', 'approved-slot immutability', 'deterministic compilation', 'no whole-manuscript coherence call']
}, null, 2));
