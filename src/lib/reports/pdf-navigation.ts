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

/**
 * pdfjs expects DOM geometry types that Node does not provide. Its own fallback is to load
 * @napi-rs/canvas, whose entry point requires a compiled native binding -- and that binding is not
 * present in the deployed bundle, so the load fails and pdfjs then throws `DOMMatrix is not
 * defined` the moment it touches the type, even though this module only extracts text and never
 * rasterises anything.
 *
 * @napi-rs/canvas also ships geometry.js: a vendored, pure-JavaScript geometry polyfill with no
 * native dependency at all. Installing those globals first means pdfjs never needs the native
 * binding for the text-extraction path. Path2D is deliberately not stubbed -- nothing here draws,
 * and a stub would turn a missing capability into silently wrong output rather than a loud error.
 */
async function ensureGeometryGlobals(): Promise<void> {
  const globals = globalThis as Record<string, unknown>;
  if (typeof globals.DOMMatrix !== 'undefined') return;

  const geometry = await import('@napi-rs/canvas/geometry.js') as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const source = (typeof geometry.DOMMatrix !== 'undefined' ? geometry : geometry.default) ?? {};
  for (const name of ['DOMMatrix', 'DOMPoint', 'DOMRect'] as const) {
    if (typeof globals[name] === 'undefined' && typeof source[name] !== 'undefined') {
      globals[name] = source[name];
    }
  }
  if (typeof globals.DOMMatrix === 'undefined') {
    throw new Error('pdf-navigation could not install a DOMMatrix polyfill for pdfjs-dist.');
  }
}

/**
 * Diagnostic tiers, in decreasing strictness. The earliest physical page on which the complete
 * canonical heading is recoverable is accepted; when several tiers match that same page, the
 * strictest tier is reported.
 *
 * Tiers 2 and 3 identify how a heading that is demonstrably present in the HTML survived PDF text
 * extraction. Extracted whitespace does not correspond to HTML whitespace: a heading long enough
 * to wrap is emitted as several text runs, and depending on how the line breaks those runs may be
 * separated by inconsistent spacing (tier 2) or split inside a word (tier 3).
 *
 * Every tier still requires the complete canonical heading in exact character order. None of them
 * is a similarity, token-subset or fuzzy match. Physical document order is authoritative because
 * the customer template contract forbids tracked headings from being quoted before their actual
 * section; a later prose cross-reference must never outrank the real, earlier heading merely
 * because Chromium extracted that later prose as one cleaner text run.
 */
/**
 * Measured on the real renderer during RC1 certification. For the three headings that failed --
 * "Priority findings, contradictions and scenarios", "A1. Complete material findings register"
 * and "A7. Definitions and score basis" -- the diagnostic recorded:
 *
 *   whitespace_normalised = none        whitespace_stripped = unique
 *
 * Tier 2 matching nothing while tier 3 matches uniquely means Chromium splits these headings
 * *inside a word*, not merely across inconsistent spacing. Whitespace normalisation could never
 * have fixed them, which is why the earlier normalisation-only attempt was withdrawn rather than
 * shipped on a guess.
 */
export type HeadingMatchTier = 'exact' | 'whitespace_normalised' | 'whitespace_stripped';

export interface HeadingTierCandidate {
  tier: HeadingMatchTier;
  /** Pages on which the full heading appears at this tier. */
  pages: number[];
  /** A tier is usable evidence only when exactly one page matches; more is ambiguous. */
  unique: boolean;
}

/**
 * Content-free. `key` is a fixed heading constant from REPORT_TOC_ENTRIES, never report text; the
 * remaining fields are page numbers and counts. No extracted text, surrounding content,
 * organisation detail or customer data appears here or in the thrown message.
 */
export interface HeadingMatchDiagnostic {
  key: string;
  /** The tier that resolved this heading, or null when no tier could. */
  acceptedTier: HeadingMatchTier | null;
  pageNumber: number | null;
  /** Number of text items on the accepted page -- a shape signal, not content. */
  textItemCount: number | null;
  candidates: HeadingTierCandidate[];
}

export class HeadingExtractionError extends Error {
  readonly diagnostics: HeadingMatchDiagnostic[];
  readonly missingKeys: string[];
  constructor(message: string, diagnostics: HeadingMatchDiagnostic[], missingKeys: string[]) {
    super(message);
    this.name = 'HeadingExtractionError';
    this.diagnostics = diagnostics;
    this.missingKeys = missingKeys;
  }
}

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, '');
}

/**
 * Measures, for every entry, which tiers locate it and on how many pages. The accepted page is the
 * earliest post-Contents physical occurrence at any tier; tier strictness only breaks ties on that
 * same page. This mirrors the rendered audit's structural first-occurrence rule and prevents a
 * later exact prose cross-reference from displacing an earlier heading split across PDF text runs.
 */
