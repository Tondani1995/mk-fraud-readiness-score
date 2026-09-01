"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

import { GA_CONSENT_EVENT, GA_MEASUREMENT_ID, GA_READY_EVENT, hasAnalyticsConsent, pageview } from "@/lib/website/gtag";

export default function GoogleAnalytics() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
    const [analyticsReady, setAnalyticsReady] = useState(false);
    const initialPageviewSentRef = useRef(false);

    useEffect(() => {
        if (!GA_MEASUREMENT_ID) return;

        const syncConsent = () => {
            const enabled = hasAnalyticsConsent();
            setAnalyticsEnabled(enabled);
            if (!enabled) initialPageviewSentRef.current = false;
            if (typeof window.gtag === "function") {
                window.gtag("consent", "update", {
                    analytics_storage: enabled ? "granted" : "denied",
                });
            }
        };
        const syncReady = () => setAnalyticsReady(typeof window.gtag === "function");
        syncConsent();
        syncReady();

        window.addEventListener("storage", syncConsent);
        window.addEventListener(GA_CONSENT_EVENT, syncConsent);
        window.addEventListener(GA_READY_EVENT, syncReady);

        return () => {
            window.removeEventListener("storage", syncConsent);
            window.removeEventListener(GA_CONSENT_EVENT, syncConsent);
            window.removeEventListener(GA_READY_EVENT, syncReady);
        };
    }, []);

    const search = searchParams.toString();

    useEffect(() => {
        if (!GA_MEASUREMENT_ID || !analyticsEnabled) {
            if (!analyticsEnabled) initialPageviewSentRef.current = false;
            return;
        }
        // Enhanced Measurement owns browser-history pageviews for SPA route changes.
        // This explicit event covers the initial document because send_page_view is false.
        if (!analyticsReady) return;
        if (initialPageviewSentRef.current) return;

        const url = search ? `${pathname}?${search}` : pathname;
        if (pageview(url)) initialPageviewSentRef.current = true;
    }, [analyticsEnabled, analyticsReady, pathname, search]);

    const handleGtagLoad = () => {
        window.dispatchEvent(new Event(GA_READY_EVENT));
    };

    if (!GA_MEASUREMENT_ID || !analyticsEnabled) return null;

    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
                onLoad={handleGtagLoad}
            />
            <Script id="google-analytics" strategy="afterInteractive">
                {`
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  window.gtag = gtag;
                  gtag('consent', 'default', {
                    analytics_storage: 'granted',
                    ad_storage: 'denied',
                    ad_user_data: 'denied',
                    ad_personalization: 'denied'
                  });
                  gtag('js', new Date());
                  gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, { send_page_view: false });
                  window.dispatchEvent(new Event(${JSON.stringify(GA_READY_EVENT)}));
                `}
            </Script>
        </>
    );
}
