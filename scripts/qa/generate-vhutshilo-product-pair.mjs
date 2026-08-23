import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { buildVhutshiloV12Assembled, VHUTSHILO_V12_GRAPH, VHUTSHILO_V12_SOURCE_SHA } from '../../src/lib/qa/v12-vhutshilo-fixture.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model.ts';
import { adaptEssentialEvidenceModel } from '../../src/lib/reports/essential-presentation-adaptation.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { selectContent } from '../../src/lib/reports/select-content-blocks.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../../src/lib/reports/roadmap.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { composeEssentialManuscript } from '../../src/lib/reports/narrative/essential-manuscript-coordinator.ts';
import { createV11WholeManuscriptWriter } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';
import { renderValidatedCommercialPdfWithNavigation } from '../../src/lib/reports/render-validated-commercial-pdf.ts';
import { renderComprehensiveReportPackage } from '../../src/lib/reports/comprehensive/manual-generation.ts';
import { generateComprehensiveInterpretation } from '../../src/lib/reports/comprehensive/interpretation.ts';
import { assertEssentialFinalHtml } from '../../src/lib/reports/essential-validation-cascade.ts';
import { renderHtmlToPdfBuffer } from '../../src/lib/reports/render-pdf.ts';

const OUT = path.resolve('qa-output/v12-product-pair');
const ESSENTIAL_MODEL = 'openai/gpt-5-mini';
const COMPREHENSIVE_MODEL = 'openai/gpt-5.6-luna';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

await fs.mkdir(OUT, { recursive: true });

const fixture = buildVhutshiloV12Assembled();
const { data, score, path: adaptivePath, controlResponses } = fixture;
const deterministic = {
  sourceSha: VHUTSHILO_V12_SOURCE_SHA,
  generatorSha: process.env.GITHUB_SHA ?? null,
  graphVersion: VHUTSHILO_V12_GRAPH,
  organisationName: data.organisationName,
  assessmentReference: data.assessmentReference,
  reportReference: data.reportReference,
  score: data.scoreRun.overallScore,
  calculatedMaturity: data.scoreRun.calculatedMaturity,
  finalMaturity: data.scoreRun.finalMaturity,
  coveragePct: data.scoreRun.coveragePct,
  applicableControls: score.metrics.applicableCount,
  excludedControls: score.metrics.excludedCount,
  redirectedControls: score.metrics.redirectedCount,
  unknownControls: score.metrics.unknownCount,
  activeResponseCount: Object.keys(controlResponses).length,
  activePathCount: adaptivePath.activePathCount
};

if (deterministic.score !== 43.33 || deterministic.finalMaturity !== 'Developing' || deterministic.coveragePct !== 100) {
  throw new Error(`Fixture drift: ${JSON.stringify(deterministic)}`);
}

console.log('Generating Essential from exact Vhutshilo V1.2 assessment...');
const advisoryModel = buildAdvisoryEvidenceModel(data);
const essentialEvidence = adaptEssentialEvidenceModel(advisoryModel, data.adaptiveGatewayAnswers);
const projection = buildEssentialProjection(data, essentialEvidence);
const content = selectContent(data, [], projection);
const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
const factPack = buildEssentialNarrativeFactPack(data, essentialEvidence, projection);
const writer = createV11WholeManuscriptWriter(ESSENTIAL_MODEL, { allowTailRecovery: false });
const semanticReviewer = writer.reviewSemanticCandidates
  ? { review: (request) => writer.reviewSemanticCandidates(request) }
  : undefined;
const composed = await composeEssentialManuscript({ factPack, writer, semanticReviewer });
const essentialPdf = await renderValidatedCommercialPdfWithNavigation({
  data,
  content,
  narrative: composed.narrative,
  roadmap,
  evidenceModel: essentialEvidence,
  carryForwardAssuranceSpanHashes: composed.acceptedAssuranceSpanHashes,
  carryForwardSemanticDecisions: composed.acceptedSemanticDecisions
});
const essentialDoc = await PDFDocument.load(essentialPdf);
const essentialName = `${data.reportReference}-ESSENTIAL.pdf`;
await fs.writeFile(path.join(OUT, essentialName), essentialPdf);

console.log('Generating Comprehensive from the same assessment via GPT-5.6 Luna...');
let comprehensiveValidation = null;
const comprehensive = await renderComprehensiveReportPackage({
  assembled: data,
  evidenceModel: advisoryModel,
  maxRepairsPerSlot: 0,
  orderReference: data.orderReference,
  reportReference: data.reportReference,
  versionNumber: 1,
  generateInterpretation: async (brief, options) => {
    const run = await generateComprehensiveInterpretation(brief, {
      ...options,
      model: COMPREHENSIVE_MODEL,
      maxRepairsPerSlot: 0
    });
    if (run.issues.length) throw new Error(`Comprehensive interpretation unresolved issues: ${JSON.stringify(run.issues)}`);
    return run;
  },
  renderPdf: async (html, options) => {
    comprehensiveValidation = assertEssentialFinalHtml({ html, data });
    return renderHtmlToPdfBuffer(html, options);
  }
});
if (!comprehensiveValidation?.publishable) throw new Error('Comprehensive final five-layer validation did not reach publishable acceptance.');

const comprehensiveName = `${data.reportReference}-COMPREHENSIVE.pdf`;
await fs.writeFile(path.join(OUT, comprehensiveName), comprehensive.pdf);
await fs.writeFile(path.join(OUT, comprehensive.workbook.fileName), comprehensive.workbook.bytes);
const comprehensiveDoc = await PDFDocument.load(comprehensive.pdf);

const meta = {
  generatedAt: new Date().toISOString(),
  deterministic,
  essential: {
    tier: 'Essential',
    model: ESSENTIAL_MODEL,
    finalFiveLayerGate: 'PASS (production Essential cascade completed inside renderValidatedCommercialPdfWithNavigation)',
    pdf: { fileName: essentialName, bytes: essentialPdf.length, sha256: sha256(essentialPdf), pages: essentialDoc.getPageCount() }
  },
  comprehensive: {
    tier: 'Comprehensive',
    model: comprehensive.interpretationRun.accounting.model,
    interpretationAccounting: comprehensive.interpretationRun.accounting,
    interpretationIssues: comprehensive.interpretationRun.issues,
    assemblyVersion: comprehensive.source.assemblyVersion,
    managementModelVersion: comprehensive.source.managementModelVersion,
    finalValidation: {
      policyVersion: comprehensiveValidation.policyVersion,
      publishable: comprehensiveValidation.publishable,
      finalHtmlSha256: comprehensiveValidation.finalHtmlSha256,
      blockingCodes: comprehensiveValidation.blockingCodes,
      heldForReviewCodes: comprehensiveValidation.heldForReviewCodes,
      warningCodes: comprehensiveValidation.warningCodes,
      candidateCount: comprehensiveValidation.candidates.length
    },
    pdf: { fileName: comprehensiveName, bytes: comprehensive.pdf.length, sha256: sha256(comprehensive.pdf), pages: comprehensiveDoc.getPageCount() },
    workbook: {
      fileName: comprehensive.workbook.fileName,
      bytes: comprehensive.workbook.bytes.length,
      sha256: comprehensive.workbook.checksumSha256,
      sheetNames: comprehensive.workbook.sheetNames,
      rowCounts: comprehensive.workbook.rowCounts
    }
  }
};
await fs.writeFile(path.join(OUT, 'vhutshilo-product-pair-meta.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
