#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildComprehensiveDeliveryModel, renderBoardReadoutHtml, renderComprehensiveReportHtml, renderWorkshopMaterialHtml } from '../../src/lib/reports/comprehensive/index.ts';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';

const outputDir = path.resolve(process.env.COMMERCIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
await fs.mkdir(outputDir, { recursive: true });
const fixtureKey = process.env.COMPREHENSIVE_FIXTURE ?? 'denseWeakAssessment';
const fixture = comprehensiveFixtures[fixtureKey];
if (!fixture) throw new Error(`Unknown Comprehensive fixture: ${fixtureKey}`);
const model = buildComprehensiveDeliveryModel(fixture.analytical);

const deliverables = [
  ['comprehensive-main-report.pdf', renderComprehensiveReportHtml(model), 'MK Fraud Readiness · Comprehensive · Confidential'],
  ['comprehensive-board-readout.pdf', renderBoardReadoutHtml(model), 'MK Fraud Readiness · Board readout · Confidential'],
  ['comprehensive-workshop-material.pdf', renderWorkshopMaterialHtml(model), 'MK Fraud Readiness · Workshop material · Confidential']
];

for (const [filename, html, footerLabel] of deliverables) {
  const pdf = await renderHtmlToPdfBuffer(html, { footerLabel });
  await fs.writeFile(path.join(outputDir, filename), pdf);
}

console.log(JSON.stringify({
  outputDir,
  fixtureKey,
  deliverables: deliverables.map(([filename]) => filename),
  model: {
    findings: model.findings.length,
    risks: model.riskRegister.length,
    proofRequirements: model.proofRequirements.length,
    controlBlueprints: model.controlImprovements.length
  }
}, null, 2));
