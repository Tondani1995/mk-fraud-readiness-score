"use client";

import { useEffect, useState } from "react";
import { ANALYTICS_CONSENT_STORAGE_KEY, GA_CONSENT_EVENT } from "@/lib/website/gtag";
import { readMarketingConsent, setMarketingConsent } from "@/lib/website/meta/consent";

const CONSENT_KEY = ANALYTICS_CONSENT_STORAGE_KEY;

export default function CookieConsent() {
    const [visible, setVisible] = useState(false);
    const [allowMarketing, setAllowMarketing] = useState(false);

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
        <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200 bg-white/95 px-6 py-4 shadow-2xl backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-3xl">
                    <p className="text-sm font-semibold text-[#001030]">Analytics and advertising cookies</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        We use analytics to understand which MK Fraud Insights pages are useful and improve the website. You can accept or decline non-essential analytics cookies.
                    </p>
                    <label className="mt-3 flex items-start gap-3 text-sm leading-relaxed text-slate-600">
                        <input
                            type="checkbox"
                            name="marketingConsent"
                            checked={allowMarketing}
                            onChange={(event) => setAllowMarketing(event.target.checked)}
                            className="mt-1 h-4 w-4"
                        />
                        <span>
                            Also allow advertising measurement cookies, so we can see which campaigns bring organisations to the Fraud Readiness assessment. We never share your answers, your score or your organisation&rsquo;s details with advertising platforms.
                        </span>
                    </label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => record(false, false)}
                        className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        onClick={() => record(true, allowMarketing)}
                        className="rounded-xl bg-[#001030] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b1b44]"
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
