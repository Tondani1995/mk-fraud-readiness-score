#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract, buildExecutivePresentationModel, renderBoardReadoutHtml, renderComprehensiveReportHtml, renderWorkshopMaterialHtml, COMPREHENSIVE_REPORT_SECTIONS } from '../../src/lib/reports/comprehensive/index.ts';
import { buildComprehensiveRegisterWorkbook } from '../../src/lib/reports/comprehensive/workbook-builder.ts';

const repo = path.resolve('.');
const read = async (file) => fs.readFile(path.join(repo, file), 'utf8');
const forbidden = /Named reviewer|Independent reviewer|Human review|Evidence validated|Supported for stated scope|Insufficient evidence|Not supported|Evidence reconciliation|Review notes in scope|Reviewer judgement|Reviewer sign-off/i;
const exactBasis = "This report provides strategic fraud-risk analysis and control design based on management's recorded Fraud Readiness assessment responses.";

const generationSource = await read('src/lib/comprehensive/generation-service.ts');
const commercialBuilder = await read('scripts/commercial-quality/build-kestrel-commercial-pack.mjs');
const presentationBuilder = await read('scripts/commercial-quality/build-executive-presentation.mjs');
assert.doesNotMatch(generationSource, /loadComprehensiveReviewerInput|fromAssembledReportData\([^)]*,|reviewerInput/);
assert.match(generationSource, /fromAssembledReportData\(assembled\)/);
assert.doesNotMatch(commercialBuilder, /loadComprehensiveReviewerInput|getEngagementByOrderReference|persisted management review record/);
assert.doesNotMatch(presentationBuilder, /loadComprehensiveReviewerInput|reviewerInput|Named reviewer|Review notes in scope/);

const model = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
assert.doesNotThrow(() => assertComprehensiveBlueprintContract(model));
assert.equal(model.analytical.assembled, undefined, 'fixture path remains assessment-universe-only');
assert.equal(model.proofRequirements.length, model.analytical.evidenceModel.evidenceChecklist.length);
assert.ok(model.decisionOptionSets.every((set) => set.optionDetails.length === 3));
assert.ok(model.narrativeBriefs.every((brief) => ['diagnosis', 'interpretation', 'design'].includes(brief.layer)));

const report = renderComprehensiveReportHtml(model);
const board = renderBoardReadoutHtml(model);
const workshop = renderWorkshopMaterialHtml(model);
for (const [name, html] of [['main report', report], ['board readout', board], ['workshop', workshop]]) {
  const basisPattern = /This report provides strategic fraud-risk analysis and control design based on management(?:'|&#39;|&apos;)s recorded Fraud Readiness assessment responses\./;
  assert.match(html, basisPattern, `${name}: basis statement`);
  assert.doesNotMatch(html.replaceAll('Customer upload, human approval and assurance workflow are outside this product boundary.', ''), forbidden, `${name}: forbidden review language`);
}
assert.ok(COMPREHENSIVE_REPORT_SECTIONS.every((section) => ['diagnosis', 'interpretation', 'design'].includes(section.layer)));
assert.ok(!COMPREHENSIVE_REPORT_SECTIONS.some((section) => /validation|reconciliation|signoff|reviewer|observations|gaps/i.test(section.key)));

const workbook = await buildComprehensiveRegisterWorkbook(model);
assert.deepEqual(workbook.sheetNames, ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Actions', 'Evidence Checklist', 'Roadmap', 'Management Decisions']);
assert.ok(workbook.bytes.length > 0);

console.log(JSON.stringify({ passed: true, checks: ['assessment-universe-only generation', 'no reviewer identity dependency', 'no evidence-validation status dependency', 'no evidence-assurance claim', 'diagnosis-interpretation-design section mapping', 'Comprehensive blueprint workbook contract'], sheets: workbook.sheetNames, reportSections: COMPREHENSIVE_REPORT_SECTIONS.length }, null, 2));
