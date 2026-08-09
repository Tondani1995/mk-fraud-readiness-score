#!/usr/bin/env node
/**
 * Commercial Essential PDF composition contract.
 *
 * Measured against the real V7 artefact (RPT-MKFRS-2026-1FB942BC02-V7, 39 pages), which showed:
 *   - all 60 L1 roadmap actions printed against a 12-target / 15-ceiling projection;
 *   - E1 repeating control actions the roadmap had already selected;
 *   - prose citing "Appendix A1"/"A2" when the PDF contains only E1 and E2;
 *   - a roadmap heading page and a stranded final roadmap row page;
 *   - an executive title of "Visibility-limited assessment" beside coverage 100%,
 *     control visibility 100% and zero uncertainty responses.
 *
 * No provider is called and no report version is created.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

const template = readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
const projection = readFileSync('src/lib/reports/essential-projection.ts', 'utf8');
const blocks = readFileSync('src/lib/reports/select-content-blocks.ts', 'utf8');

// ------------------------------------------------------------------ roadmap source and cap
test('the template renders the bounded projection roadmap, never the full L1 set', () => {
  assert.match(template, /const roadmapRows = projection\.roadmapActions\.map/,
    'roadmap rows must come from the projection');
  assert.ok(!/roadmapRows = evidenceModel\.roadmapActions/.test(template),
    'the full L1 roadmap must never be the PDF source again');
});
test('the template does not reimplement roadmap selection', () => {
  // The name may appear in a comment explaining where selection lives; what must not appear is a
  // call to it, or any re-slicing of the roadmap inside the template.
  assert.ok(!/selectDependencyClosedRoadmap\s*\(/.test(template),
    'selection belongs to the projection, not the template');
  assert.ok(!/roadmapActions[\s\S]{0,40}\.slice\(/.test(template),
    'the template must not re-cap the roadmap');
});
test('the roadmap cap remains 12 target / 15 ceiling', () => {
  assert.match(projection, /roadmapTotal: 12/);
  assert.match(projection, /roadmapTotalCeiling: 15/);
});

// ------------------------------------------------------------------ E1 de-duplication
test('E1 de-duplicates on the authoritative linkedRoadmapActionIds relationship', () => {
  assert.match(projection, /record\.linkedRoadmapActionIds\.some\(\(id\) => selectedRoadmapActionIds\.has\(id\)\)/,
    'E1 must exclude records linked to a selected roadmap action');
  // The earlier attempt compared CAR ids / question codes against RA and MF ids -- different
  // namespaces, so it matched nothing.
  assert.ok(!/roadmapSelectedIds\.has\(record\.primaryQuestionCode\)/.test(template),
    'the inert namespace-mismatched filter must not return');
});
test('E1 de-duplication runs before the 40 cap, not after it', () => {
  const dedupeAt = projection.indexOf('record.linkedRoadmapActionIds.some');
  const capAt = projection.indexOf('ESSENTIAL_CAPS.appendixControlActionRecords)');
  assert.ok(dedupeAt > 0 && capAt > 0, 'both the filter and the cap must be present');
  assert.ok(dedupeAt < capAt,
    'filtering after the cap would silently shrink E1 below its allowance');
});
test('roadmap selection precedes the E1 appendix build', () => {
  const roadmapAt = projection.indexOf('const roadmapActions = selectDependencyClosedRoadmap');
  const appendixAt = projection.indexOf('const appendixControlActionRecords');
  assert.ok(roadmapAt > 0 && appendixAt > 0);
  assert.ok(roadmapAt < appendixAt,
    'E1 cannot exclude roadmap-selected records unless the roadmap is chosen first');
});
test('the E1 cap remains 40 and unrelated control actions are still retained', () => {
  assert.match(projection, /appendixControlActionRecords: 40/);
  // Only two exclusions may apply: already-shown records, and roadmap-selected ones.
  assert.match(projection, /\.filter\(\(record\) => !shownRecordIds\.has\(record\.id\)\)/);
});

// ------------------------------------------------------------------ cross-references
test('no reference to a non-existent Appendix A1 or A2 survives', () => {
  assert.ok(!/Appendix A1/.test(template), 'the PDF has no Appendix A1');
  assert.ok(!/Appendix A2/.test(template), 'the PDF has no Appendix A2');
  assert.match(template, /supporting register issued with this report/,
    'the complete registers must be pointed at the supporting register');
});

// ------------------------------------------------------------------ pagination boundaries
test('exactly one section may continue after the roadmap', () => {
  assert.match(template, /\.report-section\.continue-after-roadmap \{ break-before: auto; page-break-before: auto; \}/,
    'the continuation exception must be scoped to a class');
  const uses = template.match(/continue-after-roadmap/g) ?? [];
  // One CSS rule, one orphan-guard rule and one section that carries the class.
  assert.ok(uses.length >= 3, 'the class must be applied to the Evidence validation section');
  assert.match(template, /section\('Evidence validation priorities', 'Evidence validation priorities', evidencePriorityBlock, 'long-section continue-after-roadmap'\)/);
});
test('the forced page break is preserved for every other section', () => {
  assert.match(template, /\.cover, \.report-section \{ break-before: page; page-break-before: always; \}/,
    'the general rule must remain');
});
test('the continuing section cannot orphan its own heading', () => {
  assert.match(template, /\.continue-after-roadmap \.section-kicker,[\s\S]*?break-after: avoid/,
    'kicker and heading must stay with the first content');
});
test('a roadmap heading cannot sit alone above its table', () => {
  assert.match(template, /\.subsection-heading \+ \.section-note,[\s\S]*?break-after: avoid/);
});
test('the disproven roadmap row-split override is gone', () => {
  // CI showed a row that fits a page is never split -- it moves whole -- so this changed nothing,
  // and splitting a control objective from its owner, timing and success measure is wrong anyway.
  assert.ok(!/\.roadmap-table tbody tr \{ break-inside: auto/.test(template),
    'roadmap rows must stay intact');
});

// ------------------------------------------------------------------ executive title
test('a systemic, full-visibility assessment gets a foundational title', () => {
  assert.match(blocks, /title: 'Systemic foundational control gap'/,
    'the systemic condition needs its own deterministic title');
  assert.match(blocks, /scope\.resultStatus === 'INSUFFICIENT_VISIBILITY'\s*\|\|\s*scope\.unknownSharePct > 0\s*\|\|\s*scope\.unansweredApplicableCount > 0/,
    'the visibility test must be the deterministic condition, not merely "is adaptive"');
});
test('a genuinely visibility-limited assessment keeps its title', () => {
  assert.match(blocks, /title: 'Visibility-limited assessment'/,
    'the visibility-limited title must be retained for the real case');
  const visibilityAt = blocks.indexOf("const visibilityLimited");
  const limitedTitleAt = blocks.indexOf("title: 'Visibility-limited assessment'");
  const systemicTitleAt = blocks.indexOf("title: 'Systemic foundational control gap'");
  assert.ok(visibilityAt < limitedTitleAt && limitedTitleAt < systemicTitleAt,
    'the visibility-limited branch must be evaluated first');
});
test('the title can no longer contradict the reported visibility metrics', () => {
  // The old code returned the visibility-limited title for ANY adaptive assessment.
  assert.ok(!/if \(data\.adaptiveScope\) \{\s*return \{\s*title: 'Visibility-limited assessment'/.test(blocks),
    'the unconditional visibility-limited return must be gone');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
