#!/usr/bin/env node
/**
 * Proof that a rendered Comprehensive report carries a usable outline.
 *
 * Renders a real PDF offline from the deterministic fixture -- no database, no provider, no
 * spend -- and reads the outline back out of the finished bytes. Static wiring assertions
 * live in brand-conformance-tests; this one exists because a bookmark tree that is wired but
 * never resolves to a page is indistinguishable from no bookmarks at all.
 *
 * Requires a local Chromium via PUPPETEER_EXECUTABLE_PATH. Skips cleanly without one, so it
 * never blocks a machine that cannot render.
 */
import assert from 'node:assert/strict';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml, comprehensiveSectionPlan, COMPREHENSIVE_REGISTER_TITLES } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';
import { addPdfBookmarks, extractHeadingPageMap } from '../../src/lib/reports/pdf-navigation.ts';

const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, status: 'PASS' }); } catch (e) { results.push({ name, status: 'FAIL', detail: e.message.split('\n')[0] }); } };

const analytical = comprehensiveFixtures.denseWeakAssessment.analytical;
const evidence = analytical.evidenceModel;
const domains = [{ name: 'Fraud Leadership and Governance', score: 42, band: 'Developing' }];
const scenarioFacts = evidence.scenarios.map((scenario) => ({
  id: scenario.id, title: scenario.title, entryPoint: scenario.entryPoint, mechanism: scenario.fraudSequence,
  linkedFindingIds: scenario.linkedFindingIds ?? [], linkedRiskIds: scenario.linkedRiskIds ?? [],
  linkedQuestionCodes: scenario.linkedQuestionCodes ?? []
}));
const model = buildComprehensiveManagementModel(assembleComprehensive(evidence, { scenarioFacts, domains }));
const html = renderComprehensiveManagementReportHtml({
  model, organisationName: 'Fixture Organisation', assessmentReference: 'MKFRS-NAV-FIXTURE',
  score: 43.33, maturity: 'Developing',
  domains: domains.map((d) => ({ title: d.name, score: d.score, band: d.band }))
});

check('the rendered HTML carries the approved assurance boundary', () => {
  assert.match(html, /Confidential · Self-assessment advisory · Not an independent assurance opinion/);
});
check('the rendered HTML advertises no production mechanism on the cover', () => {
  const cover = html.slice(html.indexOf('page--navy'), html.indexOf('page--navy') + 4000);
  assert.doesNotMatch(cover, /Automated analysis/i);
});
check('the rendered HTML embeds the approved mark, not typed text', () => {
  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(html, />MK Fraud Insights<\/div>/);
});
check('the rendered HTML carries MK Navy and MK Slate', () => {
  assert.match(html, /#01123A/i);
  assert.match(html, /#47515A/i);
  assert.doesNotMatch(html, /#0B1B33/i);
  assert.doesNotMatch(html, /#5A6B7C/i);
});

let outline = null;
let pageCount = null;
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  const pdf = await renderHtmlToPdfBuffer(html, { footerLabel: 'MK Fraud Readiness Comprehensive — Fixture' });
  const sections = comprehensiveSectionPlan(model);
  const sectionEntries = [];
  for (const [index, section] of sections.entries()) {
    const at = html.indexOf(`class="q">${index + 1} · ${section.title}<`);
    const heading = at >= 0 ? /<h1[^>]*>([^<]+)<\/h1>/.exec(html.slice(at)) : null;
    sectionEntries.push({ key: (heading?.[1] ?? section.title).trim(), label: section.title });
  }
  const registerEntries = COMPREHENSIVE_REGISTER_TITLES.map(([letter, title]) => ({ key: title, label: `Appendix ${letter} · ${title}` }));
  const pageMap = await extractHeadingPageMap(new Uint8Array(pdf), [...sectionEntries, ...registerEntries], 3);
  const located = (entry) => Number.isInteger(pageMap[entry.key]);
  const bookmarks = sectionEntries.filter(located).map((entry) => ({ title: entry.label, pageNumber: pageMap[entry.key] }));
  const registers = registerEntries.filter(located);
  if (registers.length) bookmarks.push({ title: 'Appendices', pageNumber: pageMap[registers[0].key], children: registers.map((e) => ({ title: e.label, pageNumber: pageMap[e.key] })) });
  const withOutline = await addPdfBookmarks(new Uint8Array(pdf), bookmarks);
  await closeRenderBrowser();

  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(withOutline);
  pageCount = doc.getPageCount();
  outline = { top: bookmarks.length, children: bookmarks.at(-1)?.children?.length ?? 0, titles: bookmarks.map((b) => b.title) };

  check('every planned section resolves to a page', () => {
    assert.equal(bookmarks.filter((b) => b.title !== 'Appendices').length, sections.length,
      `${sections.length} sections planned, ${bookmarks.length - 1} located`);
  });
  check('the appendix registers are nested under one parent', () => {
    const appendices = bookmarks.find((b) => b.title === 'Appendices');
    assert.ok(appendices, 'no appendix parent written');
    assert.ok(appendices.children.length >= 4, `only ${appendices.children.length} registers located`);
  });
  check('every bookmark points inside the document', () => {
    const flat = bookmarks.flatMap((b) => [b, ...(b.children ?? [])]);
    for (const node of flat) {
      assert.ok(node.pageNumber >= 1 && node.pageNumber <= pageCount, `${node.title} points at page ${node.pageNumber} of ${pageCount}`);
    }
  });
  check('the outline is readable from the finished bytes', () => {
    const catalog = doc.catalog;
    assert.ok(catalog.get(catalog.context.obj('Outlines').constructor.of?.('Outlines') ?? undefined) !== undefined
      || Buffer.from(withOutline).includes(Buffer.from('/Outlines')), 'no /Outlines entry in the produced PDF');
  });
} else {
  results.push({ name: 'rendered outline proof', status: 'SKIP', detail: 'PUPPETEER_EXECUTABLE_PATH not set' });
}

const failed = results.filter((r) => r.status === 'FAIL');
console.log(JSON.stringify({ suite: 'increment-2-comprehensive-navigation', pageCount, outline, total: results.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
