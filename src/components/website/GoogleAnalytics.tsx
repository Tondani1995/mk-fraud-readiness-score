"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

import { GA_MEASUREMENT_ID, pageview } from "@/lib/website/gtag";

const CONSENT_KEY = "mk_fraud_cookie_consent";

function hasAnalyticsConsent() {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(CONSENT_KEY) === "accepted";
}

export default function GoogleAnalytics() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

    useEffect(() => {
        if (!GA_MEASUREMENT_ID) return;

        const syncConsent = () => setAnalyticsEnabled(hasAnalyticsConsent());
        syncConsent();

        window.addEventListener("storage", syncConsent);
        window.addEventListener("mk-fraud-consent-updated", syncConsent);

        return () => {
            window.removeEventListener("storage", syncConsent);
            window.removeEventListener("mk-fraud-consent-updated", syncConsent);
        };
    }, []);

    useEffect(() => {
        if (!GA_MEASUREMENT_ID || !analyticsEnabled) return;

        const search = searchParams.toString();
        const url = search ? `${pathname}?${search}` : pathname;
        pageview(url);
    }, [analyticsEnabled, pathname, searchParams]);

    if (!GA_MEASUREMENT_ID || !analyticsEnabled) return null;

    return (
        <>
            <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                strategy="afterInteractive"
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
                  gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
                `}
            </Script>
        </>
    );
}
