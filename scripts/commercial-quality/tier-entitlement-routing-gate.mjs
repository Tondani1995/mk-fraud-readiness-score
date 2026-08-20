#!/usr/bin/env node
/**
 * Tier entitlement + pipeline routing gate — zero provider calls.
 *
 * A paid R35,000 Comprehensive order had no operator fulfilment path: entitlement
 * validation still carried the retired reviewer-led model and rejected every
 * Comprehensive order, and manual generation supported only Essential.
 *
 * This gate proves each paid tier is entitled to its own report and only its own,
 * that the retired model is gone, and that manual fulfilment selects the pipeline
 * from the entitlement rather than assuming Essential.
 *
 * Usage:
 *   npm run v11:tier-entitlement-routing-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import {
  validatePremiumReportGenerationEntitlement,
  ReportEntitlementError,
  ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE,
  COMPREHENSIVE_REPORT_TYPE
} from '../../src/lib/reports/report-entitlement.ts';
import { ESSENTIAL_PRODUCT_CODE, COMPREHENSIVE_PRODUCT_CODE } from '../../src/lib/commercial/product-catalogue.ts';

const ESSENTIAL_ORDER = process.env.ESSENTIAL_ORDER ?? 'MKORD-2026-22FF6B69';
const COMPREHENSIVE_ORDER = process.env.COMPREHENSIVE_ORDER ?? 'MKORD-2026-BC315A4D';

const results = [];
const record = (id, description, passed, detail) =>
  results.push({ id, description, result: passed ? 'PASS' : 'FAIL', detail });

const entitlementOf = async (orderReference) => {
  const assembled = await assembleReportData(orderReference);
  try {
    return { assembled, reportType: validatePremiumReportGenerationEntitlement(assembled), error: null };
  } catch (error) {
    return { assembled, reportType: null, error };
  }
};

// T1/T2 — each paid tier resolves to its own report type.
const essential = await entitlementOf(ESSENTIAL_ORDER);
record('T1', 'Essential order is entitled to the Essential report only',
  essential.reportType === ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE
    && essential.assembled.productCode === ESSENTIAL_PRODUCT_CODE,
  `product=${essential.assembled.productCode} reportType=${essential.reportType ?? essential.error?.message}`);

const comprehensive = await entitlementOf(COMPREHENSIVE_ORDER);
record('T2', 'Comprehensive order is entitled to the Comprehensive report only',
  comprehensive.reportType === COMPREHENSIVE_REPORT_TYPE
    && comprehensive.assembled.productCode === COMPREHENSIVE_PRODUCT_CODE,
  `product=${comprehensive.assembled.productCode} reportType=${comprehensive.reportType ?? comprehensive.error?.message}`);

// T3 — the tiers never cross. Neither paid order can resolve to the other's report.
record('T3', 'Entitlements never cross between tiers',
  essential.reportType !== COMPREHENSIVE_REPORT_TYPE
    && comprehensive.reportType !== ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE,
  `essential=${essential.reportType} comprehensive=${comprehensive.reportType}`);

// T4 — the retired reviewer-led Comprehensive model is gone from entitlement.
const source = fs.readFileSync('src/lib/reports/report-entitlement.ts', 'utf8');
const RETIRED = /reviewer-led engagement workflow|reviewer\s+validation|sign[- ]off|independent(?:ly)?\s+validat/i;
const retiredHit = source.split('\n').findIndex((line) =>
  RETIRED.test(line) && !/^\s*(?:\*|\/\/)/.test(line));
record('T4', 'Retired reviewer-led Comprehensive model is absent from entitlement',
  retiredHit === -1, retiredHit === -1 ? 'no reviewer-led rejection' : `line ${retiredHit + 1}`);

// T5 — wrong-tier and unentitled products are still rejected.
const rejections = [];
for (const [label, mutate] of [
  ['free product', (a) => { a.productCode = 'free_snapshot'; }],
  ['unknown product', (a) => { a.productCode = 'something_else'; }],
  // A mislabelled order: the code says Comprehensive while the identity and price
  // history are still Essential's. Tier selection reads the code and the price proof
  // reads the id, so this is the shape that could price one tier and fulfil the other.
  ['Comprehensive code over an Essential product identity',
    (a) => { a.productCode = COMPREHENSIVE_PRODUCT_CODE; a.productPriceVersions = a.productPriceVersions.map((v) => ({ ...v, productId: `${v.productId}-other` })); }],
  ['Essential order carrying a Comprehensive-sized amount', (a) => { a.amountCents = 3_500_000; }]
]) {
  const assembled = await assembleReportData(ESSENTIAL_ORDER);
  mutate(assembled);
  try {
    const reportType = validatePremiumReportGenerationEntitlement(assembled);
    rejections.push(`${label}: ACCEPTED as ${reportType}`);
  } catch (error) {
    if (!(error instanceof ReportEntitlementError)) rejections.push(`${label}: wrong error type`);
  }
}
record('T5', 'Wrong-tier and unentitled products are rejected',
  rejections.length === 0, rejections.length ? rejections.join('; ') : 'all rejected');

// T6 — manual fulfilment routes on the entitlement, not on an assumed tier.
const fulfilment = fs.readFileSync('src/lib/reports/phase1-manual-fulfilment.ts', 'utf8');
record('T6', 'Manual fulfilment selects the pipeline from the entitlement',
  /const isComprehensive = reportType === COMPREHENSIVE_REPORT_TYPE/.test(fulfilment)
    && /renderComprehensiveReportPdf/.test(fulfilment)
    && /p_report_type: reportType/.test(fulfilment),
  'branches on reportType, routes to the certified Comprehensive pipeline, persists the type');

// T7 — the Comprehensive path reuses the certified pipeline and duplicates nothing.
const manual = fs.readFileSync('src/lib/reports/comprehensive/manual-generation.ts', 'utf8');
const REQUIRED = ['assembleComprehensive', 'buildComprehensiveManagementModel',
  'renderComprehensiveManagementReportHtml', 'interpretationToCommentary', 'renderHtmlToPdfBuffer'];
const missing = REQUIRED.filter((symbol) => !manual.includes(symbol));
// A second renderer would mean the operator ships something other than what was certified.
const duplicates = /<html|<style|<section|<table/i.test(manual);
record('T7', 'Comprehensive manual path reuses the certified pipeline without duplicating it',
  missing.length === 0 && !duplicates,
  missing.length ? `missing ${missing.join(',')}` : duplicates ? 'contains its own markup' : 'composition only');

// T8 — repairs are additional paid calls and are not authorised by default.
record('T8', 'Comprehensive manual path defaults to a single provider call',
  /maxRepairsPerSlot: input\.maxRepairsPerSlot \?\? 0/.test(manual),
  'maxRepairsPerSlot defaults to 0');

const failures = results.filter((entry) => entry.result === 'FAIL');
const summary = {
  gate: 'tier-entitlement-routing',
  providerCalls: 0,
  essentialOrder: ESSENTIAL_ORDER,
  comprehensiveOrder: COMPREHENSIVE_ORDER,
  conditions: results.length,
  violations: failures.length,
  results
};
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/manual-launch/tier-routing';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'tier-entitlement-routing.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const entry of results) console.log(`${entry.result}  ${entry.id}  ${entry.description}  [${entry.detail}]`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} tier-entitlement/routing violation(s).`);
  process.exit(1);
}
console.log('\nPASS: each paid tier is entitled to its own report and routed to its own pipeline.');
