#!/usr/bin/env node
/**
 * Provider-free PDF ↔ XLSX reconciliation for the current Comprehensive path.
 *
 * Motheo is the cross-artifact acceptance case. Bokamoso is checked for the
 * same customer-workbook hygiene and formula/rendering boundary, but remains
 * a provider-free structural composition fixture rather than commercial
 * narrative acceptance.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import { buildV12ProfileAssembled } from '../../src/lib/qa/comprehensive-v12-quality-profiles.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildAuthoritativeComprehensiveObjects } from '../../src/lib/reports/comprehensive/authoritative-objects.ts';
import { CUSTOMER_COPY_LEAKAGE_CHECKS, CUSTOMER_WORKBOOK_COPY_LEAKAGE_CHECKS, findCustomerWorkbookCopyLeakage } from '../../src/lib/reports/narrative/blueprint-text.ts';

const moduleRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
const { FileBlob, SpreadsheetFile } = requireFromBundle('@oai/artifact-tool');

const outputDir = path.resolve(process.env.CURRENT_COMPREHENSIVE_OUTPUT_DIR ?? path.join(process.cwd(), 'outputs', 'comprehensive-current-path'));
const acceptancePath = path.join(outputDir, 'comprehensive-current-path-acceptance.json');
const sheetNames = ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Blueprints', 'Implementation Blueprint', 'Management Decisions', 'Question Traceability'];

function analyticalFor(data, evidenceModel) {
  return {
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
  };
}

function deliveryFor(profileKey) {
  const { data } = buildV12ProfileAssembled(profileKey);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const delivery = buildComprehensiveDeliveryModel(analyticalFor(data, evidenceModel));
  assertComprehensiveBlueprintContract(delivery);
  const factPack = buildComprehensiveNarrativeFactPack(delivery);
  assertNarrativeFactPack(factPack);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  assertReportBlueprint(blueprint, factPack);
  return { data, factPack, blueprint, authoritative: buildAuthoritativeComprehensiveObjects(factPack, blueprint) };
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function key(value) {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normaliseText(value) {
  return cellText(value)
    .replace(/-\s*\r?\n\s*/g, '')
    .replace(/\u00ad/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function containsText(haystack, needle) {
  return normaliseText(haystack).includes(normaliseText(needle));
}

function assertContainsText(haystack, needle, message) {
  assert.ok(containsText(haystack, needle), `${message}: ${JSON.stringify(needle)}`);
}

const semanticStopWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'use', 'with']);

function semanticTokens(value) {
  return normaliseText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 5 && !semanticStopWords.has(token))
    .slice(0, 2);
}

