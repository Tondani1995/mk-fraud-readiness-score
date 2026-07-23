import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString } from 'pdf-lib';

/**
 * V7 Checkpoint F controller review blocker 7 -- deterministic PDF navigation.
 *
 * Chromium's print-to-PDF (used by render-pdf.ts) has no facility to emit a table-of-contents
 * page with correct page numbers or a PDF outline/bookmark tree from HTML: it only lays out and
 * paginates the HTML it is given. Both are added here as a small, explicit two-step process:
 *
 *   1. extractHeadingPageMap() reads a *rendered* PDF (pdfjs-dist, a pure-JS/no-native-deps text
 *      extractor) and finds the first physical page whose text contains each tracked heading
 *      string -- the same mechanism used to build inspection/section-map.json in the Checkpoint F
 *      audit script, just running in-process instead of via a separate Python pass.
 *   2. addPdfBookmarks() writes a PDF /Outlines tree into an already-rendered PDF buffer using
 *      pdf-lib's low-level object API (pdf-lib has no high-level "add bookmark" call).
 *
 * The caller (render-validated-commercial-pdf.ts) is responsible for the "two-pass" part: render
 * once, extract the page map, re-render the HTML with that page map so the printed contents page
 * shows real numbers, then call addPdfBookmarks() on that second render. This keeps page numbers
 * genuinely computed from the final layout instead of hand-maintained literals that drift when
 * content changes.
 */

export interface TocEntry {
  /** Exact heading text as rendered in the HTML -- must be unique across the document. */
  key: string;
  label: string;
  appendix?: boolean;
}

/**
 * The contents page itself necessarily prints every tracked heading's label as plain text (that
 * is the whole point of a table of contents), so a naive "first page containing this string" scan
 * starting at page 1 always resolves every entry to the contents page. Callers that render a fixed
 * cover (page 1) + contents (page 2) must pass startPage=3 so the scan begins after the page that
 * would otherwise shadow every real heading.
 */

export interface BookmarkNode {
  title: string;
  pageNumber: number;
  children?: BookmarkNode[];
}

export async function extractHeadingPageMap(
  pdfBytes: Uint8Array,
  entries: TocEntry[],
  startPage = 1
): Promise<Record<string, number>> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
  const map: Record<string, number> = {};
  const remaining = new Set(entries.map((entry) => entry.key));
  for (let pageNumber = startPage; pageNumber <= doc.numPages && remaining.size > 0; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    for (const key of remaining) {
      if (text.includes(key)) {
        map[key] = pageNumber;
        remaining.delete(key);
      }
    }
  }
  if (remaining.size > 0) {
    throw new Error(`extractHeadingPageMap could not locate heading(s) in the rendered PDF: ${[...remaining].join(', ')}`);
  }
  return map;
}

export async function addPdfBookmarks(pdfBytes: Uint8Array, bookmarks: BookmarkNode[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();

  const pageRef = (pageNumber: number) => {
    const page = pages[pageNumber - 1];
    if (!page) throw new Error(`addPdfBookmarks: page ${pageNumber} does not exist (document has ${pages.length} pages).`);
    return page.ref;
  };

  interface Entry {
    ref: PDFRef;
    dict: PDFDict;
    node: BookmarkNode;
    children: Entry[];
  }

  const buildEntries = (nodes: BookmarkNode[]): Entry[] =>
    nodes.map((node) => {
      const dict: PDFDict = context.obj({});
      const ref = context.register(dict);
      const children = buildEntries(node.children ?? []);
      return { ref, dict, node, children };
    });

  const wire = (entries: Entry[], parentRef: PDFRef) => {
    entries.forEach((entry, index) => {
      entry.dict.set(PDFName.of('Title'), PDFString.of(entry.node.title));
      entry.dict.set(PDFName.of('Parent'), parentRef);
      entry.dict.set(PDFName.of('Dest'), context.obj([pageRef(entry.node.pageNumber), PDFName.of('Fit')]));
      if (index > 0) entry.dict.set(PDFName.of('Prev'), entries[index - 1].ref);
      if (index < entries.length - 1) entry.dict.set(PDFName.of('Next'), entries[index + 1].ref);
      if (entry.children.length > 0) {
        entry.dict.set(PDFName.of('First'), entry.children[0].ref);
        entry.dict.set(PDFName.of('Last'), entry.children[entry.children.length - 1].ref);
        entry.dict.set(PDFName.of('Count'), PDFNumber.of(entry.children.length));
        wire(entry.children, entry.ref);
      }
    });
  };

  const rootEntries = buildEntries(bookmarks);
  const outlineDict: PDFDict = context.obj({ Type: PDFName.of('Outlines') });
  const outlineRef = context.register(outlineDict);
  wire(rootEntries, outlineRef);
  if (rootEntries.length > 0) {
    outlineDict.set(PDFName.of('First'), rootEntries[0].ref);
    outlineDict.set(PDFName.of('Last'), rootEntries[rootEntries.length - 1].ref);
    outlineDict.set(PDFName.of('Count'), PDFNumber.of(rootEntries.length));
  }
  pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRef);

  return pdfDoc.save();
}
