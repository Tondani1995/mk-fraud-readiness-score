/**
 * RC1 PDF navigation module-format contract.
 *
 * The RC1 certification journey failed at the render stage with:
 *
 *   require() of ES Module /var/task/node_modules/pdfjs-dist/legacy/build/pdf.mjs
 *   from .../fulfilment-worker/route.js not supported.
 *
 * extractHeadingPageMap() already loaded pdfjs-dist with `await import()`, which is correct. The
 * defect was in the bundler configuration: next.config.mjs externalised pdfjs-dist as
 * `commonjs <request>`, and a commonjs external makes webpack emit require() for the module --
 * rewriting the correct dynamic import back into the one form Node refuses for ESM.
 *
 * The distinction matters per package, so this suite pins both halves: pdfjs-dist must be an
 * `import` external because it is ESM, and @napi-rs/canvas must stay a `commonjs` external
 * because it is a native CommonJS addon that has no ESM entry point.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

/** Smallest valid single-page PDF carrying one known heading string. */
function buildProbePdf(heading) {
  const content = Buffer.from(`BT /F1 24 Tf 72 700 Td (${heading}) Tj ET`);
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  let pdf = Buffer.from('%PDF-1.4\n');
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf = Buffer.concat([pdf, Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
  });
  const xref = pdf.length;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) table += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.concat([
    pdf,
    Buffer.from(table),
    Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`),
  ]);
}

const root = process.cwd();
const nextConfig = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'src', 'lib', 'reports', 'pdf-navigation.ts'), 'utf8');
const require = createRequire(import.meta.url);

let failures = 0;
let total = 0;
async function test(name, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

console.log('RC1 -- PDF navigation module format');

await test('P1. the call site loads pdfjs-dist with a dynamic import, never require', () => {
  assert.match(navigation, /await import\('pdfjs-dist\/legacy\/build\/pdf\.mjs'\)/);
  assert.doesNotMatch(navigation, /require\(\s*['"]pdfjs-dist/);
});

await test('P2. the module it loads really is ESM, so require() could never work', () => {
  const entry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  assert.ok(entry.endsWith('.mjs'), `expected an .mjs entry, got ${entry}`);
  const source = fs.readFileSync(entry, 'utf8');
  // An ESM build exports with `export`; a CJS one would assign module.exports.
  assert.match(source, /\bexport\s*\{|\bexport\s+(?:const|function|class|default)\b/);
});

await test('P3. pdfjs-dist is never externalised as a commonjs module', () => {
  // This is the exact regression: `commonjs pdfjs-dist/...` is what produced ERR_REQUIRE_ESM.
  // Scoped to executable lines: the comments above the branch name the mistake being prevented,
  // and that explanation must not be mistaken for the mistake itself.
  const executable = nextConfig
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const pdfBranch = executable.slice(
    executable.indexOf("request === 'pdfjs-dist'"),
    executable.indexOf("request === '@napi-rs/canvas'"),
  );
  assert.ok(pdfBranch.length > 0, 'the pdfjs-dist external branch is missing');
  assert.doesNotMatch(pdfBranch, /commonjs/, 'the pdfjs-dist branch must not emit a commonjs external');
});

await test('P4. pdfjs-dist is externalised as an import, preserving the dynamic import', () => {
  assert.match(nextConfig, /if \(request === 'pdfjs-dist' \|\| request\.startsWith\('pdfjs-dist\/'\)\) \{\s*\n\s*return callback\(null, `import \$\{request\}`\);/);
});

await test('P5. the native canvas addon stays a commonjs external', () => {
  // Narrowness check: the correction must not have flipped the native addon too. It has no ESM
  // entry point, so an `import` external there would break it in the opposite direction.
  assert.match(
    nextConfig,
    /if \(request === '@napi-rs\/canvas' \|\| request\.startsWith\('@napi-rs\/canvas\/'\)\) \{\s*\n\s*return callback\(null, `commonjs \$\{request\}`\);/,
  );
});

await test('P6. pdfjs-dist actually loads through a dynamic import and exposes getDocument', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  assert.equal(typeof pdfjs.getDocument, 'function', 'getDocument must be callable after import');
});

await test('P7. no external branch can route a .mjs request through require()', () => {
  // Deliberately not asserting that require() of this entry throws here: whether Node permits
  // require(esm) varies by version and by whether the module graph uses top-level await, so that
  // assertion would pin the local runtime rather than the bundler contract that actually failed.
  // What must hold is that every commonjs external branch is reachable only for CommonJS packages.
  const executable = nextConfig
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const commonjsRequests = [...executable.matchAll(/request === '([^']+)'[^;]*?return callback\(null, `commonjs/gs)]
    .map((match) => match[1]);
  for (const request of commonjsRequests) {
    assert.notEqual(request, 'pdfjs-dist', 'pdfjs-dist must never be a commonjs external');
    const entry = require.resolve(request);
    assert.ok(!entry.endsWith('.mjs'), `${request} resolves to ESM (${entry}) but is a commonjs external`);
  }
});

