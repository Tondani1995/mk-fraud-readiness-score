let browserPromise: Promise<any> | null = null;

// Tracks consecutive render failures across renderer instances (i.e. across HTTP invocations
// that share this module's warm state) so that a persistently broken Chromium runtime is
// observable as a distinct operational signal, not just a string of individually-explained
// per-report errors. Reset to 0 on any successful render.
let consecutiveRenderFailures = 0;
const REPEATED_FAILURE_ALERT_THRESHOLD = 3;

/** Test-only hook: forces the next getBrowser() call to relaunch regardless of cached state. */
export function __resetPdfRendererStateForTests(): void {
  browserPromise = null;
  consecutiveRenderFailures = 0;
}

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

/** Best-effort close that never lets a failure while tearing down a dead resource mask the real error. */
async function closeSafely(closeable: { close: () => Promise<void> } | null | undefined): Promise<void> {
  if (!closeable) return;
  try {
    await closeable.close();
  } catch {
    // The resource may already be gone (crashed process, already-closed page) -- nothing more
    // we can safely do here, and this must never throw over a caller's real error.
  }
}

async function getBrowser() {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) {
        return existing;
      }
      console.warn('phase14_pdf_renderer_stale_browser_discarded', {
        reason: 'cached_browser_disconnected'
      });
    } catch {
      // The cached launch itself failed after being cached (shouldn't normally happen since
      // launchBrowser()'s own .catch clears browserPromise, but guard against a stale reference
      // from a prior tick anyway) -- fall through to relaunch.
    }
    browserPromise = null;
  }
  browserPromise = launchBrowser().catch((error) => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

/**
 * H1 fix: a cached browser handle must never be reused once it is known (or suspected) dead.
 * Any failure while acquiring a page, setting content, or rendering the PDF clears the cached
 * browser so the *next* call relaunches Chromium from scratch, rather than repeatedly retrying
 * `newPage()`/`page.pdf()` against a browser process that has already crashed. Page and browser
 * resources are always closed on the way out, and repeated failures are logged as a distinct,
 * observable operational signal (`phase14_pdf_renderer_repeated_failures`) separate from the
 * per-report error already recorded on the fulfilment row by the caller.
 */
export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  let browser: { newPage: () => Promise<unknown>; close: () => Promise<void>; isConnected: () => boolean } | null = null;
  let page: { close: () => Promise<void>; setContent: (html: string, opts: unknown) => Promise<void>; pdf: (opts: unknown) => Promise<unknown> } | null = null;
  try {
    browser = await getBrowser();
    page = (await browser!.newPage()) as typeof page;
    await page!.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    const pdf = await page!.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    consecutiveRenderFailures = 0;
    return Buffer.from(pdf as Parameters<typeof Buffer.from>[0]);
  } catch (error) {
    // Never reuse a browser that failed to launch, open a page, load content, or render -- any of
    // these can indicate a crashed or hung renderer process. Discard the cached handle so the
    // next caller relaunches Chromium rather than retrying against the same dead process. This
    // also covers a launch failure inside getBrowser() itself (browser stays null in that case).
    browserPromise = null;
    consecutiveRenderFailures += 1;
    if (consecutiveRenderFailures >= REPEATED_FAILURE_ALERT_THRESHOLD) {
      console.error('phase14_pdf_renderer_repeated_failures', {
        consecutiveFailures: consecutiveRenderFailures,
        lastError: error instanceof Error ? error.message : String(error)
      });
    }
    await closeSafely(browser);
    throw error;
  } finally {
    await closeSafely(page);
  }
}
