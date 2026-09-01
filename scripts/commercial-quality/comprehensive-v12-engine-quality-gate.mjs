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

for (const profileKey of Object.keys(profiles)) {
  const { data, score, path: resolvedPath, profile } = buildV12ProfileAssembled(profileKey);

  if (data.packageName !== 'Comprehensive') fail(profileKey, 'PRODUCT_IDENTITY', `packageName=${data.packageName}`);
  if (data.productCode !== 'mk_validated_assessment') fail(profileKey, 'PRODUCT_IDENTITY', `productCode=${data.productCode}`);
  if (data.amountCents !== 3500000 || data.productPriceCents !== 3500000) {
    fail(profileKey, 'PRODUCT_IDENTITY', `price snapshot ${data.amountCents}/${data.productPriceCents}`);
  }
  if (data.scoreRun.overallScore !== score.summary.overallScore) fail(profileKey, 'SCORE_PARITY', 'assembled score differs from V1.2 scorer');
  if (data.scoreRun.finalMaturity !== score.summary.finalMaturity) fail(profileKey, 'MATURITY_PARITY', 'assembled maturity differs from V1.2 scorer');
  if (data.domainResults.length !== 10) fail(profileKey, 'DOMAIN_COVERAGE', `${data.domainResults.length} domains rendered into assembled truth`);

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

  const html = renderComprehensiveManagementReportHtml({
    model,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band }))
  });
  const plain = textOf(html);

  if (!plain.includes('MK Fraud Readiness Comprehensive')) fail(profileKey, 'TIER_LABEL', 'Comprehensive title missing');
  if (plain.includes('MK Fraud Readiness Essential')) fail(profileKey, 'TIER_LABEL', 'Essential title leaked into Comprehensive output');
  if (!plain.includes('has not been independently reviewed')) fail(profileKey, 'ASSURANCE_BOUNDARY', 'independent-review limitation missing');
  if (!plain.includes('No evidence has been examined')) fail(profileKey, 'ASSURANCE_BOUNDARY', 'evidence limitation missing');
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