export async function collectHeadingMatchDiagnostics(
  pdfBytes: Uint8Array,
  entries: TocEntry[],
  startPage = 1
): Promise<HeadingMatchDiagnostic[]> {
  await ensureGeometryGlobals();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;

  // Every page is read so candidate locations and tier diagnostics remain observable even after
  // the earliest structural occurrence has been selected.
  const pages: Array<{ pageNumber: number; exact: string; normalised: string; stripped: string; itemCount: number }> = [];
  for (let pageNumber = startPage; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const exact = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push({
      pageNumber,
      exact,
      normalised: normaliseWhitespace(exact),
      stripped: stripWhitespace(exact),
      itemCount: content.items.length,
    });
  }

  const diagnostics: HeadingMatchDiagnostic[] = [];

  for (const entry of entries) {
    const key = entry.key;
    const normalisedKey = normaliseWhitespace(key);
    const strippedKey = stripWhitespace(key);

    const exactPages = pages.filter((page) => page.exact.includes(key)).map((page) => page.pageNumber);
    const normalisedPages = pages.filter((page) => page.normalised.includes(normalisedKey)).map((page) => page.pageNumber);
    const strippedPages = pages.filter((page) => page.stripped.includes(strippedKey)).map((page) => page.pageNumber);

    const candidates: HeadingTierCandidate[] = [
      { tier: 'exact', pages: exactPages, unique: exactPages.length === 1 },
      { tier: 'whitespace_normalised', pages: normalisedPages, unique: normalisedPages.length === 1 },
      { tier: 'whitespace_stripped', pages: strippedPages, unique: strippedPages.length === 1 },
    ];

    // Structural order wins before text-run neatness. Chromium can split a real heading inside a
    // word on its actual section page while a later prose cross-reference contains the same
    // canonical heading as one exact text run. Preferring "any exact match anywhere" therefore
    // points navigation at the later prose instead of the section itself. The customer template
    // contract already forbids tracked headings from being quoted before their real section, and
    // the rendered audit uses the first post-Contents occurrence for the same reason. Select the
    // earliest physical page on which the complete canonical heading is recoverable at any tier;
    // when more than one tier matches that same page, use the strictest tier only as a tie-breaker.
    const matchedPages = [...new Set([...exactPages, ...normalisedPages, ...strippedPages])]
      .sort((left, right) => left - right);
    const acceptedPage: number | null = matchedPages[0] ?? null;
    let acceptedTier: HeadingMatchTier | null = null;
    if (acceptedPage !== null) {
      if (exactPages.includes(acceptedPage)) acceptedTier = 'exact';
      else if (normalisedPages.includes(acceptedPage)) acceptedTier = 'whitespace_normalised';
      else if (strippedPages.includes(acceptedPage)) acceptedTier = 'whitespace_stripped';
    }

    diagnostics.push({
      key,
      acceptedTier,
      pageNumber: acceptedPage,
      textItemCount: acceptedPage !== null
        ? (pages.find((page) => page.pageNumber === acceptedPage)?.itemCount ?? null)
        : null,
      candidates,
    });
  }

  return diagnostics;
}

export async function extractHeadingPageMap(
  pdfBytes: Uint8Array,
  entries: TocEntry[],
  startPage = 1,
  onDiagnostics?: (diagnostics: HeadingMatchDiagnostic[]) => void
): Promise<Record<string, number>> {
  const diagnostics = await collectHeadingMatchDiagnostics(pdfBytes, entries, startPage);
  onDiagnostics?.(diagnostics);
  const map: Record<string, number> = {};
  const missing: string[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.acceptedTier !== null && diagnostic.pageNumber !== null) {
      map[diagnostic.key] = diagnostic.pageNumber;
    } else {
      missing.push(diagnostic.key);
    }
  }

  if (missing.length > 0) {
    // The summary carries heading constants, tier names, page numbers and counts only, so it is
    // safe for the protected runtime log that already records this stage's error.
    const summary = diagnostics
      .filter((diagnostic) => diagnostic.acceptedTier === null)
      .map((diagnostic) => {
        const tiers = diagnostic.candidates
          .filter((candidate) => candidate.tier !== 'exact')
          .map((candidate) => `${candidate.tier}=${candidate.pages.length === 0
            ? 'none'
            : candidate.unique ? `unique(p${candidate.pages[0]})` : `ambiguous(${candidate.pages.length})`}`)
          .join(' ');
        return `${diagnostic.key} [${tiers}]`;
      })
      .join('; ');
    throw new HeadingExtractionError(
      `extractHeadingPageMap could not locate heading(s) in the rendered PDF: ${missing.join(', ')} -- tier diagnostics: ${summary}`,
      diagnostics,
      missing,
    );
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
