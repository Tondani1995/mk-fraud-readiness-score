export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
export const GA_READY_EVENT = "mk-ga-ready";
export const GA_CONSENT_EVENT = "mk-fraud-consent-updated";
export const ANALYTICS_CONSENT_STORAGE_KEY = "mk_fraud_cookie_consent";
// One second gives gtag a delivery-acknowledgement window without materially delaying navigation.
export const NAVIGATION_EVENT_TIMEOUT_MS = 1000;

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

export function pageview(url: string): boolean {
    if (!GA_MEASUREMENT_ID || !hasAnalyticsConsent() || typeof window.gtag !== "function") {
        return false;
    }

    const pageLocation = typeof window.location?.href === "string"
        ? new URL(url, window.location.href).toString()
        : url;

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
            ...params,
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
