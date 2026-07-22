import type { AssembledReportData, RoadmapItem, SelectedContent } from './types';
import { renderReportHtml } from './templates/report-template';
import { renderHtmlToPdfBuffer } from './render-pdf';

/**
 * V7 Checkpoint B -- narrow PDF-render orchestration seam.
 *
 * This is the single production-used entry point that turns AssembledReportData + SelectedContent
 * + roadmap into a rendered PDF buffer. It exists so the fail-closed ordering required by
 * Checkpoint B is provable, not just assumed:
 *   - renderReportHtml() (via dependencies.renderHtml) now throws ReportCommercialQualityError
 *     before returning any HTML when the commercial quality gate fails (see
 *     ../commercial-quality.ts and templates/report-template.ts) -- so a quality failure here
 *     necessarily means dependencies.renderPdf was never called;
 *   - a renderer failure (dependencies.renderPdf rejecting) is a different, later failure mode,
 *     distinguishable from a quality failure because it can only happen after renderHtml already
 *     succeeded.
 *
 * dependencies defaults to the real renderReportHtml/renderHtmlToPdfBuffer so production callers
 * (phase1-manual-fulfilment.ts's generateManualPhase1Report()) don't need to pass anything; tests
 * inject recording fakes/spies instead. This is a plain default-parameter seam, not a dependency-
 * injection framework or service container.
 */
export interface CommercialPdfRenderDependencies {
  renderHtml: typeof renderReportHtml;
  renderPdf: typeof renderHtmlToPdfBuffer;
}

export async function renderValidatedCommercialPdf(
  input: {
    data: AssembledReportData;
    content: SelectedContent;
    roadmap: { agenda: RoadmapItem[] };
  },
  dependencies: CommercialPdfRenderDependencies = {
    renderHtml: renderReportHtml,
    renderPdf: renderHtmlToPdfBuffer
  }
): Promise<Buffer> {
  const html = dependencies.renderHtml(input.data, input.content, input.roadmap);
  return dependencies.renderPdf(html);
}
