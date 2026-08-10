/**
 * Joint launch commercial contract tests (credential-free, no database, no network).
 *
 * Covers the PRODUCT, ORDER and HISTORICAL requirements of the joint Essential + Comprehensive
 * launch: the authoritative prices, that Advisory is not self-service orderable, that no current
 * customer-facing R5,000 or R50,000 product contract survives, that Essential and Comprehensive
 * entitlements cannot cross, and - the important one - that a historical price snapshot does not
 * become accidentally entitled under a new catalogue price and that no unrestricted dual-price
 * exception exists.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ADVISORY_PRICE_FROM_CENTS,
  COMMERCIAL_CATALOGUE,
  COMPREHENSIVE_PRICE_CENTS,
  COMPREHENSIVE_PRODUCT_CODE,
  ESSENTIAL_PRICE_CENTS,
  ESSENTIAL_PRODUCT_CODE,
  ESSENTIAL_SUPERSEDED_PRICE_CENTS,
  isSelfServicePaidTier,
  listCatalogue,
  paidProductForTier,
  tierForProductCode
} from '../src/lib/commercial/product-catalogue.ts';
import {
  currentPriceVersion,
  priceVersionEffectiveAt,
  validateOrderPriceEntitlement,
  versionCoversInstant
} from '../src/lib/commercial/order-price-entitlement.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

console.log('joint-launch product contract');

// --- PRODUCT ------------------------------------------------------------------------------------

check('Essential current price is 750000 cents ZAR incl VAT', () => {
  assert.equal(ESSENTIAL_PRICE_CENTS, 750000);
  assert.equal(COMMERCIAL_CATALOGUE.essential.priceCents, 750000);
  assert.equal(COMMERCIAL_CATALOGUE.essential.currency, 'ZAR');
  assert.equal(COMMERCIAL_CATALOGUE.essential.vatInclusive, true);
  assert.equal(COMMERCIAL_CATALOGUE.essential.label, 'Essential');
});

check('Comprehensive current price is 3500000 cents ZAR incl VAT', () => {
  assert.equal(COMPREHENSIVE_PRICE_CENTS, 3500000);
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.priceCents, 3500000);
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.currency, 'ZAR');
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.vatInclusive, true);
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.label, 'Comprehensive');
});

check('Comprehensive is a human-reviewed engagement, not an automated diagnostic', () => {
  assert.equal(COMMERCIAL_CATALOGUE.comprehensive.fulfilmentModel, 'reviewed_engagement');
  assert.equal(COMMERCIAL_CATALOGUE.essential.fulfilmentModel, 'automated_diagnostic');
  assert.notEqual(COMPREHENSIVE_PRODUCT_CODE, ESSENTIAL_PRODUCT_CODE);
});

check('Advisory is not self-service orderable and carries no fixed platform entitlement', () => {
  const advisory = COMMERCIAL_CATALOGUE.advisory;
  assert.equal(advisory.selfServiceOrderable, false);
  assert.equal(advisory.productCode, null);
  assert.equal(advisory.priceCents, null);
  assert.equal(advisory.priceFromCents, ADVISORY_PRICE_FROM_CENTS);
  assert.equal(ADVISORY_PRICE_FROM_CENTS, 15000000);
  assert.equal(isSelfServicePaidTier('advisory'), false);
  assert.equal(paidProductForTier('advisory'), null);
});

check('only Essential and Comprehensive can be ordered through the paid entitlement system', () => {
  assert.equal(paidProductForTier('essential').productCode, ESSENTIAL_PRODUCT_CODE);
  assert.equal(paidProductForTier('comprehensive').productCode, COMPREHENSIVE_PRODUCT_CODE);
  for (const value of ['advisory', 'free', 'gold', '', null, undefined, 0, {}]) {
    assert.equal(paidProductForTier(value), null, `tier ${String(value)} must not be orderable`);
  }
});

check('no current customer-facing R5,000 or R50,000 product contract survives', () => {
  for (const listing of listCatalogue()) {
    assert.notEqual(listing.priceCents, 500000, `${listing.tier} must not still be priced at R5,000`);
    assert.notEqual(listing.priceCents, 5000000, `${listing.tier} must not still be priced at R50,000`);
  }
  const advisory = listCatalogue().find((listing) => listing.tier === 'advisory');
  assert.notEqual(advisory.priceFromCents, 5000000, 'Advisory must not be presented as "from R50,000"');
});

/** Executable source with comments removed, so prose about prices is not mistaken for a literal. */
function code(relativePath) {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

check('the catalogue is the only place a price literal lives', () => {
  const cataloguePath = 'src/lib/commercial/product-catalogue.ts';
  // Every server module that participates in ordering or entitlement must be free of amounts.
  for (const file of [
    'src/lib/commercial/order-service.ts',
    'src/lib/commercial/order-price-entitlement.ts',
    'src/lib/reports/report-entitlement.ts',
    'src/lib/orders/manual-eft-orders.ts',
    'src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts',
    'src/app/score/api/commercial/products/route.ts'
  ]) {
    const source = code(file);
    for (const literal of ['750000', '3500000', '500000', '5000000', '15000000']) {
      assert.equal(
        source.includes(literal),
        false,
        `${file} must not carry the price literal ${literal}; prices belong in ${cataloguePath}`
      );
    }
  }
});

check('internal product code, customer label and price are separate concerns', () => {
  assert.equal(tierForProductCode(ESSENTIAL_PRODUCT_CODE), 'essential');
  assert.equal(tierForProductCode(COMPREHENSIVE_PRODUCT_CODE), 'comprehensive');
  assert.equal(tierForProductCode('free_snapshot'), 'free');
  assert.equal(tierForProductCode('something_else'), null);
  assert.equal(tierForProductCode(null), null);
  // The label may change freely; the code may not.
  assert.notEqual(COMMERCIAL_CATALOGUE.comprehensive.label, COMPREHENSIVE_PRODUCT_CODE);
});

// --- VERSIONED PRICE CONTRACT --------------------------------------------------------------------

const ESSENTIAL_ID = 'product-essential';
const COMPREHENSIVE_ID = 'product-comprehensive';
const CUTOVER = '2026-08-10T00:00:00.000Z';

const versions = [
  {
    id: 'v-essential-1',
    productId: ESSENTIAL_ID,
    versionNumber: 1,
    priceCents: ESSENTIAL_SUPERSEDED_PRICE_CENTS,
    currency: 'ZAR',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: CUTOVER
  },
  {
    id: 'v-essential-2',
    productId: ESSENTIAL_ID,
    versionNumber: 2,
    priceCents: ESSENTIAL_PRICE_CENTS,
    currency: 'ZAR',
    effectiveFrom: CUTOVER,
    effectiveTo: null
  },
  {
    id: 'v-comprehensive-1',
    productId: COMPREHENSIVE_ID,
    versionNumber: 1,
    priceCents: 5000000,
    currency: 'ZAR',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: CUTOVER
  },
  {
    id: 'v-comprehensive-2',
    productId: COMPREHENSIVE_ID,
    versionNumber: 2,
    priceCents: COMPREHENSIVE_PRICE_CENTS,
    currency: 'ZAR',
    effectiveFrom: CUTOVER,
    effectiveTo: null
  }
];

function order(overrides = {}) {
  return {
    orderId: 'order-1',
    productId: ESSENTIAL_ID,
    amountCents: ESSENTIAL_PRICE_CENTS,
    currency: 'ZAR',
    createdAt: '2026-08-11T09:00:00.000Z',
    productPriceVersionId: 'v-essential-2',
    ...overrides
  };
}

check('validity windows are half-open, so exactly one version covers any instant', () => {
  const superseded = versions[0];
  const current = versions[1];
  assert.equal(versionCoversInstant(superseded, '2026-01-01T00:00:00.000Z'), true, 'lower bound inclusive');
  assert.equal(versionCoversInstant(superseded, CUTOVER), false, 'upper bound exclusive');
  assert.equal(versionCoversInstant(current, CUTOVER), true, 'new window starts exactly at the cutover');
  assert.equal(versionCoversInstant(current, '2030-01-01T00:00:00.000Z'), true, 'open window has no upper bound');
  assert.equal(priceVersionEffectiveAt(versions, ESSENTIAL_ID, CUTOVER).id, 'v-essential-2');
  assert.equal(priceVersionEffectiveAt(versions, ESSENTIAL_ID, '2026-07-09T00:00:00.000Z').id, 'v-essential-1');
  assert.equal(currentPriceVersion(versions, ESSENTIAL_ID).priceCents, ESSENTIAL_PRICE_CENTS);
});

check('a new Essential order at R7,500 is entitled', () => {
  const result = validateOrderPriceEntitlement(order(), versions);
  assert.equal(result.valid, true);
  assert.equal(result.version.priceCents, ESSENTIAL_PRICE_CENTS);
});

check('a legitimate historical R5,000 order stays entitled after the reprice, unmodified', () => {
  // Shape of every real Production row: created before the cutover, no price-version backfill.
  const historical = order({
    amountCents: ESSENTIAL_SUPERSEDED_PRICE_CENTS,
    createdAt: '2026-07-09T01:36:12.507Z',
    productPriceVersionId: null
  });
  const result = validateOrderPriceEntitlement(historical, versions);
  assert.equal(result.valid, true, 'a paid R5,000 order must not be de-entitled by the R7,500 migration');
  assert.equal(result.version.id, 'v-essential-1');
});

check('NO unrestricted dual-price exception: R5,000 booked after the cutover is rejected', () => {
  const result = validateOrderPriceEntitlement(
    order({ amountCents: ESSENTIAL_SUPERSEDED_PRICE_CENTS, productPriceVersionId: null }),
    versions
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'order_amount_price_version_mismatch');
});

check('a historical snapshot cannot claim the NEW price either', () => {
  const result = validateOrderPriceEntitlement(
    order({
      amountCents: ESSENTIAL_PRICE_CENTS,
      createdAt: '2026-07-09T01:36:12.507Z',
      productPriceVersionId: null
    }),
    versions
  );
  assert.equal(result.valid, false, 'R7,500 was not a valid Essential price in July 2026');
  assert.equal(result.reason, 'order_amount_price_version_mismatch');
});

check('a hand-set price version that never applied to the order is rejected', () => {
  const result = validateOrderPriceEntitlement(
    order({
      amountCents: ESSENTIAL_SUPERSEDED_PRICE_CENTS,
      createdAt: '2026-08-11T09:00:00.000Z',
      productPriceVersionId: 'v-essential-1'
    }),
    versions
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'price_version_not_effective_at_order_creation');
});

check('a price version belonging to another product is rejected', () => {
  const result = validateOrderPriceEntitlement(
    order({ amountCents: COMPREHENSIVE_PRICE_CENTS, productPriceVersionId: 'v-comprehensive-2' }),
    versions
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'price_version_product_mismatch');
});

check('overlapping versions fail closed rather than resolving by preference', () => {
  const overlapping = [
    ...versions,
    { ...versions[1], id: 'v-essential-2-duplicate', versionNumber: 3 }
  ];
  const result = validateOrderPriceEntitlement(order({ productPriceVersionId: null }), overlapping);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'price_version_missing');
});

