import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel, renderBoardReadoutHtml, renderComprehensiveReportHtml } from '../src/lib/reports/comprehensive/index.ts';

const execFileAsync = promisify(execFile);
const outputDir = path.resolve(process.env.COMPREHENSIVE_OUTPUT_DIR ?? './outputs/comprehensive');
await fs.mkdir(outputDir, { recursive: true });

async function renderPdf(html, outputPath, footerText) {
  // Prefer the same Chromium/Puppeteer path as production when installed. The desktop runtime
  // may not include the application dependency tree, so fall back to the installed Chrome CLI for
  // deterministic fixture rendering rather than silently skipping visual verification.
  let puppeteer;
  let chromium;
  try {
    const moduleRoot = process.env.CODEX_NODE_MODULES ?? '/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
    const requireFromBundle = createRequire(path.join(moduleRoot, 'package.json'));
    puppeteer = requireFromBundle('puppeteer-core');
    const chromiumModule = requireFromBundle('@sparticuz/chromium');
    chromium = chromiumModule.default ?? chromiumModule;
  } catch {
    const htmlPath = `${outputPath}.html`;
    await fs.writeFile(htmlPath, html);
    const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    await execFileAsync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', `--print-to-pdf=${outputPath}`, htmlPath]);
    await fs.unlink(htmlPath).catch(() => {});
    return;
  }
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
  const browser = await puppeteer.launch({ args: process.env.PUPPETEER_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args, executablePath, headless: true, defaultViewport: chromium.defaultViewport });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="width:100%;padding:0 14mm;color:#6c665b;font:7px Arial,sans-serif;text-align:right;border-top:1px solid #ded5c5;"><span style="float:left;padding-top:4px;">${footerText}</span><span style="display:inline-block;padding-top:4px;"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`, margin: { top: '10mm', right: '12mm', bottom: '14mm', left: '12mm' } });
    await fs.writeFile(outputPath, pdf);
    await page.close();
  } finally {
    await browser.close();
  }
}

const fixtureKey = process.env.COMPREHENSIVE_FIXTURE ?? 'weakOrganisationMeaningfulEvidence';
const fixture = comprehensiveFixtures[fixtureKey];
if (!fixture) throw new Error(`Unknown Comprehensive fixture: ${fixtureKey}`);
const model = buildComprehensiveDeliveryModel(fixture.analytical);
const reportHtml = renderComprehensiveReportHtml(model);
const boardHtml = renderBoardReadoutHtml(model);
const suffix = fixtureKey === 'weakOrganisationMeaningfulEvidence' ? 'fixture' : fixtureKey.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const reportPath = path.join(outputDir, `comprehensive-report-${suffix}.pdf`);
const boardPath = path.join(outputDir, `comprehensive-board-readout-${suffix}.pdf`);
await renderPdf(reportHtml, reportPath, 'MK Comprehensive Report · Confidential');
await renderPdf(boardHtml, boardPath, 'MK Board Readout · Confidential');

const reportInfo = (await execFileAsync('pdfinfo', [reportPath])).stdout;
const boardInfo = (await execFileAsync('pdfinfo', [boardPath])).stdout;
const pageCount = (info) => Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
const reportPages = pageCount(reportInfo);
const boardPages = pageCount(boardInfo);
if (boardPages < 5 || boardPages > 8) throw new Error(`Board readout page count ${boardPages} is outside the required 5-8 page bound.`);
if (reportPages < 17) throw new Error(`Comprehensive report rendered only ${reportPages} pages; expected readable multi-section output.`);
if (reportPages > 40) throw new Error(`Comprehensive report rendered ${reportPages} pages; the approved commercial corridor caps the dense fixture at 40.`);

const renderDir = path.join(outputDir, 'renders');
await fs.mkdir(renderDir, { recursive: true });
const reportPrefix = path.join(renderDir, `comprehensive-report-${suffix}-page`);
const boardPrefix = path.join(renderDir, `board-readout-${suffix}-page`);
await execFileAsync('pdftoppm', ['-f', '1', '-l', String(reportPages), '-png', '-r', '100', reportPath, reportPrefix]);
await execFileAsync('pdftoppm', ['-f', '1', '-l', String(boardPages), '-png', '-r', '100', boardPath, boardPrefix]);

async function contactSheet(prefix, pageCount, filename) {
  const pagePaths = await Promise.all(Array.from({ length: pageCount }, async (_, index) => {
    const padded = `${prefix}-${String(index + 1).padStart(2, '0')}.png`;
    const plain = `${prefix}-${index + 1}.png`;
    try { await fs.access(padded); return padded; } catch { return plain; }
  }));
  const thumbs = await Promise.all(pagePaths.map(async (pagePath) => {
    const buffer = await sharp(pagePath).resize({ width: 260, height: 370, fit: 'contain', background: '#ffffff' }).png().toBuffer();
    return { input: buffer };
  }));
  const columns = 4;
  const rows = Math.ceil(pageCount / columns);
  const canvas = sharp({ create: { width: columns * 270, height: rows * 390, channels: 4, background: '#e8edf1' } });
  await canvas.composite(thumbs.map((thumb, index) => ({ ...thumb, left: (index % columns) * 270 + 5, top: Math.floor(index / columns) * 390 + 5 }))).png().toFile(path.join(renderDir, filename));
}

const reportContactSheet = path.join(renderDir, `comprehensive-report-${suffix}-contact-sheet.png`);
const boardContactSheet = path.join(renderDir, `board-readout-${suffix}-contact-sheet.png`);
await contactSheet(reportPrefix, reportPages, path.basename(reportContactSheet));
await contactSheet(boardPrefix, boardPages, path.basename(boardContactSheet));
const firstReportPage = `${reportPrefix}-01.png`;
const firstBoardPage = `${boardPrefix}-1.png`;
const result = { fixtureKey, reportPath, reportPages, boardPath, boardPages, screenshots: [firstReportPage, firstBoardPage], contactSheets: [reportContactSheet, boardContactSheet] };
await fs.writeFile(path.join(outputDir, 'comprehensive-render-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
