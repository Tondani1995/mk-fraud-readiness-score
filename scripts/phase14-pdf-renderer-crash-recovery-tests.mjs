// Phase 14 -- H1: PDF renderer Chromium crash recovery.
//
// Proves the render-pdf.ts fix against the REAL, compiled production module: a cached browser
// handle is health-checked with isConnected() before reuse; any failure acquiring a page, setting
// content, or rendering the PDF discards the cached browser so the *next* call relaunches
// Chromium; a dead browser handle is never reused; page/browser resources are closed safely even
// on failure; and repeated consecutive failures are logged as a distinct observable operational
// signal.
//
// Environment note: this sandbox is linux/arm64 without root, and the packaged
// @sparticuz/chromium binary (linux/x64, AL2023-lib-dependent) cannot launch a real Chromium
// process here -- confirmed directly (scripts/phase14-node24-chromium-smoke.mjs fails in this
// sandbox for that reason, independent of anything in this change). Spawning a real x86_64
// Chromium under user-mode emulation was evaluated and rejected as too slow/flaky to be a
// trustworthy CI signal. Instead, this test compiles the real render-pdf.ts to disk and lets
// Node's normal module resolution load it for real, but shadows only the two external packages
// it imports (puppeteer-core, @sparticuz/chromium) with local fakes that simulate a browser
// process crashing between calls. Every line of render-pdf.ts's own cache/health-check/cleanup
// logic runs unmodified and for real; only the OS-level browser process is faked, which is the
// one boundary this sandbox cannot cross. A literal spawned-process crash test should additionally
// be run once against a real Node 24 / Vercel-equivalent preview environment before production
// activation, since that is the only place the real packaged Chromium binary can launch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = process.cwd();
const sourcePath = path.join(root, 'src/lib/reports/render-pdf.ts');
const source = fs.readFileSync(sourcePath, 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: sourcePath
}).outputText;

// ---- Build a real, on-disk fixture directory so Node's native module resolution (including the
// dynamic import() calls inside the compiled module, which a require() shim cannot intercept)
// naturally finds our fakes instead of the real packages. ----
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-pdf-crash-'));
const controlPath = path.join(workDir, 'control.cjs');
const rendererPath = path.join(workDir, 'render-pdf.cjs');
const fakeChromiumBinaryPath = path.join(workDir, 'fake-chromium-binary');

fs.writeFileSync(fakeChromiumBinaryPath, '#!/bin/sh\necho fake\n');
fs.writeFileSync(rendererPath, compiled);

fs.writeFileSync(controlPath, `
// Shared mutable test-control state, required by both the fake puppeteer-core package (by
// relative path, unaffected by node_modules shadowing) and this test script (by the same
// absolute path -- Node's require cache makes both sides see the same singleton object).
module.exports = {
  launchCount: 0,
  instances: [],
  failNextCallAt: null, // 'newPage' | 'setContent' | 'pdf' | null
  pageCloseCount: 0,
  browserCloseCount: 0
};
`);

const puppeteerCoreDir = path.join(workDir, 'node_modules', 'puppeteer-core');
fs.mkdirSync(puppeteerCoreDir, { recursive: true });
fs.writeFileSync(path.join(puppeteerCoreDir, 'package.json'), JSON.stringify({ name: 'puppeteer-core', version: '0.0.0-fake', main: 'index.js' }));
fs.writeFileSync(path.join(puppeteerCoreDir, 'index.js'), `
const control = require(${JSON.stringify(controlPath)});

function makeFakePage() {
  return {
    async setContent(html, opts) {
      if (control.failNextCallAt === 'setContent') {
        control.failNextCallAt = null;
        throw new Error('simulated_set_content_failure');
      }
    },
    async pdf(opts) {
      if (control.failNextCallAt === 'pdf') {
        control.failNextCallAt = null;
        throw new Error('simulated_pdf_render_failure');
      }
      return Buffer.from('%PDF-FAKE-CONTENT');
    },
    async close() {
      control.pageCloseCount += 1;
    }
  };
}

module.exports = {
  defaultArgs(opts) {
    return Array.isArray(opts?.args) ? opts.args : [];
  },
  async launch(opts) {
    control.launchCount += 1;
    const instance = {
      generation: control.launchCount,
      connected: true,
      isConnected() {
        return instance.connected;
      },
      async newPage() {
        if (control.failNextCallAt === 'newPage') {
          control.failNextCallAt = null;
          throw new Error('simulated_new_page_failure');
        }
        return makeFakePage();
      },
      async close() {
        control.browserCloseCount += 1;
        instance.connected = false;
      }
    };
    control.instances.push(instance);
    return instance;
  }
};
`);

const chromiumDir = path.join(workDir, 'node_modules', '@sparticuz', 'chromium');
fs.mkdirSync(chromiumDir, { recursive: true });
fs.writeFileSync(path.join(chromiumDir, 'package.json'), JSON.stringify({ name: '@sparticuz/chromium', version: '0.0.0-fake', main: 'index.js' }));
fs.writeFileSync(path.join(chromiumDir, 'index.js'), `
module.exports = {
  args: [],
  defaultViewport: null,
  headless: 'shell',
  async executablePath() {
    return ${JSON.stringify(fakeChromiumBinaryPath)};
  }
};
`);

const { renderHtmlToPdfBuffer, __resetPdfRendererStateForTests } = require(rendererPath);
const control = require(controlPath);

assert.equal(typeof renderHtmlToPdfBuffer, 'function');
assert.equal(typeof __resetPdfRendererStateForTests, 'function');

let passed = 0;
async function test(name, fn) {
  __resetPdfRendererStateForTests();
  control.launchCount = 0;
  control.instances = [];
  control.failNextCallAt = null;
  control.pageCloseCount = 0;
  control.browserCloseCount = 0;
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    throw error;
  }
}