check('a missing amount snapshot or currency mismatch is rejected', () => {
  assert.equal(validateOrderPriceEntitlement(order({ amountCents: null }), versions).reason, 'order_amount_not_snapshotted');
  assert.equal(
    validateOrderPriceEntitlement(order({ currency: 'USD' }), versions).reason,
    'order_currency_price_version_mismatch'
  );
  assert.equal(validateOrderPriceEntitlement(order(), []).reason, 'price_version_missing');
});

check('a Comprehensive order at R35,000 is entitled under its own product', () => {
  const result = validateOrderPriceEntitlement(
    order({ productId: COMPREHENSIVE_ID, amountCents: COMPREHENSIVE_PRICE_CENTS, productPriceVersionId: 'v-comprehensive-2' }),
    versions
  );
  assert.equal(result.valid, true);
  assert.equal(result.version.priceCents, COMPREHENSIVE_PRICE_CENTS);
});

check('the R50,000 Comprehensive window is closed, so it entitles nothing new', () => {
  const result = validateOrderPriceEntitlement(
    order({ productId: COMPREHENSIVE_ID, amountCents: 5000000, productPriceVersionId: null }),
    versions
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'order_amount_price_version_mismatch');
});

// --- ORDER / ENTITLEMENT CROSSING -----------------------------------------------------------------

