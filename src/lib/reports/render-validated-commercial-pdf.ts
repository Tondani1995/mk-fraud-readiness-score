import type { AssembledReportData, RoadmapItem, SelectedContent } from './types';
import { renderReportHtml, REPORT_TOC_ENTRIES } from './templates/report-template';
import { renderHtmlToPdfBuffer } from './render-pdf';
import { addPdfBookmarks, extractHeadingPageMap, type BookmarkNode } from './pdf-navigation';
import type { AdvisoryEvidenceModel } from './evidence-model';
import type { ParsedBlueprintMarkdown } from './narrative/blueprint-text';
import { closeEssentialCommercialOutputDefects } from './essential-commercial-output-closure';

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
    /**
     * Validated v1.1 manuscript, ordered by the blueprint. Deliberately a separate input
     * from `content`: SelectedContent's five fixed buckets cannot hold an ordered
     * chapter/section/subsection manuscript without dropping or duplicating it, so the
     * two are kept as distinct kinds rather than merged into one ambiguous object.
     * Absent for Comprehensive and for any caller still on the deterministic content path.
     */
    narrative?: ParsedBlueprintMarkdown;
  },
  dependencies: CommercialPdfRenderDependencies = {
    renderHtml: renderReportHtml,
    renderPdf: renderHtmlToPdfBuffer
  }
): Promise<Buffer> {
  const html = closeEssentialCommercialOutputDefects(
    dependencies.renderHtml(input.data, input.content, input.roadmap, input.evidenceModel, undefined, undefined, input.narrative)
  );
  return dependencies.renderPdf(html);
}

const CORE_TOC_ENTRIES = REPORT_TOC_ENTRIES.filter((entry) => !entry.appendix);
// Structural identity, never display text. The appendix root is the FIRST entry flagged
// `appendix: true`; the remainder are its children. Selecting the root by a hard-coded label
// literal silently dropped the appendix TOC row and bookmark the moment the customer-facing
// heading was renamed, even though the section itself still rendered.
const APPENDIX_ENTRIES = REPORT_TOC_ENTRIES.filter((entry) => entry.appendix);
const APPENDIX_ROOT_ENTRY = APPENDIX_ENTRIES[0];
const APPENDIX_CHILD_ENTRIES = APPENDIX_ENTRIES.slice(1);
if (!APPENDIX_ROOT_ENTRY) throw new Error('render-validated-commercial-pdf: REPORT_TOC_ENTRIES has no appendix root entry.');

// Bound on the fixed-point search. Real numbers stop moving almost immediately; this exists so a
// pathological oscillation fails closed instead of looping.
const MAX_NAVIGATION_PASSES = 4;

/**
 * V7 Checkpoint F controller review blocker 7 -- adds a customer-facing contents page with real
 * page numbers and a matching PDF bookmark/outline tree, using a deterministic render that
 * iterates to a fixed point:
 *
 *   pass 1: render through the existing fail-closed renderValidatedCommercialPdf() seam exactly as
 *           before (so the quality gate still runs first, unchanged and untouched) with the
 *           contents page showing placeholder page numbers;
 *   pass 2+: read the real page number of every tracked heading out of that PDF
 *           (extractHeadingPageMap(), pdf-navigation.ts), re-render the *same* HTML with those
 *           numbers filled in, and repeat until re-measuring reproduces the numbers that were
 *           printed; write a matching PDF outline into that final render.
 *
 * The passes render byte-for-byte the same content except the contents-page numbers themselves
 * (same heading text, same section order) -- nothing is hand-maintained or guessed.
 *
 * Filling real numbers into the contents page changes that page's own text, which can reflow
 * anything that is not pinned by a forced page break. Rather than assume the first measurement
 * survives, the render iterates to a fixed point: repeat until the map measured *from* a render
 * equals the map that produced it, so the printed numbers and the outline describe the very bytes
 * returned. Convergence is normally immediate; failing to converge means the contents page cannot
 * be trusted, so it fails closed rather than shipping a PDF whose navigation lies.
 *
 * Note this guards reflow only. It cannot detect a heading located on the wrong page in the first
 * place -- extractHeadingPageMap() finds an entry by its heading text, so prose that quotes a
 * tracked heading verbatim is matched instead (see the comment on the evidence-priority lede in
 * templates/report-template.ts). Cross-references must therefore never quote a tracked heading.
 */
export async function renderValidatedCommercialPdfWithNavigation(
  input: {
    data: AssembledReportData;
    content: SelectedContent;
    roadmap: { agenda: RoadmapItem[] };
    evidenceModel?: AdvisoryEvidenceModel;
    /** Validated v1.1 manuscript must survive every navigation fixed-point render pass. */
    narrative?: ParsedBlueprintMarkdown;
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
  const measure = (pdf: Uint8Array) => extractHeadingPageMap(
    pdf,
    REPORT_TOC_ENTRIES,
    3,
    // Generation diagnostics: which tier resolved each heading. Headings resolved below tier 1
    // mean the renderer split them across text runs, which is worth seeing rather than silently
    // tolerating. Heading constants, tier names and page numbers only -- no report content.
    (diagnostics) => {
      const belowExact = diagnostics.filter((diagnostic) => diagnostic.acceptedTier !== null
        && diagnostic.acceptedTier !== 'exact');
      if (belowExact.length === 0) return;
      console.info('pdf_heading_match_tier', {
        acceptedBelowExact: belowExact.map((diagnostic) => ({
          key: diagnostic.key,
          tier: diagnostic.acceptedTier,
          page: diagnostic.pageNumber
        }))
      });
    }
  );

  // The first render used placeholder numbers, so the loop starts from the first real map.
  let pageMap = await measure(new Uint8Array(firstPassPdf));
  for (let attempt = 0; attempt < MAX_NAVIGATION_PASSES; attempt += 1) {
    const html = closeEssentialCommercialOutputDefects(
      dependencies.renderHtml(input.data, input.content, input.roadmap, input.evidenceModel, pageMap, undefined, input.narrative)
    );
    const numberedPdf = await dependencies.renderPdf(html);
    const measured = await measure(new Uint8Array(numberedPdf));
    // Fixed point: what the contents page prints is what the render actually paginated to, so the
    // outline written below describes the very bytes being returned.
    if (REPORT_TOC_ENTRIES.every((entry) => measured[entry.key] === pageMap[entry.key])) {
      return await withNavigationBookmarks(numberedPdf, pageMap);
    }
    pageMap = measured;
  }
  throw new Error(
    'render-validated-commercial-pdf: contents-page numbering did not converge; '
    + 'refusing to publish a report whose contents page and bookmarks disagree with its pages.'
  );
}

async function withNavigationBookmarks(secondPassPdf: Buffer, pageMap: Record<string, number>): Promise<Buffer> {
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
