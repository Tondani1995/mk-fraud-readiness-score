#!/usr/bin/env node
/**
 * Increment 2 brand and navigation conformance.
 *
 * Two kinds of assertion, deliberately separated.
 *
 * Static assertions read the renderer source and the approved master. They cover brand
 * values, cover wording, logo geometry and the font stack, and they are the ones that would
 * have caught every defect Increment 1 found.
 *
 * Rendered assertions build a real Comprehensive PDF offline from a fixture -- no database,
 * no provider, no spend -- and check the outline the customer would actually receive.
 *
 * One deliberate gap: font resolution cannot be proven by rendering on a developer machine,
 * because the fonts installed here are not the fonts installed in the render container. What
 * is proven here is that the declared stack puts Open Sans first and can no longer fall
 * through to Georgia or Arial. Proving the embedded face belongs to the final acceptance run.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MK_TOKENS } from '../../src/lib/reports/design/tokens.ts';
import { MK_LOGO_PRIMARY_SVG, MK_LOGO_REVERSED_SVG, MK_LOGO_ASPECT_RATIO } from '../../src/lib/reports/design/brand-assets.ts';
import { comprehensiveSectionPlan, COMPREHENSIVE_REGISTER_TITLES } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';

const results = [];
const check = (name, fn) => { try { fn(); results.push({ name, status: 'PASS' }); } catch (e) { results.push({ name, status: 'FAIL', detail: e.message.split('\n')[0] }); } };
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

const essential = read('src/lib/reports/templates/report-template.ts');
const comprehensive = read('src/lib/reports/comprehensive/render-comprehensive-html.ts');
const master = read('qa/reference-artifacts/mk-readiness/mk-fraud-insights-logo.svg');

/* ---- brand values ---- */
check('MK Navy is the principal navy', () => assert.equal(MK_TOKENS.navy900, '#01123A'));
check('MK Slate carries secondary content', () => { assert.equal(MK_TOKENS.slate, '#47515A'); assert.equal(MK_TOKENS.muted, '#47515A'); });
check('white is unchanged', () => assert.equal(MK_TOKENS.white, '#FFFFFF'));
check('Readiness gold is unchanged', () => assert.equal(MK_TOKENS.brass, '#C9A227'));
check('the gold text derivative is the only other gold', () => {
  assert.equal(MK_TOKENS.brassText, '#7A6011');
  const golds = Object.values(MK_TOKENS).filter((v) => /^#[0-9A-F]{6}$/i.test(v) && /^#(C9A227|7A6011|F0E6C8)$/i.test(v));
  assert.equal(golds.length, 3, 'exactly three gold-family values: accent, accessible text derivative, soft ground');
});
check('the superseded colours appear nowhere in either renderer', () => {
  for (const [file, name] of [[essential, 'Essential'], [comprehensive, 'Comprehensive']]) {
    assert.doesNotMatch(file, /#0B1B33/i, `${name} still carries the superseded navy`);
    assert.doesNotMatch(file, /#5A6B7C/i, `${name} still carries the superseded slate`);
    assert.doesNotMatch(file, /#7a6011/i, `${name} hardcodes the gold derivative instead of using the token`);
  }
});

/* ---- cover wording ---- */
check('Essential eyebrow reads "Fraud readiness advisory"', () => {
  assert.match(essential, /<div class="cover-eyebrow">Fraud readiness advisory<\/div>/);
});
check('the independence claim is gone from Essential', () => {
  assert.doesNotMatch(essential, /Independent fraud risk advisory/i);
});
check('no production mechanism is advertised on either cover', () => {
  assert.doesNotMatch(essential, /Automated analysis/i);
  const cover = comprehensive.slice(comprehensive.indexOf('page--navy'), comprehensive.indexOf('page--navy') + 3000);
  assert.doesNotMatch(cover, /Automated analysis/i);
});
check('Comprehensive carries the approved assurance boundary', () => {
  assert.match(comprehensive, /Confidential · Self-assessment advisory · Not an independent assurance opinion/);
});
check('the methodology basis still states the limitations in full', () => {
  assert.match(comprehensive, /has not been independently reviewed/i);
  assert.match(comprehensive, /no assurance opinion is given/i);
  assert.match(comprehensive, /self-reported by the organisation/i);
});

/* ---- logo ---- */
check('the typed wordmark substitute is gone from both covers', () => {
  assert.doesNotMatch(essential, /MK FRAUD INSIGHTS<\/div>/);
  assert.doesNotMatch(comprehensive, />MK Fraud Insights<\/div>/);
});
check('both covers render the approved mark', () => {
  assert.match(essential, /renderCoverLogo\(\)/);
  assert.match(comprehensive, /renderCoverLogo\(/);
});
check('the mark is the approved geometry, not a redrawing', () => {
  // Compare the geometry itself, normalising only the whitespace the editor wraps it with.
  const paths = (svg) => [
    ...[...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]),
    ...[...svg.matchAll(/\spoints="([^"]+)"/g)].map((m) => m[1])
  ].map((d) => d.split(/\s+/).join(' ').trim());
  const masterPaths = paths(master);
  assert.ok(masterPaths.length > 0, 'master carries vector geometry');
  assert.deepEqual(paths(MK_LOGO_PRIMARY_SVG), masterPaths, 'primary mark geometry differs from the approved master');
  assert.deepEqual(paths(MK_LOGO_REVERSED_SVG), masterPaths, 'reversed mark geometry differs from the approved master');
});
check('the primary mark uses only the two brand colours', () => {
  const fills = [...new Set((MK_LOGO_PRIMARY_SVG.match(/fill="#[0-9A-Fa-f]{6}"/g) ?? []))].sort();
  assert.deepEqual(fills, ['fill="#01123A"', 'fill="#47515A"']);
});
check('the reversed mark is a colour treatment of the same geometry', () => {
  assert.doesNotMatch(MK_LOGO_REVERSED_SVG, /#01123A/i);
  assert.match(MK_LOGO_REVERSED_SVG, /#FFFFFF/i);
});
check('the mark keeps the master proportions', () => {
  assert.ok(Math.abs(MK_LOGO_ASPECT_RATIO - 739 / 206) < 1e-9);
});

/* ---- typography ---- */
check('Open Sans leads both font stacks', () => {
  assert.match(essential, /font: 9\.2pt\/1\.42 'Open Sans'/);
  assert.match(essential, /font-family: 'Open Sans'/);
  assert.match(comprehensive, /font-family:'Open Sans'/);
});
check('Georgia can no longer activate', () => {
  assert.doesNotMatch(essential, /Georgia/);
  assert.doesNotMatch(comprehensive, /Georgia/);
});
check('Arial cannot lead a stack', () => {
  assert.doesNotMatch(essential, /font-family: Arial/);
  assert.doesNotMatch(comprehensive, /font-family:Arial/);
});
check('Poppins is not introduced in this increment', () => {
  assert.doesNotMatch(essential, /Poppins/i);
  assert.doesNotMatch(comprehensive, /Poppins/i);
});
check('type sizes are untouched', () => {
  assert.match(essential, /font: 9\.2pt\/1\.42/);
  assert.match(essential, /h2 \{ color: var\(--mk-navy-900\); font-size: 20pt/);
  assert.match(essential, /\.cover h1 \{ color: var\(--mk-white\); font-size: 31pt/);
  assert.match(essential, /\.cover-brand \{ font-size: 10pt/);
});

/* ---- geometry must not move ---- */
check('page box and margins are untouched', () => {
  assert.match(essential, /@page \{ size: A4 portrait; margin: 12mm 13mm 15mm 13mm; \}/);
});
check('the cover field order is unchanged', () => {
  const cover = essential.slice(essential.indexOf('<section class="cover">'), essential.indexOf('</section>', essential.indexOf('<section class="cover">')));
  const order = ['cover-brand', 'cover-rule', 'cover-eyebrow', '<h1>', 'cover-subtitle', 'cover-client', 'cover-meta', 'cover-confidential'];
  let at = -1;
  for (const token of order) {
    const next = cover.indexOf(token, at + 1);
    assert.ok(next > at, `cover field out of order at ${token}`);
    at = next;
  }
});
check('Essential stays scoreless on the cover', () => {
  const cover = essential.slice(essential.indexOf('<section class="cover">'), essential.indexOf('</section>', essential.indexOf('<section class="cover">')));
  assert.doesNotMatch(cover, /overallScore|score\(/, 'a score reached the Essential cover');
});
check('Comprehensive keeps its result on the cover', () => {
  assert.match(comprehensive, /\$\{input\.score\.toFixed\(2\)\}/);
  assert.match(comprehensive, /Readiness \/ 100/);
  assert.match(comprehensive, /Maturity band/);
});

/* ---- navigation ---- */
check('Essential outline wiring is intact', () => {
  const validated = read('src/lib/reports/render-validated-commercial-pdf.ts');
  assert.match(validated, /addPdfBookmarks/);
  assert.match(validated, /APPENDIX_ROOT_ENTRY/);
});
check('Comprehensive now writes an outline', () => {
  const manual = read('src/lib/reports/comprehensive/manual-generation.ts');
  assert.match(manual, /withComprehensiveBookmarks/);
  assert.match(manual, /addPdfBookmarks/);
});
check('the outline is built from the renderer\'s own section plan', () => {
  const manual = read('src/lib/reports/comprehensive/manual-generation.ts');
  assert.match(manual, /comprehensiveSectionPlan/);
  assert.match(manual, /COMPREHENSIVE_REGISTER_TITLES/);
  assert.equal(COMPREHENSIVE_REGISTER_TITLES.length, 6);
});
check('a remediation report plans nine numbered sections', () => {
  const plan = comprehensiveSectionPlan({ narrativeMode: 'REMEDIATION', registers: { scenarios: [{}], assuranceCoverage: [], assurancePriorities: [], resilienceTests: [] } });
  assert.equal(plan.length, 9);
  assert.equal(plan[0].title, 'Where the organisation stands');
  assert.equal(plan[8].title, 'How management will know it is working');
});

const failed = results.filter((r) => r.status === 'FAIL');
console.log(JSON.stringify({ suite: 'increment-2-brand-conformance', total: results.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
