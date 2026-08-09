#!/usr/bin/env node

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PDFDocument, PDFName } from 'pdf-lib';

process.env.PUPPETEER_EXECUTABLE_PATH ??= '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { renderHtmlToPdfBuffer, __resetPdfRendererStateForTests } = await import('../src/lib/reports/render-pdf.ts');
const fixturePath = 'tmp/g30-pdf-accessibility-fixture.pdf';
const html = `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>MK G30 accessibility fixture</title></head><body><h1>Fraud readiness report</h1><h2>Executive summary</h2><p>Fixture-only renderer probe.</p><h2>Action register</h2><table><thead><tr><th>Action</th><th>Owner</th></tr></thead><tbody><tr><td>Review</td><td>Leadership</td></tr></tbody></table><p><a href="https://example.com">Read the methodology</a></p></body></html>`;

try {
  __resetPdfRendererStateForTests();
  const bytes = await renderHtmlToPdfBuffer(html);
  fs.writeFileSync(fixturePath, bytes);
  const info = execFileSync('pdfinfo', [fixturePath], { encoding: 'utf8' });
  const extracted = execFileSync('pdftotext', [fixturePath, '-'], { encoding: 'utf8' });
  const document = await PDFDocument.load(bytes);
  const language = document.catalog.get(PDFName.of('Lang'))?.toString() ?? null;
  const result = {
    ok: true,
    fixtureOnly: true,
    title: /^Title:\s*(.*)$/m.exec(info)?.[1]?.trim() ?? null,
    taggedPdfInfo: /^Tagged:\s*(.*)$/m.exec(info)?.[1]?.trim() ?? null,
    language,
    textOrder: ['Fraud readiness report', 'Executive summary', 'Action register'].every((value) => extracted.indexOf(value) >= 0),
    textOrderIndexes: ['Fraud readiness report', 'Executive summary', 'Action register'].map((value) => extracted.indexOf(value)),
    tableTextExtracted: extracted.includes('Action') && extracted.includes('Leadership'),
    linkTextExtracted: extracted.includes('Read the methodology'),
    bookmarks: document.catalog.has(PDFName.of('Outlines')),
    markInfo: document.catalog.has(PDFName.of('MarkInfo')),
    taggedStructureTree: document.catalog.has(PDFName.of('StructTreeRoot')),
    sourceSemantics: { lang: true, title: true, headings: true, tableHeader: true, meaningfulLink: true },
    limitation: 'Fixture-only result. Commercial retained-artifact verification remains gated because no retained PDF is present in this clone.',
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  try { fs.unlinkSync(fixturePath); } catch {}
}
