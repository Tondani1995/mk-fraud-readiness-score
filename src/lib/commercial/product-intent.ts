/**
 * Product intent — the customer's pre-assessment tier preference.
 *
 * Intent is a UI preference and nothing else. It is deliberately NOT commercial state:
 *
 *   - it creates no order, no entitlement and no price lock;
 *   - it is never read by fulfilment, scoring or reporting;
 *   - it is stored in the browser, not the database, so no commercial-state schema is introduced
 *     and a stale or forged value can only ever change which card is emphasised on the Snapshot.
 *
 * The customer remains free to choose any tier — or none — when the Snapshot selector is reached.
 * `readProductIntent` therefore fails closed to `null` on anything it does not recognise.
 */

import { isSelfServicePaidTier, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';

export type ProductIntent = SelfServicePaidTier;

/**
 * Parse a `?product=` query value. Unknown, absent, manipulated or array-valued input resolves to
 * null rather than throwing, so a tampered URL degrades to the ordinary no-intent journey.
 */
export function parseProductIntent(value: unknown): ProductIntent | null {
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase();
  return isSelfServicePaidTier(normalised) ? normalised : null;
}

const STORAGE_PREFIX = 'mk.product-intent.';

/** Storage key is scoped per assessment so two assessments in one browser cannot cross-select. */
export function productIntentStorageKey(assessmentReference: string) {
  return `${STORAGE_PREFIX}${assessmentReference}`;
}

/** Best-effort persist. Storage being unavailable (private mode, blocked cookies) is not an error. */
export function rememberProductIntent(assessmentReference: string, intent: ProductIntent | null) {
  if (!assessmentReference || !intent) return;
  try {
    window.localStorage.setItem(productIntentStorageKey(assessmentReference), intent);
  } catch {
    /* Intent is an optional convenience; losing it must never block the journey. */
  }
}

/** Best-effort read. Any unreadable or unrecognised value resolves to null. */
export function readProductIntent(assessmentReference: string): ProductIntent | null {
  if (!assessmentReference) return null;
  try {
    return parseProductIntent(window.localStorage.getItem(productIntentStorageKey(assessmentReference)));
  } catch {
    return null;
  }
}