console.log('Phase 14 PDF renderer (H1) Chromium crash recovery suite');

await test('a healthy cached browser is reused across renders (no unnecessary relaunch)', async () => {
  const first = await renderHtmlToPdfBuffer('<p>one</p>');
  const second = await renderHtmlToPdfBuffer('<p>two</p>');
  assert.equal(Buffer.isBuffer(first), true);
  assert.equal(Buffer.isBuffer(second), true);
  assert.equal(control.launchCount, 1, 'browser must be reused, not relaunched, while healthy');
});

await test('isConnected() is checked before reuse: a disconnected cached browser is discarded and Chromium relaunches', async () => {
  await renderHtmlToPdfBuffer('<p>warm the cache</p>');
  assert.equal(control.launchCount, 1);
  // Simulate an external browser-process crash: the cached browser object still exists in
  // render-pdf.ts's module state, but the underlying process is gone.
  control.instances[0].connected = false;

  const pdf = await renderHtmlToPdfBuffer('<p>after crash</p>');
  assert.equal(Buffer.isBuffer(pdf), true, 'render must still succeed by relaunching');
  assert.equal(control.launchCount, 2, 'a disconnected browser must never be reused -- next call must relaunch Chromium');
});

await test('a failed newPage() clears the cached browser even though isConnected() still reports true', async () => {
  await renderHtmlToPdfBuffer('<p>warm the cache</p>');
  assert.equal(control.launchCount, 1);
  assert.equal(control.instances[0].connected, true);
  control.failNextCallAt = 'newPage';

  await assert.rejects(renderHtmlToPdfBuffer('<p>will fail</p>'), /simulated_new_page_failure/);
  // The browser object never reported disconnection -- only the *operation* failed -- yet the
  // cache must still be cleared, per the H1 requirement ("failed newPage()... clears cached
  // browser"), not just a health-check on isConnected().
  const next = await renderHtmlToPdfBuffer('<p>recovered</p>');
  assert.equal(Buffer.isBuffer(next), true);
  assert.equal(control.launchCount, 2, 'a newPage() failure must force a relaunch on the next call');
});

await test('a failed setContent() clears the cached browser and the next render relaunches Chromium', async () => {
  await renderHtmlToPdfBuffer('<p>warm the cache</p>');
  control.failNextCallAt = 'setContent';
  await assert.rejects(renderHtmlToPdfBuffer('<p>will fail</p>'), /simulated_set_content_failure/);
  await renderHtmlToPdfBuffer('<p>recovered</p>');
  assert.equal(control.launchCount, 2);
});

await test('a failed page.pdf() clears the cached browser and the next render relaunches Chromium', async () => {
  await renderHtmlToPdfBuffer('<p>warm the cache</p>');
  control.failNextCallAt = 'pdf';
  await assert.rejects(renderHtmlToPdfBuffer('<p>will fail</p>'), /simulated_pdf_render_failure/);
  await renderHtmlToPdfBuffer('<p>recovered</p>');
  assert.equal(control.launchCount, 2);
});

await test('page and browser resources are closed safely on both success and failure paths', async () => {
  await renderHtmlToPdfBuffer('<p>ok</p>');
  assert.equal(control.pageCloseCount, 1, 'the page must be closed after a successful render');
  assert.equal(control.browserCloseCount, 0, 'a healthy browser must not be closed after a successful render');

  control.failNextCallAt = 'pdf';
  await assert.rejects(renderHtmlToPdfBuffer('<p>fail</p>'));
  assert.equal(control.pageCloseCount, 2, 'the page must still be closed after a failed render');
  assert.equal(control.browserCloseCount, 1, 'a browser discarded after a failure must be closed, not leaked');
});

await test('repeated consecutive failures are logged as a distinct observable operational signal', async () => {
  const originalConsoleError = console.error;
  const errorCalls = [];
  console.error = (...args) => { errorCalls.push(args); };
  try {
    for (let i = 0; i < 3; i += 1) {
      control.failNextCallAt = 'pdf';
      await assert.rejects(renderHtmlToPdfBuffer('<p>fail</p>'));
    }
  } finally {
    console.error = originalConsoleError;
  }
  const alertCalls = errorCalls.filter((args) => args[0] === 'phase14_pdf_renderer_repeated_failures');
  assert.equal(alertCalls.length, 1, 'the repeated-failure alert must fire once the consecutive-failure threshold is crossed');
  assert.equal(alertCalls[0][1].consecutiveFailures, 3);
});

await test('a successful render resets the consecutive-failure counter (no stale alert on an isolated later failure)', async () => {
  const originalConsoleError = console.error;
  const errorCalls = [];
  console.error = (...args) => { errorCalls.push(args); };
  try {
    for (let i = 0; i < 2; i += 1) {
      control.failNextCallAt = 'pdf';
      await assert.rejects(renderHtmlToPdfBuffer('<p>fail</p>'));
    }
    await renderHtmlToPdfBuffer('<p>recovered, resets the counter</p>');
    control.failNextCallAt = 'pdf';
    await assert.rejects(renderHtmlToPdfBuffer('<p>fail again</p>'));
  } finally {
    console.error = originalConsoleError;
  }
  const alertCalls = errorCalls.filter((args) => args[0] === 'phase14_pdf_renderer_repeated_failures');
  assert.equal(alertCalls.length, 0, 'a single isolated failure after a success must not trigger the repeated-failure alert');
});

fs.rmSync(workDir, { recursive: true, force: true });
console.log(`Phase 14 PDF renderer (H1) Chromium crash recovery suite passed (${passed} cases).`);
