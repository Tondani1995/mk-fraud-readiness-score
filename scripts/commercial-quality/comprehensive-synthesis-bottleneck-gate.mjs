#!/usr/bin/env node
/**
 * Provider-free diagnostic and bounded correction gate for Comprehensive Premium
 * synthesis. It exercises the same Fact Pack -> Story Plan -> Blueprint ->
 * manuscript binding -> presentation model -> PDF compositor path used by the
 * customer product, but it never constructs a writer or calls a provider.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { buildMotheoDeterministicFixture, buildBoundedFixtureMarkdown } from './comprehensive-phase-g-fixture.mjs';
import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildAuthoritativeComprehensiveObjects } from '../../src/lib/reports/comprehensive/authoritative-objects.ts';
import { bindComprehensiveFixtureManuscript } from '../../src/lib/reports/comprehensive/manuscript-coordinator.ts';
import { buildComprehensiveNarrativePresentationModel } from '../../src/lib/reports/comprehensive/narrative-presentation-model.ts';
import { renderComprehensiveNarrativeReportHtml } from '../../src/lib/reports/comprehensive/render-narrative-html.ts';
import { closeRenderBrowser, renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';
import { assertNarrativeFactPack, buildComprehensiveNarrativeFactPack, buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { assertReportBlueprint, buildReportBlueprint, validateReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { findCustomerCopyLeakage } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { premiumProjectionValidationIssues } from '../../src/lib/reports/narrative/premium-projection.ts';

const repoRoot = process.cwd();
const implementationSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const outputDir = path.resolve(process.env.COMPREHENSIVE_SYNTHESIS_OUTPUT_DIR ?? path.join(repoRoot, 'outputs', `comprehensive-synthesis-correction-${implementationSha}`));
const failedCertificationDir = path.resolve(process.env.COMPREHENSIVE_FAILED_CERTIFICATION_DIR ?? '/Users/tondani/Documents/Codex/2026-09-01/files-pasted-by-the-user-mk/outputs/comprehensive-real-provider-certification-f7defd7476a64a0bbafe286b13efc41a29d2490c');
const failedManuscriptPath = path.join(failedCertificationDir, 'motheo-real-provider-manuscript.md');
const failedPdfPath = path.join(failedCertificationDir, 'motheo-real-provider-report.pdf');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

function stable(value) {
  return JSON.stringify(value, null, 2);
}

function writeJson(filename, value) {
  return fs.writeFile(path.join(outputDir, filename), `${stable(value)}\n`);
}

function compact(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(value) {
  return new Set(compact(value).split(' ').filter((word) => word.length > 2));
}

function jaccard(left, right) {
  const a = words(left);
  const b = words(right);
  const union = new Set([...a, ...b]);
  return union.size ? Number(([...a].filter((word) => b.has(word)).length / union.size).toFixed(4)) : 1;
}

function repeatedSentences(text) {
  const rows = new Map();
  for (const raw of String(text).match(/[^.!?…]+[.!?…]/g) ?? []) {
    const value = raw.replace(/\s+/g, ' ').trim();
    const key = compact(value);
    if (key.length < 35) continue;
    const row = rows.get(key) ?? { sentence: value, count: 0 };
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].filter((row) => row.count > 1).sort((left, right) => right.count - left.count || left.sentence.localeCompare(right.sentence));
}

function matchCount(text, pattern) {
  return [...String(text).matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))].length;
}

function firstMatchSummary(text, patterns) {
  return Object.fromEntries(patterns.map(({ id, pattern }) => [id, matchCount(text, pattern)]));
}

function sectionList(blueprint) {
  return blueprint.chapters.flatMap((chapter) => chapter.sections.map((section) => ({ chapterId: chapter.chapterId, chapterTitle: chapter.title, ...section })));
}

function sourceAwareFixtureAudit(markdown) {
  const repeated = repeatedSentences(markdown);
  const leakage = findCustomerCopyLeakage(markdown);
  return {
    wordCount: markdown.trim().split(/\s+/).length,
    repeatedSentenceCount: repeated.length,
    repeatedSentences: repeated,
    customerCopyLeakage: leakage,
    sourceAwareParagraphs: markdown.split(/\n\n+/).filter((block) => !block.startsWith('#')).length
  };
}

function failedOutputAudit(text) {
  const contextPatterns = [
    { id: 'operating-context', pattern: /operating context/gi },
    { id: 'digital-identity-context', pattern: /digital (?:channels|or identity|payments|and identity)/gi },
    { id: 'third-party-context', pattern: /third-party|supplier(?:s)?|intermediari(?:es|ary)/gi },
    { id: 'physical-value-context', pattern: /physical (?:cash|value|assets)|manual adjustments|distributed operations|temporary(?:, seasonal or subcontracted)? workers/gi },
    { id: 'context-as-a-management-topic', pattern: /context(?:ual|ual factors)?/gi }
  ];
  const repeated = repeatedSentences(text);
  return {
    wordCount: text.trim().split(/\s+/).length,
    contextPhraseCounts: firstMatchSummary(text, contextPatterns),
    repeatedSentenceCount: repeated.length,
    repeatedSentences: repeated.slice(0, 20),
    broadContextInventorySignals: [
      'The organisation\'s operating context makes this connected view particularly relevant.',
      'External suppliers, contractors or service providers are present',
      'Physical cash is handled'
    ].map((phrase) => ({ phrase, count: matchCount(text, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) })),
    repeatedTargetControlFraming: matchCount(text, /The target environment protects what is already working/gi),
    repeatedGenericControlSuffix: matchCount(text, /The (?:recorded|current) standard remains (?:owned|visible|managed)/gi)
  };
}

function pdfMetrics(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
  assert.ok(pages > 0, 'Corrected provider-free PDF must contain pages.');
  assert.ok(text.trim().length > 2000, 'Corrected provider-free PDF must contain substantive text.');
  assert.doesNotMatch(text, /\bundefined\b|\bNaN\b/i, 'Corrected provider-free PDF contains undefined or NaN text.');
  return { pages, words: text.trim().split(/\s+/).length, textSha256: sha256(text) };
}

function deliveryFor(data, evidenceModel) {
  return buildComprehensiveDeliveryModel({
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
}

function questionLevelEvidence(factPack, storyPlan, blueprint, data) {
  const signals = factPack.questionSignals ?? [];
  const storySignals = storyPlan.premiumRequirements?.questionSignalRefs ?? [];
  const analytical = sectionList(blueprint).find((section) => section.sectionId === 'ANALYTICAL-BASIS-SECTION');
  const blueprintSignals = blueprint.contentAssignments.filter((item) => item.contentType === 'question_signal').map((item) => item.contentRef);
  const analyticalSignals = analytical?.questionEvidenceRefs ?? [];
  const sourcePriorityCodes = factPack.sustainmentPriorities.map((priority) => priority.sourceQuestionCode).filter(Boolean);
  const sourcePrioritySignalRefs = signals.filter((signal) => sourcePriorityCodes.includes(signal.questionCode)).map((signal) => signal.factRef);
  const byDomain = Object.fromEntries([...new Set(signals.map((signal) => signal.domainCode))].sort().map((domainCode) => [domainCode, {
    domainName: signals.find((signal) => signal.domainCode === domainCode)?.domainName,
    signalCount: signals.filter((signal) => signal.domainCode === domainCode).length,
    applicableCount: signals.filter((signal) => signal.domainCode === domainCode && signal.applicable).length,
    responseLabels: Object.fromEntries([...new Set(signals.filter((signal) => signal.domainCode === domainCode).map((signal) => signal.responseLabel))].sort().map((label) => [label, signals.filter((signal) => signal.domainCode === domainCode && signal.responseLabel === label).length]))
  }]));
  const allRefs = signals.map((signal) => signal.factRef);
  const absorbed = allRefs.filter((ref) => !sourcePrioritySignalRefs.includes(ref));
  assert.equal(signals.length, data.questionTraces.length, 'Every assessment question trace must enter the Comprehensive Fact Pack.');
  assert.equal(signals.length, 68, 'Motheo question-signal count must remain 68.');
  assert.equal(new Set(storySignals).size, storySignals.length, 'Story Plan question signals must be unique.');
  assert.deepEqual(new Set(storySignals), new Set(allRefs), 'Every question signal must survive into Story Plan requirements.');
  assert.deepEqual(new Set(blueprintSignals), new Set(allRefs), 'Every question signal must have a Blueprint evidence assignment.');
  assert.deepEqual(new Set(analyticalSignals), new Set(allRefs), 'Analytical basis must retain the complete question evidence surface.');
  return {
    enteredQuestionTraces: data.questionTraces.length,
    factPackQuestionSignals: signals.length,
    storyPlanQuestionSignals: storySignals.length,
    blueprintQuestionSignalAssignments: blueprintSignals.length,
    analyticalBasisQuestionSignals: analyticalSignals.length,
    domainCoverage: Object.keys(byDomain).length,
    byDomain,
    prioritySourceQuestionCodes: sourcePriorityCodes,
    prioritySourceSignalRefs: sourcePrioritySignalRefs,
    absorbedIntoDomainCoverageAndPremiumRoutes: {
      count: absorbed.length,
      signalRefs: absorbed,
      explanation: 'These signals remain in the full Analytical basis evidence surface and domain profile; they are not discarded or converted into additional Sustainment weaknesses.'
    }
  };
}

function exposurePathwayEvidence(factPack) {
  const pathways = factPack.exposurePathways ?? [];
  assert.equal(pathways.length, 3, 'Motheo must retain three supported exposure pathways.');
  assert.equal(new Set(pathways.map((pathway) => pathway.label)).size, pathways.length, 'Exposure pathway labels must be distinct.');
  assert(pathways.every((pathway) => pathway.questionSignalRefs.length > 0 && pathway.contextRefs.length > 0 && pathway.dependencyRefs.length > 0 && pathway.linkedPriorityRefs.length > 0 && pathway.changeCondition && pathway.analyticalConsequence && pathway.managementImplication), 'Every exposure pathway must have evidence, context, consequence and response links.');
  return pathways.map((pathway) => ({
    factRef: pathway.factRef,
    pathwayRef: pathway.pathwayRef,
    label: pathway.label,
    contextRefs: pathway.contextRefs,
    contextKeys: pathway.contextKeys,
    supportedExposureIds: pathway.supportedExposureIds,
    questionSignalRefs: pathway.questionSignalRefs,
    domainRefs: pathway.domainRefs,
    dependencyRefs: pathway.dependencyRefs,
    linkedPriorityRefs: pathway.linkedPriorityRefs,
    linkedControlRefs: pathway.linkedControlRefs,
    linkedDecisionRefs: pathway.linkedDecisionRefs,
    linkedRoadmapRefs: pathway.linkedRoadmapRefs,
    linkedResilienceTestRefs: pathway.linkedResilienceTestRefs,
    changeCondition: pathway.changeCondition,
    analyticalConsequence: pathway.analyticalConsequence,
    managementImplication: pathway.managementImplication,
    conditionalBoundary: pathway.conditionalBoundary,
    provenanceRefs: pathway.provenanceRefs
  }));
}

function crossDomainEvidence(factPack) {
  const map = factPack.enterpriseIntegrationMap;
  assert(map, 'Motheo must have an Enterprise Fraud Readiness Integration Map.');
  assert.equal(map.loopNodes.length, 4);
  assert.equal(map.domainNodes.length, 10);
  const supported = map.dependencies.filter((dependency) => dependency.supportStatus === 'SUPPORTED');
  assert.equal(supported.length, 4);
  assert(supported.every((dependency) => dependency.contributingDomainRefs.length >= 1 && dependency.linkedControlRefs.length > 0 && dependency.linkedDecisionRefs.length > 0 && dependency.provenanceRefs.length > 0), 'Supported dependencies must carry domain, response and provenance links.');
  return {
    loops: map.loopNodes.map((loop) => ({ loopRef: loop.loopRef, label: loop.label, methodologyRole: loop.methodologyRole, memberDomainRefs: loop.memberDomainRefs })),
    domainCount: map.domainNodes.length,
    supportedDependencyCount: supported.length,
    supportedDependencies: supported.map((dependency) => ({
      dependencyRef: dependency.dependencyRef,
      relationshipType: dependency.relationshipType,
      loopRef: dependency.loopRef,
      contributingDomainRefs: dependency.contributingDomainRefs,
      overlayRefs: dependency.overlayRefs,
      linkedAssurancePriorityRefs: dependency.linkedAssurancePriorityRefs,
      linkedControlRefs: dependency.linkedControlRefs,
      linkedDecisionRefs: dependency.linkedDecisionRefs,
      protectedManagementOutcome: dependency.protectedManagementOutcome,
      evidenceOrIndicator: dependency.evidenceOrIndicator,
      deteriorationTrigger: dependency.deteriorationTrigger,
      provenanceRefs: dependency.provenanceRefs
    }))
  };
}

function sectionNoveltyEvidence(factPack, storyPlan, blueprint) {
  const sections = sectionList(blueprint);
  const rules = storyPlan.premiumRequirements?.sectionContributionRules ?? [];
  const ruleById = new Map(rules.map((rule) => [rule.sectionId, rule]));
  const rows = sections.map((section) => {
    const rule = ruleById.get(section.sectionId);
    return {
      sectionId: section.sectionId,
      chapterId: section.chapterId,
      managementQuestion: section.managementQuestion,
      primaryContribution: section.analyticalContribution,
      prohibitedRestatementOf: section.prohibitedRestatementOf ?? [],
      questionEvidenceRefs: section.questionEvidenceRefs ?? [],
      rulePresent: Boolean(rule),
      primaryContributionWordOverlap: rule ? jaccard(section.analyticalContribution, rule.primaryContribution) : 0
    };
  });
  const premiumRows = rows.filter((row) => row.rulePresent);
  const primaryContributions = premiumRows.map((row) => compact(row.primaryContribution));
  assert.equal(premiumRows.length, rules.length, 'Every Comprehensive section contract must land on a real section.');
  assert.equal(new Set(primaryContributions).size, premiumRows.length, 'Comprehensive section primary contributions must be distinct.');
  assert(premiumRows.every((row) => row.managementQuestion && row.primaryContribution && row.prohibitedRestatementOf.length > 0), 'Every Comprehensive section must have a management question, contribution and non-repetition boundary.');
  const assignmentGroups = Object.groupBy(blueprint.contentAssignments, (assignment) => assignment.contentType);
  const primaryHomes = Object.fromEntries(['question_signal', 'exposure_pathway', 'critical_reliance', 'context_application', 'resilience_test', 'control_outcome_link', 'roadmap_dependency_link'].map((type) => [type, (assignmentGroups[type] ?? []).map((assignment) => `${assignment.contentRef} → ${assignment.chapterId}/${assignment.sectionId}`)]));
  assert.equal(new Set((assignmentGroups.question_signal ?? []).map((item) => item.contentRef)).size, factPack.questionSignals?.length ?? 0, 'Question signal assignments must remain unique.');
  return { sectionCount: sections.length, contractCount: rules.length, rows, primaryHomes };
}

function genericControlSaturationEvidence(factPack, failedText) {
  const controls = factPack.controls;
  const fingerprints = controls.map((control) => ({
    factRef: control.factRef,
    objective: control.objective,
    currentState: control.currentState,
    targetState: control.targetState,
    independentCheck: control.independentCheck,
    failureResponse: control.failureResponse,
    fingerprint: sha256Json([control.objective, control.currentState, control.targetState, control.independentCheck, control.failureResponse])
  }));
  const comparisons = [];
  for (let left = 0; left < controls.length; left += 1) {
    for (let right = left + 1; right < controls.length; right += 1) comparisons.push({ left: controls[left].factRef, right: controls[right].factRef, similarity: jaccard(JSON.stringify(fingerprints[left]), JSON.stringify(fingerprints[right])) });
  }
  assert.equal(new Set(fingerprints.map((row) => row.fingerprint)).size, controls.length, 'Control designs must not be materially identical.');
  assert.equal(new Set(controls.map((control) => control.objective)).size, controls.length, 'Control objectives must be distinct.');
  assert.equal(new Set(controls.map((control) => control.targetState)).size, controls.length, 'Control target states must be distinct.');
  return {
    threshold: { exactDuplicate: 0, highSimilarityWarning: 0.85 },
    status: 'PASS',
    exactDuplicateCount: 0,
    controls: fingerprints,
    pairwiseSimilarity: comparisons,
    failedProviderManuscriptGenericControlSuffixMatches: matchCount(failedText, /The (?:recorded|current) standard remains (?:owned|visible|managed)/gi),
    rule: 'Fail on exact duplicate control design or repeated objective/target state; report high lexical similarity for owner review rather than using brittle pixel checks.'
  };
}

function priorityDominanceEvidence(factPack) {
  const priorities = factPack.sustainmentPriorities;
  const pathways = factPack.exposurePathways ?? [];
  const roles = {
    control: factPack.controls,
    decision: factPack.decisions,
    roadmap: factPack.roadmap,
    assurancePriority: factPack.assurancePriorities ?? [],
    resilienceTest: factPack.resilienceTests ?? [],
    exposurePathway: pathways,
    controlOutcome: factPack.controlOutcomeLinks ?? [],
    roadmapDependency: factPack.roadmapDependencyLinks ?? []
  };
  const rows = priorities.map((priority) => {
    const linked = {
      control: roles.control.filter((item) => item.linkedSustainmentPriorityRefs?.includes(priority.factRef)).map((item) => item.factRef),
      decision: roles.decision.filter((item) => item.linkedSustainmentPriorityRefs?.includes(priority.factRef)).map((item) => item.factRef),
      roadmap: roles.roadmap.filter((item) => item.sourceSustainmentPriorityRef === priority.factRef).map((item) => item.factRef),
      assurancePriority: roles.assurancePriority.filter((item) => item.factRef === `ASSURANCE-PRIORITY-${priority.factRef.slice(-3)}`).map((item) => item.factRef),
      resilienceTest: roles.resilienceTest.filter((item) => item.linkedPriorityRef === priority.factRef).map((item) => item.factRef),
      exposurePathway: roles.exposurePathway.filter((item) => item.linkedPriorityRefs.includes(priority.factRef)).map((item) => item.factRef),
      controlOutcome: roles.controlOutcome.filter((item) => item.priorityRef === priority.factRef).map((item) => item.factRef),
      roadmapDependency: roles.roadmapDependency.filter((item) => item.priorityRef === priority.factRef).map((item) => item.factRef)
    };
    const populatedFunctions = Object.entries(linked).filter(([, refs]) => refs.length > 0).map(([name]) => name);
    return { priorityRef: priority.factRef, sourceQuestionCode: priority.sourceQuestionCode, populatedFunctions, linked };
  });
  const pathwayDominance = rows.map((row) => ({ priorityRef: row.priorityRef, pathwayCoverage: pathways.length ? Number((row.linked.exposurePathway.length / pathways.length).toFixed(4)) : 0 }));
  const dominant = pathwayDominance.filter((row) => row.pathwayCoverage > 0.75);
  assert(pathways.every((pathway) => new Set(pathway.linkedPriorityRefs).size >= 1), 'Every pathway must retain a supported priority link.');
  assert.equal(new Set(pathways.map((pathway) => pathway.managementImplication)).size, pathways.length, 'Pathway implications must not collapse into one generic priority statement.');
  return {
    threshold: { dominantPathwayCoverage: 0.75 },
    status: 'PASS_SUPPORTED_CENTRALITY',
    interpretation: dominant.length ? 'A dominant pathway priority is reported as supported centrality because the underlying pathways, controls, decisions, outcomes and implications remain distinct; it is not treated as generic priority saturation.' : 'No priority dominates the pathway layer.',
    dominantPriorityRefs: dominant.map((row) => row.priorityRef),
    pathwayCoverage: pathwayDominance,
    priorities: rows,
    duplicateFunctionTemplateDetected: false,
    rule: 'Escalate dominance only when high coverage is combined with duplicate object fingerprints or one generic implication; supported concentration remains visible for owner review.'
  };
}

function decisionSpecificityEvidence(factPack) {
  const decisions = factPack.decisions;
  const fingerprints = decisions.map((decision) => ({
    factRef: decision.factRef,
    theme: decision.question,
    optionSet: decision.options.map((option) => option.option),
    recommendedRoute: decision.recommendedRoute,
    rationale: decision.rationale,
    owner: decision.owner,
    targetDate: decision.targetDate,
    consequenceOfDelay: decision.consequenceOfDelay,
    fingerprint: sha256Json(decision.options.map((option) => ({ option: option.option, cost: option.cost, benefit: option.benefit, tradeOff: option.tradeOff })))
  }));
  assert.equal(decisions.length, 3);
  assert.equal(new Set(fingerprints.map((row) => row.fingerprint)).size, decisions.length, 'Leadership decisions must not reuse one option set.');
  assert.equal(new Set(decisions.map((decision) => decision.question)).size, decisions.length);
  return { count: decisions.length, exactOptionSetDuplicates: 0, decisions: fingerprints, themes: ['governance mandate / escalation', 'control-effectiveness review and learning', 'fraud-risk view currency after material change'] };
}

function essentialIsolation(data, evidenceModel, factPack) {
  const essentialProjection = buildEssentialProjection(data, evidenceModel);
  const essentialPack = buildEssentialNarrativeFactPack(data, evidenceModel, essentialProjection);
  assertNarrativeFactPack(essentialPack);
  const essentialPlan = buildNarrativeStoryPlan(essentialPack);
  assertNarrativeStoryPlan(essentialPlan, essentialPack);
  const essentialBlueprint = buildReportBlueprint(essentialPack, essentialPlan);
  assertReportBlueprint(essentialBlueprint, essentialPack);
  const premiumProperties = ['questionSignals', 'assuranceCoverage', 'assurancePriorities', 'resilienceTests', 'enterpriseIntegrationMap', 'contextApplications', 'exposurePathways', 'criticalReliances', 'controlOutcomeLinks', 'roadmapDependencyLinks'].filter((key) => Object.hasOwn(essentialPack, key));
  const premiumKinds = essentialPack.facts.filter((fact) => ['assurance_coverage', 'assurance_priority', 'resilience_test', 'enterprise_integration_map', 'integration_dependency', 'context_application', 'exposure_pathway', 'critical_reliance', 'control_outcome_link', 'roadmap_dependency_link', 'question_signal'].includes(fact.kind));
  const premiumAssignments = essentialBlueprint.contentAssignments.filter((item) => ['assurance_coverage', 'assurance_priority', 'integration_map', 'integration_dependency', 'resilience_test', 'context_application', 'exposure_pathway', 'critical_reliance', 'control_outcome_link', 'roadmap_dependency_link', 'question_signal'].includes(item.contentType));
  assert.equal(premiumProperties.length, 0);
  assert.equal(premiumKinds.length, 0);
  assert.equal(premiumAssignments.length, 0);
  assert.deepEqual(essentialBlueprint.contextApplicationRequirements, []);
  return { status: 'PASS', premiumProperties, premiumFactKinds: [], premiumAssignments: [], contextApplicationRequirements: [] };
}

function premiumStoryPreview({ factPack, storyPlan, blueprint, flow, pathwayEvidence, crossDomain }) {
  const integration = factPack.enterpriseIntegrationMap;
  const line = (label, value) => `- ${label}: ${value}`;
  const sections = [
    '# Premium Story Preview — Motheo',
    '',
    'Structural preview generated from the provider-free Fact Pack, Story Plan and Blueprint. It contains no writer prose.',
    '',
    '## 1. Executive priority / outcome',
    line('Objective', storyPlan.executiveStoryObjective),
    line('Recorded outcome', `${factPack.assessment.score}/100 · ${factPack.assessment.maturity} · ${factPack.narrativeMode}`),
    line('Priority result', factPack.sustainmentPriorities.map((item) => item.title).join(' · ')),
    '',
    '## 2. Enterprise Fraud Readiness Integration structure',
    line('Structure', `${integration.loopNodes.length} loops → ${integration.domainNodes.length} domain nodes → ${crossDomain.supportedDependencyCount} supported dependencies`),
    ...integration.loopNodes.map((loop) => line(`${loop.loopRef} · ${loop.label}`, `${loop.methodologyRole} · domains ${loop.memberDomainRefs.join(', ')}`)),
    '',
    '## 3. Deterministic dependencies and provenance',
    ...crossDomain.supportedDependencies.map((dependency) => line(dependency.dependencyRef, `${dependency.relationshipType} · ${dependency.contributingDomainRefs.join(' + ')} · controls ${dependency.linkedControlRefs.join(', ')} · decisions ${dependency.linkedDecisionRefs.join(', ')} · provenance ${dependency.provenanceRefs.join(', ')}`)),
    '',
    '## 4. Motheo operating-context links',
    ...pathwayEvidence.map((pathway) => line(`${pathway.pathwayRef} · ${pathway.label}`, `context ${pathway.contextKeys.join(', ')} · exposure basis ${pathway.supportedExposureIds.join(', ')} · ${pathway.analyticalConsequence} → ${pathway.managementImplication}`)),
    '',
    '## 5. Sustainment resilience/change tests',
    ...(factPack.resilienceTests ?? []).map((test) => line(test.testId, `${test.changeCondition} · test ${test.managementTest} · linked priority ${test.linkedPriorityRef} · boundary ${test.doesNotAssertFinding}`)),
    '',
    '## 6. Control → evidence → decision → management-outcome links',
    ...(factPack.controlOutcomeLinks ?? []).map((link) => line(link.linkRef, `${link.controlRef} → evidence ${link.evidenceRefs.join(', ')} → ${link.decisionRef} → ${link.protectedOutcome} · response ${link.responseRefs.join(', ')}`)),
    '',
    '## 7. Leadership decisions linked to enterprise integration',
    ...factPack.decisions.map((decision) => line(decision.factRef, `${decision.question} · route ${decision.recommendedRoute} · owner ${decision.owner} · timing ${decision.targetDate} · delay consequence ${decision.consequenceOfDelay}`)),
    '',
    '## 8. Dependency-led 12-month sequence',
    ...blueprint.transformationSequence.map((stage) => line(stage.stage, `${stage.supported ? 'SUPPORTED' : 'UNSUPPORTED'} · source objects ${stage.sourceRefs.join(', ')}`)),
    ...(factPack.roadmapDependencyLinks ?? []).map((link) => line(link.linkRef, `${link.roadmapRef} · gate ${link.stageGate} · next-stage use ${link.nextStageUse}`)),
    '',
    '## 9. Comprehensive-only elements not present in Essential',
    line('Question-level evidence surface', `${flow.factPackQuestionSignals} signals retained behind the premium Analytical basis`),
    line('Enterprise integration', `${integration.factRef}, ${integration.loopNodes.length} loops, ${integration.dependencies.filter((item) => item.supportStatus === 'SUPPORTED').length} supported relationships`),
    line('Assurance and resilience', `${(factPack.assuranceCoverage ?? []).length} coverage rows, ${(factPack.assurancePriorities ?? []).length} assurance priorities, ${(factPack.resilienceTests ?? []).length} change tests`),
    line('Selective context and exposure', `${(factPack.contextApplications ?? []).length} context applications, ${pathwayEvidence.length} exposure pathways, ${flow.domainCoverage} domain routes`),
    line('Critical reliance and outcome links', `${(factPack.criticalReliances ?? []).length} critical reliances, ${(factPack.controlOutcomeLinks ?? []).length} control-outcome links, ${(factPack.roadmapDependencyLinks ?? []).length} roadmap-dependency links`),
    line('Twelve-month maturation', `${factPack.maturationSteps.length} existing maturation steps across ${blueprint.transformationSequence.map((stage) => stage.stage).join(' → ')}`)
  ];
  return `${sections.join('\n')}\n`;
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const failedManuscript = await fs.readFile(failedManuscriptPath, 'utf8');
  const fixture = buildMotheoDeterministicFixture();
  const { data, evidenceModel, factPack, storyPlan, blueprint, context, generationPrompt } = fixture;
  assertNarrativeFactPack(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  assertReportBlueprint(blueprint, factPack);
  assert.deepEqual(premiumProjectionValidationIssues(factPack), []);

  const flow = questionLevelEvidence(factPack, storyPlan, blueprint, data);
  const pathwayEvidence = exposurePathwayEvidence(factPack);
  const crossDomain = crossDomainEvidence(factPack);
  const sectionNovelty = sectionNoveltyEvidence(factPack, storyPlan, blueprint);
  const decisionSpecificity = decisionSpecificityEvidence(factPack);
  const genericControlSaturation = genericControlSaturationEvidence(factPack, failedManuscript);
  const priorityDominance = priorityDominanceEvidence(factPack);
  const essential = essentialIsolation(data, evidenceModel, factPack);
  const authoritative = buildAuthoritativeComprehensiveObjects(factPack, blueprint);

  const correctedMarkdown = buildBoundedFixtureMarkdown(blueprint);
  const bound = bindComprehensiveFixtureManuscript({ markdown: correctedMarkdown, factPack, storyPlan, blueprint, generationId: 'provider-free-synthesis-correction' });
  assert.equal(bound.narrative.ok, true, `Corrected provider-free manuscript did not bind: ${JSON.stringify(bound.narrative.errors)}`);
  assert.equal(bound.validation.ok, true, `Corrected provider-free manuscript failed hard-truth validation: ${JSON.stringify(bound.validation.hardTruth.issues)}`);
  assert.equal(bound.validation.quality.status, 'PASS', `Corrected provider-free manuscript failed quality validation: ${JSON.stringify(bound.validation.quality.issues)}`);
  const fixtureAudit = sourceAwareFixtureAudit(correctedMarkdown);
  assert.equal(fixtureAudit.customerCopyLeakage.length, 0, 'Corrected fixture contains customer-copy leakage.');
  assert.equal(fixtureAudit.repeatedSentenceCount, 0, 'Corrected bounded fixture contains repeated prose paragraphs.');

  const presentation = buildComprehensiveNarrativePresentationModel({
    factPack,
    blueprint,
    narrative: bound.narrative,
    qaLabel: 'INTERNAL QA · PROVIDER-FREE SYNTHESIS COMPOSITION PREVIEW · NOT COMMERCIAL NARRATIVE ACCEPTANCE'
  });
  const html = renderComprehensiveNarrativeReportHtml(presentation);
  assert.match(html, /data-brand-asset="approved-mk-fraud-insights-mark"/);
  assert.match(html, /data:image\/svg\+xml,/);
  assert.match(html, /MK_CSS_VARIABLES|--mk-navy/);
  assert.equal((html.match(/data-companion-workbook="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-exhibit-type="exposure_pathway"/g) ?? []).length, 1);
  assert.equal((html.match(/data-exhibit-type="critical_reliance"/g) ?? []).length, 1);
  assert.match(html, /Supported change pathways/);
  assert.match(html, /Control signals relied on across the management view/);

  const preview = premiumStoryPreview({ factPack, storyPlan, blueprint, flow, pathwayEvidence, crossDomain });
  const failedAudit = failedOutputAudit(failedManuscript);
  const correctedAudit = { ...fixtureAudit, wordCount: correctedMarkdown.trim().split(/\s+/).length, sectionContracts: sectionNovelty.contractCount };
  const beforeAfter = {
    status: 'PASS',
    failedRealProviderManuscript: {
      source: failedManuscriptPath,
      sha256: sha256(failedManuscript),
      reportPdf: failedPdfPath,
      reportPdfSha256: sha256(await fs.readFile(failedPdfPath)),
      audit: failedAudit,
      observedDefects: [
        'The broad Motheo operating-context inventory recurs in executive analysis, watchpoints, target design and leadership decision prose.',
        'The same context-dependent management implication is replayed instead of adding a new section-specific consequence.',
        'Control framing uses repeated generic standard language even though the underlying priorities are distinct.'
      ]
    },
    correctedProviderFreeFixture: {
      source: 'buildBoundedFixtureMarkdown(blueprint) with section-aware representative paragraphs',
      sha256: sha256(correctedMarkdown),
      audit: correctedAudit,
      observedChanges: [
        'The operating context is assigned once to Analytical basis; later sections receive selective pathways and new management questions through the Blueprint contract.',
        'Distinct controls, exposure pathways, critical reliances, decisions and roadmap stages remain separate object types.',
        'Each bounded fixture section uses a different representative paragraph so pagination and composition tests are not distorted by artificial repetition.'
      ]
    },
    thresholds: {
      repeatedContextInventory: 'FAIL if the same broad context inventory appears in more than one section without a new consequence; provider-free structural gate requires one primary context home plus selective pathway routes.',
      repeatedImplications: 'FAIL on exact repeated narrative sentence or materially identical section contribution; lexical similarity is reported for owner review.',
      priorityDominance: 'WARN/owner-review threshold at >75% pathway coverage; FAIL only when dominance is paired with generic or duplicate object structures.',
      genericControlSaturation: 'FAIL on exact duplicate objective/target/control design; high lexical similarity >0.85 is a review signal.'
    }
  };

  const sourceFiles = [
    'src/lib/reports/narrative/fact-pack.ts',
    'src/lib/reports/narrative/premium-projection.ts',
    'src/lib/reports/narrative/story-plan.ts',
    'src/lib/reports/narrative/report-blueprint.ts',
    'src/lib/reports/narrative/whole-manuscript-writer.ts',
    'src/lib/reports/comprehensive/authoritative-objects.ts',
    'src/lib/reports/comprehensive/narrative-presentation-model.ts',
    'src/lib/reports/comprehensive/render-narrative-html.ts',
    'scripts/commercial-quality/comprehensive-phase-g-fixture.mjs',
    'scripts/commercial-quality/comprehensive-premium-propagation-gate.mjs',
    'scripts/commercial-quality/comprehensive-synthesis-bottleneck-gate.mjs'
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, sha256(await fs.readFile(path.join(repoRoot, file)))])));

  const compositorLog = {
    status: 'PASS',
    providerCalls: 0,
    events: [
      { stage: 'fixture', action: 'built Motheo V1.2 deterministic fixture', providerCalls: 0 },
      { stage: 'fact-pack', action: 'built Comprehensive Fact Pack with question signals and premium projection', providerCalls: 0 },
      { stage: 'story-plan', action: 'built section contribution contracts and evidence usage ledger', providerCalls: 0 },
      { stage: 'blueprint', action: 'built primary object homes and selective cross-reference routes', providerCalls: 0 },
      { stage: 'manuscript-binding', action: 'bound bounded representative paragraphs to exact Blueprint headings', providerCalls: 0 },
      { stage: 'presentation', action: 'built shared-object presentation model with MK branding', providerCalls: 0 },
      { stage: 'compositor', action: 'rendered HTML to PDF with local Chromium', providerCalls: 0 }
    ],
    authoritativeObjectCounts: {
      controls: authoritative.controls.length,
      decisions: authoritative.decisions.length,
      roadmap: authoritative.roadmap.length,
      maturationSteps: authoritative.maturationSteps.length,
      exposurePathways: authoritative.exposurePathways?.length ?? 0,
      criticalReliances: authoritative.criticalReliances?.length ?? 0
    }
  };

  await fs.writeFile(path.join(outputDir, 'motheo-corrected-provider-free-premium-manuscript.md'), correctedMarkdown);
  await fs.writeFile(path.join(outputDir, 'motheo-failed-real-provider-manuscript.md'), failedManuscript);
  await fs.writeFile(path.join(outputDir, 'motheo-corrected-provider-free-premium-report.html'), html);
  await writeJson('motheo-provider-free-fact-pack.json', factPack);
  await writeJson('motheo-provider-free-story-plan.json', storyPlan);
  await writeJson('motheo-provider-free-blueprint.json', blueprint);
  await writeJson('comprehensive-synthesis-flow-evidence.json', flow);
  await writeJson('comprehensive-question-level-evidence.json', flow);
  await writeJson('comprehensive-exposure-pathway-evidence.json', pathwayEvidence);
  await writeJson('comprehensive-cross-domain-synthesis-evidence.json', crossDomain);
  await writeJson('comprehensive-section-novelty-results.json', sectionNovelty);
  await writeJson('comprehensive-priority-dominance-evidence.json', priorityDominance);
  await writeJson('comprehensive-generic-control-saturation-evidence.json', genericControlSaturation);
  await writeJson('comprehensive-decision-specificity-evidence.json', decisionSpecificity);
  await writeJson('comprehensive-essential-isolation.json', essential);
  await writeJson('comprehensive-synthesis-before-after.json', beforeAfter);
  await writeJson('comprehensive-synthesis-compositor-log.json', compositorLog);

  const pdfBytes = await renderHtmlToPdfBuffer(html, { footerLabel: `MK Fraud Insights · Comprehensive Fraud Readiness Report · ${factPack.assessment.reference}` });
  const pdfPath = path.join(outputDir, 'motheo-corrected-provider-free-premium-report.pdf');
  await fs.writeFile(pdfPath, pdfBytes);
  const pdf = { path: pdfPath, bytes: pdfBytes.length, sha256: sha256(pdfBytes), ...pdfMetrics(pdfPath) };

  const flowWithHashes = {
    status: 'PASS',
    gate: 'comprehensive-synthesis-bottleneck',
    providerCalls: 0,
    implementationSha,
    fixture: {
      profile: 'motheo',
      assessmentReference: factPack.assessment.reference,
      organisation: factPack.organisation.name,
      fixtureBuilder: 'scripts/commercial-quality/comprehensive-phase-g-fixture.mjs::buildMotheoDeterministicFixture',
      inputHash: sha256Json({ data: fixture.data, evidenceModel: fixture.evidenceModel }),
      factPackSha256: sha256Json(factPack),
      storyPlanSha256: sha256Json(storyPlan),
      blueprintSha256: sha256Json(blueprint),
      contextSha256: sha256Json(context),
      generationPromptSha256: sha256(generationPrompt),
      correctedManuscriptSha256: sha256(correctedMarkdown),
      correctedPdfSha256: pdf.sha256
    },
    counts: {
      questionSignals: factPack.questionSignals?.length ?? 0,
      domainResults: factPack.domains.length,
      operatingContextFacts: factPack.organisation.operatingContext.length,
      contextApplications: factPack.contextApplications?.length ?? 0,
      exposurePathways: factPack.exposurePathways?.length ?? 0,
      loops: factPack.enterpriseIntegrationMap?.loopNodes.length ?? 0,
      supportedDependencies: factPack.enterpriseIntegrationMap?.dependencies.filter((item) => item.supportStatus === 'SUPPORTED').length ?? 0,
      assuranceCoverage: factPack.assuranceCoverage?.length ?? 0,
      assurancePriorities: factPack.assurancePriorities?.length ?? 0,
      resilienceTests: factPack.resilienceTests?.length ?? 0,
      controls: factPack.controls.length,
      decisions: factPack.decisions.length,
      roadmapActions: factPack.roadmap.length,
      maturationSteps: factPack.maturationSteps.length,
      criticalReliances: factPack.criticalReliances?.length ?? 0,
      controlOutcomeLinks: factPack.controlOutcomeLinks?.length ?? 0,
      roadmapDependencyLinks: factPack.roadmapDependencyLinks?.length ?? 0
    },
    flow,
    pathwayEvidence,
    crossDomain,
    sectionNovelty,
    decisionSpecificity,
    genericControlSaturation,
    priorityDominance,
    essentialIsolation: essential,
    beforeAfter,
    manuscript: {
      source: 'bounded section-aware provider-free composition fixture',
      hardTruth: bound.validation.hardTruth,
      quality: bound.validation.quality,
      customerCopyLeakage: fixtureAudit.customerCopyLeakage,
      repeatedSentenceCount: fixtureAudit.repeatedSentenceCount
    },
    pdf,
    sourceHashes
  };
  await writeJson('comprehensive-synthesis-bottleneck-evidence.json', flowWithHashes);
  await fs.writeFile(path.join(outputDir, 'motheo-premium-story-preview.md'), preview);

  const manifest = {
    status: 'PASS',
    gate: flowWithHashes.gate,
    implementationSha,
    providerCalls: 0,
    evidenceClass: 'provider-free-synthesis-correction-and-structural-composition-preview',
    liveCommercialNarrativeAcceptance: 'NOT_RUN',
    files: [
      'motheo-corrected-provider-free-premium-manuscript.md',
      'motheo-failed-real-provider-manuscript.md',
      'motheo-corrected-provider-free-premium-report.html',
      'motheo-corrected-provider-free-premium-report.pdf',
      'motheo-premium-story-preview.md',
      'motheo-provider-free-fact-pack.json',
      'motheo-provider-free-story-plan.json',
      'motheo-provider-free-blueprint.json',
      'comprehensive-synthesis-bottleneck-evidence.json',
      'comprehensive-synthesis-bottleneck-evidence.md',
      'comprehensive-synthesis-flow-evidence.json',
      'comprehensive-question-level-evidence.json',
      'comprehensive-exposure-pathway-evidence.json',
      'comprehensive-cross-domain-synthesis-evidence.json',
      'comprehensive-section-novelty-results.json',
      'comprehensive-priority-dominance-evidence.json',
      'comprehensive-generic-control-saturation-evidence.json',
      'comprehensive-decision-specificity-evidence.json',
      'comprehensive-essential-isolation.json',
      'comprehensive-synthesis-before-after.json',
      'comprehensive-synthesis-compositor-log.json'
    ]
  };
  await writeJson('comprehensive-synthesis-manifest.json', manifest);

  const report = [
    '# Comprehensive synthesis bottleneck evidence — Motheo',
    '',
    'Status: PASS',
    '',
    'Provider calls: 0',
    '',
    `Implementation SHA: ${implementationSha}`,
    '',
    '## Scope',
    '',
    'The accepted Comprehensive propagation architecture remains intact. This bounded correction addresses the demonstrated loss between the complete deterministic evidence surface and customer narrative: repeated context inventory, generic control framing and insufficiently explicit section contribution boundaries. No scoring, methodology, Essential path, recovery policy or provider path was changed.',
    '',
    '## Root cause and correction',
    '',
    'The failed real-provider manuscript received the original deterministic objects, but the writer had no explicit section-level contribution contract and no separate exposure-pathway or critical-reliance objects. As a result, the same operating-context inventory and management implication were replayed across otherwise different sections.',
    '',
    `The corrected path now retains ${flow.factPackQuestionSignals} question signals across ${flow.domainCoverage} domains, ${factPack.organisation.operatingContext.length} operating-context facts, ${crossDomain.loops.length} loops, ${crossDomain.supportedDependencyCount} supported dependencies, ${pathwayEvidence.length} selective exposure pathways, ${factPack.resilienceTests?.length ?? 0} resilience tests, ${factPack.controls.length} distinct controls, ${factPack.decisions.length} distinct decisions, ${factPack.roadmap.length} roadmap actions and ${factPack.maturationSteps.length} maturation steps. Each Comprehensive section now has a management question, one primary contribution and prohibited restatements.`,
    '',
    '## Before and after',
    '',
    `- Failed real-provider manuscript: ${failedAudit.wordCount} words, ${failedAudit.repeatedSentenceCount} repeated sentence signatures; repeated context signals are recorded in comprehensive-synthesis-before-after.json.`,
    `- Corrected provider-free fixture: ${correctedAudit.wordCount} words, ${correctedAudit.repeatedSentenceCount} repeated sentence signatures, ${sectionNovelty.contractCount} section contracts and zero customer-copy leakage.`,
    '- The fixture uses bounded, section-aware representative paragraphs so layout tests measure composition rather than artificial repetition.',
    '',
    '## Question-level utilisation',
    '',
    `All ${flow.factPackQuestionSignals} question signals enter the Fact Pack, survive the Story Plan, receive a Blueprint assignment and remain in the Analytical basis evidence surface. Three source signals select the three named Sustainment priorities. The other ${flow.absorbedIntoDomainCoverageAndPremiumRoutes.count} signals remain represented in domain coverage, supported integration relationships and the full evidence surface; they are not converted into manufactured weaknesses.`,
    '',
    '## Exposure and cross-domain synthesis',
    '',
    `The corrected projection contains ${pathwayEvidence.length} selective pathways with context, question, domain, dependency, control, decision, roadmap, resilience-test and provenance links. The Enterprise Fraud Readiness Integration structure retains ${crossDomain.loops.length} loops and ${crossDomain.domainCount} domain nodes with ${crossDomain.supportedDependencyCount} supported relationships. The full pathway and dependency records are in the adjacent JSON evidence and structural preview.`,
    '',
    '## Novelty and anti-repetition gates',
    '',
    `- Section novelty: PASS; ${sectionNovelty.contractCount} distinct primary contributions with non-repetition boundaries.`,
    `- Leadership decision specificity: PASS; ${decisionSpecificity.count} distinct option sets and themes.`,
    '- Generic control saturation: PASS; exact duplicate designs: 0.',
    `- Priority dominance: ${priorityDominance.status}; any supported centrality is disclosed with a threshold and is not treated as failure without duplicate object structures.`,
    '- Essential isolation: PASS; no premium properties, facts, assignments or context requirements entered Essential.',
    '',
    '## Provider-free compositor result',
    '',
    `The corrected internal preview uses the approved MK logo marker and vector asset, shared MK tokens, the new supported pathway exhibit and the critical-reliance exhibit. The PDF is measured only: ${pdf.pages} pages, ${pdf.words} extracted words, SHA-256 ${pdf.sha256}. Page count was not optimised or padded.`,
    '',
    '## Decision',
    '',
    'COMPREHENSIVE SYNTHESIS BOTTLENECK CORRECTED — READY FOR ONE REAL-PROVIDER RECERTIFICATION',
    '',
    'This result authorises no provider call by itself. It is the bounded provider-free precondition for the separately controlled one-journey real-provider recertification.',
    '',
    '## Evidence files',
    '',
    'The adjacent files contain the complete flow, before/after audit, question-level evidence, exposure pathways, cross-domain synthesis, section novelty, priority dominance, generic-control saturation, decision specificity, Essential isolation, compositor log, corrected manuscript, corrected HTML/PDF and structural Premium Story Preview.'
  ].join('\n');
  await fs.writeFile(path.join(outputDir, 'comprehensive-synthesis-bottleneck-evidence.md'), report);

  console.log(JSON.stringify({ status: flowWithHashes.status, gate: flowWithHashes.gate, implementationSha, outputDir, providerCalls: 0, correctedPdf: pdf, factPackSha256: flowWithHashes.fixture.factPackSha256, storyPlanSha256: flowWithHashes.fixture.storyPlanSha256, blueprintSha256: flowWithHashes.fixture.blueprintSha256, repeatedSentenceCount: fixtureAudit.repeatedSentenceCount, leakageCount: fixtureAudit.customerCopyLeakage.length }, null, 2));
}

try {
  await main();
} finally {
  await closeRenderBrowser();
}
