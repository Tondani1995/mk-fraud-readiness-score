import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = join(process.cwd(), 'src/lib/reports/render-pdf.ts');
const source = readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  },
  fileName: sourcePath
}).outputText;

const module = { exports: {} };
new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
  require,
  module,
  module.exports,
  sourcePath,
  join(process.cwd(), 'src/lib/reports')
);

const { renderHtmlToPdfBuffer } = module.exports;
assert.equal(typeof renderHtmlToPdfBuffer, 'function');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm; }
body { font-family: Arial, sans-serif; color: #222; }
h1 { font-size: 28px; margin-bottom: 12px; }
p { font-size: 13px; line-height: 1.5; }
</style></head><body>
<h1>MK Fraud Readiness — Node 24 Chromium Smoke</h1>
<p>This PDF proves that the packaged Chromium and Puppeteer runtime can launch and render under the Phase 14 Node.js 24 compatibility boundary.</p>
</body></html>`;

const pdf = await renderHtmlToPdfBuffer(html);
assert(pdf.length > 10_000, `Expected a non-trivial PDF; received ${pdf.length} bytes.`);
assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
const outputPath = join(process.cwd(), 'tmp', 'phase14-node24-chromium-smoke.pdf');
writeFileSync(outputPath, pdf);
console.log(JSON.stringify({ ok: true, node: process.version, bytes: pdf.length, outputPath }));
process.exit(0);
