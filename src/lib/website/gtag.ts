export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
export const GA_READY_EVENT = "mk-ga-ready";
export const GA_CONSENT_EVENT = "mk-fraud-consent-updated";
export const ANALYTICS_CONSENT_STORAGE_KEY = "mk_fraud_cookie_consent";

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
