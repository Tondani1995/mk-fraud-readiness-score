import crypto from 'node:crypto';

/**
 * PDF rendering for the MK publication system: Chromium's print engine with the page rules in the document itself
 * (running heads and folios as CSS page-margin boxes), tagged PDF and a document outline. The existing renderer
 * (`render-pdf.ts`, protected) adds its own Arial footer template, which the publication system replaces; this
 * function therefore launches Chromium directly with the same accessibility arguments.
 */
let browserPromise: Promise<any> | null = null;
async function browser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { default: puppeteer } = await import('puppeteer-core');
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
      if (!executablePath) throw new Error('PUPPETEER_EXECUTABLE_PATH is required for the publication renderer in this prototype.');
      return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--export-tagged-pdf', '--generate-pdf-document-outline'], protocolTimeout: 300_000 });
    })();
  }
  return browserPromise;
}

export async function renderPublicationPdf(html: string): Promise<{ pdf: Buffer; sha256: string }> {
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 300_000 });
    await page.evaluate(() => (document as any).fonts.ready);
    const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 300_000 }));
    return { pdf, sha256: crypto.createHash('sha256').update(pdf).digest('hex') };
  } finally {
    await page.close();
  }
}

export async function closePublicationBrowser(): Promise<void> {
  if (!browserPromise) return;
  try { (await browserPromise).close(); } catch { /* already closed */ }
  browserPromise = null;
}
