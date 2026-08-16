#!/usr/bin/env node
/**
 * Scenario-specificity gate — zero provider calls.
 *
 * Fraud scenarios were keyed on the weak control family alone, so two organisations with
 * the same weakness received byte-identical prose: a construction operator and a hospital
 * group both got "Unusual activity avoids timely challenge…" word for word. Scenarios now
 * take an operating context derived from the customer's own gateway answers.
 *
 * This holds the two properties that matter: a context is only ever selected when the
 * assessment establishes it, and organisations whose evidence genuinely differs do not
 * receive interchangeable narratives.
 *
 * Usage:
 *   npm run v11:scenario-specificity-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { deriveSupportedOperatingExposures, hasExposure } from '../../src/lib/reports/narrative/operating-exposures.ts';

const results = [];
const record = (id, description, passed, detail) =>
  results.push({ id, description, result: passed ? 'PASS' : 'FAIL', detail });

// ---- A. Evidence grounding -------------------------------------------------
const stock = deriveSupportedOperatingExposures({ G06: 'yes' });
record('A1', 'Stock exposure requires the stock gateway',
  hasExposure(stock, 'PHYSICAL_STOCK_OR_ASSETS'), 'G06=yes grants PHYSICAL_STOCK_OR_ASSETS');

// ---- B. Historical / null safety -------------------------------------------
record('B1', 'Missing gateway data yields no exposures and never throws',
  deriveSupportedOperatingExposures(undefined).length === 0
  && deriveSupportedOperatingExposures({}).length === 0, 'undefined and {} both yield []');

// ---- C. Negative fabrication ----------------------------------------------
// The defining property: absent evidence must never produce a specialised context.
const none = deriveSupportedOperatingExposures({ G05: 'none', G06: 'no', G08: 'no', G10: 'no', G11: 'no' });
const fabrications = [
  ['stock', hasExposure(none, 'PHYSICAL_STOCK_OR_ASSETS')],
  ['digital customer activity', hasExposure(none, 'DIGITAL_CUSTOMER_ACTIVITY')],
  ['cash handling', hasExposure(none, 'CASH_HANDLING')],
  ['refunds', hasExposure(none, 'REFUNDS_AND_ADJUSTMENTS')],
  ['distributed operations', hasExposure(none, 'DISTRIBUTED_OPERATIONS')]
].filter(([, present]) => present).map(([label]) => label);
record('C1', 'No evidence never fabricates an exposure',
  fabrications.length === 0, fabrications.length ? `fabricated: ${fabrications.join(', ')}` : 'none fabricated');

// 'unknown' is a real gateway option meaning the customer could not say.
const unknown = deriveSupportedOperatingExposures({ G05: 'unknown', G06: 'unknown', G08: 'unknown' });
record('C2', '"unknown" establishes nothing', unknown.length === 0, `${unknown.length} exposures from all-unknown`);

// ---- D. Differentiation ----------------------------------------------------
// Same weak family, different evidenced exposure -> different context.
const cashSite = deriveSupportedOperatingExposures({ G05: 'significant', G08: 'no', G10: 'no', G11: 'yes' });
const onlineSingle = deriveSupportedOperatingExposures({ G05: 'none', G08: 'yes', G10: 'yes', G11: 'no' });
record('D1', 'Different evidenced operating models yield different exposure sets',
  hasExposure(cashSite, 'SIGNIFICANT_CASH_HANDLING') && !hasExposure(cashSite, 'DIGITAL_CUSTOMER_ACTIVITY')
  && hasExposure(onlineSingle, 'DIGITAL_CUSTOMER_ACTIVITY') && !hasExposure(onlineSingle, 'CASH_HANDLING'),
  'cash+multi-site vs online+single-site diverge');

record('D2', 'Site footprint is distinguished, not assumed',
  hasExposure(cashSite, 'DISTRIBUTED_OPERATIONS') && hasExposure(onlineSingle, 'SINGLE_SITE_OPERATIONS'),
  'G11 yes/no produce distinct exposures');

// ---- E. Sector is never the source ----------------------------------------
// G01 is 'other' for most organisations and must carry no derivation weight.
const sectorOnly = deriveSupportedOperatingExposures({ G01: 'construction' });
record('E1', 'Sector label alone establishes no exposure',
  sectorOnly.length === 0, `G01=construction alone yields ${sectorOnly.length} exposures`);

// ---- F. Fallback ----------------------------------------------------------
record('F1', 'Outsourcing is distinguished from internal management',
  hasExposure(deriveSupportedOperatingExposures({ G03: 'outsourced' }), 'OUTSOURCED_SUPPLIER_MANAGEMENT')
  && hasExposure(deriveSupportedOperatingExposures({ G03: 'internal' }), 'INTERNAL_SUPPLIER_MANAGEMENT'),
  'G03 outsourced/internal diverge');

// ---- G. Vocabulary safety --------------------------------------------------
// Concepts the assessment never captures must have no derivation path at all.
const source = fs.readFileSync('src/lib/reports/narrative/fact-pack.ts', 'utf8');
const scenarioBlock = source.slice(source.indexOf('SCENARIO_CONTEXT_VARIANTS'), source.indexOf('interface FraudPathwayRule'));
const FORBIDDEN = /\b(patient|fleet|fuel card|subcontractor|hotel booking|courier|hospital billing|tenant|bursary|beneficiary)\b/i;
const leak = scenarioBlock.match(FORBIDDEN);
record('G1', 'Scenario context never uses concepts the assessment does not capture',
  !leak, leak ? `found "${leak[0]}"` : 'no unsupported vocabulary');

const failures = results.filter((entry) => entry.result === 'FAIL');
const summary = { gate: 'scenario-specificity', providerCalls: 0, conditions: results.length, violations: failures.length, results };
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/scenario-specificity';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'scenario-specificity.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const entry of results) console.log(`${entry.result}  ${entry.id}  ${entry.description}  [${entry.detail}]`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} scenario-specificity violation(s).`);
  process.exit(1);
}
console.log('\nPASS: scenario context is evidence-gated and differentiates on real operating differences.');