check('Essential report entitlement rejects a Comprehensive order (entitlements cannot cross)', async () => {
  // Asserted structurally: the guard checks the Essential product code AND the Essential tier, and
  // names the Comprehensive code in its rejection path.
  const guard = read('src/lib/reports/report-entitlement.ts');
  assert.match(guard, /assembled\.productCode !== ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE/);
  assert.match(guard, /tierForProductCode\(assembled\.productCode\) !== 'essential'/);
  assert.match(guard, /COMPREHENSIVE_PRODUCT_CODE/);
});

check('order creation refuses any tier that is not self-service paid', () => {
  const route = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
  assert.match(route, /isSelfServicePaidTier\(body\?\.tier\)/);
  const service = read('src/lib/commercial/order-service.ts');
  assert.match(service, /tier_not_self_service/);
  // The order amount comes from the price version, never from the catalogue constant directly.
  assert.match(service, /amount_cents: priceVersion\.priceCents/);
  assert.match(service, /product_price_version_id: priceVersion\.id/);
  assert.match(service, /price_version_mismatch/);
});

check('Essential order creation resolves its product by code, not by display order', () => {
  const source = read('src/lib/orders/manual-eft-orders.ts');
  assert.match(source, /eq\('product_code', ESSENTIAL_PRODUCT_CODE\)/);
  assert.doesNotMatch(source, /order\('display_order'/);
  assert.match(source, /amount_cents: priceVersion\.priceCents/);
});

console.log(`\njoint-launch product contract: ${checks} checks passed.`);
