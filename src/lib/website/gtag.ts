import { sanitiseAnalyticsUrl } from "./analytics-url";

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
export const GA_READY_EVENT = "mk-ga-ready";
export const GA_CONSENT_EVENT = "mk-fraud-consent-updated";
export const ANALYTICS_CONSENT_STORAGE_KEY = "mk_fraud_cookie_consent";
export const MARKETING_CONSENT_STORAGE_KEY = "mk_fraud_marketing_consent";
// One second gives gtag a delivery-acknowledgement window without materially delaying navigation.
export const NAVIGATION_EVENT_TIMEOUT_MS = 1000;

export type GoogleConsentState = {
    analytics_storage: "granted" | "denied";
    ad_storage: "granted" | "denied";
    ad_user_data: "granted" | "denied";
    ad_personalization: "granted" | "denied";
};

type GtagValue = string | number | boolean | undefined;

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag?: (...args: unknown[]) => void;
    }
}

export function hasAnalyticsConsent(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "accepted";
    } catch {
        return false;
    }
}

export function getStoredConsentState(): GoogleConsentState {
    if (typeof window === "undefined") {
        return {
            analytics_storage: "denied",
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
        };
    }

    let analyticsGranted = false;
    let marketingGranted = false;
    try {
        analyticsGranted = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "accepted";
        marketingGranted = window.localStorage.getItem(MARKETING_CONSENT_STORAGE_KEY) === "accepted";
    } catch {
        // A blocked or unavailable localStorage must fail closed.
    }

    return {
        analytics_storage: analyticsGranted ? "granted" : "denied",
        ad_storage: marketingGranted ? "granted" : "denied",
        ad_user_data: marketingGranted ? "granted" : "denied",
        ad_personalization: marketingGranted ? "granted" : "denied",
    };
}

export function updateGoogleConsent(state: GoogleConsentState = getStoredConsentState()) {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("consent", "update", state);
}

function currentHref(): string | undefined {
    return typeof window !== "undefined" && typeof window.location?.href === "string" ? window.location.href : undefined;
}

// The page context gtag attaches to every hit (page_location / page_referrer) is pinned to the
// sanitised URL by the inline bootstrap in GoogleAnalytics.tsx, on load and on every history
// change. These helpers sanitise what they themselves pass: the explicit page_view location and any
// URL-valued event parameter. See analytics-url.ts.

/** URL-valued event parameters are sanitised too; any other value is passed through unchanged. */
function sanitiseEventParams(params: Record<string, GtagValue>): Record<string, GtagValue> {
    const base = currentHref();
    const result: Record<string, GtagValue> = {};
    for (const [key, value] of Object.entries(params)) {
        if (typeof value !== "string" || !/^(https?:\/\/|\/)/.test(value) || !/[?#]/.test(value)) {
            result[key] = value;
            continue;
        }
        let normalised: string | undefined;
        try {
            normalised = new URL(value, base).toString();
        } catch {
            normalised = undefined;
        }
        const sanitised = sanitiseAnalyticsUrl(value, base);
        result[key] = sanitised === normalised ? value : sanitised;
    }
    return result;
}

export function pageview(url: string): boolean {
    if (!GA_MEASUREMENT_ID || !hasAnalyticsConsent() || typeof window.gtag !== "function") {
        return false;
    }

    const pageLocation = sanitiseAnalyticsUrl(url, currentHref());
    if (!pageLocation) return false;

    window.gtag("event", "page_view", {
        page_title: typeof document !== "undefined" ? document.title : undefined,
        page_location: pageLocation,
    });
    return true;
}

export function trackEvent(action: string, params: Record<string, GtagValue> = {}): boolean {
    if (!GA_MEASUREMENT_ID || !hasAnalyticsConsent() || typeof window.gtag !== "function") {
        return false;
    }

    params = sanitiseEventParams(params);
    window.gtag("event", action, params);
    return true;
}

/**
 * Sends a consented GA event before a navigation, using GA's acknowledgement callback and a
 * short bounded fallback. Analytics must never prevent the customer from continuing.
 */
export function trackEventBeforeNavigation(
    action: string,
    params: Record<string, GtagValue> = {},
    navigate: () => void
): boolean {
    let navigationStarted = false;
    const navigateOnce = () => {
        if (navigationStarted) return;
        navigationStarted = true;
        try {
            navigate();
        } catch {
            // Navigation errors belong to the caller's navigation target; analytics must not
            // turn a successful assessment/start response into an uncaught client error.
        }
    };

    if (!GA_MEASUREMENT_ID || !hasAnalyticsConsent() || typeof window.gtag !== "function") {
        navigateOnce();
        return false;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const acknowledge = () => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
        }
        navigateOnce();
    };

    timeoutId = setTimeout(() => {
        timeoutId = undefined;
        navigateOnce();
    }, NAVIGATION_EVENT_TIMEOUT_MS);

    try {
        window.gtag("event", action, {
            ...sanitiseEventParams(params),
            event_callback: acknowledge,
            event_timeout: NAVIGATION_EVENT_TIMEOUT_MS,
        });
        return true;
    } catch {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        timeoutId = undefined;
        navigateOnce();
        return false;
    }
}
