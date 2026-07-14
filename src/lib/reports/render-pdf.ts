let browserPromise: Promise<any> | null = null;

type ChromiumRuntime = {
  args: string[];
  defaultViewport: { width: number; height: number } | null;
  executablePath: () => Promise<string>;
  headless: boolean | 'shell';
};

function normalizeChromiumModule(chromiumModule: unknown): ChromiumRuntime {
  const candidate = (chromiumModule as { default?: ChromiumRuntime }).default ?? chromiumModule;
  return candidate as ChromiumRuntime;
}

async function fileExists(pathname: string): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    return (await fs.stat(pathname)).isFile();
  } catch {
    return false;
  }
}

async function directoryExists(pathname: string): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    return (await fs.stat(pathname)).isDirectory();
  } catch {
    return false;
  }
}

async function resolveChromiumExecutablePath(chromium: ChromiumRuntime): Promise<string> {
  const localOverride = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (localOverride) {
    if (!await fileExists(localOverride)) {
      throw new Error(`Configured Chromium executable does not exist: ${localOverride}`);
    }
    console.info('Chromium runtime diagnostics', {
      executablePath: localOverride,
      executableExists: true,
      nodeVersion: process.version,
      source: 'explicit-local-override'
    });
    return localOverride;
  }
  const executablePath = await chromium.executablePath();
  const executableExists = await fileExists(executablePath);
  const al2023LibraryPath = '/tmp/al2023/lib';
  const al2023LibraryDirectoryExists = await directoryExists(al2023LibraryPath);
  const libNsprExists = await fileExists(`${al2023LibraryPath}/libnspr4.so`);
  const ldLibraryPath = process.env.LD_LIBRARY_PATH ?? '';

  console.info('Chromium runtime diagnostics', {
    executablePath,
    executableExists,
    nodeVersion: process.version,
    al2023LibraryDirectoryExists,
    libNsprExists,
    ldLibraryPathContainsAl2023: ldLibraryPath.split(':').includes(al2023LibraryPath)
  });

  if (!executableExists) {
    throw new Error(`Packaged Chromium executable was resolved but does not exist: ${executablePath}`);
  }

  return executablePath;
}

async function launchBrowser() {
  const [{ default: puppeteer }, chromiumModule] = await Promise.all([
    import('puppeteer-core'),
    import('@sparticuz/chromium')
  ]);
  const chromium = normalizeChromiumModule(chromiumModule);
  const executablePath = await resolveChromiumExecutablePath(chromium);
  const localOverride = Boolean(process.env.PUPPETEER_EXECUTABLE_PATH?.trim());
  const args = localOverride
    ? puppeteer.defaultArgs({ args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true })
    : puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' });

  return puppeteer.launch({
    args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: localOverride ? true : 'shell'
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
