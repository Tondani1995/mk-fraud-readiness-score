import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import type { BoundedCompiledManuscript } from '../narrative/bounded-section-engine';
import { generateComprehensiveNarrativeReport } from './narrative-generation';

/**
 * Admin/manual Comprehensive fulfilment entrypoint.
 *
 * This deliberately routes through the Reporting Bible manuscript-first
 * architecture. The customer PDF is narrative-led; the detailed analytical
 * registers remain in the existing Comprehensive workbook.
 */
export async function renderComprehensiveReportPdf(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
}): Promise<{ pdf: Buffer; narrativeRun: BoundedCompiledManuscript }> {
  const result = await generateComprehensiveNarrativeReport(input);
  return { pdf: result.pdf, narrativeRun: result.manuscript };
}