function assertSemanticPresence(haystack, value, message) {
  const tokens = semanticTokens(value);
  assert.ok(tokens.length >= 2, `${message}: insufficient semantic tokens`);
  for (const token of tokens) assertContainsText(haystack, token, `${message} token missing`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256Json(value) {
  return sha256(Buffer.from(JSON.stringify(value)));
}

function sheetData(workbook, name) {
  const sheet = workbook.worksheets.getItem(name);
  const usedRange = sheet.getUsedRange();
  const values = usedRange?.values ?? [];
  const headers = (values[0] ?? []).map(key);
  const rows = values.slice(1).filter((row) => row.some((value) => cellText(value).trim() !== ''));
  const records = rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
  return { sheet, usedRange, values, headers, rows, records };
}

function summaryValue(summary, field) {
  return summary.rows.find((row) => key(row[0]) === key(field))?.[1] ?? null;
}

function recordById(rows, sourceId) {
  return rows.find((row) => cellText(row.technicalid ?? row.id).trim() === sourceId);
}

function decisionSimilarityWords(value) {
  return new Set(normaliseText(value).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => word.length > 2));
}

function decisionSimilarity(left, right) {
  const a = decisionSimilarityWords(JSON.stringify(left));
  const b = decisionSimilarityWords(JSON.stringify(right));
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? Number((intersection / union).toFixed(4)) : 1;
}

function decisionStructure(decision) {
  return {
    question: decision.question,
    options: decision.options.map((option) => ({ option: option.option, cost: option.cost, benefit: option.benefit, tradeOff: option.tradeOff })),
    recommendedRoute: decision.recommendedRoute,
    rationale: decision.rationale,
    owner: decision.owner,
    targetDate: decision.targetDate,
    consequenceOfDelay: decision.consequenceOfDelay
  };
}

function assertDecisionSpecificity(decisions) {
  const structures = decisions.map(decisionStructure);
  const fingerprints = structures.map(sha256Json);
  assert.equal(new Set(fingerprints).size, decisions.length, 'Motheo decision objects must be unique.');
  const comparisons = [];
  let maxPairwiseSimilarity = 0;
  for (let left = 0; left < decisions.length; left += 1) {
    for (let right = left + 1; right < decisions.length; right += 1) {
      const similarity = decisionSimilarity(structures[left], structures[right]);
      maxPairwiseSimilarity = Math.max(maxPairwiseSimilarity, similarity);
      comparisons.push({ left: decisions[left].factRef, right: decisions[right].factRef, similarity });
      assert.ok(similarity < 0.9, `Motheo decisions ${decisions[left].factRef} and ${decisions[right].factRef} are materially duplicated (${similarity}).`);
    }
  }
  return { count: decisions.length, exactUnique: true, fingerprints, maxPairwiseSimilarity, comparisons };
}

async function inspectWorkbook(profileKey, workbookPath, workbookQa) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
  const sheets = Object.fromEntries(sheetNames.map((name) => [name, sheetData(workbook, name)]));
  const allText = JSON.stringify(Object.fromEntries(sheetNames.map((name) => [name, sheets[name].values])));
  const leakage = findCustomerWorkbookCopyLeakage(allText);
  assert.deepEqual(leakage, [], `${profileKey}: customer-workbook copy leakage found.`);
  assert.deepEqual(new Set(workbookQa.renderedSheets), new Set(sheetNames), `${profileKey}: not all workbook sheets were rendered for review.`);

  const formulaScan = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 300 }, summary: `${profileKey} workbook formula error scan` });
  assert.match(formulaScan.ndjson ?? String(formulaScan), /matched 0 entries|no matches|0 entries/i, `${profileKey}: formula error scan did not pass.`);

  const summary = sheets.Summary;
  const generatedRowIndex = summary.rows.findIndex((row) => key(row[0]) === 'generated');
  assert.ok(generatedRowIndex >= 0, `${profileKey}: Summary.Generated row missing.`);
  const generatedExcelRow = generatedRowIndex + 2;
  const generatedStyle = await workbook.inspect({ kind: 'computedStyle', sheetId: summary.sheet.id, range: `B${generatedExcelRow}`, maxChars: 3000 });
  assert.match(generatedStyle.ndjson ?? String(generatedStyle), /"numberFormat":"yyyy-mm-dd hh:mm"/, `${profileKey}: Generated must use a real date/time number format.`);

  const requiredTokens = ['#01123A', '#1F6B4A', '#C9A227'];
  for (const token of requiredTokens) assert.match(allText, new RegExp(token.replace('#', '#')), `${profileKey}: MK design token ${token} is missing from workbook output.`);

  for (const name of sheetNames) {
    const previewPath = path.join(workbookQa.previewDir, `${name.toLowerCase().replaceAll(' ', '-')}.png`);
    await fs.access(previewPath);
  }

  return {
    workbook,
    sheets,
    allText,
    leakage,
    formulaScan: formulaScan.ndjson ?? formulaScan,
    generated: { excelRow: generatedExcelRow, numberFormat: 'yyyy-mm-dd hh:mm' },
    renderedSheets: workbookQa.renderedSheets
  };
}

