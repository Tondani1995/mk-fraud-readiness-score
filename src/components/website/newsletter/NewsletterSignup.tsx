"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { trackEvent } from "@/lib/website/gtag";
import { getCampaignAttribution } from "@/lib/website/acquisition-context";
import { CONSENT_WORDING_DISPLAY } from "@/lib/marketing/consent-wording";
import { NEWSLETTER_ENABLED } from "@/lib/marketing/newsletter-flag";

type Props = {
  source: "footer" | "publication_page" | "insight_article" | "commercial_resource";
  tone?: "dark" | "light";
  heading?: string;
  description?: string;
};

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/**
 * MK Fraud Signals subscribe form. Discreet by design: one field, one unticked consent box, one
 * button. The consent box is never pre-ticked and the form is never embedded inside an
 * assessment, enquiry or purchase flow. Analytics receive the placement only, never the address.
 */
export default function NewsletterSignup({ source, tone = "light", heading, description }: Props) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [botcheck, setBotcheck] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  if (!NEWSLETTER_ENABLED) return null;

  const dark = tone === "dark";
  const labelClass = dark ? "text-white/70" : "text-slate-600";
  const inputClass = dark
    ? "border-white/20 bg-white/5 text-white placeholder:text-white/45 focus:border-white/60"
    : "border-mk-line bg-white text-mk-navy placeholder:text-slate-400 focus:border-mk-accent";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) {
      setState({ kind: "error", message: "Please tick the box to confirm you want to receive MK Fraud Signals." });
      return;
    }
    setState({ kind: "sending" });
    trackEvent("newsletter_signup_submitted", { placement: source });
    try {
      const attribution = getCampaignAttribution();
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          consent: true,
          source,
          sourcePath: typeof window !== "undefined" ? window.location.pathname : null,
          attribution,
          botcheck
        })
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (response.ok && result.ok) {
        setState({ kind: "done", message: result.message ?? "Please check your inbox to confirm your subscription." });
        setEmail("");
        setConsent(false);
        return;
      }
      const message =
        result.error === "invalid_email" ? "Please enter a valid email address."
        : result.error === "rate_limited" ? "Too many attempts. Please try again later."
        : "Subscriptions are temporarily unavailable. Please try again later.";
      setState({ kind: "error", message });
    } catch {
      setState({ kind: "error", message: "Subscriptions are temporarily unavailable. Please try again later." });
    }
  }

  return (
    <div>
      {heading ? <h2 className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${dark ? "text-white/50" : "text-mk-accent"}`}>{heading}</h2> : null}
      {description ? <p className={`mt-3 text-[15px] leading-7 ${labelClass}`}>{description}</p> : null}
      {state.kind === "done" ? (
        <p role="status" className={`mt-4 text-[15px] leading-7 ${dark ? "text-white" : "text-mk-navy"}`}>{state.message}</p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Work email"
              className={`min-h-11 w-full rounded-brand border px-4 text-[15px] outline-none transition-colors ${inputClass}`}
            />
            <button
              type="submit"
              disabled={state.kind === "sending"}
              className={`min-h-11 shrink-0 rounded-brand px-5 text-[15px] font-semibold transition-colors disabled:opacity-60 ${dark ? "bg-white text-mk-navy hover:bg-mk-surface" : "bg-mk-navy text-white hover:bg-mk-accent"}`}
            >
              {state.kind === "sending" ? "Sending…" : "Subscribe"}
            </button>
          </div>
          <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={botcheck} onChange={(event) => setBotcheck(event.target.value)} />
          </div>
          <div className="flex items-start gap-3">
            <input
              id={`${id}-consent`}
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-mk-accent"
            />
            <label htmlFor={`${id}-consent`} className={`text-[13px] leading-6 ${labelClass}`}>
              {CONSENT_WORDING_DISPLAY.before}
              <Link href="/privacy-policy" className={`underline underline-offset-2 ${dark ? "hover:text-white" : "hover:text-mk-navy"}`}>{CONSENT_WORDING_DISPLAY.link}</Link>
              {CONSENT_WORDING_DISPLAY.after}
            </label>
          </div>
          {state.kind === "error" ? <p role="alert" className={`text-[13px] ${dark ? "text-white" : "text-red-700"}`}>{state.message}</p> : null}
        </form>
      )}
    </div>
  );
}
