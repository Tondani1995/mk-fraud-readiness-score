import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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

const fixture = comprehensiveFixtures.weakOrganisationMeaningfulEvidence;
const model = buildComprehensiveDeliveryModel(fixture.analytical, fixture.reviewer);
const reportHtml = renderComprehensiveReportHtml(model);
const boardHtml = renderBoardReadoutHtml(model);
const reportPath = path.join(outputDir, 'comprehensive-report-fixture.pdf');
const boardPath = path.join(outputDir, 'comprehensive-board-readout-fixture.pdf');
await renderPdf(reportHtml, reportPath, 'MK Comprehensive Report · Confidential');
await renderPdf(boardHtml, boardPath, 'MK Board Readout · Confidential');

const reportInfo = (await execFileAsync('pdfinfo', [reportPath])).stdout;
const boardInfo = (await execFileAsync('pdfinfo', [boardPath])).stdout;
const pageCount = (info) => Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
const reportPages = pageCount(reportInfo);
const boardPages = pageCount(boardInfo);
if (boardPages < 5 || boardPages > 8) throw new Error(`Board readout page count ${boardPages} is outside the required 5-8 page bound.`);
if (reportPages < 17) throw new Error(`Comprehensive report rendered only ${reportPages} pages; expected readable multi-section output.`);

const renderDir = path.join(outputDir, 'renders');
await fs.mkdir(renderDir, { recursive: true });
await execFileAsync('pdftoppm', ['-f', '1', '-l', '1', '-png', '-r', '130', reportPath, path.join(renderDir, 'comprehensive-report-page')]);
await execFileAsync('pdftoppm', ['-f', '1', '-l', '1', '-png', '-r', '130', boardPath, path.join(renderDir, 'board-readout-page')]);
const result = { reportPath, reportPages, boardPath, boardPages, screenshots: [path.join(renderDir, 'comprehensive-report-page-1.png'), path.join(renderDir, 'board-readout-page-1.png')] };
await fs.writeFile(path.join(outputDir, 'comprehensive-render-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
