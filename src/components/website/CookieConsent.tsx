"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "mk_fraud_cookie_consent";

export default function CookieConsent() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem(CONSENT_KEY);
        setVisible(!stored);
    }, []);

    function accept() {
        window.localStorage.setItem(CONSENT_KEY, "accepted");
        window.dispatchEvent(new Event("mk-fraud-consent-updated"));
        setVisible(false);
    }

    function decline() {
        window.localStorage.setItem(CONSENT_KEY, "declined");
        window.dispatchEvent(new Event("mk-fraud-consent-updated"));
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200 bg-white/95 px-6 py-4 shadow-2xl backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-3xl">
                    <p className="text-sm font-semibold text-[#001030]">Analytics consent</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        We use analytics to understand which MK Fraud Insights pages are useful and improve the website. You can accept or decline non-essential analytics cookies.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={decline}
                        className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                        Decline
                    </button>
                    <button
                        type="button"
                        onClick={accept}
                        className="rounded-xl bg-[#001030] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b1b44]"
                    >
                        Accept analytics
                    </button>
                </div>
            </div>
        </div>
    );
}
