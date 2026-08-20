/**
 * Versioned product-price entitlement.
 *
 * The problem this exists to solve: before the joint launch, premium report entitlement compared
 * the order's amount against a hard-coded constant AND against `products.price_cents` read live at
 * generation time. Repricing Essential from R5,000 to R7,500 would therefore have silently
 * de-entitled every already-paid R5,000 order - and the only cheap way out would have been a
 * permanent "R5,000 OR R7,500 is always fine" exception, which is exactly the dangerous shape the
 * brief forbids, because it also entitles a NEW order created at the OLD price.
 *
 * The contract instead:
 *   - Each catalogue price is a row in `public.product_price_versions` with a half-open validity
 *     window [effective_from, effective_to). Exactly one row per product has effective_to = null.
 *   - New orders record `product_price_version_id`, so their entitlement is asserted, not inferred.
 *   - Legacy orders (created before the column existed) carry no version id and are NOT rewritten.
 *     They resolve to the single version whose window contains `orders.created_at`.
 *
 * Consequences that matter:
 *   - A legitimate R5,000 order created in July 2026 stays entitled forever, because the version
 *     effective at its creation time priced Essential at R5,000.
 *   - An order created TODAY for 500000 cents is rejected, because the version effective today
 *     prices Essential at 750000. There is no window in which both amounts are simultaneously
 *     valid, so no unrestricted dual-price allowance exists.
 */

export type ProductPriceVersion = {
  id: string;
  productId: string;
  versionNumber: number;
  priceCents: number;
  currency: string;
  /** Inclusive lower bound of the window this price applied to. */
  effectiveFrom: string;
  /** Exclusive upper bound; null means this is the current catalogue price. */
  effectiveTo: string | null;
};

export type OrderPriceSubject = {
  orderId: string;
  productId: string;
  /** Immutable price snapshot taken when the order was created. */
  amountCents: number | null;
  currency: string | null;
  createdAt: string;
  /** Present on orders created after the versioned contract landed; null for legacy orders. */
  productPriceVersionId: string | null;
};

export type PriceEntitlementReason =
  | 'price_version_missing'
  | 'price_version_product_mismatch'
  | 'price_version_not_effective_at_order_creation'
  | 'order_amount_not_snapshotted'
  | 'order_amount_price_version_mismatch'
  | 'order_currency_price_version_mismatch';

export type PriceEntitlementResult =
  | { valid: true; version: ProductPriceVersion }
  | { valid: false; reason: PriceEntitlementReason };

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** True when `at` falls inside the half-open window [effectiveFrom, effectiveTo). */
export function versionCoversInstant(version: ProductPriceVersion, at: string): boolean {
  const instant = timestamp(at);
  const from = timestamp(version.effectiveFrom);
  if (!Number.isFinite(instant) || !Number.isFinite(from)) return false;
  if (instant < from) return false;
  if (version.effectiveTo === null) return true;
  const to = timestamp(version.effectiveTo);
  return Number.isFinite(to) && instant < to;
}

/** The single version of `productId` in force at `at`, or null when none covers that instant. */
export function priceVersionEffectiveAt(
  versions: readonly ProductPriceVersion[],
  productId: string,
  at: string
): ProductPriceVersion | null {
  const matches = versions.filter((version) => version.productId === productId && versionCoversInstant(version, at));
  // A product with two versions covering the same instant is a data defect, not a fallback to
  // resolve by preference. Fail closed rather than silently picking one.
  return matches.length === 1 ? matches[0] : null;
}

export function currentPriceVersion(
  versions: readonly ProductPriceVersion[],
  productId: string
): ProductPriceVersion | null {
  const matches = versions.filter((version) => version.productId === productId && version.effectiveTo === null);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Validates that an order's immutable amount snapshot is the price its product genuinely carried
 * when the order was created. Never consults the live catalogue price.
 */
export function validateOrderPriceEntitlement(
  order: OrderPriceSubject,
  versions: readonly ProductPriceVersion[]
): PriceEntitlementResult {
  const version = order.productPriceVersionId
    ? versions.find((candidate) => candidate.id === order.productPriceVersionId) ?? null
    : priceVersionEffectiveAt(versions, order.productId, order.createdAt);

  if (!version) return { valid: false, reason: 'price_version_missing' };
  if (version.productId !== order.productId) return { valid: false, reason: 'price_version_product_mismatch' };

  // An explicitly referenced version must still be one that was genuinely in force for this order,
  // so a stale or hand-set version id cannot buy entitlement at a price that never applied.
  if (order.productPriceVersionId && !versionCoversInstant(version, order.createdAt)) {
    return { valid: false, reason: 'price_version_not_effective_at_order_creation' };
  }

  if (order.amountCents === null) return { valid: false, reason: 'order_amount_not_snapshotted' };
  if (order.amountCents !== version.priceCents) return { valid: false, reason: 'order_amount_price_version_mismatch' };

  if (String(order.currency ?? '').toUpperCase() !== version.currency.toUpperCase()) {
    return { valid: false, reason: 'order_currency_price_version_mismatch' };
  }

  return { valid: true, version };
}
