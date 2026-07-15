export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";

type GtagValue = string | number | boolean | undefined;

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag?: (...args: unknown[]) => void;
    }
}

export function pageview(url: string) {
    if (!GA_MEASUREMENT_ID || typeof window === "undefined" || typeof window.gtag !== "function") {
        return;
    }

    window.gtag("config", GA_MEASUREMENT_ID, {
        page_path: url,
    });
}

export function trackEvent(action: string, params: Record<string, GtagValue> = {}) {
    if (!GA_MEASUREMENT_ID || typeof window === "undefined" || typeof window.gtag !== "function") {
        return;
    }

    window.gtag("event", action, params);
}
