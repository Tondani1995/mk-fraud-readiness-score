#!/usr/bin/env node
/**
 * Snapshot result experience -- structural and brand gate.
 *
 * Enforces the removals and the brand rules from the frozen UX specification as tests rather
 * than as review notes, so none of them can quietly return.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

/**
 * Source with comments stripped.
 *
 * The gate must test what ships, not the prose explaining why. Several of these rules are
 * documented in comments that necessarily name the thing being forbidden, and scanning raw
 * text would fail on its own explanation.
 */
function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every customer-facing file in the Snapshot result and order journey. */
const SURFACE_FILES = [
  'src/components/assessment/SnapshotResult.tsx',
  'src/components/assessment/ScoreGauge.tsx',
  'src/components/products/ProductChoice.tsx',
  'src/components/products/TierComparison.tsx',
  'src/components/commercial/OrderJourney.tsx',
  'src/components/layout/ResultChrome.tsx',
  'src/app/score/snapshot/[assessmentRef]/page.tsx',
  'src/app/score/order/new/page.tsx',
  'src/lib/snapshot/result-copy.ts'
];

test('The replaced Snapshot card is gone', () => {
  assert.equal(exists('src/components/assessment/FreeSnapshot.tsx'), false);
  for (const file of SURFACE_FILES) {
    assert.doesNotMatch(read(file), /FreeSnapshotCard/, `${file} still references the replaced card`);
  }
});

test('No raw Tailwind palette class appears on a customer surface', () => {
  // amber-* was the only gold on the journey and belongs to no MK source. slate-*/gray-*/blue-*
  // bypass the brand tokens entirely.
  const banned = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(?:amber|slate|gray|grey|zinc|neutral|stone|blue|indigo|sky|emerald|teal|rose|orange|yellow)-\d{2,3}\b/;
  for (const file of SURFACE_FILES) {
    const match = read(file).match(banned);
    assert.equal(match, null, `${file} uses off-brand palette class ${match?.[0]}`);
  }
});

test('No unapproved brand colour is hard-coded on a customer surface', () => {
  // The approved runtime palette for V1.2. #FFFFFF and white alphas are permitted literals in
  // the navy sections, where a token cannot express an alpha.
  const APPROVED = new Set(['#001030', '#1d3658', '#47515a', '#f8fafc', '#e2e8f0', '#ffffff', '#9b2c2c', '#2f6b4f']);
  for (const file of SURFACE_FILES) {
    for (const hex of read(file).match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      assert.ok(APPROVED.has(hex.toLowerCase()), `${file} hard-codes unapproved colour ${hex}`);
    }
  }
});

test('No gold or cream survives anywhere on the journey', () => {
  for (const file of SURFACE_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /#C9A227|#8C6F14|#FAF7F0|#D9B441/i, `${file} reintroduces a gold value`);
    assert.doesNotMatch(source, /\bmk-brass|mk-cream|mk-charcoal\b/, `${file} uses a deprecated token alias`);
  }
});

test('The unconditional Comprehensive recommendation cannot be reintroduced', () => {
  const tierComparison = read('src/components/products/TierComparison.tsx');
  assert.doesNotMatch(tierComparison, /featured/, 'TierComparison still carries a featured flag');
  assert.doesNotMatch(tierComparison, /Recommended/, 'TierComparison still renders a Recommended badge');
  // The only recommendation source is the deterministic rule set.
  const choice = read('src/components/products/ProductChoice.tsx');
  assert.match(choice, /recommendation\.recommendedTier === tier/);
  assert.match(choice, /recommendation\.reason/);
  assert.match(choice, /recommendation\.freedomClause/);
});

test('Advisory renders no price, floor or range', () => {
  for (const file of SURFACE_FILES) {
    assert.doesNotMatch(read(file), /ADVISORY_PRICE_FROM_CENTS/, `${file} imports the Advisory floor`);
    assert.doesNotMatch(read(file), /150[ ,.]?000/, `${file} renders an Advisory figure`);
  }
});

