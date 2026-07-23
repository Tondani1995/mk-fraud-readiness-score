import type { AssembledReportData, RoadmapItem, SelectedContent } from './types';
import { renderReportHtml, REPORT_TOC_ENTRIES } from './templates/report-template';
import { renderHtmlToPdfBuffer } from './render-pdf';
import { addPdfBookmarks, extractHeadingPageMap, type BookmarkNode } from './pdf-navigation';
import type { AdvisoryEvidenceModel } from './evidence-model';

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
    evidenceModel?: AdvisoryEvidenceModel;
  },
  dependencies: CommercialPdfRenderDependencies = {
    renderHtml: renderReportHtml,
    renderPdf: renderHtmlToPdfBuffer
  }
): Promise<Buffer> {
  const html = dependencies.renderHtml(input.data, input.content, input.roadmap, input.evidenceModel);
  return dependencies.renderPdf(html);
}

const CORE_TOC_ENTRIES = REPORT_TOC_ENTRIES.filter((entry) => !entry.appendix);
const APPENDIX_ROOT_ENTRY = REPORT_TOC_ENTRIES.find((entry) => entry.appendix && entry.label === 'Appendix');
const APPENDIX_CHILD_ENTRIES = REPORT_TOC_ENTRIES.filter((entry) => entry.appendix && entry.label !== 'Appendix');
if (!APPENDIX_ROOT_ENTRY) throw new Error('render-validated-commercial-pdf: REPORT_TOC_ENTRIES is missing its "Appendix" root entry.');

/**
 * V7 Checkpoint F controller review blocker 7 -- adds a customer-facing contents page with real
 * page numbers and a matching PDF bookmark/outline tree, using a deterministic two-pass render:
 *
 *   pass 1: render through the existing fail-closed renderValidatedCommercialPdf() seam exactly as
 *           before (so the quality gate still runs first, unchanged and untouched) with the
 *           contents page showing placeholder page numbers;
 *   pass 2: read the real page number of every tracked heading out of that PDF
 *           (extractHeadingPageMap(), pdf-navigation.ts), re-render the *same* HTML with those
 *           numbers filled in, and write a matching PDF outline into that second render.
 *
 * The two passes render byte-for-byte the same content except the contents-page numbers
 * themselves (same heading text, same section order), so the second pass's own page numbers are
 * exactly what the first pass measured -- nothing is hand-maintained or guessed.
 */
export async function renderValidatedCommercialPdfWithNavigation(
  input: {
    data: AssembledReportData;
    content: SelectedContent;
    roadmap: { agenda: RoadmapItem[] };
    evidenceModel?: AdvisoryEvidenceModel;
  },
  dependencies: CommercialPdfRenderDependencies = {
    renderHtml: renderReportHtml,
    renderPdf: renderHtmlToPdfBuffer
  }
): Promise<Buffer> {
  const firstPassPdf = await renderValidatedCommercialPdf(input, dependencies);
  // Page 1 is the fixed cover and page 2 is the contents page itself (which prints every tracked
  // heading's label as plain text) -- see pdf-navigation.ts's TocEntry doc comment for why the
  // heading scan must start after both.
  const pageMap = await extractHeadingPageMap(new Uint8Array(firstPassPdf), REPORT_TOC_ENTRIES, 3);

  const secondPassHtml = dependencies.renderHtml(input.data, input.content, input.roadmap, input.evidenceModel, pageMap);
  const secondPassPdf = await dependencies.renderPdf(secondPassHtml);

  const bookmarks: BookmarkNode[] = [
    ...CORE_TOC_ENTRIES.map((entry) => ({ title: entry.label, pageNumber: pageMap[entry.key] })),
    {
      title: APPENDIX_ROOT_ENTRY!.label,
      pageNumber: pageMap[APPENDIX_ROOT_ENTRY!.key],
      children: APPENDIX_CHILD_ENTRIES.map((entry) => ({ title: entry.label, pageNumber: pageMap[entry.key] }))
    }
  ];
  const withBookmarks = await addPdfBookmarks(new Uint8Array(secondPassPdf), bookmarks);
  return Buffer.from(withBookmarks);
}
