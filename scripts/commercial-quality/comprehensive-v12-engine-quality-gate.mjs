#!/usr/bin/env node
/**
 * V1.2 Comprehensive engine quality gate.
 *
 * Purpose: prove that the current V1.2 adaptive assessment truth can feed the
 * owner-frozen Comprehensive v1.1 analytical/report pipeline without any
 * database, Vercel deployment, Production mutation or provider call.
 *
 * This is deliberately an engine-level gate. It preserves the frozen
 * Comprehensive product architecture and asks whether current assessment truth
 * still produces distinct, internally coherent, customer-safe management models
 * and deterministic report surfaces.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  profiles,
  buildV12ProfileAssembled,
  COMPREHENSIVE_V12_QUALITY_SOURCE_SHA,
  COMPREHENSIVE_V12_QUALITY_GRAPH
} from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts
} from '../../src/lib/reports/comprehensive/customer-visible-adaptation.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';
import { claimsVerification } from '../../src/lib/reports/comprehensive/product-contract.ts';
import { getQuestionPlaybook, listQuestionPlaybooks } from '../../src/lib/reports/evidence-model/question-playbooks.ts';
import { comprehensiveAssessmentScopeFromData } from '../../src/lib/reports/comprehensive/assessment-scope.ts';
import { buildInterpretationBrief } from '../../src/lib/reports/comprehensive/interpretation.ts';

const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/comprehensive-v12-engine-quality';
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const rows = [];

function fail(profile, code, detail) {
  failures.push({ profile, code, detail });
}

function textOf(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function hashObject(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function htmlEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

for (const profileKey of Object.keys(profiles)) {
  const { data, score, path: resolvedPath, profile, graph } = buildV12ProfileAssembled(profileKey);

  if (data.packageName !== 'Comprehensive') fail(profileKey, 'PRODUCT_IDENTITY', `packageName=${data.packageName}`);
  if (data.productCode !== 'mk_validated_assessment') fail(profileKey, 'PRODUCT_IDENTITY', `productCode=${data.productCode}`);
  if (data.amountCents !== 3500000 || data.productPriceCents !== 3500000) {
    fail(profileKey, 'PRODUCT_IDENTITY', `price snapshot ${data.amountCents}/${data.productPriceCents}`);
  }
  if (data.scoreRun.overallScore !== score.summary.overallScore) fail(profileKey, 'SCORE_PARITY', 'assembled score differs from V1.2 scorer');
  if (data.scoreRun.finalMaturity !== score.summary.finalMaturity) fail(profileKey, 'MATURITY_PARITY', 'assembled maturity differs from V1.2 scorer');
  if (data.domainResults.length !== 10) fail(profileKey, 'DOMAIN_COVERAGE', `${data.domainResults.length} domains rendered into assembled truth`);

  const methodologyIdentity = data.scoreRun;
  const activeQuestionCodes = graph.questions.map((question) => question.questionCode);
  const registry = listQuestionPlaybooks(methodologyIdentity);
  if (registry.length !== 68) fail(profileKey, 'PLAYBOOK_REGISTRY_COVERAGE', `${registry.length}/68 V1.2 playbooks resolved`);
  const missingPlaybooks = activeQuestionCodes.filter((questionCode) => !getQuestionPlaybook(questionCode, methodologyIdentity));
  if (missingPlaybooks.length) fail(profileKey, 'PLAYBOOK_REGISTRY_COVERAGE', `missing: ${missingPlaybooks.join(', ')}`);

  const assessmentScope = comprehensiveAssessmentScopeFromData(data);
  const evidence = buildAdvisoryEvidenceModel(data);
  const customerEvidence = adaptComprehensiveEvidenceModel(evidence);
  const projection = buildEssentialProjection(data, customerEvidence);
  const pack = buildEssentialNarrativeFactPack(data, customerEvidence, projection);

  if (typeof pack.assessment.score !== 'number' || !pack.assessment.maturity) {
    fail(profileKey, 'FACT_PACK', 'scored assessment did not survive into the Narrative Fact Pack');
    continue;
  }

  const domains = pack.domains
    .filter((domain) => typeof domain.score === 'number')
    .map((domain) => ({
      name: domain.name,
      score: domain.score,
      band: getMaturityBand(domain.score)
    }));

  if (domains.length !== 10) fail(profileKey, 'FACT_PACK_DOMAIN_COVERAGE', `${domains.length} scored domains in Fact Pack`);

  const model = buildComprehensiveManagementModel(
    assembleComprehensive(customerEvidence, {
      scenarioFacts: adaptComprehensiveScenarioFacts(pack.scenarios),
      domains
    })
  );

  const brief = buildInterpretationBrief({
    model,
    organisationName: pack.organisation.name,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    assessmentScope,
    domains
  });

  const html = renderComprehensiveManagementReportHtml({
    model,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    assessmentScope,
    domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band }))
  });
  const plain = textOf(html);

  if (!plain.includes('MK Fraud Readiness Comprehensive')) fail(profileKey, 'TIER_LABEL', 'Comprehensive title missing');
  if (plain.includes('MK Fraud Readiness Essential')) fail(profileKey, 'TIER_LABEL', 'Essential title leaked into Comprehensive output');
  if (!plain.includes('has not been independently reviewed')) fail(profileKey, 'ASSURANCE_BOUNDARY', 'independent-review limitation missing');
  if (!plain.includes('No evidence has been examined')) fail(profileKey, 'ASSURANCE_BOUNDARY', 'evidence limitation missing');

  if (!assessmentScope) {
    fail(profileKey, 'ADAPTIVE_SCOPE', 'V1.2 profile lost adaptive scope before Comprehensive generation');
  } else {
    if (assessmentScope.resultStatus !== score.resultStatus) {
      fail(profileKey, 'ADAPTIVE_SCOPE', `scope status ${assessmentScope.resultStatus} differs from scorer ${score.resultStatus}`);
    }
    if (brief.assessmentScope?.resultStatus !== score.resultStatus) {
      fail(profileKey, 'ADAPTIVE_SCOPE', 'interpretation brief lost adaptive result status');
    }
    if (brief.assessmentScope?.excludedCount !== score.metrics.excludedCount
      || brief.assessmentScope?.redirectedCount !== score.metrics.redirectedCount
      || brief.assessmentScope?.unknownCount !== score.metrics.unknownCount) {
      fail(profileKey, 'ADAPTIVE_SCOPE', 'interpretation brief scope counts differ from scorer');
    }
    if (score.resultStatus === 'PROVISIONAL' && !/provisional adaptive result/i.test(plain)) {
      fail(profileKey, 'ADAPTIVE_SCOPE_DISCLOSURE', 'provisional status is not visible in rendered report');
    }
    if (score.metrics.excludedCount > 0 && !plain.includes(`Excluded ${score.metrics.excludedCount}`)) {
      fail(profileKey, 'ADAPTIVE_SCOPE_DISCLOSURE', 'excluded count is not visible in assessed-position page');
    }
    if (score.metrics.redirectedCount > 0 && !plain.includes(`Oversight-routed ${score.metrics.redirectedCount}`)) {
      fail(profileKey, 'ADAPTIVE_SCOPE_DISCLOSURE', 'oversight-routed count is not visible in assessed-position page');
    }
    if (score.resultStatus !== 'INSUFFICIENT_VISIBILITY' && /did not provide enough visibility for a reliable scored result/i.test(plain)) {
      fail(profileKey, 'ADAPTIVE_SCOPE_DISCLOSURE', 'renderer falsely describes an issuable result as insufficient visibility');
    }
  }

  const verification = claimsVerification(plain);
  if (verification.violation) fail(profileKey, 'ASSURANCE_CLAIM', `forbidden verification claim: ${verification.matched}`);

  const engineLeakPatterns = [
    [/\bnarrativeMode\b/i, 'narrativeMode'],
    [/\b(?:SUSTAINMENT|REMEDIATION|MIXED) mode\b/i, 'internal narrative mode'],
    [/\bbounded section writer\b/i, 'bounded writer'],
    [/\bthe engine selected\b/i, 'engine wording'],
    [/\bgenerated interpretation\b/i, 'generation wording']
  ];
  for (const [pattern, label] of engineLeakPatterns) {
    if (pattern.test(plain)) fail(profileKey, 'ENGINE_VOCABULARY', label);
  }

  const registerCounts = {
    findings: model.registers.findings.length,
    risks: model.registers.risks.length,
    controls: model.registers.controls.length,
    evidence: model.registers.evidence.flatMap((group) => group.items).length,
    actions: model.registers.actions.length,
    measures: model.registers.measures.length
  };
  for (const [name, count] of Object.entries(registerCounts)) {
    if (count < 1) fail(profileKey, 'EMPTY_REGISTER', `${name}=0`);
  }

  const coreCounts = {
    managementThemes: model.core.managementThemes.length,
    exposureThemes: model.core.exposureThemes.length,
    controlProgrammes: model.core.controlProgrammes.length,
    governanceRoles: model.core.governanceRoles.length,
    decisionAgenda: model.core.decisionAgenda.length,
    implementationPhases: model.core.implementationPhases.length
  };
  for (const [name, count] of Object.entries(coreCounts)) {
    if (count < 1) fail(profileKey, 'EMPTY_CORE_MODULE', `${name}=0`);
  }

  // Every deterministic register row must reach its own appendix, not merely
  // occur somewhere in the document. This catches the historical class of
  // defect where a model object existed but the renderer omitted its section.
  const registerSections = html.split('<section class="reg">').slice(1);
  const sectionFor = (title) => registerSections.find((section) => section.includes(htmlEsc(title))) ?? '';
  const assertRowsRendered = (sectionTitle, values, identity, label) => {
    const section = sectionFor(sectionTitle);
    if (!section) {
      fail(profileKey, 'UNRENDERED_REGISTER_SECTION', `${label}: appendix section absent`);
      return;
    }
    const missing = values.filter((value) => !section.includes(htmlEsc(identity(value))));
    if (missing.length) {
      fail(profileKey, 'UNRENDERED_REGISTER_ROW', `${label}: ${missing.length} of ${values.length} absent (e.g. ${identity(missing[0])})`);
    }
  };
  assertRowsRendered('Finding register', model.registers.findings, (row) => row.findingId, 'finding register');
  assertRowsRendered('Fraud risk register', model.registers.risks, (row) => row.riskId, 'risk register');
  assertRowsRendered('Control blueprint register', model.registers.controls, (row) => row.controlId, 'control register');
  assertRowsRendered('Evidence requirement register', model.registers.evidence.flatMap((group) => group.items), (row) => row.artefact, 'evidence register');
  assertRowsRendered('12-month action and assurance register', model.registers.actions, (row) => row.deliverable, 'action register');
  assertRowsRendered('Measurement register', model.registers.measures, (row) => row.measure, 'measure register');

  const coreValues = {
    managementThemes: model.core.managementThemes.map((row) => row.title),
    exposureThemes: model.core.exposureThemes.map((row) => row.title),
    controlProgrammes: model.core.controlProgrammes.map((row) => row.title),
    governanceRoles: model.core.governanceRoles.map((row) => row.displayRole),
    decisionAgenda: model.core.decisionAgenda.map((row) => row.decisionRequired),
    implementationPhases: model.core.implementationPhases.map((row) => row.phase)
  };
  for (const [name, values] of Object.entries(coreValues)) {
    const missing = values.filter((value) => value && !html.includes(htmlEsc(value)));
    if (missing.length) fail(profileKey, 'UNRENDERED_CORE_MODULE', `${name}: ${missing.length} of ${values.length} absent`);
  }

  const fingerprintPayload = {
    mode: model.narrativeMode,
    themes: model.core.managementThemes.map((x) => x.title),
    exposureThemes: model.core.exposureThemes.map((x) => x.title),
    programmes: model.core.controlProgrammes.map((x) => x.title),
    decisions: model.core.decisionAgenda.map((x) => x.decisionRequired),
    findings: model.registers.findings.map((x) => x.finding ?? x.observation ?? x.findingId),
    risks: model.registers.risks.map((x) => x.risk ?? x.riskStatement ?? x.riskId),
    controls: model.registers.controls.map((x) => x.controlObjective ?? x.controlDesign ?? x.controlId)
  };
  const fingerprint = hashObject(fingerprintPayload);

  fs.writeFileSync(path.join(outDir, `${profileKey}.html`), html);
  fs.writeFileSync(path.join(outDir, `${profileKey}.model-summary.json`), JSON.stringify({
    profile: profileKey,
    organisation: profile.organisationName,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    resultStatus: score.resultStatus,
    assessmentScope,
    interpretationScope: brief.assessmentScope,
    activeNodes: resolvedPath.activeNodes.length,
    applicableQuestions: score.metrics.applicableCount,
    excludedQuestions: score.metrics.excludedCount,
    redirectedQuestions: score.metrics.redirectedCount,
    unknownQuestions: score.metrics.unknownCount,
    unansweredQuestions: score.metrics.unansweredApplicableCount,
    registerCounts,
    coreCounts,
    fingerprint
  }, null, 2) + '\n');

  rows.push({
    profile: profileKey,
    organisation: profile.organisationName,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    resultStatus: score.resultStatus,
    assessmentScope,
    interpretationScope: brief.assessmentScope,
    activeNodes: resolvedPath.activeNodes.length,
    applicableQuestions: score.metrics.applicableCount,
    excludedQuestions: score.metrics.excludedCount,
    redirectedQuestions: score.metrics.redirectedCount,
    unknownQuestions: score.metrics.unknownCount,
    unansweredQuestions: score.metrics.unansweredApplicableCount,
    registerCounts,
    coreCounts,
    fingerprint,
    htmlBytes: Buffer.byteLength(html)
  });
}

const uniqueFingerprints = new Set(rows.map((row) => row.fingerprint));
if (uniqueFingerprints.size !== rows.length) {
  fail('portfolio', 'CUSTOMER_DIFFERENTIATION', `${uniqueFingerprints.size} unique analytical fingerprints across ${rows.length} profiles`);
}

const maturitySet = new Set(rows.map((row) => row.maturity));
if (maturitySet.size < 2) {
  fail('portfolio', 'PROFILE_SPREAD', 'quality portfolio does not exercise at least two maturity positions');
}

const summary = {
  sourceSha: COMPREHENSIVE_V12_QUALITY_SOURCE_SHA,
  graph: COMPREHENSIVE_V12_QUALITY_GRAPH,
  providerCalls: 0,
  databaseReads: 0,
  productionMutations: 0,
  deploymentRequired: false,
  profiles: rows,
  failures
};

fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

if (failures.length) {
  console.error(`FAIL: ${failures.length} Comprehensive V1.2 engine-quality violation(s).`);
  process.exit(1);
}
console.log(`PASS: ${rows.length} V1.2 profiles reached the frozen Comprehensive management/report engine with distinct, customer-safe outputs and zero provider calls.`);