async function runMotheoReconciliation(profile, evidence, inspected) {
  const { factPack, blueprint, authoritative } = profile;
  const pdfText = execFileSync('pdftotext', ['-layout', evidence.pdfPath, '-'], { encoding: 'utf8' });
  const summary = inspected.sheets.Summary;
  assert.equal(Number(summaryValue(summary, 'Readiness score')), factPack.assessment.score, 'PDF/XLSX readiness score mismatch.');
  assert.equal(cellText(summaryValue(summary, 'Final maturity')), factPack.assessment.maturity, 'PDF/XLSX maturity mismatch.');
  assert.equal(cellText(summaryValue(summary, 'Product mode')), factPack.narrativeMode, 'PDF/XLSX mode mismatch.');
  assertContainsText(pdfText, String(factPack.assessment.score), 'PDF readiness score missing');
  assertContainsText(pdfText, factPack.assessment.maturity, 'PDF final maturity missing');
  assertContainsText(pdfText, 'Sustainment', 'PDF Sustainment mode missing');

  assert.equal(factPack.findings.length, 0, 'Motheo must have zero customer findings.');
  assert.equal(factPack.risks.length, 0, 'Motheo must have zero customer risks.');
  assert.equal(inspected.sheets['Material Findings'].records.length, 0, 'Motheo workbook must have zero Material Findings rows.');
  assert.equal(inspected.sheets['Risk Register'].records.length, 0, 'Motheo workbook must have zero Risk Register rows.');
  assert.doesNotMatch(inspected.sheets['Question Traceability'].headers.join(' '), /linkedfindingids|linkedriskids/i, 'Motheo traceability must not expose finding/risk ID columns.');
  assert.doesNotMatch(inspected.allText, /(?:finding id:|risk id:|\b(?:MF-[A-Z0-9]+(?:-[A-Z0-9]+)+|RISK-(?:GOVERNANCE|CONTROL|DIGITAL|EVIDENCE|INCIDENT|REPORTING|SUPPLIER|DETECTION)(?:-[A-Z0-9]+)*))\b/, 'Motheo customer workbook exposes an orphan finding/risk reference.');
  assert.equal(inspected.sheets['Question Traceability'].records.length, 68, 'Motheo must retain all 68 traceability rows.');

  const controlRows = inspected.sheets['Control Blueprints'].records;
  for (const control of authoritative.controls) {
    const row = recordById(controlRows, control.sourceId);
    assert.ok(row, `Motheo workbook is missing control ${control.sourceId}.`);
    for (const [field, expected] of [['currentstate', control.currentState], ['targetstate', control.targetState], ['controlobjective', control.objective], ['accountableexecutive', control.accountableExecutive], ['processowner', control.processOwner], ['operatingfrequency', control.frequency], ['effectivenessmeasure', control.effectivenessMeasure]]) {
      assertContainsText(row[field], expected, `Motheo workbook control ${control.sourceId} ${field} mismatch`);
    }
    for (const [field, expected] of [['control objective', control.objective], ['accountable owner', control.accountableExecutive], ['process owner', control.processOwner], ['operating frequency', control.frequency], ['effectiveness measure', control.effectivenessMeasure]]) {
      assertContainsText(pdfText, expected, `Motheo PDF control ${control.sourceId} ${field} missing`);
    }
  }

  const decisionRows = inspected.sheets['Management Decisions'].records;
  const decisionProof = assertDecisionSpecificity(authoritative.decisions);
  for (const decision of authoritative.decisions) {
    const row = recordById(decisionRows, decision.sourceId);
    assert.ok(row, `Motheo workbook is missing decision ${decision.sourceId}.`);
    assertContainsText(row.decisionrequired, decision.question, `Motheo workbook decision ${decision.sourceId} question mismatch`);
    assertContainsText(row.recommendedroute, decision.recommendedRoute, `Motheo workbook decision ${decision.sourceId} recommended route mismatch`);
    assertContainsText(row.recommendationrationale, decision.rationale, `Motheo workbook decision ${decision.sourceId} rationale mismatch`);
    assertContainsText(row.accountableowner, decision.owner, `Motheo workbook decision ${decision.sourceId} owner mismatch`);
    assert.ok(containsText(row.targetperiod, decision.targetDate) || containsText(row.targetdate, decision.targetDate), `Motheo workbook decision ${decision.sourceId} timing mismatch.`);
    assertContainsText(row.consequenceofdelay, decision.consequenceOfDelay, `Motheo workbook decision ${decision.sourceId} consequence mismatch`);
    assertContainsText(pdfText, decision.question, `Motheo PDF decision ${decision.sourceId} question missing`);
    assertContainsText(pdfText, decision.recommendedRoute, `Motheo PDF decision ${decision.sourceId} recommended route missing`);
    assertContainsText(pdfText, decision.rationale, `Motheo PDF decision ${decision.sourceId} rationale missing`);
    assertContainsText(pdfText, decision.owner, `Motheo PDF decision ${decision.sourceId} owner missing`);
    assertContainsText(pdfText, decision.targetDate, `Motheo PDF decision ${decision.sourceId} timing missing`);
    assertContainsText(pdfText, decision.consequenceOfDelay, `Motheo PDF decision ${decision.sourceId} consequence missing`);
    for (const option of decision.options) {
      assertContainsText(row.viableoptions, option.option, `Motheo workbook decision ${decision.sourceId} option missing`);
      assertContainsText(row.optionanalysis, option.cost, `Motheo workbook decision ${decision.sourceId} option cost missing`);
      assertContainsText(row.optionanalysis, option.benefit, `Motheo workbook decision ${decision.sourceId} option benefit missing`);
      assertContainsText(row.optionanalysis, option.tradeOff, `Motheo workbook decision ${decision.sourceId} option trade-off missing`);
      assertSemanticPresence(pdfText, option.option, `Motheo PDF decision ${decision.sourceId} option`);
      assertSemanticPresence(pdfText, option.benefit, `Motheo PDF decision ${decision.sourceId} option benefit`);
      assertSemanticPresence(pdfText, option.tradeOff, `Motheo PDF decision ${decision.sourceId} option trade-off`);
    }
  }

  const implementationRows = inspected.sheets['Implementation Blueprint'].records;
  const stageSet = new Set(implementationRows.map((row) => cellText(row.blueprintstage).trim()).filter(Boolean));
  const expectedStages = blueprint.transformationSequence.map((stage) => stage.stage);
  for (const stage of expectedStages) {
    assert.ok(stageSet.has(stage), `Motheo Implementation Blueprint is missing ${stage}.`);
    assertContainsText(pdfText, stage, `Motheo PDF transformation stage ${stage} missing`);
  }
  assert.ok(implementationRows.some((row) => cellText(row.blueprintstage) === 'PRESERVE' && cellText(row.period) === '30 days'), 'Motheo first-30-days Preserve record missing.');
  assert.ok(implementationRows.some((row) => cellText(row.blueprintstage) === 'MEASURE' && ['60 days', '90 days'].includes(cellText(row.period))), 'Motheo days-31-90 Measure records missing.');
  assert.ok(implementationRows.some((row) => cellText(row.blueprintstage) === 'EMBED' && cellText(row.period) === '4-6 months'), 'Motheo 4-6 month Embed records missing.');
  assert.ok(implementationRows.some((row) => cellText(row.blueprintstage) === 'OPTIMISE' && cellText(row.period) === '7-12 months'), 'Motheo 7-12 month Optimise records missing.');
  const maturationRows = implementationRows.filter((row) => key(row.recordtype) === 'maturationstep');
  assert.equal(maturationRows.length, factPack.maturationSteps.length, 'Motheo maturation/optimisation records must match the authorised maturation objects.');
  for (const item of authoritative.maturationSteps) {
    const row = recordById(maturationRows, item.maturationRef);
    assert.ok(row, `Motheo workbook is missing maturation step ${item.maturationRef}.`);
    assert.equal(cellText(row.period), item.phaseWindow, `Motheo maturation step ${item.maturationRef} timing mismatch.`);
    assertContainsText(row.requirementordeliverable, item.priorityActivity, `Motheo maturation step ${item.maturationRef} activity mismatch`);
    assertContainsText(row.successmeasure, item.successMeasure, `Motheo maturation step ${item.maturationRef} measure mismatch`);
    assertContainsText(row.prooforcompletion, item.proofOfProgress, `Motheo maturation step ${item.maturationRef} proof mismatch`);
  }

  return {
    scoreMaturityMode: 'PASS',
    controls: { count: authoritative.controls.length, reconciled: authoritative.controls.length },
    decisions: decisionProof,
    implementation: { stages: expectedStages, stageSet: [...stageSet].sort(), maturationSteps: maturationRows.length, roadmapWindows: [...new Set(implementationRows.map((row) => cellText(row.period).trim()).filter(Boolean))].sort() },
    sustainmentBoundary: { pdfFindings: factPack.findings.length, pdfRisks: factPack.risks.length, workbookFindings: inspected.sheets['Material Findings'].records.length, workbookRisks: inspected.sheets['Risk Register'].records.length, traceabilityRows: inspected.sheets['Question Traceability'].records.length, orphanFindingRiskReferences: false }
  };
}

