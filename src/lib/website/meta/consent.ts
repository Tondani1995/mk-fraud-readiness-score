/**
 * Meta advertising consent.
 *
 * This is deliberately a SEPARATE consent from the analytics consent that gates GA4
 * (`mk_fraud_cookie_consent`). The analytics banner wording only ever promised traffic
 * analytics, and the GA4 bootstrap explicitly denies `ad_storage`, `ad_user_data` and
 * `ad_personalization`. Reusing that permission for Meta advertising measurement would
 * claim a consent the visitor was never asked for, so marketing consent has its own key,
 * its own event, and its own opt-in.
 */

export const MARKETING_CONSENT_STORAGE_KEY = "mk_fraud_marketing_consent";
export const MARKETING_CONSENT_EVENT = "mk-fraud-marketing-consent-updated";

export type MarketingConsentState = "accepted" | "declined" | "unset";

/** Reads stored marketing consent. Any storage failure is treated as "no consent". */
export function readMarketingConsent(): MarketingConsentState {
    if (typeof window === "undefined") return "unset";
    try {
        const stored = window.localStorage.getItem(MARKETING_CONSENT_STORAGE_KEY);
        if (stored === "accepted") return "accepted";
        if (stored === "declined") return "declined";
        return "unset";
    } catch {
        return "unset";
    }
}

/** The single gate every Meta code path must pass. Absence of a decision is never consent. */
export function hasMarketingConsent(): boolean {
    return readMarketingConsent() === "accepted";
}

/** Persists the visitor's marketing decision and notifies listeners in the same document. */
export function setMarketingConsent(accepted: boolean): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(MARKETING_CONSENT_STORAGE_KEY, accepted ? "accepted" : "declined");
    } catch {
        // A visitor who blocks storage simply gets no Meta tracking; that is the safe outcome.
    }
    try {
        window.dispatchEvent(new Event(MARKETING_CONSENT_EVENT));
    } catch {
        // Event dispatch is a convenience for live updates, never a correctness requirement.
    }
}
