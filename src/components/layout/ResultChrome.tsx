'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Chrome for a completed assessment result and its order journey.
 *
 * The marketing header is wrong here: it offers five ways off the page and makes
 * "Assess Your Organisation" the most prominent control on screen, inviting a customer who
 * has just finished an assessment to start another one. This replaces it with MK identity,
 * the result context, a save-link control and a route to a human.
 *
 * Clutter ceiling: at most two persistent chrome elements at once -- header plus section rail
 * on desktop, header plus the contextual bottom bar on mobile.
 */

export type ResultChromeProps = {
  assessmentReference: string;
  /** Absolute private result URL. Absent on the order route, where there is nothing to save. */
  resultUrl?: string | null;
  /** Order route shows "Step n of 3" in place of the save/contact controls. */
  orderStep?: { current: number; total: number } | null;
  children: React.ReactNode;
};

function shortReference(reference: string) {
  if (reference.length <= 14) return reference;
  return `${reference.slice(0, 6)}…${reference.slice(-4)}`;
}

export function ResultChrome({ assessmentReference, resultUrl, orderStep, children }: ResultChromeProps) {
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function copyResultLink() {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  // Focus is trapped while the mobile sheet is open and returned to the trigger on close.
  useEffect(() => {
    if (!sheetOpen) return;
    const node = sheetRef.current;
    node?.querySelector<HTMLElement>('a,button')?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSheetOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-mk-paper">
      <a href="#main-content" className="sr-only z-50 rounded-xl bg-white px-4 py-3 font-semibold text-mk-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-mk-accent focus:ring-offset-2">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-mk-line bg-mk-paper pt-[env(safe-area-inset-top)] md:static">
        <div className="mx-auto flex h-[50px] max-w-[1120px] items-center justify-between gap-3 px-[18px] md:h-[54px] md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="whitespace-nowrap font-semibold tracking-tight text-mk-navy" aria-label="MK Fraud Insights home">
              MK FRAUD INSIGHTS
            </Link>
            <span aria-hidden="true" className="hidden h-4 w-px bg-mk-line md:block" />
            <p className="hidden truncate text-[10.5px] uppercase tracking-[0.14em] text-mk-muted md:block">
              Fraud Readiness Snapshot · {assessmentReference}
            </p>
            <p className="truncate text-[10.5px] tracking-[0.08em] text-mk-muted md:hidden">
              {shortReference(assessmentReference)}
            </p>
          </div>

          {orderStep ? (
            <p className="whitespace-nowrap text-[11.5px] font-semibold text-mk-muted">
              Step {orderStep.current} of {orderStep.total}
            </p>
          ) : (
            <>
              <div className="hidden items-center gap-2 md:flex">
                {resultUrl ? (
                  <button
                    type="button"
                    onClick={() => void copyResultLink()}
                    className="min-h-11 whitespace-nowrap rounded-xl border-2 border-mk-accent/25 px-3.5 py-2 text-[11.5px] font-semibold text-mk-navy transition hover:border-mk-accent/50 focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
                  >
                    {copied ? 'Copied' : 'Save result link'}
                  </button>
                ) : null}
                <Link
                  href="/contact"
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border-2 border-mk-accent/25 px-3.5 py-2 text-[11.5px] font-semibold text-mk-navy transition hover:border-mk-accent/50 focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
                >
                  Contact MK
                </Link>
              </div>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setSheetOpen((open) => !open)}
                aria-expanded={sheetOpen}
                aria-haspopup="menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-mk-accent/25 text-mk-navy focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 md:hidden"
              >
                <span className="sr-only">Result options</span>
                <span aria-hidden="true" className="text-lg leading-none">⋯</span>
              </button>
            </>
          )}
        </div>

        {sheetOpen && !orderStep ? (
          <div ref={sheetRef} role="menu" aria-label="Result options" className="border-t border-mk-line bg-mk-surface px-[18px] py-3 md:hidden">
            <p className="pb-2 text-[10px] uppercase tracking-[0.16em] text-mk-muted">{assessmentReference}</p>
            <div className="flex flex-col gap-1">
              {resultUrl ? (
                <button type="button" role="menuitem" onClick={() => void copyResultLink()} className="min-h-11 rounded-lg px-2 text-left text-sm font-semibold text-mk-navy focus:outline-none focus:ring-2 focus:ring-mk-accent">
                  {copied ? 'Result link copied' : 'Save result link'}
                </button>
              ) : null}
              <Link role="menuitem" href="/contact" className="min-h-11 rounded-lg px-2 py-2.5 text-sm font-semibold text-mk-navy focus:outline-none focus:ring-2 focus:ring-mk-accent">Contact MK</Link>
              <a role="menuitem" href="#methodology" onClick={() => setSheetOpen(false)} className="min-h-11 rounded-lg px-2 py-2.5 text-sm font-semibold text-mk-navy focus:outline-none focus:ring-2 focus:ring-mk-accent">Methodology and privacy</a>
              <Link role="menuitem" href="/privacy" className="min-h-11 rounded-lg px-2 py-2.5 text-sm font-semibold text-mk-navy focus:outline-none focus:ring-2 focus:ring-mk-accent">Privacy</Link>
            </div>
          </div>
        ) : null}
      </header>

      <p aria-live="polite" className="sr-only">{copied ? 'Result link copied' : ''}</p>

      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}

/** Two-line result footer. Replaces the corporate footer on result and order routes. */
export function ResultFooter({ assessmentReference, methodologyLabel }: { assessmentReference: string; methodologyLabel?: string | null }) {
  return (
    <footer className="border-t border-mk-line bg-mk-surface">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-[18px] py-7 text-[11px] leading-6 text-mk-muted md:flex-row md:items-center md:justify-between md:px-6">
        <p>
          MK Fraud Insights{methodologyLabel ? ` · ${methodologyLabel}` : ''} · {assessmentReference}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/privacy" className="underline-offset-2 hover:underline">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="underline-offset-2 hover:underline">Terms</Link>
          <span aria-hidden="true">·</span>
          <a href="mailto:hello@mkfraud.co.za" className="underline-offset-2 hover:underline">hello@mkfraud.co.za</a>
        </p>
      </div>
    </footer>
  );
}