const acceptance = JSON.parse(await fs.readFile(acceptancePath, 'utf8'));
assert.equal(acceptance.status, 'PASS', 'Current-path acceptance must be PASS before workbook reconciliation.');
assert.equal(acceptance.providerCalls, 0, 'Workbook reconciliation must remain provider-free.');
assert.equal(acceptance.databaseWrites, 0, 'Workbook reconciliation must remain write-free.');

const profiles = {};
for (const [keyName, evidenceClass] of [['motheo', 'preserved-terra-manuscript-structural-replay'], ['bokamoso', 'provider-free-structural-composition-fixture']]) {
  const acceptanceEvidence = acceptance.outputs.find((item) => item.profile === keyName);
  assert.ok(acceptanceEvidence, `${keyName}: acceptance evidence missing.`);
  const workbookQa = JSON.parse(await fs.readFile(path.join(outputDir, `MK-Comprehensive-${keyName}-workbook-qa.json`), 'utf8'));
  assert.equal(workbookQa.status, 'PASS', `${keyName}: workbook QA must pass.`);
  assert.equal(workbookQa.providerCalls, 0, `${keyName}: workbook QA must remain provider-free.`);
  const inspected = await inspectWorkbook(keyName, workbookQa.workbook.path, workbookQa);
  const profile = deliveryFor(keyName);
  const result = {
    profile: keyName,
    evidenceClass,
    liveCommercialNarrativeAcceptance: keyName === 'motheo' ? 'NOT_RUN' : 'NOT_EVALUATED',
    pdf: { path: acceptanceEvidence.pdfPath, sha256: sha256(await fs.readFile(acceptanceEvidence.pdfPath)) },
    workbook: { path: workbookQa.workbook.path, sha256: sha256(await fs.readFile(workbookQa.workbook.path)), bytes: (await fs.stat(workbookQa.workbook.path)).size },
    workbookHygiene: { customerCopyLeakage: inspected.leakage, formulaErrorScan: inspected.formulaScan, generated: inspected.generated, renderedSheets: inspected.renderedSheets },
    sharedObjectHashes: { factPack: sha256Json(profile.factPack), blueprint: sha256Json(profile.blueprint) }
  };
  if (keyName === 'motheo') result.motheoCrossArtifact = await runMotheoReconciliation(profile, acceptanceEvidence, inspected);
  profiles[keyName] = result;
}

