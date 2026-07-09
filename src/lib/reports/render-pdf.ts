let browserPromise: Promise<any> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    const [{ default: puppeteer }, chromium] = await Promise.all([
      import('puppeteer-core'),
      import('@sparticuz/chromium')
    ]);

    browserPromise = puppeteer.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless
    });
  }
  return browserPromise;
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
