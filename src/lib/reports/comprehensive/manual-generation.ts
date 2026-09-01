import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import type { WholeManuscriptTextResult } from '../narrative/manuscript';
import type { EssentialManuscriptResult } from '../narrative/essential-manuscript-coordinator';
import { generateComprehensiveNarrativeReport } from './narrative-generation';

/**
 * Admin/manual Comprehensive fulfilment entrypoint.
 *
 * This routes through the same whole-manuscript safety architecture used by
 * Essential, but against the richer Comprehensive Fact Pack and Blueprint. The
 * customer PDF is narrative-led; detailed registers remain in the workbook.
 */
export async function renderComprehensiveReportPdf(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
}): Promise<{
  pdf: Buffer;
  narrativeRun: WholeManuscriptTextResult;
  semanticSafety?: EssentialManuscriptResult['semanticSafety'];
}> {
  const result = await generateComprehensiveNarrativeReport(input);
  return {
    pdf: result.pdf,
    narrativeRun: result.narrativeRun,
    semanticSafety: result.semanticSafety
  };
}