const summary = {
  status: 'PASS',
  gate: 'comprehensive-current-workbook-reconciliation',
  providerCalls: 0,
  databaseWrites: 0,
  acceptance: {
    providerFreeStructuralAcceptance: 'PASS',
    providerFreeCrossArtifactRegression: 'PASS',
    liveCommercialNarrativeAcceptance: 'NOT_RUN',
    commercialValue: 'NOT_CLAIMED',
    bokamosoEvidenceClass: 'provider-free-structural-composition-fixture-only'
  },
  checks: [
    'PDF score, maturity and mode equal Motheo XLSX Summary.',
    'PDF control objectives, owners, frequencies and effectiveness measures reconcile to Motheo XLSX Control Blueprints.',
    'PDF leadership decision questions, routes, options, trade-offs, owners, timing and delay consequences reconcile to Motheo XLSX Management Decisions.',
    'PDF twelve-month stages and authorised maturation steps are represented in Motheo XLSX Implementation Blueprint.',
    'Motheo has zero customer findings and zero customer risks in both artifacts.',
    'Motheo exposes no orphan technical finding/risk references in the customer workbook.',
    'Motheo retains exactly 68 Question Traceability rows.',
    'Both workbooks have no formula errors, pass customer-copy leakage checks and have all sheets rendered for visual review.'
  ],
  customerCopyLeakageChecks: [...CUSTOMER_COPY_LEAKAGE_CHECKS, ...CUSTOMER_WORKBOOK_COPY_LEAKAGE_CHECKS].map(({ id, pattern, description }) => ({ id, expression: pattern.toString(), description })),
  profiles,
  evidenceSha256: sha256Json(profiles)
};
await fs.writeFile(path.join(outputDir, 'comprehensive-current-workbook-reconciliation.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
