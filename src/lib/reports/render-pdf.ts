let browserPromise: Promise<any> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    const puppeteer = await import('puppeteer');
    browserPromise = puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserPromise;
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' }
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
