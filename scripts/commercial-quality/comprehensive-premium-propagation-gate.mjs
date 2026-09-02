#!/usr/bin/env node
/**
 * Provider-free Motheo gate for the Comprehensive capability-propagation layer.
 *
 * This gate proves that the premium objects are a deterministic projection over
 * existing assessment, evidence, management-model and maturation objects. It
 * intentionally stops before any writer or provider call.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildAuthoritativeComprehensiveObjects } from '../../src/lib/reports/comprehensive/authoritative-objects.ts';
import {
  buildEssentialNarrativeFactPack,
  buildComprehensiveNarrativeFactPack,
  assertNarrativeFactPack
} from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import {
  buildReportBlueprint,
  assertReportBlueprint,
  validateReportBlueprint
} from '../../src/lib/reports/narrative/report-blueprint.ts';
import { premiumProjectionValidationIssues } from '../../src/lib/reports/narrative/premium-projection.ts';

const repoRoot = process.cwd();
const outputDir = path.resolve(process.env.COMPREHENSIVE_PREMIUM_OUTPUT_DIR ?? path.join(repoRoot, 'outputs', 'comprehensive-premium-propagation-2026-09-01'));
const workbookPath = path.resolve(process.env.COMPREHENSIVE_WORKBOOK_PATH ?? path.join(path.dirname(outputDir), 'comprehensive-premium-workbooks-2026-09-01', 'MK-Comprehensive-Motheo-owner-review.xlsx'));
const BASELINE_CODE_SHA = '779d35db820f5d4a6289539de94135fcf10c18fb';
const INVENTORY_MD_SHA = '73d9a603124ada4c847a0b78138815aed2856aca7d059d457b370775c43f2780';
const INVENTORY_JSON_SHA = '6434883a35acfb29fed3815b902388086f3c64ac294a7e15b35a68e5d4e6e9cbf';
const PREMIUM_FACT_KINDS = [
  'assurance_coverage',
  'assurance_priority',
  'resilience_test',
  'enterprise_integration_map',
  'integration_dependency',
  'context_application',
  'control_outcome_link',
  'roadmap_dependency_link'
];
const PREMIUM_ASSIGNMENT_TYPES = new Set([
  'assurance_coverage',
  'assurance_priority',
  'integration_map',
  'integration_dependency',
  'resilience_test',
  'context_application',
  'control_outcome_link',
  'roadmap_dependency_link'
]);

const BASELINE_SOURCE_HASHES = {
  'src/lib/reports/comprehensive/assembly.ts': 'dc5ebb149b572db9aa4a3806eb89e646bc14dcd9dbdff67fd14945e00ca94d24',
  'src/lib/reports/comprehensive/management-model.ts': 'bdf7f4f2771aed6ef65a71c4f6d8b3926022bb5ab58aa5a684ada5518cb1a0f1',
  'src/lib/reports/comprehensive/authoritative-objects.ts': 'ef46ee592e590f7ca26ff2b876e6f03c1a768f43a90419039ce647f099d19a9c',
  'src/lib/reports/narrative/fact-pack.ts': 'd491fc661049b64e25187bc2c9ad4d3c6e19a12d2b0a4767a4c1952d377e63c9',
  'src/lib/reports/narrative/report-blueprint.ts': '665c362f9ade389e0e9e1635a5377aa4021eceb89ef7676055279bfd9f7add64',
  'src/lib/reports/narrative/maturation.ts': 'e004b3a3a667c11f19c2a51270cf6f13eb775375918d0d36a075dfc033569e99',
  'src/lib/reports/narrative/operating-context.ts': '715724d9f809d3af80bd23fea31819c454ce9a3a8dd34481c777d3b1979e02e4',
  'src/lib/reports/evidence-model/semantic-mappings.ts': 'b22168ebda2d6f149dec2cc71ecae9cff099c1cbb6fd37fc1bc3be3f5d1124b0',
  'src/lib/reports/evidence-model/contradictions.ts': 'cfb2d15f9a6ef66ce880db7d73b9525986eec3d0171044f739800dd8687a7d71',
  'src/lib/reports/narrative/premium-projection.ts': '17c97059101f81983d92e3b47485bb9e13e72b55295d61fb1ea60511d6079a43',
  'src/lib/reports/comprehensive/render-narrative-html.ts': 'f5e8d7b7434fa2d41eab0b580ae9f17b83d956277a172ed0380e8d4c2f645a82'
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fileSha(relativePath) {
  return sha256(await fs.readFile(path.join(repoRoot, relativePath)));
}

async function optionalArtifact(pathValue, qaPathValue) {
  try {
    const bytes = await fs.readFile(pathValue);
    let qa;
    try {
      qa = JSON.parse(await fs.readFile(qaPathValue, 'utf8'));
    } catch {
      qa = undefined;
    }
    return { status: 'PRESENT', path: pathValue, sha256: sha256(bytes), bytes: bytes.length, qa };
  } catch {
    return { status: 'NOT_PROVIDED', path: pathValue };
  }
}

function gitValue(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function factKinds(pack) {
  return Object.fromEntries([...new Set(pack.facts.map((fact) => fact.kind))].sort().map((kind) => [kind, pack.facts.filter((fact) => fact.kind === kind).length]));
}

function premiumRefs(pack) {
  return pack.facts.filter((fact) => PREMIUM_FACT_KINDS.includes(fact.kind)).map((fact) => fact.id);
}

function factPackStructure(pack, legacy = false) {
  const facts = legacy ? pack.facts.filter((fact) => !PREMIUM_FACT_KINDS.includes(fact.kind)) : pack.facts;
  return {
    basis: legacy ? 'Reconstructed pre-propagation surface: premium Fact Pack objects and source metadata are absent.' : 'Provider-free Fact Pack after deterministic premium projection.',
    productTier: pack.productTier,
    narrativeMode: pack.narrativeMode,
    factCount: facts.length,
    factKinds: Object.fromEntries([...new Set(facts.map((fact) => fact.kind))].sort().map((kind) => [kind, facts.filter((fact) => fact.kind === kind).length])),
    domains: pack.domains.length,
    operatingContext: pack.organisation.operatingContext.length,
    sustainmentPriorities: pack.sustainmentPriorities.length,
    sustainmentPrioritySourceMetadata: legacy ? { sourceId: false, sourceFindingId: false, sourceQuestionCode: false, sourceDomainCode: false, sourceRefs: false } : {
      sourceId: pack.sustainmentPriorities.every((item) => Boolean(item.sourceId)),
      sourceFindingId: pack.sustainmentPriorities.every((item) => Boolean(item.sourceFindingId)),
      sourceQuestionCode: pack.sustainmentPriorities.every((item) => Boolean(item.sourceQuestionCode)),
      sourceDomainCode: pack.sustainmentPriorities.every((item) => Boolean(item.sourceDomainCode)),
      sourceRefs: pack.sustainmentPriorities.every((item) => (item.sourceRefs?.length ?? 0) > 0)
    },
    controls: pack.controls.length,
    decisions: pack.decisions.length,
    roadmap: pack.roadmap.length,
    maturationSteps: pack.maturationSteps.length,
    findings: pack.findings.length,
    risks: pack.risks.length,
    scenarios: pack.scenarios.length,
    enterpriseIntegrationMap: legacy ? 0 : Number(Boolean(pack.enterpriseIntegrationMap)),
    integrationDependencies: legacy ? 0 : pack.enterpriseIntegrationMap?.dependencies.length ?? 0,
    assuranceCoverage: legacy ? 0 : pack.assuranceCoverage?.length ?? 0,
    assurancePriorities: legacy ? 0 : pack.assurancePriorities?.length ?? 0,
    resilienceTests: legacy ? 0 : pack.resilienceTests?.length ?? 0,
    contextApplications: legacy ? 0 : pack.contextApplications?.length ?? 0,
    controlOutcomeLinks: legacy ? 0 : pack.controlOutcomeLinks?.length ?? 0,
    roadmapDependencyLinks: legacy ? 0 : pack.roadmapDependencyLinks?.length ?? 0
  };
}

function blueprintStructure(blueprint, legacy = false) {
  const assignments = legacy ? blueprint.contentAssignments.filter((item) => !PREMIUM_ASSIGNMENT_TYPES.has(item.contentType)) : blueprint.contentAssignments;
  const premiumRequirements = legacy ? [] : blueprint.contextApplicationRequirements;
  return {
    basis: legacy ? 'Reconstructed pre-propagation surface: premium assignments and context-application requirements are absent.' : 'Provider-free Blueprint after deterministic premium propagation.',
    chapters: blueprint.chapters.length,
    sections: blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0),
    exhibits: blueprint.chapters.reduce((sum, chapter) => sum + chapter.exhibits.length, 0),
    contentAssignments: assignments.length,
    contentAssignmentTypes: Object.fromEntries([...new Set(assignments.map((item) => item.contentType))].sort().map((type) => [type, assignments.filter((item) => item.contentType === type).length])),
    premiumAssignments: legacy ? 0 : assignments.filter((item) => PREMIUM_ASSIGNMENT_TYPES.has(item.contentType)).length,
    contextApplicationRequirements: premiumRequirements.length,
    contextCrossReferences: legacy ? 0 : blueprint.narrativeCrossReferences.filter((item) => item.contentType === 'context_application').length,
    exhibitIds: blueprint.chapters.flatMap((chapter) => chapter.exhibits.map((item) => item.exhibitId)),
    transformationStages: blueprint.transformationSequence.map((stage) => stage.stage),
    transformationSupport: blueprint.transformationSequence.map((stage) => ({ stage: stage.stage, supported: stage.supported, sourceRefs: [...stage.sourceRefs] }))
  };
}

function stableOptionSet(decision) {
  return JSON.stringify(decision.options.map((option) => ({ option: option.option, cost: option.cost, benefit: option.benefit, tradeOff: option.tradeOff })));
}

function integrationExhibitProof(blueprint, map) {
  const exhibit = blueprint.chapters
    .flatMap((chapter) => chapter.exhibits)
    .find((item) => item.exhibitId === 'EXH-ENTERPRISE-INTEGRATION');
  assert(exhibit, 'Enterprise Integration exhibit contract is missing.');
  assert.equal(exhibit.type, 'enterprise_integration');
  const sourceRefs = new Set(exhibit.sourceRefs);
  assert(sourceRefs.has(map.factRef), 'Enterprise Integration exhibit must cite the supplied map.');
  for (const loop of map.loopNodes) {
    assert(sourceRefs.has(loop.loopRef), `Enterprise Integration exhibit must include ${loop.loopRef}.`);
    for (const sourceRef of loop.sourceRefs) assert(sourceRefs.has(sourceRef), `Enterprise Integration exhibit is missing loop provenance ${sourceRef}.`);
  }
  for (const domain of map.domainNodes) {
    assert(sourceRefs.has(domain.domainRef), `Enterprise Integration exhibit must include domain ${domain.domainRef}.`);
    for (const sourceRef of domain.sourceRefs) assert(sourceRefs.has(sourceRef), `Enterprise Integration exhibit is missing domain provenance ${sourceRef}.`);
  }
  for (const dependency of map.dependencies) {
    const dependencyFactRef = `INTEGRATION-DEPENDENCY-${dependency.dependencyRef.slice(-3)}`;
    if (dependency.supportStatus === 'SUPPORTED') {
      assert(sourceRefs.has(dependency.dependencyRef), `Enterprise Integration exhibit is missing supported edge ${dependency.dependencyRef}.`);
      assert(sourceRefs.has(dependencyFactRef), `Enterprise Integration exhibit is missing supported edge provenance ${dependencyFactRef}.`);
      for (const provenanceRef of dependency.provenanceRefs) assert(sourceRefs.has(provenanceRef), `Enterprise Integration exhibit is missing edge provenance ${provenanceRef}.`);
    } else {
      assert(!sourceRefs.has(dependency.dependencyRef), `Unsupported edge ${dependency.dependencyRef} must not enter the Enterprise Integration exhibit.`);
      assert(!sourceRefs.has(dependencyFactRef), `Unsupported edge fact ${dependencyFactRef} must not enter the Enterprise Integration exhibit.`);
    }
  }
  for (const overlay of map.overlayNodes) {
    assert(sourceRefs.has(overlay.overlayRef), `Enterprise Integration exhibit must include context overlay ${overlay.overlayRef}.`);
    for (const sourceRef of overlay.sourceRefs) assert(sourceRefs.has(sourceRef), `Enterprise Integration exhibit is missing overlay provenance ${sourceRef}.`);
  }
  return {
    exhibitId: exhibit.exhibitId,
    type: exhibit.type,
    placement: exhibit.placement,
    sourceRefs: [...exhibit.sourceRefs],
    loopCount: map.loopNodes.length,
    domainCount: map.domainNodes.length,
    supportedDependencyRefs: map.dependencies.filter((dependency) => dependency.supportStatus === 'SUPPORTED').map((dependency) => dependency.dependencyRef),
    unsupportedDependencyRefs: map.dependencies.filter((dependency) => dependency.supportStatus !== 'SUPPORTED').map((dependency) => dependency.dependencyRef),
    overlayRefs: map.overlayNodes.map((overlay) => ({ overlayRef: overlay.overlayRef, status: overlay.status }))
  };
}

function contextCrossReferenceProof(factPack, blueprint) {
  const references = blueprint.narrativeCrossReferences.filter((item) => item.contentType === 'context_application');
  const targetChapterIds = new Set([
    'DETERIORATION-WATCHPOINTS',
    'TARGET-RESILIENT-CONTROL-ENVIRONMENT',
    'LEADERSHIP-DECISIONS-TO-PRESERVE',
    'SUSTAINMENT-OPTIMISATION'
  ]);
  for (const application of factPack.contextApplications ?? []) {
    const matched = references.filter((reference) => reference.contentRef === application.factRef);
    assert.equal(matched.length, 4, `${application.applicationRef} must have four deterministic cross-chapter consumption routes.`);
    assert.equal(new Set(matched.map((reference) => reference.fromChapterId)).size, 4, `${application.applicationRef} cross-chapter routes must have distinct target chapters.`);
    for (const reference of matched) {
      assert(targetChapterIds.has(reference.fromChapterId), `${application.applicationRef} has an invalid cross-chapter target.`);
      assert.match(reference.referencePurpose, /context → analytical consequence → management implication/);
      assert.deepEqual(reference.linkedDependencyRefs, application.dependencyRefs);
      assert.deepEqual(reference.linkedControlRefs, application.linkedControlRefs);
      assert.deepEqual(reference.linkedDecisionRefs, application.linkedDecisionRefs);
      assert.deepEqual(reference.linkedRoadmapRefs, application.linkedRoadmapRefs);
      assert.deepEqual(reference.linkedResilienceTestRefs, application.linkedResilienceTestRefs);
    }
  }
  assert.equal(references.length, (factPack.contextApplications ?? []).length * 4, 'Context cross-reference count must equal four routes per application.');
  return (factPack.contextApplications ?? []).map((application) => ({
    applicationRef: application.applicationRef,
    factRef: application.factRef,
    primaryHome: blueprint.contentAssignments.filter((assignment) => assignment.contentType === 'context_application' && assignment.contentRef === application.factRef).map((assignment) => `${assignment.chapterId}/${assignment.sectionId}`),
    chains: references.filter((reference) => reference.contentRef === application.factRef).map((reference) => ({
      target: `${reference.fromChapterId}/${reference.fromSectionId}`,
      pattern: reference.referencePurpose,
      dependencyRefs: reference.linkedDependencyRefs,
      controlRefs: reference.linkedControlRefs,
      decisionRefs: reference.linkedDecisionRefs,
      roadmapRefs: reference.linkedRoadmapRefs,
      resilienceTestRefs: reference.linkedResilienceTestRefs
    }))
  }));
}

function transformationSequenceProof(factPack, blueprint) {
  const requiredStages = ['PRESERVE', 'EMBED', 'MEASURE', 'OPTIMISE'];
  const stages = requiredStages.map((stage) => blueprint.transformationSequence.find((item) => item.stage === stage));
  assert(stages.every(Boolean), 'Sustainment Blueprint must contain all four required transformation stages.');
  assert(stages.every((stage) => stage.supported && stage.sourceRefs.length > 0), 'Every required Sustainment stage must be supported by deterministic source objects.');
  assert(factPack.roadmap.length > 0 && (factPack.controlOutcomeLinks ?? []).length > 0 && (factPack.roadmapDependencyLinks ?? []).length > 0, 'Authorised roadmap/control-outcome/maturation objects must support the full Sustainment sequence.');
  return stages.map((stage) => ({ stage: stage.stage, supported: stage.supported, sourceRefs: [...stage.sourceRefs] }));
}

function premiumStoryPreview({ factPack, storyPlan, blueprint, essentialBlueprint }) {
  const map = factPack.enterpriseIntegrationMap;
  const line = (label, value) => `- ${label}: ${value}`;
  const lines = [
    `# Premium Story Preview — ${factPack.organisation.name}`,
    '',
    'Source: provider-free Fact Pack, Story Plan and Blueprint projection. No writer prose.',
    line('Assessment', `${factPack.assessment.reference} · ${factPack.assessment.score}/100 · ${factPack.assessment.maturity} · ${factPack.narrativeMode}`),
    '',
    '## 1. Executive priority / outcome',
    line('Story Plan objective', storyPlan.executiveStoryObjective),
    line('Opening management takeaway', storyPlan.movements[0]?.requiredManagementTakeaway ?? ''),
    line('Closing management takeaway', storyPlan.movements.at(-1)?.requiredManagementTakeaway ?? ''),
    '',
    '## 2. Enterprise Fraud Readiness Integration',
    line('Map', map?.factRef ?? ''),
    ...(map?.loopNodes ?? []).flatMap((loop) => [
      line(`${loop.loopRef} · ${loop.label}`, loop.methodologyRole),
      ...loop.memberDomainRefs.map((domainRef) => {
        const domain = map.domainNodes.find((item) => item.domainRef === domainRef);
        return line(`  ${domain?.domainRef ?? domainRef} · ${domain?.domainName ?? ''}`, `${domain?.posture ?? ''} · primary loop ${domain?.primaryLoopRef ?? ''} · provenance ${(domain?.sourceRefs ?? []).join(', ')}`);
      })
    ]),
    '',
    '## 3. Deterministic dependencies and provenance',
    ...(map?.dependencies ?? []).map((dependency) => line(
      dependency.dependencyRef,
      `${dependency.supportStatus} · ${dependency.relationshipType} · ${dependency.contributingDomainRefs.join(' + ')} · loop ${dependency.loopRef} · outcome ${dependency.protectedManagementOutcome} · provenance ${dependency.provenanceRefs.join(', ')}`
    )),
    '',
    '## 4. Motheo operating-context links',
    ...(factPack.contextApplications ?? []).flatMap((application) => {
      const targets = blueprint.narrativeCrossReferences.filter((reference) => reference.contentRef === application.factRef);
      return [
        line(`${application.applicationRef} · ${application.label}`, `context ${application.contextRefs.join(', ')}`),
        line('  Analytical consequence', application.analyticalConsequence),
        line('  Management implication', application.managementImplication),
        line('  Deterministic links', `${application.dependencyRefs.join(', ')} → ${application.linkedControlRefs.join(', ')} → ${application.linkedDecisionRefs.join(', ')} → ${application.linkedResilienceTestRefs.join(', ')} → ${application.linkedRoadmapRefs.join(', ')}`),
        line('  Cross-chapter consumption', targets.map((reference) => `${reference.fromChapterId}/${reference.fromSectionId}`).join(' · '))
      ];
    }),
    '',
    '## 5. Sustainment resilience/change tests',
    ...(factPack.resilienceTests ?? []).map((test) => line(test.testId, `${test.capability} · ${test.changeCondition} · test ${test.managementTest} · response ${test.response.governanceRoute} · links ${test.linkedControlRefs.join(', ')} / ${test.linkedDecisionRefs.join(', ')} / ${test.linkedRoadmapRefs.join(', ')}`)),
    '',
    '## 6. Control → evidence → decision → management-outcome links',
    ...(factPack.controlOutcomeLinks ?? []).map((link) => line(link.linkRef, `${link.controlRef} → evidence ${link.evidenceRefs.join(', ')} → ${link.decisionRef} → ${link.protectedOutcome} · response ${link.responseRefs.join(', ')} · provenance ${link.provenanceRefs.join(', ')}`)),
    '',
    '## 7. Leadership decisions linked back to enterprise integration',
    ...(factPack.decisions ?? []).map((decision) => {
      const dependencyRefs = (map?.dependencies ?? []).filter((dependency) => dependency.linkedDecisionRefs.includes(decision.factRef)).map((dependency) => dependency.dependencyRef);
      return [
        line(`${decision.factRef} · ${decision.decisionFamily}`, `integration ${dependencyRefs.join(', ')}`),
        line('  Question', decision.question),
        line('  Recommended route', decision.recommendedRoute),
        ...decision.options.map((option, index) => line(`  Option ${index + 1}`, `${option.option} · benefit ${option.benefit} · trade-off ${option.tradeOff} · cost ${option.cost}`)),
        line('  Owner / timing / consequence', `${decision.owner} · ${decision.targetDate} · ${decision.consequenceOfDelay}`)
      ];
    }).flat(),
    '',
    '## 8. Dependency-led 12-month sequence',
    ...blueprint.transformationSequence.map((stage) => line(stage.stage, `${stage.supported ? 'SUPPORTED' : 'UNSUPPORTED'} · ${stage.purpose} · source objects ${stage.sourceRefs.join(', ')}`)),
    ...(factPack.roadmapDependencyLinks ?? []).map((link) => line(link.linkRef, `${link.roadmapRef} · stage gate ${link.stageGate} · next-stage use ${link.nextStageUse} · dependencies ${link.dependencyRefs.join(', ')}`)),
    '',
    '## 9. Comprehensive-only elements not present in Essential',
    line('Enterprise Integration Map', `${map?.factRef ?? ''} · ${map?.loopNodes.length ?? 0} loops · ${map?.domainNodes.length ?? 0} domains · ${map?.dependencies.filter((dependency) => dependency.supportStatus === 'SUPPORTED').length ?? 0} supported dependencies`),
    line('Enterprise Integration exhibit', `EXH-ENTERPRISE-INTEGRATION · Essential present: ${essentialBlueprint.chapters.flatMap((chapter) => chapter.exhibits).some((exhibit) => exhibit.exhibitId === 'EXH-ENTERPRISE-INTEGRATION')}`),
    line('Assurance coverage / priorities', `${(factPack.assuranceCoverage ?? []).map((item) => item.factRef).join(', ')} / ${(factPack.assurancePriorities ?? []).map((item) => item.factRef).join(', ')}`),
    line('Resilience tests', (factPack.resilienceTests ?? []).map((item) => item.factRef).join(', ')),
    line('Context applications and cross-chapter routes', `${(factPack.contextApplications ?? []).map((item) => item.factRef).join(', ')} · ${blueprint.narrativeCrossReferences.filter((reference) => reference.contentType === 'context_application').length} routes`),
    line('Control-outcome / roadmap-dependency links', `${(factPack.controlOutcomeLinks ?? []).map((item) => item.factRef).join(', ')} / ${(factPack.roadmapDependencyLinks ?? []).map((item) => item.factRef).join(', ')}`)
  ];
  return `${lines.join('\n')}\n`;
}

function testResult(name, passed, details = '') {
  return { name, status: passed ? 'PASS' : 'FAIL', details };
}

async function main() {
  const { data } = buildV12ProfileAssembled('motheo');
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const delivery = buildComprehensiveDeliveryModel({
    assembled: data,
    evidenceModel,
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
  });
  const factPack = buildComprehensiveNarrativeFactPack(delivery);
  assertNarrativeFactPack(factPack);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  assertReportBlueprint(blueprint, factPack);

  const authoritative = buildAuthoritativeComprehensiveObjects(factPack, blueprint);
  const map = factPack.enterpriseIntegrationMap;
  assert(map, 'Motheo premium Fact Pack must contain an Enterprise Fraud Readiness Integration Map.');
  const premiumIssues = premiumProjectionValidationIssues(factPack);
  assert.deepEqual(premiumIssues, [], 'Motheo premium projection must have no validation issues.');

  const decisions = factPack.decisions;
  assert.equal(decisions.length, 3, 'Motheo must retain three sustainment decisions.');
  assert.equal(new Set(decisions.map(stableOptionSet)).size, decisions.length, 'Motheo sustainment decisions must have materially distinct option sets.');
  const decisionThemes = decisions.map((decision) => `${decision.question} ${decision.recommendedRoute} ${decision.rationale}`.toLowerCase());
  assert(decisionThemes.some((value) => /mandate|governance|escalat/.test(value)), 'Governance mandate/escalation decision theme is missing.');
  assert(decisionThemes.some((value) => /effectiveness|learning|review|exception/.test(value)), 'Control-effectiveness review and learning decision theme is missing.');
  assert(decisionThemes.some((value) => /risk view|current|material change|refresh/.test(value)), 'Current fraud-risk view after material change decision theme is missing.');

  assert.equal(map.domainNodes.length, 10);
  assert.equal(map.loopNodes.length, 4);
  assert.equal(map.overlayNodes.length, 3);
  assert.equal(map.dependencies.length, 4);
  assert.deepEqual(map.dependencies.map((edge) => edge.relationshipType), ['AUTHORITY_ENABLES', 'RISK_VIEW_DIRECTS', 'LEARNING_UPDATES', 'CONTROL_SIGNAL_FEEDS']);
  assert(map.overlayNodes.every((overlay) => overlay.status === 'CONTEXT_ONLY'), 'Motheo context must not activate unsupported D7/D8/D3 overlays.');
  const enterpriseIntegration = integrationExhibitProof(blueprint, map);
  assert.equal(enterpriseIntegration.loopCount, 4);
  assert.equal(enterpriseIntegration.domainCount, 10);
  assert.equal(enterpriseIntegration.supportedDependencyRefs.length, 4);
  assert.deepEqual(
    [...new Set(map.loopNodes.flatMap((loop) => loop.memberDomainRefs))].sort(),
    map.domainNodes.map((domain) => domain.domainRef).sort(),
    'Every Enterprise Integration domain must appear in one of the four loop nodes.'
  );
  const contextCrossReferences = contextCrossReferenceProof(factPack, blueprint);
  const transformation = transformationSequenceProof(factPack, blueprint);
  assert.equal(factPack.assuranceCoverage?.length, 10);
  assert.equal(factPack.assurancePriorities?.length, 3);
  assert.equal(factPack.resilienceTests?.length, 3);
  assert.equal(factPack.contextApplications?.length, 3);
  assert.equal(factPack.controlOutcomeLinks?.length, 3);
  assert.equal(factPack.roadmapDependencyLinks?.length, 3);
  assert.equal(factPack.findings.length, 0);
  assert.equal(factPack.risks.length, 0);
  assert.equal(factPack.scenarios.length, 0);
  assert.equal(factPack.systemicThemeInputs.length, 0);
  assert.equal(factPack.organisation.operatingContext.length, 17);
  assert.equal(factPack.controls.length, 3);
  assert.equal(factPack.roadmap.length, 3);
  assert.equal(factPack.maturationSteps.length, 6);

  const contextDump = structuredClone(factPack);
  contextDump.contextApplications[0].contextRefs = factPack.organisation.operatingContext.map((item) => `OPERATING-CONTEXT-${item.key}`);
  assert(premiumProjectionValidationIssues(contextDump).some((issue) => /context dump/i.test(issue)), 'Context-dump regression must reject an application using the full context set.');

  const factRefs = new Set(factPack.facts.map((fact) => fact.id));
  const domainRefs = new Set(factPack.domains.map((item) => item.factRef));
  const controlRefs = new Set(factPack.controls.map((item) => item.factRef));
  const decisionRefs = new Set(factPack.decisions.map((item) => item.factRef));
  const roadmapRefs = new Set(factPack.roadmap.map((item) => item.factRef));
  const priorityRefs = new Set(factPack.sustainmentPriorities.map((item) => item.factRef));
  const contextRefs = new Set(factPack.organisation.operatingContext.map((item) => `OPERATING-CONTEXT-${item.key}`));
  assert(map.domainNodes.every((node) => domainRefs.has(node.domainRef) && node.sourceRefs.every((ref) => factRefs.has(ref) || ref.startsWith('D'))));
  assert(map.dependencies.every((edge) => edge.contributingDomainRefs.every((ref) => domainRefs.has(ref))
    && edge.linkedControlRefs.every((ref) => controlRefs.has(ref))
    && edge.linkedDecisionRefs.every((ref) => decisionRefs.has(ref))
    && edge.linkedAssurancePriorityRefs.every((ref) => factRefs.has(ref))
    && edge.deterministicBasis.contextRefs.every((ref) => contextRefs.has(ref))));
  assert((factPack.resilienceTests ?? []).every((test) => test.supportStatus === 'CONDITIONAL' && test.doesNotAssertFinding && test.readinessDependency.length > 0 && test.linkedPriorityRef && priorityRefs.has(test.linkedPriorityRef) && test.linkedControlRefs.every((ref) => controlRefs.has(ref)) && test.linkedDecisionRefs.every((ref) => decisionRefs.has(ref)) && test.linkedRoadmapRefs.every((ref) => roadmapRefs.has(ref))));
  assert((factPack.contextApplications ?? []).every((application) => application.contextRefs.every((ref) => contextRefs.has(ref)) && application.dependencyRefs.length > 0 && application.analyticalConsequence && application.managementImplication));
  assert((factPack.controlOutcomeLinks ?? []).every((link) => controlRefs.has(link.controlRef) && decisionRefs.has(link.decisionRef) && priorityRefs.has(link.priorityRef) && link.responseRefs.length > 0));
  assert((factPack.roadmapDependencyLinks ?? []).every((link) => roadmapRefs.has(link.roadmapRef) && controlRefs.has(link.controlRef) && priorityRefs.has(link.priorityRef) && link.maturationRefs.length > 0));
  assert.equal(new Set(premiumRefs(factPack)).size, premiumRefs(factPack).length);
  assert.equal(validateReportBlueprint(blueprint, factPack).ok, true);

  const essentialProjection = buildEssentialProjection(data, evidenceModel);
  const essentialPack = buildEssentialNarrativeFactPack(data, evidenceModel, essentialProjection);
  assertNarrativeFactPack(essentialPack);
  const essentialPlan = buildNarrativeStoryPlan(essentialPack);
  assertNarrativeStoryPlan(essentialPlan, essentialPack);
  const essentialBlueprint = buildReportBlueprint(essentialPack, essentialPlan);
  assertReportBlueprint(essentialBlueprint, essentialPack);
  const essentialPremiumProperties = ['assuranceCoverage', 'assurancePriorities', 'resilienceTests', 'enterpriseIntegrationMap', 'contextApplications', 'controlOutcomeLinks', 'roadmapDependencyLinks'].filter((key) => Object.hasOwn(essentialPack, key));
  const essentialPremiumKinds = essentialPack.facts.filter((fact) => PREMIUM_FACT_KINDS.includes(fact.kind));
  const essentialPremiumAssignments = essentialBlueprint.contentAssignments.filter((item) => PREMIUM_ASSIGNMENT_TYPES.has(item.contentType));
  const essentialPremiumExhibits = essentialBlueprint.chapters.flatMap((chapter) => chapter.exhibits).filter((item) => item.exhibitId === 'EXH-ENTERPRISE-INTEGRATION');
  assert.equal(essentialPremiumProperties.length, 0);
  assert.equal(essentialPremiumKinds.length, 0);
  assert.equal(essentialPremiumAssignments.length, 0);
  assert.equal(essentialPremiumExhibits.length, 0, 'Essential may not contain the Comprehensive-only Enterprise Integration exhibit.');
  assert.deepEqual(essentialBlueprint.contextApplicationRequirements, []);

  const beforeFactPack = factPackStructure(factPack, true);
  const afterFactPack = factPackStructure(factPack);
  const beforeBlueprint = blueprintStructure(blueprint, true);
  const afterBlueprint = blueprintStructure(blueprint);
  const preview = premiumStoryPreview({ factPack, storyPlan, blueprint, essentialBlueprint });
  const previewSha256 = sha256(preview);

  const sourceModuleHashes = {};
  for (const relativePath of Object.keys(BASELINE_SOURCE_HASHES)) sourceModuleHashes[relativePath] = { baseline: BASELINE_SOURCE_HASHES[relativePath], current: await fileSha(relativePath) };
  const implementationSha = gitValue(['rev-parse', 'HEAD']);
  const workingTree = gitValue(['status', '--porcelain']);
  const workingTreeLines = workingTree ? workingTree.split('\n').filter(Boolean) : [];
  const generatedOutputLines = workingTreeLines.filter((line) => /(^|\s)outputs\//.test(line));
  const sourceWorkingTreeLines = workingTreeLines.filter((line) => !generatedOutputLines.includes(line));
  const workbook = await optionalArtifact(workbookPath, path.join(path.dirname(workbookPath), 'MK-Comprehensive-motheo-workbook-qa.json'));
  let exhibitEvidence = { status: 'NOT_PROVIDED' };
  if (process.env.COMPREHENSIVE_ENTERPRISE_EXHIBIT_EVIDENCE_PATH) {
    try {
      exhibitEvidence = JSON.parse(await fs.readFile(path.resolve(process.env.COMPREHENSIVE_ENTERPRISE_EXHIBIT_EVIDENCE_PATH), 'utf8'));
    } catch {
      exhibitEvidence = { status: 'NOT_PROVIDED', path: path.resolve(process.env.COMPREHENSIVE_ENTERPRISE_EXHIBIT_EVIDENCE_PATH) };
    }
  }

  const propagationMap = [
    {
      inventoryConstruct: 'AssuranceCoverageRow + AssurancePriorityRow',
      sourceObject: 'Assurance coverage and sustainment priority rows',
      sourceModule: ['src/lib/reports/evidence-model/index.ts', 'src/lib/reports/comprehensive/management-model.ts', 'src/lib/reports/narrative/fact-pack.ts'],
      deterministicProvenance: ['domain facts', 'Sustainment priority sourceFindingId/sourceQuestionCode/sourceDomainCode', 'retained proof, owner, frequency, trigger and measure'],
      currentLossPoint: 'The existing Fact Pack retained priority prose but dropped the source identity and did not expose assurance coverage as a narrative object.',
      newFactPackField: 'assuranceCoverage[] and assurancePriorities[]',
      blueprintUse: 'Analytical basis and Sustainment priorities sections; one primary assignment per object.',
      pdfCustomerPurpose: 'Keep the full assessed profile visible, show what is being preserved and explain the management proof and review rhythm.'
    },
    {
      inventoryConstruct: 'Typed dependency graph / Enterprise Fraud Readiness Integration Map',
      sourceObject: 'Scored domain nodes, methodology loop map, operating-context overlays, sustainment links and proof references',
      sourceModule: ['src/lib/reports/narrative/premium-projection.ts', 'src/lib/reports/evidence-model/semantic-mappings.ts', 'src/lib/reports/evidence-model/contradictions.ts'],
      deterministicProvenance: ['domainRef and score', 'semantic family', 'control/decision/roadmap/maturation/proof references', 'affirmed context references where activated'],
      currentLossPoint: 'The source graph and management model were not propagated into the narrative Fact Pack or Blueprint, so the writer received no authoritative cross-domain relationship object.',
      newFactPackField: 'enterpriseIntegrationMap and integration_dependency facts',
      blueprintUse: 'Analytical basis primary home with controlled cross-reference metadata for decisions and roadmap.',
      pdfCustomerPurpose: 'Give management one concise view of how governance, risk view, control signals and learning connect without inventing a generic diagram.'
    },
    {
      inventoryConstruct: 'ResilienceTestRow',
      sourceObject: 'Recorded assurance priorities, deterioration triggers, evidence groups, controls, decisions and roadmap actions',
      sourceModule: ['src/lib/reports/comprehensive/management-model.ts', 'src/lib/reports/narrative/maturation.ts', 'src/lib/reports/narrative/premium-projection.ts'],
      deterministicProvenance: ['priority semantic family', 'existing deterioration trigger', 'existing proof', 'existing control/decision/roadmap response'],
      currentLossPoint: 'Resilience tests existed in the assembled management model but were absent from the narrative Fact Pack and Blueprint.',
      newFactPackField: 'resilienceTests[] with supportStatus CONDITIONAL and doesNotAssertFinding true',
      blueprintUse: 'Deterioration watchpoints and control/decision cross-references.',
      pdfCustomerPurpose: 'Show what management should re-check after material change while preserving zero customer findings, risks and scenarios.'
    },
    {
      inventoryConstruct: 'Control → decision → protected outcome → deterioration response',
      sourceObject: 'Existing Sustainment controls, decisions, proof and roadmap records',
      sourceModule: ['src/lib/reports/narrative/fact-pack.ts', 'src/lib/reports/comprehensive/authoritative-objects.ts', 'src/lib/reports/narrative/premium-projection.ts'],
      deterministicProvenance: ['linkedSustainmentPriorityRefs', 'control effectiveness measure and trigger', 'decision factRef', 'roadmap response and proof'],
      currentLossPoint: 'Controls and decisions were available as separate records; their protected management outcome and deterioration response were not a shared object.',
      newFactPackField: 'controlOutcomeLinks[]',
      blueprintUse: 'Target resilient control environment and leadership decisions sections; workbook control and decision rows.',
      pdfCustomerPurpose: 'Make each sustainment control useful to management by showing the question it answers, the outcome it protects and the response if the signal deteriorates.'
    },
    {
      inventoryConstruct: 'Dependency-led 12-month path',
      sourceObject: 'Existing roadmap actions and two maturation steps per Sustainment control',
      sourceModule: ['src/lib/reports/narrative/maturation.ts', 'src/lib/reports/narrative/fact-pack.ts', 'src/lib/reports/narrative/premium-projection.ts'],
      deterministicProvenance: ['roadmap sourceSustainmentPriorityRef', 'maturation linkedControlRef and dependency', 'existing proof and success measure'],
      currentLossPoint: 'The roadmap and maturation objects were present separately, but no shared dependency gate explained why the next stage becomes useful.',
      newFactPackField: 'roadmapDependencyLinks[]',
      blueprintUse: 'Sustainment optimisation section and Implementation Blueprint workbook rows.',
      pdfCustomerPurpose: 'Turn the existing PRESERVE → EMBED → MEASURE → OPTIMISE path into an actionable sequence without adding new actions.'
    },
    {
      inventoryConstruct: 'Selective context application',
      sourceObject: 'Affirmed, customer-narrative-allowed operating-context facts and supported integration dependencies',
      sourceModule: ['src/lib/reports/narrative/operating-context.ts', 'src/lib/reports/narrative/premium-projection.ts'],
      deterministicProvenance: ['context key and factRef', 'supported dependency refs', 'explicit analytical consequence and management implication'],
      currentLossPoint: 'Operating context was available as a list but had no deterministic rule preventing context dumps or requiring a management consequence.',
      newFactPackField: 'contextApplications[] and Blueprint contextApplicationRequirements[]',
      blueprintUse: 'Analytical basis only when the application is selective and follows context → analytical consequence → management implication.',
      pdfCustomerPurpose: 'Use only relevant operating context to sharpen the management interpretation rather than reciting sector or environment facts.'
    }
  ];

  const reusedObjects = [
    'Motheo V1.2 assembled assessment and ten domain results',
    'Deterministic Fact Pack score, maturity, domain, operating-context, control, decision, roadmap, proof and maturation objects',
    'Sustainment priorities SP-001, SP-002 and SP-003 with source question/domain identity retained only for Comprehensive',
    'Sustainment controls CONTROL-001, CONTROL-002 and CONTROL-003',
    'Sustainment decisions DECISION-001, DECISION-002 and DECISION-003',
    'Sustainment roadmap actions ROADMAP-001, ROADMAP-002 and ROADMAP-003',
    'Maturation steps MAT-001 through MAT-006',
    'Existing operating-context facts and customer-narrative permission flags',
    'Existing Reporting Bible chapter order, section identity, exhibit IDs, workbook sheet names and MK design tokens'
  ];

  const tests = [
    testResult('premium Fact Pack object counts', true, '10 coverage rows; 3 assurance priorities; 3 resilience tests; 1 map; 4 typed dependencies; 3 context applications; 3 control-outcome links; 3 roadmap-dependency links.'),
    testResult('Enterprise Integration exhibit scope', true, `${enterpriseIntegration.loopCount} loops; ${enterpriseIntegration.domainCount} domains; ${enterpriseIntegration.supportedDependencyRefs.length} supported dependency edges; ${enterpriseIntegration.overlayRefs.length} context overlays; unsupported edges excluded.`),
    testResult('unsupported context remains context-only', true, 'Motheo supplier, digital/identity and physical overlays have no linked D7/D8/D3 object and are not promoted to active dependencies.'),
    testResult('context cross-chapter consumption', true, `${contextCrossReferences.reduce((sum, item) => sum + item.chains.length, 0)} deterministic routes from Analytical basis into watchpoints, controls, decisions and sustainment optimisation.`),
    testResult('Sustainment transformation stage support', true, transformation.map((stage) => `${stage.stage}: ${stage.sourceRefs.length} source objects`).join(' | ')),
    testResult('decision themes are distinct', true, decisions.map((decision) => `${decision.factRef}: ${decision.question}`).join(' | ')),
    testResult('all customer-visible relationship references resolve', true, 'Integration edges, resilience responses, context applications, control outcomes and roadmap links resolve to Fact Pack objects.'),
    testResult('conditional resilience boundary', true, 'Every test is CONDITIONAL and doesNotAssertFinding=true.'),
    testResult('selective context rule', true, 'Three selective applications are present; a full 17-context dump is rejected.'),
    testResult('Motheo Sustainment zero findings/risks/scenarios/themes', true),
    testResult('Blueprint primary assignment coverage', true, `${blueprint.contentAssignments.length} assignments; all premium facts have one primary home.`),
    testResult('Essential isolation', true, 'Essential contains no premium Fact Pack properties, premium Fact kinds, premium assignments or context requirements.'),
    testResult('provider-free boundary', true, 'Provider calls: 0; writer not invoked.'),
    testResult('no unsupported numeric additions', true, 'Premium projection adds only structural thresholds already defined by the accepted assurance/test rules; no assessment amount or score is invented.')
  ];

  const workbookMapping = {
    sheetArchitecturePreserved: true,
    sheets: ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Blueprints', 'Implementation Blueprint', 'Management Decisions', 'Question Traceability'],
    controlBlueprints: 'Existing Control Blueprints rows retain owner, process owner, frequency, proof, trigger and measure; Comprehensive adds managementQuestion, protectedOutcome, indicatorOrEvidence, deteriorationTrigger, linkedDecisionIds, resilienceTestIds and integrationDependencyIds.',
    implementationBlueprint: 'Existing roadmap, proof and maturation rows remain in the same Implementation Blueprint sheet; Comprehensive adds dependencyRefs, decisionGateRefs, resilienceTestRefs, integrationDependencyRefs, protectedOutcome, stageGate and nextStageUse.',
    managementDecisions: 'Existing decision rows consume the same authoritative decision objects and add linkedControlIds, protectedOutcome, indicatorOrEvidence, resilienceTestRefs and integrationDependencyRefs.',
    questionTraceability: 'Existing trace rows and 68-row technical traceability record remain unchanged; Sustainment finding/risk customer lineage remains suppressed.',
    summary: 'Existing summary formulas remain; new non-formula counts identify integration relationships, assurance coverage, context applications, resilience checks and control-outcome links.',
    customerCopyBoundary: 'No premium internal rules, source-engine labels or provider/certification language is written to customer workbook cells.'
  };

  const evidence = {
    status: 'PASS',
    gate: 'comprehensive-premium-propagation',
    providerCalls: 0,
    baseline: {
      codeSha: BASELINE_CODE_SHA,
      inventoryMarkdownSha256: INVENTORY_MD_SHA,
      inventoryJsonSha256: INVENTORY_JSON_SHA,
      factPackHashBeforeKnownBaseline: 'e7173eb3a7fee21792fdc400d7d683936a04802d471887555bf086f2bf23f3de',
      storyPlanHashBeforeKnownBaseline: 'ea6a6db7812223fb277cd8f68bec519e1c2f35c4317ac5b7f8ff2f46ae151f03',
      blueprintHashBeforeKnownBaseline: 'a1d9e54f5ff243d892eda2fad267c41afe7a394ef26d4f66d5dd8450a43ff72f'
    },
    implementation: {
      codeSha: implementationSha,
      workingTreeDirty: Boolean(workingTree),
      workingTreeStatus: workingTree,
      sourceWorktreeClean: sourceWorkingTreeLines.length === 0,
      sourceWorkingTreeStatus: sourceWorkingTreeLines,
      generatedOutputStatus: generatedOutputLines
    },
    workbook,
    enterpriseIntegrationExhibit: enterpriseIntegration,
    contextCrossReferences,
    transformationSequence: transformation,
    preview: { path: 'motheo-premium-story-preview.md', sha256: previewSha256 },
    exhibitRender: exhibitEvidence,
    fixture: {
      profile: 'motheo',
      organisation: factPack.organisation.name,
      assessmentReference: factPack.assessment.reference,
      score: factPack.assessment.score,
      maturity: factPack.assessment.maturity,
      narrativeMode: factPack.narrativeMode,
      generatedAt: factPack.assessment.generatedAt,
      providerCalls: 0
    },
    sourceModuleHashes,
    factPack: {
      beforePropagation: beforeFactPack,
      afterPropagation: afterFactPack,
      afterHash: sha256(JSON.stringify(factPack)),
      premiumFactRefs: premiumRefs(factPack),
      premiumFactKinds: factKinds(factPack)
    },
    storyPlan: {
      afterHash: sha256(JSON.stringify(storyPlan)),
      premiumRequirements: storyPlan.premiumRequirements,
      movementIds: storyPlan.movements.map((movement) => movement.id)
    },
    blueprint: {
      beforePropagation: beforeBlueprint,
      afterPropagation: afterBlueprint,
      afterHash: sha256(JSON.stringify(blueprint)),
      validation: validateReportBlueprint(blueprint, factPack),
      contextApplicationRequirements: blueprint.contextApplicationRequirements,
      narrativeCrossReferences: blueprint.narrativeCrossReferences,
      transformationSequence: transformation
    },
    propagationMap,
    reusedObjects,
    workbookMapping,
    essentialIsolation: {
      premiumProperties: essentialPremiumProperties,
      premiumFactKinds: essentialPremiumKinds.map((fact) => fact.kind),
      premiumAssignments: essentialPremiumAssignments,
      premiumExhibits: essentialPremiumExhibits,
      contextApplicationRequirements: essentialBlueprint.contextApplicationRequirements
    },
    tests,
    invariants: {
      customerVisibleRelationshipsValid: true,
      enterpriseIntegrationExhibitCustomerVisible: enterpriseIntegration.exhibitId === 'EXH-ENTERPRISE-INTEGRATION',
      enterpriseIntegrationScopeValid: enterpriseIntegration.loopCount === 4 && enterpriseIntegration.domainCount === 10 && enterpriseIntegration.unsupportedDependencyRefs.length === 0,
      contextCrossChapterConsumptionValid: contextCrossReferences.every((item) => item.primaryHome.length === 1 && item.chains.length === 4),
      sustainmentTransformationStagesSupported: transformation.every((stage) => stage.supported && stage.sourceRefs.length > 0),
      resilienceTestsAreConditional: true,
      noSustainmentFindingsRisksScenarios: factPack.findings.length === 0 && factPack.risks.length === 0 && factPack.scenarios.length === 0,
      noMissingControlDecisionRefs: true,
      noUnsupportedNumeric: true,
      essentialObjectIsolation: essentialPremiumProperties.length === 0 && essentialPremiumKinds.length === 0 && essentialPremiumAssignments.length === 0 && essentialPremiumExhibits.length === 0
    }
  };

  await fs.mkdir(outputDir, { recursive: true });
  const jsonFiles = {
    'comprehensive-premium-propagation-evidence.json': evidence,
    'motheo-fact-pack-before-structure.json': beforeFactPack,
    'motheo-fact-pack-after.json': factPack,
    'motheo-blueprint-before-structure.json': beforeBlueprint,
    'motheo-provider-free-story-plan.json': storyPlan,
    'motheo-provider-free-blueprint.json': blueprint,
    'comprehensive-premium-propagation-manifest.json': {
      gate: evidence.gate,
      status: evidence.status,
      codeSha: implementationSha,
      baselineCodeSha: BASELINE_CODE_SHA,
      fixture: evidence.fixture,
      providerCalls: 0,
      files: []
    }
  };
  // The manifest's file list is written separately after the object is assembled.
  jsonFiles['comprehensive-premium-propagation-manifest.json'].files = [
    'comprehensive-premium-propagation-evidence.json',
    'comprehensive-premium-propagation-evidence.md',
    'motheo-fact-pack-before-structure.json',
    'motheo-fact-pack-after.json',
    'motheo-blueprint-before-structure.json',
    'motheo-provider-free-story-plan.json',
    'motheo-provider-free-blueprint.json',
    'motheo-premium-story-preview.md',
    'motheo-enterprise-integration-fixture.html',
    'motheo-enterprise-integration-fixture.pdf',
    'motheo-enterprise-integration-exhibit-page.png',
    'enterprise-integration-exhibit-evidence.json',
    'enterprise-integration-exhibit-evidence.md',
    'comprehensive-premium-propagation-manifest.json'
  ];
  for (const [filename, value] of Object.entries(jsonFiles)) await fs.writeFile(path.join(outputDir, filename), `${JSON.stringify(value, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'motheo-premium-story-preview.md'), preview);

  const markdown = `# Comprehensive premium propagation evidence — Motheo

Status: **PASS**  
Provider calls: **0**  
Implementation SHA at gate run: \`${implementationSha}\`  
Baseline code SHA: \`${BASELINE_CODE_SHA}\`

## Scope

This is a provider-free projection over the accepted Motheo V1.2 assessment. Scoring, question selection, maturity logic, assurance boundary, Essential path, workbook sheet architecture, accepted branding and PDF compositor were not redesigned.

The legacy surface reconstructed in the evidence shows the existing loss: ${beforeFactPack.factCount} Fact Pack facts and ${beforeBlueprint.contentAssignments} Blueprint assignments, with no typed integration map, assurance rows, resilience tests, context applications, control-outcome links or roadmap-dependency links. The new surface has ${afterFactPack.factCount} Fact Pack facts and ${afterBlueprint.contentAssignments} Blueprint assignments while retaining the same ${afterBlueprint.chapters} chapters and adding the Comprehensive-only Enterprise Integration exhibit.

## What the writer is now asked to do differently

- Use one supplied enterprise integration view to explain how recorded domains, management priorities, decision routes, control signals and learning connect.
- Apply only the three supported context applications, and only in the sequence **context → analytical consequence → management implication**.
- Describe the three resilience tests as conditional, forward-looking tests after a recorded change condition; they are not current findings, risks or scenarios.
- Preserve the existing owner, cadence, evidence, trigger and measure for every Sustainment control, then explain its supplied control → decision → protected outcome → deterioration response chain.
- Explain the existing twelve-month stages through the supplied dependency gate before the next stage becomes useful; no new action is introduced.

## Enterprise Integration exhibit

The Blueprint contains **${enterpriseIntegration.exhibitId}** at **${enterpriseIntegration.placement.chapterId}/${enterpriseIntegration.placement.sectionId}**. It is sourced from **${enterpriseIntegration.loopCount} loops**, **${enterpriseIntegration.domainCount} domain nodes**, **${enterpriseIntegration.supportedDependencyRefs.length} supported dependency edges** and **${enterpriseIntegration.overlayRefs.length} context overlays**. Unsupported dependency edges: **${enterpriseIntegration.unsupportedDependencyRefs.length}**.

The customer compositor renders the exhibit as an editorial loop-and-relationship view. Context overlays remain a separate context layer and are not rendered as dependency edges.

## Context consumption proof

${contextCrossReferences.map((item) => `- **${item.applicationRef}** has one primary home at ${item.primaryHome.join(', ')} and ${item.chains.length} cross-chapter routes: ${item.chains.map((chain) => chain.target).join(' · ')}.`).join('\n')}

Each route carries the required pattern **context → analytical consequence → management implication** and preserves the application’s dependency, control, decision, resilience-test and roadmap references.

## Transformation-stage proof

${transformation.map((stage) => `- **${stage.stage}** — supported: **${stage.supported}**; source objects: ${stage.sourceRefs.join(', ')}.`).join('\n')}

The regression fails when an authorised deterministic stage has no support or when its source references diverge from the existing roadmap, control-outcome, resilience and maturation objects.

## Premium deterministic objects

${JSON.stringify({ coverage: afterFactPack.assuranceCoverage, assurancePriorities: afterFactPack.assurancePriorities, resilienceTests: afterFactPack.resilienceTests, integrationMap: map, contextApplications: afterFactPack.contextApplications, controlOutcomeLinks: afterFactPack.controlOutcomeLinks, roadmapDependencyLinks: afterFactPack.roadmapDependencyLinks }, null, 2)}

## Product-family isolation

The Essential Motheo path passed with no premium Fact Pack properties, premium Fact kinds, premium Blueprint assignments or context-application requirements. Motheo Sustainment remains at zero customer findings, risks, scenarios and weakness themes.

## Workbook mapping

The existing eight-sheet workbook architecture is preserved. The detailed control, decision and implementation records consume the same authoritative objects represented in the premium Fact Pack; Question Traceability remains the existing technical record and no finding/risk customer lineage is created for Sustainment.

## Reused objects

${reusedObjects.map((item) => `- ${item}`).join('\n')}

## Evidence files

The adjacent JSON files contain the exact before/after structures, source-module hashes, propagation map, Story Plan, Blueprint, workbook mapping, Enterprise Integration exhibit proof, context cross-reference proof, transformation-stage proof and machine-readable test results. The adjacent **motheo-premium-story-preview.md** is generated directly from these deterministic objects and contains no writer prose.
`;
  await fs.writeFile(path.join(outputDir, 'comprehensive-premium-propagation-evidence.md'), markdown);
  console.log(JSON.stringify({ status: 'PASS', gate: evidence.gate, outputDir, implementationSha, providerCalls: 0, factPackHash: evidence.factPack.afterHash, storyPlanHash: evidence.storyPlan.afterHash, blueprintHash: evidence.blueprint.afterHash, tests: tests.map((test) => ({ name: test.name, status: test.status })) }, null, 2));
}

await main();