await test('P8. the geometry polyfill loads without any native binding', () => {
  // @napi-rs/canvas/geometry.js is a vendored pure-JS polyfill. Its whole value here is that it
  // resolves when the compiled binding does not -- which is the deployed condition.
  const geometry = require('@napi-rs/canvas/geometry.js');
  assert.equal(typeof geometry.DOMMatrix, 'function');
  const matrix = new geometry.DOMMatrix([1, 0, 0, 1, 10, 20]);
  assert.equal(matrix.a, 1);
  assert.equal(matrix.f, 20);
});

await test('P9. the call site installs the geometry globals before importing pdfjs', () => {
  assert.match(navigation, /await ensureGeometryGlobals\(\);\s*\n\s*const pdfjs = await import\('pdfjs-dist/);
  assert.match(navigation, /await import\('@napi-rs\/canvas\/geometry\.js'\)/);
  // Fail loudly rather than proceeding without DOMMatrix.
  assert.match(navigation, /could not install a DOMMatrix polyfill/);
  // Path2D must not be stubbed: nothing here draws, and a stub would hide a real capability gap.
  assert.doesNotMatch(navigation, /globals\.Path2D\s*=/);
});

await test('P10. heading extraction succeeds with the native binding unavailable', async () => {
  // The exact deployed failure: @napi-rs/canvas cannot resolve, so pdfjs cannot self-polyfill and
  // throws `DOMMatrix is not defined`. This runs the real extractor against a real PDF with the
  // binding blocked, in a child process so the module-resolution patch cannot leak.
  const probe = path.join(root, 'scripts', '.rc1-pdf-navigation-probe.mjs');
  const pdfPath = path.join(root, 'scripts', '.rc1-pdf-navigation-probe.pdf');
  fs.writeFileSync(pdfPath, buildProbePdf('RC1HEADINGPROBE'));
  fs.writeFileSync(probe, `
import fs from 'node:fs';
import Module from 'node:module';
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@napi-rs/canvas') throw new Error('Cannot find native binding.');
  return realResolve.call(this, request, ...rest);
};
delete globalThis.DOMMatrix; delete globalThis.DOMPoint; delete globalThis.DOMRect;
const { extractHeadingPageMap } = await import('../src/lib/reports/pdf-navigation.ts');
const bytes = new Uint8Array(fs.readFileSync(${JSON.stringify(pdfPath)}));
const map = await extractHeadingPageMap(bytes, [{ key: 'RC1HEADINGPROBE', label: 'probe' }], 1);
process.stdout.write('MAP=' + JSON.stringify(map));
`);
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '--experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs',
      probe,
    ], { cwd: root, encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.equal(result.status, 0, `probe failed:\n${output}`);
    assert.ok(output.includes('MAP={"RC1HEADINGPROBE":1}'), `unexpected extraction result:\n${output}`);
    assert.ok(!/DOMMatrix is not defined/.test(output), 'the original failure must not recur');
  } finally {
    fs.rmSync(probe, { force: true });
    fs.rmSync(pdfPath, { force: true });
  }
});

console.log('');
console.log(`rc1-pdf-navigation-module: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
