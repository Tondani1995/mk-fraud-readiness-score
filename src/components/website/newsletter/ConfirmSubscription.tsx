"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/website/gtag";

type View = "loading" | "ready" | "missing" | "sending" | "confirmed" | "expired" | "used" | "error";

/**
 * Reads the one-time token, removes it from the address bar immediately (so it never lingers in
 * history, referrers or analytics), and only confirms when the person presses the button. A mail
 * scanner that pre-fetches the link therefore cannot subscribe anyone.
 */
export default function ConfirmSubscription() {
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("token");
    if (value) {
      window.history.replaceState(null, "", window.location.pathname);
      setToken(value);
      setView("ready");
    } else {
      setView("missing");
    }
  }, []);

  async function confirm() {
    if (!token) return;
    setView("sending");
    try {
      const response = await fetch("/api/newsletter/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; outcome?: string };
      if (result.ok) {
        trackEvent("newsletter_signup_confirmed", { placement: "confirmation_page" });
        setView("confirmed");
      } else if (result.outcome === "expired" || result.outcome === "superseded") {
        setView("expired");
      } else if (result.outcome === "already_used") {
        setView("used");
      } else {
        setView("error");
      }
    } catch {
      setView("error");
    }
  }

  const text = "mt-4 max-w-2xl text-base leading-7 text-slate-600";
  if (view === "loading") return <p className={text}>Loading…</p>;
  if (view === "missing") return <p className={text}>This confirmation link is incomplete. Please use the link in your email, or <Link className="underline" href="/mk-fraud-signals">subscribe again</Link>.</p>;
  if (view === "confirmed") return <p role="status" className={text}>Thank you. Your subscription is confirmed. New subscriptions are reviewed before the first issue is sent, and every issue includes a one-click unsubscribe link.</p>;
  if (view === "expired") return <p className={text}>This link has expired or a newer one was sent. Please <Link className="underline" href="/mk-fraud-signals">subscribe again</Link> to receive a fresh link.</p>;
  if (view === "used") return <p className={text}>This link has already been used. If you subscribed, there is nothing more to do.</p>;
  if (view === "error") return <p role="alert" className={text}>We could not confirm your subscription just now. Please try the link again later.</p>;

  return (
    <div className="mt-4">
      <p className="max-w-2xl text-base leading-7 text-slate-600">Press the button to confirm that you want to receive MK Fraud Signals, the weekly email from MK Fraud Insights.</p>
      <button
        type="button"
        onClick={confirm}
        disabled={view === "sending"}
        className="mt-6 inline-flex min-h-12 items-center rounded-brand bg-mk-navy px-6 text-[15px] font-semibold text-white transition-colors hover:bg-mk-accent disabled:opacity-60"
      >
        {view === "sending" ? "Confirming…" : "Confirm subscription"}
      </button>
    </div>
  );
}