test('No price literal exists on a customer surface', () => {
  for (const file of SURFACE_FILES) {
    assert.doesNotMatch(read(file), /R\s?7[ ,.]?500|R\s?35[ ,.]?000|\b750000\b|\b3500000\b/, `${file} hard-codes a price`);
  }
  // Prices resolve from the catalogue at render time.
  assert.match(read('src/components/products/ProductChoice.tsx'), /COMMERCIAL_CATALOGUE\[tier\]/);
});

test('No inline billing form remains on the result page', () => {
  const result = read('src/components/assessment/SnapshotResult.tsx');
  assert.doesNotMatch(result, /invoiceRequested|invoiceDetails|billingEmail|<input/i);
  // Billing lives on the focused route only.
  assert.match(read('src/components/commercial/OrderJourney.tsx'), /invoiceRequested/);
});

test('Priority signals render exactly once', () => {
  const result = read('src/components/assessment/SnapshotResult.tsx');
  const occurrences = (result.match(/prioritySignals/g) ?? []).length;
  assert.equal(occurrences, 1, `prioritySignals appears ${occurrences} times; it must render once`);
});

test('The result routes are excluded from marketing navigation', () => {
  const chrome = read('src/components/layout/AppChrome.tsx');
  assert.match(chrome, /resultActive/);
  assert.match(chrome, /score\/snapshot\//);
  assert.match(chrome, /score\/order\//);
  for (const file of SURFACE_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /Assess Your Organisation/, `${file} shows the assessment CTA on a completed result`);
    for (const label of ['Industries', 'Insights']) {
      assert.doesNotMatch(source, new RegExp(`>\\s*${label}\\s*<`), `${file} shows marketing nav item ${label}`);
    }
  }
});

test('No system vocabulary reaches the customer', () => {
  const banned = [
    /persisted score run/i,
    /Persisted score result/i,
    /\bresult status\b/i,
    /Report options/i,
    /Product name/i,
    /MK admin generation/i,
    /Normal result/i
  ];
  for (const file of SURFACE_FILES) {
    const source = read(file);
    for (const pattern of banned) {
      assert.doesNotMatch(source, pattern, `${file} exposes system vocabulary matching ${pattern}`);
    }
  }
});

test('Comprehensive makes no assurance, validation or review claim', () => {
  const banned = /\b(reviewed|independently|independent review of|validated|verified|examined|assured|assurance opinion|sign-off|signed off)\b/i;
  const choice = read('src/components/products/ProductChoice.tsx');
  // The Advisory band is the one place these words are permitted, because that is what Advisory
  // does. Everything before it describes the two analytical products.
  const advisoryIndex = choice.indexOf('MK Advisory');
  assert.ok(advisoryIndex > 0, 'Advisory band not found');
  const analyticalSection = choice.slice(0, advisoryIndex);
  const match = analyticalSection.match(banned);
  assert.equal(match, null, `product copy claims ${match?.[0]}`);
});

test('One h1, and it is the organisation-specific headline', () => {
  const result = read('src/components/assessment/SnapshotResult.tsx');
  assert.equal((result.match(/<h1/g) ?? []).length, 1);
  assert.match(result, /<h1[^>]*>\s*\{narrative\.headline\}/s);
});

test('The score gauge draws no unsupported calculated-score marker', () => {
  const gauge = read('src/components/assessment/ScoreGauge.tsx');
  // The engine caps maturity and persists no uncapped numeric score, so no caret may claim one.
  assert.doesNotMatch(gauge, /calculatedScore|uncapped/i);
});

test('The deterministic fallback occupies the same layout', () => {
  const result = read('src/components/assessment/SnapshotResult.tsx');
  assert.match(result, /snapshotNarrative \?\? buildMinimalSafeSnapshotNarrativeContent/);
  // No provider, model or AI status may be exposed, and no layout may branch on provenance.
  assert.doesNotMatch(result, /\.mode\b|\.model\b|fallbackReason|aiCallCount|provider/i);
});

test('White text on navy stays above the AA threshold', () => {
  // White/45% on #001030 computes to 4.46:1 and fails AA. 52% is the floor actually used.
  for (const file of SURFACE_FILES) {
    for (const match of read(file).matchAll(/text-white\/\[?\.(\d{2})\]?/g)) {
      assert.ok(Number(match[1]) >= 52, `${file} uses text-white/.${match[1]}, below the 52% floor`);
    }
  }
});
