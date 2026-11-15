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
      const accessibility = ['--export-tagged-pdf', '--generate-pdf-document-outline'];
      const localExecutable = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
      if (localExecutable) {
        return puppeteer.launch({ executablePath: localExecutable, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', ...accessibility], protocolTimeout: 300_000 });
      }
      // Hosted runtime: the same packaged Chromium the production renderer (render-pdf.ts) uses.
      const { default: chromium } = await import('@sparticuz/chromium');
      return puppeteer.launch({
        executablePath: await chromium.executablePath(),
        headless: 'shell',
        args: await puppeteer.defaultArgs({ args: [...chromium.args, ...accessibility], headless: 'shell' }),
        defaultViewport: (chromium as any).defaultViewport ?? null,
        protocolTimeout: 240_000
      });
    })();
  }
  return browserPromise;
}

/** `timeoutMs` bounds both loading and printing, so a render cannot outlast the caller's deadline. */
export async function renderPublicationPdf(html: string, options: { timeoutMs?: number } = {}): Promise<{ pdf: Buffer; sha256: string }> {
  const timeout = Math.max(1_000, Math.min(options.timeoutMs ?? 300_000, 300_000));
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout });
    await page.evaluate(() => (document as any).fonts.ready);
    const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout }));
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
