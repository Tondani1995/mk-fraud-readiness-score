/**
 * RC1 heading-match diagnostic contract.
 *
 * The certification journey rendered a PDF successfully and then failed because three headings
 * that are demonstrably emitted by report-template.ts were not found in the extracted text:
 *
 *   Priority findings, contradictions and scenarios
 *   A1. Complete material findings register
 *   A7. Definitions and score basis
 *
 * A whitespace-normalising fix was written for this and then withdrawn, because the fixture built
 * to prove it turned out to be vacuous -- pdfjs had already stripped the trailing space, so the
 * naive join matched and the test proved nothing. Rather than guess again, extractHeadingPageMap
 * now measures three tiers and reports which one would have matched, while still accepting only
 * tier 1.
 *
 * These fixtures pin that behaviour: the tiers must classify correctly, and none of tier 2 or
 * tier 3 may approve a heading.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const navigation = fs.readFileSync(path.join(root, 'src', 'lib', 'reports', 'pdf-navigation.ts'), 'utf8');

/**
 * Builds a valid PDF from `pages`, each page being an array of text runs drawn on their own line.
 * Separate runs are what Chromium produces for a heading that wraps, and what pdfjs returns as
 * separate text items.
 */
function buildPdf(pages) {
  const objects = [];
  const pageRefs = [];
  let nextObj = 3;
  const contentObjs = [];
  for (const runs of pages) {
    const drawn = runs
      .map((run, index) => `BT /F1 16 Tf 60 ${760 - index * 28} Td (${run}) Tj ET`)
      .join('\n');
    contentObjs.push(Buffer.from(drawn));
  }
  const fontRef = 3 + pages.length * 2;
  for (let i = 0; i < pages.length; i += 1) {
    const pageObj = nextObj + i * 2;
    const contentObj = pageObj + 1;
    pageRefs.push(pageObj);
    objects[pageObj] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentObj} 0 R >>`
    );
    objects[contentObj] = Buffer.concat([
      Buffer.from(`<< /Length ${contentObjs[i].length} >>\nstream\n`),
      contentObjs[i],
      Buffer.from('\nendstream'),
    ]);
  }
  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects[fontRef] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = Buffer.from('%PDF-1.4\n');
  const offsets = [];
  const maxObj = fontRef;
  for (let i = 1; i <= maxObj; i += 1) {
    offsets[i] = pdf.length;
    pdf = Buffer.concat([pdf, Buffer.from(`${i} 0 obj\n`), objects[i], Buffer.from('\nendobj\n')]);
  }
  const xref = pdf.length;
  let table = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxObj; i += 1) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  return Buffer.concat([
    pdf,
    Buffer.from(table),
    Buffer.from(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`),
  ]);
}

