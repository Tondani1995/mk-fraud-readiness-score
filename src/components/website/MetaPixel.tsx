"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

import { MARKETING_CONSENT_EVENT, hasMarketingConsent } from "@/lib/website/meta/consent";
import { isMetaTrackablePath, META_LANDING_PATH, normalisePath } from "@/lib/website/meta/routes";
import { META_EVENT_VIEW_CONTENT, VIEW_CONTENT_PARAMS } from "@/lib/website/meta/events";
import { META_PIXEL_ID, trackMetaEvent } from "@/lib/website/meta/pixel";
import { createOpaqueEventId } from "@/lib/website/meta/event-id";

/** Removes the Meta attribution cookies when marketing consent is withdrawn. */
function clearMetaCookies() {
    if (typeof document === "undefined") return;
    for (const name of ["_fbp", "_fbc"]) {
        try {
            document.cookie = `${name}=; Max-Age=0; path=/`;
            const host = window.location.hostname.replace(/^www\./, "");
            document.cookie = `${name}=; Max-Age=0; path=/; domain=.${host}`;
        } catch {
            // Cookie clearing is best effort; no event fires without consent regardless.
        }
    }
}

/**
 * Consent-gated, route-gated Meta Pixel.
 *
 * The Pixel script is not merely idle without marketing consent -- it is never inserted, so
 * no `_fbp` is created and no request reaches Meta. It is also confined to the allowlisted
 * public marketing pages: no Pixel is loaded on any /score, admin, Snapshot, report or
 * order route, so an identifier-bearing URL is never sent as an event source.
 */
export default function MetaPixel() {
    const pathname = usePathname();
    const [consented, setConsented] = useState(false);
    const [pixelReady, setPixelReady] = useState(false);
    const lastTrackedPath = useRef<string | null>(null);

    useEffect(() => {
        if (!META_PIXEL_ID) return;

        const syncConsent = () => {
            const granted = hasMarketingConsent();
            setConsented((previous) => {
                if (previous && !granted) {
                    // Withdrawal: stop firing and drop the attribution cookies we relied on.
                    clearMetaCookies();
                    lastTrackedPath.current = null;
                }
                return granted;
            });
        };

        syncConsent();
        window.addEventListener("storage", syncConsent);
        window.addEventListener(MARKETING_CONSENT_EVENT, syncConsent);
        return () => {
            window.removeEventListener("storage", syncConsent);
            window.removeEventListener(MARKETING_CONSENT_EVENT, syncConsent);
        };
    }, []);

    const trackable = isMetaTrackablePath(pathname ?? "");
    const active = Boolean(META_PIXEL_ID) && consented && trackable;

    // PageView per allowlisted route, plus ViewContent each time the acquisition landing
    // page is reached. The guard is per-path, not per-session, so returning to the landing
    // page counts again while a re-render of the same path does not double-fire.
    useEffect(() => {
        if (!active || !pixelReady) return;

        const path = normalisePath(pathname ?? "");
        if (lastTrackedPath.current === path) return;
        lastTrackedPath.current = path;

        trackMetaEvent("PageView", {}, createOpaqueEventId());

        if (path === META_LANDING_PATH) {
            trackMetaEvent(META_EVENT_VIEW_CONTENT, VIEW_CONTENT_PARAMS, createOpaqueEventId());
        }
    }, [active, pixelReady, pathname]);

    if (!active) return null;

    return (
        <Script id="meta-pixel" strategy="afterInteractive" onReady={() => setPixelReady(true)}>
            {`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
              t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window,document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              // Automatic Advanced Matching and automatic event detection are disabled in code
              // as well as in Events Manager: Meta must never be sent a name, email or phone
              // scraped from a form on this site.
              fbq('set', 'autoConfig', false, ${JSON.stringify(META_PIXEL_ID)});
              // init receives no user-data object, so no advanced matching parameters exist.
              fbq('init', ${JSON.stringify(META_PIXEL_ID)});
            `}
        </Script>
    );
}
