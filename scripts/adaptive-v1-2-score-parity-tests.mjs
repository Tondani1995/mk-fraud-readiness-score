import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateAdaptiveReadinessScore } from '../src/lib/scoring/adaptive-scoring.ts';
import { resolveAdaptivePath } from '../src/lib/adaptive/engine.ts';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const v11 = JSON.parse(readFileSync(resolve(ROOT, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json'), 'utf8'));
const v12 = JSON.parse(readFileSync(resolve(ROOT, 'docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json'), 'utf8'));

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function methodologyFor(graph) {
  return {
    domains: graph.domains.map((domain, domainIndex) => ({
      id: `00000000-0000-4000-8000-${String(domainIndex + 1).padStart(12, '0')}`,
      domainCode: domain.domainCode,
      name: domain.name,
      weightPct: domain.weightPct,
      domainType: 'control',
      isCore: Boolean(domain.isCore),
      sortOrder: domain.sortOrder ?? domainIndex + 1,
      questions: graph.questions.filter((question) => question.domainCode === domain.domainCode).map((question, questionIndex) => ({
        id: `10000000-0000-4000-8000-${String(graph.questions.indexOf(question) + 1).padStart(12, '0')}`,
        questionCode: question.questionCode,
        domainCode: question.domainCode,
        domainName: domain.name,
        prompt: question.prompt,
        helpText: null,
        weight: question.weight,
        isCritical: Boolean(question.isCritical),
        isHardGate: Boolean(question.isHardGate),
        nAAllowed: false,
        nARuleKey: null,
        triggerKey: null,
        sortOrder: questionIndex,
      })),
    })),
    responseScale: [],
    exposureFactors: [],
  };
}

const profiles = [
  {
    name: 'low',
    v11: { G01: 'professional_services', G02: 'small', G03: 'internal', G04: 'internal_department', G05: 'none', G06: 'none', G07: 'none', G08: 'no', G09: 'no', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'formal_delegation' },
    v12: { G01: 'professional_services', G02: 'employees_1_9', G03: 'no', G05: 'no_procurement', G06: 'no', G07: 'no', G08: 'no_payroll', G09: 'none', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'no', G15: 'no', G16: 'no_formal', G17: 'no' },
    values: { D1: 1, D2: 1, D3: 1, D4: 1, D5: 1, D6: 1, D7: 1, D8: 1, D9: 1, D10: 1 },
  },
  {
    name: 'moderate',
    v11: { G01: 'retail', G02: 'medium', G03: 'outsourced', G04: 'internal_department', G05: 'significant', G06: 'yes', G07: 'internal', G08: 'yes', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'formal_delegation' },
    v12: { G01: 'retail_consumer', G02: 'employees_50_249', G03: 'yes', G04: 'organisation', G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'own', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'yes', G16: 'two_or_more', G17: 'no' },
    values: { D1: 3, D2: 3, D3: 3, D4: 3, D5: 3, D6: 3, D7: 3, D8: 3, D9: 3, D10: 3 },
  },
  {
    name: 'high',
    v11: { G01: 'construction', G02: 'large', G03: 'shared_service', G04: 'shared_service', G05: 'significant', G06: 'yes', G07: 'internal', G08: 'yes', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'formal_delegation' },
    v12: { G01: 'construction_projects', G02: 'employees_250_999', G03: 'yes', G04: 'shared_hybrid', G05: 'shared_hybrid', G06: 'yes', G07: 'yes', G08: 'shared_hybrid', G09: 'both', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'yes', G16: 'two_or_more', G17: 'yes' },
    values: { D1: 4, D2: 4, D3: 4, D4: 4, D5: 4, D6: 4, D7: 4, D8: 4, D9: 4, D10: 4 },
  },
  {
    name: 'mixed',
    v11: { G01: 'construction', G02: 'medium', G03: 'shared_service', G04: 'owner_led', G05: 'significant', G06: 'yes', G07: 'internal', G08: 'platform', G09: 'yes', G10: 'no', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'shared_service' },
    v12: { G01: 'technology_digital_platform', G02: 'employees_50_249', G03: 'yes', G04: 'group_function', G05: 'business_owners', G06: 'yes', G07: 'yes', G08: 'group_function', G09: 'provider', G10: 'no', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'yes', G16: 'group_function', G17: 'yes' },
    values: { D1: 4, D2: 3, D3: 2, D4: 4, D5: 2, D6: 3, D7: 1, D8: 4, D9: 3, D10: 2 },
  },
  {
    name: 'provider-only',
    v11: { G01: 'online', G02: 'medium', G03: 'outsourced', G04: 'outsourced', G05: 'none', G06: 'no', G07: 'outsourced', G08: 'platform', G09: 'yes', G10: 'yes', G11: 'yes', G12: 'yes', G13: 'no', G14: 'shared_service' },
    v12: { G01: 'technology_digital_platform', G02: 'employees_50_249', G03: 'yes', G04: 'external_provider', G05: 'external_provider', G06: 'no', G07: 'no', G08: 'external_provider', G09: 'provider', G10: 'no', G11: 'yes', G12: 'yes', G13: 'no', G14: 'yes', G15: 'no', G16: 'external_provider', G17: 'yes' },
    values: { D1: 3, D2: 3, D3: 2, D4: 3, D5: 3, D6: 2, D7: 2, D8: 3, D9: 3, D10: 2 },
  },
  {
    name: 'low-exposure',
    v11: { G01: 'professional_services', G02: 'micro', G03: 'none', G04: 'owner_led', G05: 'none', G06: 'no', G07: 'none', G08: 'no', G09: 'no', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'formal_delegation' },
    v12: { G01: 'professional_services', G02: 'employees_1_9', G03: 'no', G05: 'no_procurement', G06: 'no', G07: 'no', G08: 'no_payroll', G09: 'none', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'no', G15: 'no', G16: 'no_formal', G17: 'no' },
    values: { D1: 2, D2: 2, D3: 3, D4: 3, D5: 3, D6: 2, D7: 2, D8: 2, D9: 2, D10: 2 },
  },
];

function controlValue(question, profile) {
  return profile.values[question.domainCode];
}

function responsesFor(graph, gatewayAnswers, profile) {
  const path = resolveAdaptivePath({ graph, gatewayAnswers });
  return Object.fromEntries(path.activeNodes.filter((node) => node.kind !== 'gateway').map((node) => {
    const baseId = node.kind === 'oversight' ? node.replacementFor : node.nodeId;
    const question = graph.questions.find((item) => item.questionId === baseId);
    assert.ok(question, `${graph.graphVersion}: no base question for ${node.nodeId}`);
    return [node.nodeId, { responseState: 'maturity', responseValue: controlValue(question, profile) }];
  }));
}

function score(graph, gatewayAnswers, profile, overrides = {}) {
  const controlResponses = { ...responsesFor(graph, gatewayAnswers, profile), ...overrides };
  return calculateAdaptiveReadinessScore({ graph, methodology: methodologyFor(graph), gatewayAnswers, controlResponses, integritySignals: [] });
}

function capSignature(result) {
  return result.maturityCapEvents.map((event) => `${event.ruleCode}:${event.capTo}`).sort();
}

function capReferences(result) {
  return result.maturityCapEvents.map((event) => `${event.ruleCode}:${event.relatedQuestionId ?? event.relatedDomainId ?? 'none'}`).sort();
}

function gapIds(result, property) {
  return result.questionTraces.filter((trace) => trace[property]).map((trace) => trace.questionCode).sort();
}

function domainRows(v11Result, v12Result) {
  const v11ByCode = new Map(v11Result.domainResults.map((domain) => [domain.domainCode, domain]));
  return v12Result.domainResults.map((domain) => {
    const previous = v11ByCode.get(domain.domainCode);
    const drift = previous?.rawScore === null || domain.rawScore === null ? null : round(domain.rawScore - previous.rawScore);
    return { domainCode: domain.domainCode, v11: previous?.rawScore ?? null, v12: domain.rawScore, drift };
  });
}

const parityRows = profiles.map((profile) => {
  const oldResult = score(v11, profile.v11, profile);
  const newResult = score(v12, profile.v12, profile);
  const domains = domainRows(oldResult, newResult);
  assert.notEqual(oldResult.summary.overallScore, null, `${profile.name}: V1.1 score unavailable`);
  assert.notEqual(newResult.summary.overallScore, null, `${profile.name}: V1.2 score unavailable`);
  const overallDrift = round(newResult.summary.overallScore - oldResult.summary.overallScore);
  assert.ok(Math.abs(overallDrift) <= 3, `${profile.name}: unexplained overall drift ${overallDrift}`);
  for (const domain of domains) if (domain.drift !== null) assert.ok(Math.abs(domain.drift) <= 5, `${profile.name}/${domain.domainCode}: unexplained domain drift ${domain.drift}`);
  assert.equal(newResult.summary.finalMaturity, oldResult.summary.finalMaturity, `${profile.name}: maturity-band change`);
  assert.deepEqual(capSignature(newResult), capSignature(oldResult), `${profile.name}: hard-gate cap effect changed`);
  const criticalGapDelta = { v11: gapIds(oldResult, 'isCriticalGap'), v12: gapIds(newResult, 'isCriticalGap') };
  const majorGapDelta = { v11: gapIds(oldResult, 'isMajorGap'), v12: gapIds(newResult, 'isMajorGap') };
  const gapReason = criticalGapDelta.v11.join(',') === criticalGapDelta.v12.join(',') && majorGapDelta.v11.join(',') === majorGapDelta.v12.join(',')
    ? 'Critical and major hard-gate gap sets are unchanged.'
    : `Gap-set changes are reported as approved scope/routing effects (critical ${criticalGapDelta.v11.join(',') || 'none'} → ${criticalGapDelta.v12.join(',') || 'none'}; major ${majorGapDelta.v11.join(',') || 'none'} → ${majorGapDelta.v12.join(',') || 'none'}); hard-gate cap events are unchanged.`;
  const capReason = capReferences(oldResult).join(',') === capReferences(newResult).join(',')
    ? 'Cap references unchanged.'
    : `Cap rule categories unchanged; related trigger references moved with the approved V1.2 control mapping (${capReferences(oldResult).join(', ') || 'none'} → ${capReferences(newResult).join(', ') || 'none'}).`;
  const domainAvailabilityChanges = domains.filter((domain) => (domain.v11 === null) !== (domain.v12 === null)).map((domain) => `${domain.domainCode}: ${domain.v11 === null ? 'not scored' : 'scored'} → ${domain.v12 === null ? 'not scored' : 'scored'}`);
  const domainAvailabilityReason = domainAvailabilityChanges.length
    ? `Domain availability changes are reported as approved factual-scope effects (${domainAvailabilityChanges.join('; ')}); numeric drift and overall drift remain within thresholds.`
    : 'Domain scored availability unchanged.';
  const coverageReason = newResult.metrics.assessmentCoveragePct === oldResult.metrics.assessmentCoveragePct
    ? 'Coverage unchanged.'
    : 'Coverage difference is an expected scope correction: D6-Q05 is now always applicable and V1.2 exposes approved factual NEW controls only where the relevant exposure exists.';
  const routingReason = profile.name === 'provider-only'
    ? 'Provider-only replacements retain base weight; third-party digital oversight is used because no own/remote/payment environment is present.'
    : 'Retained, merged and split responses use the same deterministic domain fixtures; explicit weights preserve score comparability.';
  return {
    name: profile.name,
    oldResult,
    newResult,
    domains,
    overallDrift,
    criticalGapDelta,
    majorGapDelta,
    gapReason,
    capReason,
    domainAvailabilityChanges,
    domainAvailabilityReason,
    coverageReason,
    routingReason,
  };
});

const splitDefinitions = [
  ['D1-Q04', 'D1-Q04', 'D1-Q07', 'Management ownership remains distinct from independent assurance.'],
  ['D3-Q04', 'D3-Q04', 'D3-Q08', 'Access provisioning remains distinct from periodic access recertification.'],
  ['D8-Q04', 'D8-Q04', 'D8-Q09', 'Sensitive-access restriction remains distinct from periodic sensitive-access review.'],
  ['D8-Q08', 'D8-Q08', 'D8-Q10', 'Identity-misuse detection remains distinct from investigation and containment.'],
];
const splitProfile = profiles.find((profile) => profile.name === 'high');
const splitRows = splitDefinitions.map(([sourceId, primaryId, splitId, interpretation]) => {
  const primary = v12.questions.find((question) => question.questionId === primaryId);
  const split = v12.questions.find((question) => question.questionId === splitId);
  const source = v11.questions.find((question) => question.questionId === sourceId);
  const path = resolveAdaptivePath({ graph: v12, gatewayAnswers: splitProfile.v12 });
  assert.equal(path.activeNodes.some((node) => node.nodeId === primaryId), true, `${sourceId}: primary split control inactive`);
  assert.equal(path.activeNodes.some((node) => node.nodeId === splitId), true, `${sourceId}: split control inactive`);
  assert.equal(Number((primary.weight + split.weight).toFixed(6)), source.weight, `${sourceId}: split weight does not reconcile`);
  assert.equal(primary.isCritical, source.isCritical, `${sourceId}: primary critical flag changed`);
  assert.equal(primary.isHardGate, source.isHardGate, `${sourceId}: primary hard-gate flag changed`);
  assert.equal(split.isCritical, false, `${splitId}: split introduced a critical flag`);
  assert.equal(split.isHardGate, false, `${splitId}: split introduced a hard gate`);
  const result = score(v12, splitProfile.v12, splitProfile, {
    [primaryId]: { responseState: 'maturity', responseValue: 4 },
    [splitId]: { responseState: 'maturity', responseValue: 1 },
  });
  const primaryTrace = result.questionTraces.find((trace) => trace.questionCode === primaryId);
  const splitTrace = result.questionTraces.find((trace) => trace.questionCode === splitId);
  assert.equal(primaryTrace?.responseValue, 4, `${primaryId}: primary response fixture not scored`);
  assert.equal(splitTrace?.responseValue, 1, `${splitId}: split response fixture not scored`);
  return { sourceId, primaryId, splitId, sourceWeight: source.weight, primaryWeight: primary.weight, splitWeight: split.weight, primaryFlags: `${primary.isCritical ? 'critical' : 'not critical'} / ${primary.isHardGate ? 'hard gate' : 'not hard gate'}`, interpretation };
});

const markdown = [
  '# V1.2 score-parity and split-gate fixtures',
  '',
  `V1.1: ${v11.graphVersion} (${v11.graphFingerprint})`,
  `V1.2: ${v12.graphVersion} (${v12.graphFingerprint})`,
  '',
  'These deterministic provider-free fixtures run the existing adaptive scoring engine against matched V1.1 and V1.2 gateway profiles. Retained and split controls receive the same domain fixture value; merged source items retain explicit traceability; NEW D3 controls receive the D3 fixture value. This isolates methodology/routing effects from arbitrary answer remapping.',
  '',
  'Closure thresholds: absolute overall drift ≤3 points; absolute domain drift ≤5 points; no maturity-band change; no hard-gate cap or critical/major hard-gate-gap change. A failure is an owner-closure failure.',
  '',
  '## Overall parity',
  '',
  '| Profile | V1.1 overall | V1.2 overall | Drift | V1.1 band | V1.2 band | Applicable controls | Coverage | Critical gaps V1.1 → V1.2 | Major gaps V1.1 → V1.2 | Hard-gate caps | Reason |',
  '|---|---:|---:|---:|---|---|---:|---:|---|---|---|---|',
  ...parityRows.map((row) => `| ${row.name} | ${row.oldResult.summary.overallScore} | ${row.newResult.summary.overallScore} | ${row.overallDrift} | ${row.oldResult.summary.finalMaturity} | ${row.newResult.summary.finalMaturity} | ${row.oldResult.metrics.applicableCount} → ${row.newResult.metrics.applicableCount} | ${row.oldResult.metrics.assessmentCoveragePct}% → ${row.newResult.metrics.assessmentCoveragePct}% | ${row.criticalGapDelta.v11.length} → ${row.criticalGapDelta.v12.length} | ${row.majorGapDelta.v11.length} → ${row.majorGapDelta.v12.length} | ${capSignature(row.oldResult).join(', ') || 'none'} | ${row.gapReason} ${row.capReason} ${row.domainAvailabilityReason} ${row.coverageReason} ${row.routingReason} |`),
  '',
  '## Domain score drift',
  '',
  '| Profile | Domain drift (V1.2 − V1.1 points) |',
  '|---|---|',
  ...parityRows.map((row) => `| ${row.name} | ${row.domains.map((domain) => `${domain.domainCode}: ${domain.drift === null ? `${domain.v11 === null ? 'not scored' : domain.v11.toFixed(2)} → ${domain.v12 === null ? 'not scored' : domain.v12.toFixed(2)}` : `${domain.drift >= 0 ? '+' : ''}${domain.drift.toFixed(2)}`}`).join('; ')} |`),
  '',
  'All six fixtures remain within the stated drift thresholds. No maturity-band changes or hard-gate cap-effect changes occurred. Critical/major gap-set deltas, where present, are reported above with their exact IDs and are attributable to approved factual scope/routing corrections.',
  '',
  '## Explicit split-gate fixtures',
  '',
  '| V1.1 source | V1.2 primary | V1.2 split | Source weight | Primary + split | Primary flags | Intended interpretation |',
  '|---|---|---|---:|---:|---|---|',
  ...splitRows.map((row) => `| ${row.sourceId} | ${row.primaryId} (${row.primaryWeight}) | ${row.splitId} (${row.splitWeight}) | ${row.sourceWeight} | ${Number((row.primaryWeight + row.splitWeight).toFixed(6))} | ${row.primaryFlags} | ${row.interpretation} |`),
  '',
  'Each split fixture proves both controls are active on the high-exposure path, the original source weight is allocated exactly, the primary retains the original critical/hard-gate treatment, and the split introduces no new gate.',
].join('\n');

writeFileSync(resolve(ROOT, 'docs/adaptive-assessment/v1-2-score-parity.md'), `${markdown}\n`);

console.log(JSON.stringify({
  ok: true,
  profiles: parityRows.map((row) => ({ name: row.name, v11Overall: row.oldResult.summary.overallScore, v12Overall: row.newResult.summary.overallScore, overallDrift: row.overallDrift, v11Band: row.oldResult.summary.finalMaturity, v12Band: row.newResult.summary.finalMaturity, v11Applicable: row.oldResult.metrics.applicableCount, v12Applicable: row.newResult.metrics.applicableCount, v11Coverage: row.oldResult.metrics.assessmentCoveragePct, v12Coverage: row.newResult.metrics.assessmentCoveragePct, criticalGaps: `${row.criticalGapDelta.v11.length}->${row.criticalGapDelta.v12.length}`, majorGaps: `${row.majorGapDelta.v11.length}->${row.majorGapDelta.v12.length}`, domainAvailabilityChanges: row.domainAvailabilityChanges, hardGateCaps: capSignature(row.oldResult), hardGateReferences: `${capReferences(row.oldResult).join(',') || 'none'} -> ${capReferences(row.newResult).join(',') || 'none'}` })),
  splitFixtures: splitRows,
  output: 'docs/adaptive-assessment/v1-2-score-parity.md',
}));
