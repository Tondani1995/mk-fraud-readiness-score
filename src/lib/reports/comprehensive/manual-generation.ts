import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import type { WholeManuscriptTextResult } from '../narrative/manuscript';
import {
  generateComprehensiveNarrativeReport,
  type ComprehensiveNarrativeProvenance,
  type ComprehensiveNarrativeSafetySummary
} from './narrative-generation';

/**
 * Admin/manual Comprehensive fulfilment entrypoint.
 *
 * This routes through the Comprehensive whole-manuscript safety architecture
 * against the richer Fact Pack and Blueprint. The
 * customer PDF is narrative-led; detailed registers remain in the workbook.
 */
export async function renderComprehensiveReportPdf(input: {
  assembled: AssembledReportData;
  evidenceModel: AdvisoryEvidenceModel;
}): Promise<{
  pdf: Buffer;
  narrativeRun: WholeManuscriptTextResult;
  semanticSafety?: ComprehensiveNarrativeSafetySummary;
  provenance: ComprehensiveNarrativeProvenance;
}> {
  const result = await generateComprehensiveNarrativeReport(input);
  return {
    pdf: result.pdf,
    narrativeRun: result.narrativeRun,
    semanticSafety: result.semanticSafety,
    // Carried out of the generator deliberately: the caller must persist this before the package
    // can be finalised, so an accepted manuscript can never be discarded with the request scope.
    provenance: result.provenance
  };
}
