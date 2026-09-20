"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ANALYTICS_CONSENT_STORAGE_KEY, GA_CONSENT_EVENT } from "@/lib/website/gtag";
import { readMarketingConsent, setMarketingConsent } from "@/lib/website/meta/consent";

const CONSENT_KEY = ANALYTICS_CONSENT_STORAGE_KEY;

export default function CookieConsent() {
    const [visible, setVisible] = useState(false);
    const [allowMarketing, setAllowMarketing] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const bannerRef = useRef<HTMLDivElement>(null);
    const detailsId = useId();

    useEffect(() => {
        if (typeof window === "undefined") return;
        let storedAnalytics: string | null = null;
        try {
            storedAnalytics = window.localStorage.getItem(CONSENT_KEY);
        } catch {
            storedAnalytics = null;
        }
        // Advertising measurement is a permission this site has never asked for, so the banner
        // also returns for visitors who previously answered only the analytics question. Their
        // stored analytics choice is untouched unless they answer again here.
        setVisible(!storedAnalytics || readMarketingConsent() === "unset");
    }, []);

    useEffect(() => {
        if (!visible || !bannerRef.current || typeof ResizeObserver === "undefined") return;
        const banner = bannerRef.current;
        const previous = document.body.style.paddingBottom;
        const observer = new ResizeObserver(() => {
            document.body.style.paddingBottom = `${Math.ceil(banner.getBoundingClientRect().height) + 16}px`;
        });
        observer.observe(banner);
        return () => {
            observer.disconnect();
            document.body.style.paddingBottom = previous;
        };
    }, [visible]);

    function record(analyticsAccepted: boolean, marketingAccepted: boolean) {
        try {
            window.localStorage.setItem(CONSENT_KEY, analyticsAccepted ? "accepted" : "declined");
        } catch {
            // A visitor who blocks storage receives neither analytics nor advertising tracking.
        }
        setMarketingConsent(marketingAccepted);
        try {
            window.dispatchEvent(new Event(GA_CONSENT_EVENT));
        } catch {
            // Listeners also re-read consent on mount, so a failed dispatch is not fatal.
        }
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div
            ref={bannerRef}
            role="region"
            aria-label="Cookie preferences"
            className="fixed inset-x-2 bottom-2 z-[100] rounded-2xl border border-slate-200 bg-white px-4 py-3 xl:py-2.5 shadow-[0_8px_30px_rgba(0,16,48,0.14)] sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-[min(72rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:px-5"
        >
            <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-6">
                <div className="min-w-0 flex-1 xl:flex xl:flex-wrap xl:items-center xl:gap-x-5">
                    <p className="text-[13px] leading-5 text-slate-700">
                        <span className="font-semibold text-[#001030]">Optional cookies.</span>{" "}
                        We use analytics to improve this website.{" "}
                        <button
                            type="button"
                            aria-expanded={showDetails}
                            aria-controls={detailsId}
                            onClick={() => setShowDetails((value) => !value)}
                            className="font-medium text-[#1d3658] underline underline-offset-2"
                        >
                            {showDetails ? "Hide details" : "Details"}
                        </button>
                        <span aria-hidden="true" className="px-1.5 text-slate-300">|</span>
                        <Link href="/privacy-policy" className="font-medium text-[#1d3658] underline underline-offset-2">Privacy policy</Link>
                    </p>
                    <label className="mt-1 flex min-h-8 items-center gap-2 text-[13px] leading-5 text-slate-700 xl:mt-0">
                        <input
                            type="checkbox"
                            name="marketingConsent"
                            checked={allowMarketing}
                            onChange={(event) => setAllowMarketing(event.target.checked)}
                            className="h-4 w-4 shrink-0 accent-[#001030]"
                        />
                        <span>Also allow advertising measurement</span>
                    </label>
                    <p id={detailsId} hidden={!showDetails} className="mt-1 text-xs leading-5 text-slate-600 xl:basis-full">
                        Advertising measurement cookies let us see which campaigns bring organisations to the Fraud Readiness assessment. They stay off unless you tick the box. We never share your answers, your score or your organisation&rsquo;s details with advertising platforms.
                    </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 md:flex">
                    <button
                        type="button"
                        onClick={() => record(false, false)}
                        className="min-h-11 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        onClick={() => record(true, allowMarketing)}
                        className="min-h-11 rounded-xl bg-[#001030] px-5 text-sm font-semibold text-white transition hover:bg-[#1d3658]"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
