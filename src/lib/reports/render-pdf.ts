let browserPromise: Promise<any> | null = null;

type ChromiumRuntime = {
  args: string[];
  defaultViewport: { width: number; height: number } | null;
  executablePath: (input?: string) => Promise<string>;
  headless: boolean | 'shell';
};

type BinDirectoryCheck = {
  path: string;
  exists: boolean;
};

function bootstrapChromiumRuntimeEnvironment() {
  process.env.AWS_LAMBDA_JS_RUNTIME ??= `nodejs${process.versions.node.split('.')[0]}.x`;
  process.env.AWS_EXECUTION_ENV ??= `AWS_Lambda_nodejs${process.versions.node.split('.')[0]}.x`;
}

function normalizeChromiumModule(chromiumModule: unknown): ChromiumRuntime {
  const candidate = (chromiumModule as { default?: ChromiumRuntime }).default ?? chromiumModule;
  return candidate as ChromiumRuntime;
}

async function directoryExists(pathname: string): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    return (await fs.stat(pathname)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(pathname: string): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    return (await fs.stat(pathname)).isFile();
  } catch {
    return false;
  }
}

async function resolveChromiumExecutablePath(chromium: ChromiumRuntime): Promise<string> {
  const path = await import('node:path');
  const cwd = process.cwd();
  const candidateBinDirectories = [
    path.join(cwd, 'node_modules', '@sparticuz', 'chromium', 'bin'),
    path.join('/var/task', 'node_modules', '@sparticuz', 'chromium', 'bin'),
    path.join(cwd, '.next', 'server', 'bin')
  ];

  const chromiumBinDirectories: BinDirectoryCheck[] = [];
  for (const candidate of candidateBinDirectories) {
    chromiumBinDirectories.push({ path: candidate, exists: await directoryExists(candidate) });
  }

  const packagedBinDirectory = chromiumBinDirectories.find((candidate) => candidate.exists)?.path;
  if (!packagedBinDirectory) {
    console.error('Chromium runtime diagnostics', {
      cwd,
      chromiumBinDirectories,
      executablePath: null,
      executableExists: false,
      lambdaRuntime: process.env.AWS_LAMBDA_JS_RUNTIME ?? null,
      ldLibraryPathSet: Boolean(process.env.LD_LIBRARY_PATH)
    });
    throw new Error('Packaged Chromium bin directory was not found in the Vercel function trace.');
  }

  const executablePath = await chromium.executablePath(packagedBinDirectory);
  const executableExists = await fileExists(executablePath);
  console.info('Chromium runtime diagnostics', {
    cwd,
    chromiumBinDirectories,
    executablePath,
    executableExists,
    lambdaRuntime: process.env.AWS_LAMBDA_JS_RUNTIME ?? null,
    ldLibraryPathSet: Boolean(process.env.LD_LIBRARY_PATH)
  });

  if (!executableExists) {
    throw new Error(`Packaged Chromium executable was resolved but does not exist: ${executablePath}`);
  }

  return executablePath;
}

async function launchBrowser() {
  bootstrapChromiumRuntimeEnvironment();
  const [{ default: puppeteer }, chromiumModule] = await Promise.all([
    import('puppeteer-core'),
    import('@sparticuz/chromium')
  ]);
  const chromium = normalizeChromiumModule(chromiumModule);

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await resolveChromiumExecutablePath(chromium),
    headless: chromium.headless
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
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
