import { composeRevisedReportHtml, layoutKey, type ComposeInput, type PageMap } from './compose';
import { renderPublicationPdf } from './render';

/**
 * Hosted page layout for the MK publication (independent review Q7). The offline build script laid reports out in
 * passes with `pdftotext`; the hosted pipeline rendered once, so its contents page had no page numbers and it kept
 * near-empty continuation pages and headings stranded at the foot of a page. This runs the same passes in the hosted
 * runtime, reading the rendered PDF with pdfjs-dist (already traced into both generation routes):
 *
 *   pass 1   render; find near-empty pages before a heading that starts a new page, and headings with almost
 *            nothing after them on their page;
 *   pass 2   (only when pass 1 found something) re-compose with those sections and units flowing on and those
 *            headings starting a new page, and render again;
 *   final    re-compose with the page map so the contents page carries page numbers, and render.
 *
 * Headings are located by rendered size (section and unit headings are set at 12.6pt and above, every contents row
 * and body line below 10pt), so a contents page that runs on cannot be mistaken for the heading it lists. The page
 * map is checked against the final PDF, and the record says what was changed so an operator can see it.
 */
export const PUBLICATION_LAYOUT_VERSION = 'publication-layout-1.1';
/** A page with less body text than this, ending a section or unit, is near empty. */
export const SPARSE_PAGE_CHARS = 700;
/** A heading followed by less text than this on its page (under about a line and a half) is stranded. A heading kept with
 * its lead paragraph at the foot of a page is ordinary practice and is left alone. */
export const STRANDED_HEADING_CHARS = 160;
/** Rendered text height (pt) from which a text run is a heading. */
export const HEADING_MIN_HEIGHT = 11;

export type PageText = { all: string; heads: string };
export type LayoutRecord = {
  version: string; passes: number; pages: number; flowSections: string[]; breakBefore: string[]; flowUnits: string[]; compactContents: boolean;
  pageMap: PageMap; contentsComplete: boolean; missing: string[]; sparsePages: number[];
};
type Outline = { id: string; heading: string; units: string[] }[];
type Plan = { flowSections: string[]; breakBefore: string[]; flowUnits: string[]; compactContents: boolean };

export const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const key48 = (h: string) => norm(h).slice(0, 48);

/** Running heads and footers, read from the document's own @page rules, so they are not mistaken for body text. */
export function runningStrings(html: string): string[] {
  const page = html.match(/@page\{[\s\S]*?\}\}/)?.[0] ?? '';
  return [...page.matchAll(/content:'((?:[^'\\]|\\.)*)'/g)].map((m) => norm(m[1].replace(/\\(.)/g, '$1'))).filter(Boolean);
}
export const stripRunning = (t: string, running: string[]) => running.reduce((x, r) => x.split(r).join(' '), t).replace(/(^|\s)\d{1,3}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

async function ensureGeometryGlobals(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix !== 'undefined') return;
  const geometry = await import('@napi-rs/canvas/geometry.js') as Record<string, unknown> & { default?: Record<string, unknown> };
  const source = (typeof geometry.DOMMatrix !== 'undefined' ? geometry : geometry.default) ?? {};
  for (const name of ['DOMMatrix', 'DOMPoint', 'DOMRect'] as const) if (typeof g[name] === 'undefined' && typeof source[name] !== 'undefined') g[name] = source[name];
  if (typeof g.DOMMatrix === 'undefined') throw new Error('publication_layout_geometry_unavailable');
}

