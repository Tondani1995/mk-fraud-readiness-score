#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { selectContent } from '../../src/lib/reports/select-content-blocks.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../../src/lib/reports/roadmap.ts';
import { renderValidatedCommercialPdfWithNavigation } from '../../src/lib/reports/render-validated-commercial-pdf.ts';

const outputDir = path.resolve(process.env.COMMERCIAL_OUTPUT_DIR ?? 'outputs/commercial-quality');
const orderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
await fs.mkdir(outputDir, { recursive: true });
const data = await assembleReportData(orderReference);
const evidenceModel = buildAdvisoryEvidenceModel(data);
const projection = buildEssentialProjection(data, evidenceModel);
const content = selectContent(data, [], projection);
const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
const pdf = await renderValidatedCommercialPdfWithNavigation({ data, content, roadmap, evidenceModel });
const filename = 'essential-main-report.pdf';
await fs.writeFile(path.join(outputDir, filename), pdf);
console.log(JSON.stringify({
  source: 'persisted Rivonia assessment',
  orderReference,
  assessmentReference: data.assessmentReference,
  organisationName: data.organisationName,
  counts: {
    questionTraces: data.questionTraces.length,
    findings: projection.findings.length,
    risks: projection.risks.length,
    scenarios: projection.scenarios.length,
    controls: projection.controlActionRecords.length,
    roadmap: projection.roadmapActions.length
  },
  outputs: [filename]
}, null, 2));
