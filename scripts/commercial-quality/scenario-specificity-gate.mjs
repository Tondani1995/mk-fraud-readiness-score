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
import { VHUTSHILO_V12_GRAPH_VERSION, VHUTSHILO_V12_GATEWAY_MAP } from '../../src/lib/adaptive/fixtures/vhutshilo-v12.ts';

const v12 = (overrides = {}) => deriveSupportedOperatingExposures({
  graphVersion: VHUTSHILO_V12_GRAPH_VERSION,
  gatewayAnswers: { ...VHUTSHILO_V12_GATEWAY_MAP, ...overrides }
});

const partialV12 = (answers) => deriveSupportedOperatingExposures({
  graphVersion: VHUTSHILO_V12_GRAPH_VERSION,
  gatewayAnswers: answers
});

const results = [];
const record = (id, description, passed, detail) =>
  results.push({ id, description, result: passed ? 'PASS' : 'FAIL', detail });

// ---- A. Evidence grounding -------------------------------------------------
const stock = partialV12({ G07: 'yes' });
record('A1', 'Stock exposure requires the stock gateway',
  hasExposure(stock, 'PHYSICAL_STOCK_OR_ASSETS'), 'G07=yes grants PHYSICAL_STOCK_OR_ASSETS');

// ---- B. Historical / null safety -------------------------------------------
record('B1', 'Missing gateway data yields no exposures and never throws',
  partialV12(undefined).length === 0
  && partialV12({}).length === 0, 'undefined and {} both yield []');

// ---- C. Negative fabrication ----------------------------------------------
// The defining property: absent evidence must never produce a specialised context.
const none = v12({ G04: 'organisation', G06: 'no', G07: 'no', G09: 'none', G10: 'no', G13: 'no', G14: 'no', G17: 'no' });
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
const unknown = partialV12({ G06: 'unknown', G07: 'unknown', G09: 'unknown', G13: 'unknown', G14: 'unknown' });
record('C2', '"unknown" establishes nothing', unknown.length === 0, `${unknown.length} exposures from all-unknown`);

// ---- D. Differentiation ----------------------------------------------------
// Same weak family, different evidenced exposure -> different context.
const cashSite = partialV12({ G06: 'yes', G09: 'none', G10: 'no', G13: 'yes' });
const onlineSingle = partialV12({ G06: 'no', G09: 'own', G10: 'yes', G13: 'no' });
record('D1', 'Different evidenced operating models yield different exposure sets',
  hasExposure(cashSite, 'CASH_HANDLING') && !hasExposure(cashSite, 'DIGITAL_CUSTOMER_ACTIVITY')
  && hasExposure(onlineSingle, 'DIGITAL_CUSTOMER_ACTIVITY') && !hasExposure(onlineSingle, 'CASH_HANDLING'),
  'cash+multi-site vs online+single-site diverge');

record('D2', 'Site footprint is distinguished, not assumed',
  hasExposure(cashSite, 'DISTRIBUTED_OPERATIONS') && hasExposure(onlineSingle, 'SINGLE_SITE_OPERATIONS'),
  'G13 yes/no produce distinct exposures');

// ---- E. Sector is never the source ----------------------------------------
// G01 is 'other' for most organisations and must carry no derivation weight.
const sectorOnly = partialV12({ G01: 'construction_projects' });
record('E1', 'Sector label alone establishes no exposure',
  sectorOnly.length === 0, `G01=construction alone yields ${sectorOnly.length} exposures`);

// ---- F. Fallback ----------------------------------------------------------
record('F1', 'Outsourcing is distinguished from internal management',
  hasExposure(partialV12({ G04: 'external_provider' }), 'OUTSOURCED_SUPPLIER_MANAGEMENT')
  && hasExposure(partialV12({ G04: 'organisation' }), 'INTERNAL_SUPPLIER_MANAGEMENT'),
  'G04 external/internal diverge');

// ---- G. Vocabulary safety --------------------------------------------------
// Concepts the assessment never captures must have no derivation path at all.
const source = fs.readFileSync('src/lib/reports/narrative/fact-pack.ts', 'utf8');
const scenarioBlock = source.slice(source.indexOf('SCENARIO_CONTEXT_VARIANTS'), source.indexOf('interface FraudPathwayRule'));
// G14 asks verbatim about "temporary, seasonal or subcontracted workers", so worker
// subcontracting is evidenced. Subcontracted WORK PACKAGES are not, so the noun forms
// stay forbidden while the worker phrasing is allowed only alongside its gateway.
const FORBIDDEN = /\b(patient|fleet|fuel card|subcontractor|subcontractors|subcontracting|hotel booking|courier|hospital billing|tenant|bursary|beneficiary)\b/i;
const leak = scenarioBlock.match(FORBIDDEN);
record('G1', 'Scenario context never uses concepts the assessment does not capture',
  !leak, leak ? `found "${leak[0]}"` : 'no unsupported vocabulary');

// Worker subcontracting may be named only where G14 gates it.
const workerPhrase = /subcontracted worker/i.test(scenarioBlock);
const workerGated = !workerPhrase || /TEMPORARY_OR_SUBCONTRACTED_WORKFORCE/.test(scenarioBlock);
record('G2', 'Subcontracted-worker wording appears only under its G14 exposure',
  workerGated, workerPhrase ? 'phrase present and G14-gated' : 'phrase absent');

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