/** Per page: all text, and the text set at heading size. */
export async function pdfPageTexts(pdf: Uint8Array): Promise<PageText[]> {
  await ensureGeometryGlobals();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false });
  const doc = await task.promise;
  const pages: PageText[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      const items = content.items.map((x: any) => ({ str: 'str' in x ? String(x.str) : '', h: typeof x.height === 'number' ? x.height : 0 }));
      pages.push({ all: norm(items.map((x) => x.str).join(' ')), heads: norm(items.filter((x) => x.h >= HEADING_MIN_HEIGHT).map((x) => x.str).join(' ')) });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

const findPage = (pages: PageText[], heading: string, from = 1) => {
  const h = key48(heading);
  for (let i = Math.max(1, from); i < pages.length; i++) if (pages[i].heads.includes(h)) return i + 1;
  return null;
};
/** Body text after the heading on its page (running heads and folios already removed). */
const textAfter = (t: string, heading: string) => {
  const at = t.indexOf(key48(heading));
  return at < 0 ? Infinity : t.slice(at + norm(heading).length).trim().length;
};

export function planLayout(pages: PageText[], outline: Outline, current: Plan): Plan {
  const flowSections = new Set(current.flowSections);
  const breakBefore = new Set(current.breakBefore);
  const flowUnits = new Set(current.flowUnits);
  // The page before a heading that starts a new page holds almost nothing.
  const sparseBefore = (p: number, heading: string) => p > 3 && pages[p - 2].all.length < SPARSE_PAGE_CHARS && !pages[p - 2].heads.includes(key48(heading));
  let from = 1;
  outline.forEach((s, i) => {
    const p = findPage(pages, s.heading, from);
    if (!p) return;
    from = p - 1;
    if (i >= 2 && sparseBefore(p, s.heading)) flowSections.add(s.id);
    // A heading stranded at the foot of its page starts the next page instead.
    if (i >= 1 && textAfter(pages[p - 1].all, s.heading) < STRANDED_HEADING_CHARS && p < pages.length) breakBefore.add(s.id);
    let uf = p - 1;
    s.units.forEach((u, j) => {
      const up = findPage(pages, u, uf);
      if (!up) return;
      uf = up - 1;
      if (j > 0 && sparseBefore(up, u)) flowUnits.add(layoutKey(s.id, u));
      else if (textAfter(pages[up - 1].all, u) < STRANDED_HEADING_CHARS && up < pages.length) breakBefore.add(layoutKey(s.id, u));
    });
  });
  // The contents running a few rows onto an otherwise empty page, before the second section starts.
  const compactContents = current.compactContents || contentsOverflow(pages, outline);
  return { flowSections: [...flowSections], breakBefore: [...breakBefore], flowUnits: [...flowUnits], compactContents };
}

/** The contents running a few rows onto an otherwise empty page before the second section starts. */
export function contentsOverflow(pages: PageText[], outline: Outline): boolean {
  const second = outline[1] ? findPage(pages, outline[1].heading) : null;
  return !!second && second > 3 && pages[2].all.length < SPARSE_PAGE_CHARS && !pages[2].heads;
}

export function pageMapFrom(pages: PageText[], outline: Outline): { pageMap: PageMap; missing: string[] } {
  const pageMap: PageMap = {};
  const missing: string[] = [];
  let from = 1;
  for (const s of outline) {
    const p = findPage(pages, s.heading, from);
    if (p) { pageMap[s.id] = p; from = p - 1; } else missing.push(s.id);
    let uf = Math.max(1, (p ?? from + 1) - 1);
    for (const u of s.units) {
      const up = findPage(pages, u, uf);
      if (up) { pageMap[`${s.id}::${u}`] = up; uf = up - 1; } else missing.push(`${s.id}::${u}`);
    }
  }
  return { pageMap, missing };
}

/** Body pages (after the cover and the first section's page) holding almost nothing; the last page is the back cover. */
export const sparsePagesOf = (pages: PageText[], threshold = 220) => pages.map((t, i) => ({ p: i + 1, n: t.all.length })).filter((x) => x.p > 2 && x.p < pages.length && x.n < threshold).map((x) => x.p);

export class LayoutDeadline extends Error {
  readonly passes: number;
  constructor(passes: number) { super(`publication layout stopped at its deadline after ${passes} pass(es)`); this.name = 'LayoutDeadline'; this.passes = passes; }
}

/**
 * `deadlineAt` (with `clock`): a pass starts only if at least `minPassMs` remains, and each render is given only the time
 * remaining. If the deadline arrives before any complete PDF exists, LayoutDeadline is thrown; if it arrives during the
 * page-number passes, the last complete PDF is returned with the page map reported as not converged, so the caller's
 * publication gate holds it.
 */
export async function layoutPublication(
  base: ComposeInput,
  deps: {
    render?: (html: string, options?: { timeoutMs?: number }) => Promise<{ pdf: Buffer; sha256: string }>; texts?: (pdf: Uint8Array) => Promise<PageText[]>;
    deadlineAt?: number; clock?: () => number; minPassMs?: number; maxNumberPasses?: number;
  } = {}
): Promise<{ html: string; pdf: Buffer; sha256: string; layout: LayoutRecord }> {
  const renderPdf = deps.render ?? renderPublicationPdf;
  const read = deps.texts ?? pdfPageTexts;
  const clock = deps.clock ?? Date.now;
  const minPass = deps.minPassMs ?? 10_000;
  const remaining = () => (deps.deadlineAt === undefined ? Infinity : deps.deadlineAt - clock());
  const canPass = () => remaining() >= minPass;
  const render = (html: string) => renderPdf(html, { timeoutMs: Math.max(1_000, Math.min(remaining(), 300_000)) });
  let input: ComposeInput = { ...base, flowSections: base.flowSections ?? [], breakBefore: base.breakBefore ?? [], flowUnits: base.flowUnits ?? [], compactContents: base.compactContents ?? false };
  let { html, sections } = composeRevisedReportHtml(input);
  const running = runningStrings(html);
  const readBody = async (pdf: Uint8Array) => (await read(pdf)).map((t) => ({ all: stripRunning(t.all, running), heads: t.heads }));
  if (!canPass()) throw new LayoutDeadline(0);
  let pages = await readBody((await render(html)).pdf);
  let passes = 1;
  const planned = planLayout(pages, sections, { flowSections: input.flowSections!, breakBefore: input.breakBefore!, flowUnits: input.flowUnits!, compactContents: !!input.compactContents });
  if (planned.flowSections.length !== input.flowSections!.length || planned.breakBefore.length !== input.breakBefore!.length || planned.flowUnits.length !== input.flowUnits!.length || planned.compactContents !== !!input.compactContents) {
    if (!canPass()) throw new LayoutDeadline(passes);
    input = { ...input, ...planned };
    ({ html, sections } = composeRevisedReportHtml(input));
    pages = await readBody((await render(html)).pdf);
    passes++;
  }
  let { pageMap, missing } = pageMapFrom(pages, sections);
  // Filling in the numbers can lengthen a contents row; the map is re-read from each render until it is stable (at
  // most `maxNumberPasses` passes), and whatever still differs is reported, never silently printed as verified.
  let final: { pdf: Buffer; sha256: string } | null = null;
  let finalHtml = html;
  let finalPages: PageText[] = pages;
  let printed: PageMap = {};
  let moved: string[] = ['not-rendered'];
  for (let attempt = 0; attempt < (deps.maxNumberPasses ?? 3); attempt++) {
    if (!canPass()) { if (!final) throw new LayoutDeadline(passes); moved = moved.length ? moved : ['deadline']; break; }
    const html2 = composeRevisedReportHtml({ ...input, pageMap }).html;
    const out = await render(html2);
    passes++;
    final = out; finalHtml = html2; printed = pageMap;
    finalPages = await readBody(out.pdf);
    const check = pageMapFrom(finalPages, sections);
    moved = Object.entries(pageMap).filter(([k, v]) => check.pageMap[k] !== v).map(([k]) => k);
    missing = check.missing;
    if (!input.compactContents && contentsOverflow(finalPages, sections)) { input = { ...input, compactContents: true }; moved = moved.length ? moved : ['contents-overflow']; }
    if (!moved.length) break;
    pageMap = check.pageMap;
  }
  return {
    html: finalHtml, pdf: final!.pdf, sha256: final!.sha256,
    layout: {
      version: PUBLICATION_LAYOUT_VERSION, passes, pages: finalPages.length, flowSections: input.flowSections!, breakBefore: input.breakBefore!, flowUnits: input.flowUnits!, compactContents: !!input.compactContents,
      pageMap: printed, contentsComplete: !missing.length && !moved.length, missing: [...missing, ...moved.map((k) => `moved:${k}`)], sparsePages: sparsePagesOf(finalPages)
    }
  };
}