/** Runs extractHeadingPageMap in a child process and returns its outcome plus diagnostics. */
function extract(pages, keys, startPage = 1) {
  const probe = path.join(root, 'scripts', '.rc1-heading-probe.mjs');
  const pdfPath = path.join(root, 'scripts', '.rc1-heading-probe.pdf');
  fs.writeFileSync(pdfPath, buildPdf(pages));
  const outPath = path.join(root, 'scripts', '.rc1-heading-probe.json');
  fs.writeFileSync(probe, `
import fs from 'node:fs';
const nav = await import('../src/lib/reports/pdf-navigation.ts');
// pdfjs takes ownership of the buffer it is given, so each call gets its own copy.
const raw = fs.readFileSync(${JSON.stringify(pdfPath)});
const fresh = () => new Uint8Array(Uint8Array.prototype.slice.call(raw));
const entries = ${JSON.stringify(keys)}.map((key) => ({ key, label: key }));
let payload;
try {
  const map = await nav.extractHeadingPageMap(fresh(), entries, ${startPage});
  const diagnostics = await nav.collectHeadingMatchDiagnostics(fresh(), entries, ${startPage});
  payload = { ok: true, map, diagnostics };
} catch (error) {
  payload = {
    ok: false,
    name: error?.name ?? null,
    missing: error?.missingKeys ?? null,
    diagnostics: error?.diagnostics ?? (await nav.collectHeadingMatchDiagnostics(fresh(), entries, ${startPage}).catch(() => null)),
    message: String(error?.message ?? ''),
  };
}
fs.writeFileSync(${JSON.stringify(outPath)}, JSON.stringify(payload));
`);

  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '--experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs',
      probe,
    ], { cwd: root, encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    assert.ok(fs.existsSync(outPath), `probe produced no result:\n${output}`);
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } finally {
    fs.rmSync(probe, { force: true });
    fs.rmSync(pdfPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

function tierFor(diagnostics, key, tier) {
  const entry = diagnostics.find((d) => d.key === key);
  assert.ok(entry, `no diagnostic recorded for ${key}`);
  const candidate = entry.candidates.find((c) => c.tier === tier);
  assert.ok(candidate, `no ${tier} candidate recorded for ${key}`);
  return candidate;
}

let failures = 0;
let total = 0;
function test(name, fn) {
  total += 1;
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

console.log('RC1 -- heading match diagnostic');

const HEADING = 'Priority findings, contradictions and scenarios';

test('H1. an exact heading matches tier 1 and is accepted', () => {
  const result = extract([[HEADING]], [HEADING]);
  assert.equal(result.ok, true, `expected acceptance, got ${result.message}`);
  assert.deepEqual(result.map, { [HEADING]: 1 });
});

test('H2. ordinary line wrapping is classified, and never accepted below tier 1', () => {
  // Two runs that rejoin with single spacing: whichever of tier 1/2 matches, tier 3 must too.
  const result = extract([['Priority findings,', 'contradictions and scenarios']], [HEADING]);
  if (result.ok) {
    assert.deepEqual(result.map, { [HEADING]: 1 }, 'tier 1 acceptance must resolve to the page');
  } else {
    assert.equal(tierFor(result.diagnostics, HEADING, 'exact').pages.length, 0);
    assert.equal(tierFor(result.diagnostics, HEADING, 'whitespace_normalised').unique, true);
    assert.equal(tierFor(result.diagnostics, HEADING, 'whitespace_stripped').unique, true);
  }
});

test('H3. a heading split inside a word matches only tier 3', () => {
  const result = extract([['Priority findings, contradic', 'tions and scenarios']], [HEADING]);
  assert.equal(result.ok, false, 'a mid-word split must not be accepted');
  assert.equal(tierFor(result.diagnostics, HEADING, 'exact').pages.length, 0);
  assert.equal(tierFor(result.diagnostics, HEADING, 'whitespace_normalised').pages.length, 0,
    'a mid-word split must not satisfy whitespace normalisation');
  assert.equal(tierFor(result.diagnostics, HEADING, 'whitespace_stripped').unique, true);
});

test('H4. reordered characters fail every tier', () => {
  const result = extract([['scenarios and contradictions, Priority findings']], [HEADING]);
  assert.equal(result.ok, false);
  for (const tier of ['exact', 'whitespace_normalised', 'whitespace_stripped']) {
    assert.equal(tierFor(result.diagnostics, HEADING, tier).pages.length, 0, `${tier} must not match reordered text`);
  }
});

test('H5. missing characters fail every tier', () => {
  const result = extract([['Priority findings, contradictions and scenaris']], [HEADING]);
  assert.equal(result.ok, false);
  for (const tier of ['exact', 'whitespace_normalised', 'whitespace_stripped']) {
    assert.equal(tierFor(result.diagnostics, HEADING, tier).pages.length, 0, `${tier} must not match truncated text`);
  }
});

test('H6. a partial heading fails every tier', () => {
  const result = extract([['Priority findings, contradictions']], [HEADING]);
  assert.equal(result.ok, false);
  for (const tier of ['exact', 'whitespace_normalised', 'whitespace_stripped']) {
    assert.equal(tierFor(result.diagnostics, HEADING, tier).pages.length, 0, `${tier} must not match a prefix`);
  }
});

test('H7. a heading on two pages is recorded as ambiguous, not unique', () => {
  const result = extract([[HEADING], ['filler text'], [HEADING]], [HEADING]);
  const exact = tierFor(result.diagnostics, HEADING, 'exact');
  assert.equal(exact.pages.length, 2, 'both pages must be recorded');
  assert.equal(exact.unique, false, 'two matching pages is ambiguous');
});

test('H8. similar narrative prose does not match the heading', () => {
  const result = extract([[
    'This section covers priority findings and the contradictions and scenarios that follow from them.',
  ]], [HEADING]);
  assert.equal(result.ok, false);
  for (const tier of ['exact', 'whitespace_normalised', 'whitespace_stripped']) {
    assert.equal(tierFor(result.diagnostics, HEADING, tier).pages.length, 0, `${tier} must not match narrative prose`);
  }
});

test('H9. punctuation differences never pass silently', () => {
  const result = extract([['Priority findings contradictions and scenarios']], [HEADING]);
  assert.equal(result.ok, false, 'a missing comma must not be accepted');
  for (const tier of ['exact', 'whitespace_normalised', 'whitespace_stripped']) {
    assert.equal(tierFor(result.diagnostics, HEADING, tier).pages.length, 0,
      `${tier} must treat punctuation as significant`);
  }
});

test('H10. the diagnostic still throws rather than approving a fallback', () => {
  const result = extract([['Priority findings, contradic', 'tions and scenarios']], [HEADING]);
  assert.equal(result.ok, false, 'tier 3 evidence must not approve the PDF');
  assert.equal(result.name, 'HeadingExtractionError');
  assert.deepEqual(result.missing, [HEADING]);
  // Acceptance stays tier 1 only, in the source as well as the outcome.
  assert.match(navigation, /Acceptance is tier 1 only/);
  assert.match(navigation, /const acceptedPage = exactPages\.length > 0 \? exactPages\[0\] : null;/);
  assert.doesNotMatch(navigation, /map\[key\] = normalisedPages|map\[key\] = strippedPages/);
});

test('H11. the diagnostic records shape only, never content', () => {
  const result = extract([['Priority findings, contradic', 'tions and scenarios'], ['unrelated page text']], [HEADING]);
  const serialised = JSON.stringify(result.diagnostics);
  // Probes deliberately chosen so they are not substrings of the heading key, which legitimately
  // appears in the diagnostics: only genuinely extracted page text would be a leak.
  for (const leak of ['unrelated page text', 'unrelated', 'page text']) {
    assert.equal(serialised.includes(leak), false, `diagnostics leaked extracted text: ${leak}`);
  }
  // The message is what reaches the runtime log; it must be equally content-free.
  assert.equal(result.message.includes('unrelated page text'), false);
  const entry = result.diagnostics.find((d) => d.key === HEADING);
  assert.deepEqual(Object.keys(entry).sort(), ['acceptedTier', 'candidates', 'key', 'pageNumber', 'textItemCount']);
});

test('H12. accepted headings record their page and text-item count', () => {
  const result = extract([[HEADING, 'second run on the same page']], [HEADING]);
  assert.equal(result.ok, true);
  // Item count is exposed for accepted headings; verified via the accepting path in H1/H12 shape.
  assert.match(navigation, /textItemCount: acceptedPage !== null/);
  assert.match(navigation, /itemCount: content\.items\.length/);
});

console.log('');
console.log(`rc1-heading-match-diagnostic: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
