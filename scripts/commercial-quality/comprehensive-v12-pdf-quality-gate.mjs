#!/usr/bin/env node
/**
 * Provider-free PDF stress gate for the current V1.2 Comprehensive surfaces.
 *
 * The engine-quality gate writes deterministic HTML for Bokamoso, Siyakhula and
 * Vhutshilo. This gate fills the six reserved interpretation slots to each
 * contract's maximum word allowance, renders a real Chromium PDF, and runs the
 * established page-level raster layout audit. No provider, database or
 * deployment is involved.
 */
import fs from 'node:fs';
import path from 'node:path';

import { renderHtmlToPdfBuffer, closeRenderBrowser } from '../../src/lib/reports/render-pdf.ts';
import { INTERPRETATION_CONTRACTS } from '../../src/lib/reports/comprehensive/interpretation.ts';
import { auditPdfLayout } from './layout-fit-gate.mjs';

const engineDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/comprehensive-v12-engine-quality';
const outDir = process.env.PDF_OUTPUT_DIR ?? 'outputs/comprehensive-v12-pdf-quality';
fs.mkdirSync(outDir, { recursive: true });

const profiles = ['bokamoso', 'siyakhula', 'vhutshilo', 'motheo'];
const failures = [];
const results = [];

const pendingPattern = /<div class="interp interp--pending"><div class="interp-l">([^<]+)<\/div><p class="muted">Management interpretation is added at generation\. The analysis on this page stands without it\.<\/p><\/div>/g;

function stressProse(targetWords, slotLabel) {
  const sentence = [
    'This', 'layout', 'stress', 'fixture', 'uses', 'complete', 'executive', 'prose', 'to', 'occupy',
    'the', 'reserved', 'interpretation', 'space', 'without', 'adding', 'customer', 'facts', 'or', 'changing',
    'the', 'deterministic', 'analysis', 'beneath', 'the', 'report', 'section'
  ];
  const words = [];
  while (words.length < targetWords) words.push(...sentence);
  const exact = words.slice(0, targetWords);
  // Add ordinary punctuation without changing the word count so Chromium wraps
  // prose rather than a single pathological sentence.
  for (let i = 19; i < exact.length; i += 20) exact[i] = `${exact[i]}.`;
  return exact.join(' ');
}

function fillInterpretationSlots(html) {
  let index = 0;
  const filled = html.replace(pendingPattern, (_full, label) => {
    const contract = INTERPRETATION_CONTRACTS[index];
    if (!contract) return _full;
    index += 1;
    return `<div class="interp"><div class="interp-l">${label}</div><p>${stressProse(contract.maxWords, label)}</p></div>`;
  });
  if (index !== INTERPRETATION_CONTRACTS.length) {
    throw new Error(`Expected ${INTERPRETATION_CONTRACTS.length} interpretation slots, replaced ${index}.`);
  }
  return filled;
}

try {
  for (const profile of profiles) {
    const source = path.join(engineDir, `${profile}.html`);
    if (!fs.existsSync(source)) {
      failures.push({ profile, code: 'MISSING_ENGINE_HTML', detail: source });
      continue;
    }

    const html = fillInterpretationSlots(fs.readFileSync(source, 'utf8'));
    const pdf = await renderHtmlToPdfBuffer(html, {
      footerLabel: `MK Fraud Readiness Comprehensive: ${profile} V1.2 layout stress`
    });
    const pdfPath = path.join(outDir, `${profile}-stress.pdf`);
    const layoutPath = path.join(outDir, `${profile}-layout.json`);
    fs.writeFileSync(pdfPath, pdf);

    const layout = auditPdfLayout(pdfPath);
    fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + '\n');

    if (pdf.length < 50_000) failures.push({ profile, code: 'IMPLAUSIBLE_PDF_SIZE', detail: `${pdf.length} bytes` });
    if (layout.failCount > 0) {
      failures.push({
        profile,
        code: 'PDF_LAYOUT',
        detail: `${layout.failCount} page-level layout failure(s): ${layout.pages.filter((page) => !page.pass).map((page) => page.page).join(', ')}`
      });
    }

    results.push({
      profile,
      bytes: pdf.length,
      pages: layout.pageCount,
      layoutFailures: layout.failCount,
      blankPages: layout.pages.filter((page) => page.blank).map((page) => page.page),
      clippedPages: layout.pages.filter((page) => page.clippedElements.length > 0).map((page) => ({ page: page.page, edges: page.clippedElements })),
      footerIntrusions: layout.pages.filter((page) => page.footerIntrusionMm > 0).map((page) => ({ page: page.page, mm: page.footerIntrusionMm }))
    });
  }
} finally {
  await closeRenderBrowser();
}

const summary = {
  providerCalls: 0,
  databaseReads: 0,
  productionMutations: 0,
  interpretationStress: 'MAX_CONTRACT_WORDS',
  results,
  failures
};
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

if (failures.length) {
  console.error(`FAIL: ${failures.length} Comprehensive PDF quality violation(s).`);
  process.exit(1);
}
console.log(`PASS: ${results.length} Comprehensive V1.2 PDFs survive maximum bounded-interpretation layout stress with zero page-level failures.`);
// Chromium can leave child-process handles alive in a one-shot Actions runner
// even after Puppeteer's browser.close() resolves. All evidence is already
// flushed synchronously above; terminate the CLI explicitly so a successful
// proof cannot consume the job until its outer timeout.
process.exit(0);
