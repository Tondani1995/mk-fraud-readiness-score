'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  FRAUD_READINESS_TERMS_PATH,
  FRAUD_READINESS_TERMS_VERSION,
  PRIVACY_NOTICE_PATH,
  PRIVACY_NOTICE_VERSION,
  REQUIRED_ACKNOWLEDGEMENTS,
  TERMS_SUMMARY_POINTS
} from '@/lib/legal/fraud-readiness-terms';

/**
 * Click-wrap acceptance gate for a NEW assessment.
 *
 * Three properties this component has to hold, in order of importance:
 *
 *  1. It is not the security boundary. Acceptance is enforced by the start API and by a database
 *     trigger; this dialog exists so the customer is actually shown what they are accepting. A
 *     customer who defeats it client-side still cannot create an assessment.
 *  2. Acceptance is affirmative and unbundled. Two separate checkboxes, both required, neither
 *     pre-ticked, and the optional research consent stays on the form below where it can be
 *     declined without consequence.
 *  3. The form underneath is genuinely inert until acceptance; `inert` removes it from the tab
 *     order and from the accessibility tree, so a keyboard or screen-reader user cannot reach a
 *     field that a sighted user cannot reach either.
 *
 * Focus handling, Escape, scroll locking and the focus trap are the dialog element's own: a
 * modal `<dialog>` traps focus natively, which is more reliable than re-implementing it. Escape
 * is cancelled because dismissing this gate would leave the customer on a form they cannot use.
 */
export function FraudReadinessTermsGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gatedRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const validationId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (accepted) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
      // Land on the heading rather than on the scrollable summary. Without this the browser
      // focuses the first focusable descendant, which is the scroll region, and the customer
      // arrives at a focus ring drawn around a block of text they have not interacted with.
      headingRef.current?.focus();
    }
    const cancel = (event: Event) => event.preventDefault();
    dialog.addEventListener('cancel', cancel);
    return () => dialog.removeEventListener('cancel', cancel);
  }, [accepted]);

  /**
   * `inert` is applied imperatively rather than as a JSX prop: this React version does not type it,
   * and the attribute, not a class, is what removes the subtree from the tab order and the
   * accessibility tree.
   */
  useEffect(() => {
    const gated = gatedRef.current;
    if (!gated) return;
    if (accepted) gated.removeAttribute('inert');
    else gated.setAttribute('inert', '');
  }, [accepted]);

  const bothChecked = termsChecked && privacyChecked;

  function acceptAndContinue() {
    if (!bothChecked) {
      setShowValidation(true);
      return;
    }
    setAccepted(true);
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        data-fraud-readiness-terms-gate="true"
        className="w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-mk-line bg-white p-0 text-mk-navy shadow-[0_24px_70px_rgba(0,16,48,0.22)] focus:outline-none backdrop:bg-mk-navy/60 backdrop:backdrop-blur-sm"
      >
        {/* The acknowledgements and the actions stay out of the scroll area: on a phone the summary
            is taller than the viewport, and a click-wrap gate whose accept control is off-screen
            reads as a dead end. Only the summary scrolls. */}
        <div className="flex max-h-[min(88vh,48rem)] flex-col">
          <div ref={headingRef} tabIndex={-1} className="shrink-0 border-b border-mk-line px-6 py-6 focus:outline-none sm:px-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mk-accent">
              Before you begin
            </p>
            <h2 id={headingId} className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Fraud Readiness Terms
            </h2>
            <p id={descriptionId} className="mt-3 text-sm leading-6 text-mk-slate">
              These terms govern the Fraud Readiness Assessment and any report prepared from it.
              This is a summary. Please read the full documents before accepting.
            </p>
          </div>

          {/* Focusable so the summary can be scrolled from the keyboard. The default UA outline is
              replaced with the brand ring, and only for keyboard focus: the dialog focuses this
              region programmatically on open, and a blue ring on arrival reads as an error. */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Summary of the Fraud Readiness Terms"
            className="min-h-0 flex-1 overflow-y-auto px-6 py-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mk-accent/60 sm:px-8"
          >
            <ul className="space-y-3">
              {TERMS_SUMMARY_POINTS.map((point) => (
                <li key={point} className="flex gap-3 text-sm leading-6 text-mk-slate">
                  <span aria-hidden="true" className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-mk-accent" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm leading-6 text-mk-slate">
              Read the full{' '}
              <Link
                href={FRAUD_READINESS_TERMS_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-mk-navy underline decoration-mk-accent underline-offset-4 hover:text-mk-accent focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
              >
                Fraud Readiness Assessment Terms
              </Link>{' '}
              and{' '}
              <Link
                href={PRIVACY_NOTICE_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-mk-navy underline decoration-mk-accent underline-offset-4 hover:text-mk-accent focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
              >
                Privacy Notice
              </Link>
              . Each opens in a new tab so you do not lose this page.
            </p>
          </div>

          <div className="shrink-0 border-t border-mk-line bg-white px-6 py-6 sm:px-8">
            <div className="space-y-3.5">
              <label className="flex items-start gap-3 text-sm leading-6 text-mk-navy">
                <input
                  type="checkbox"
                  name="acceptTerms"
                  checked={termsChecked}
                  onChange={(event) => setTermsChecked(event.target.checked)}
                  aria-describedby={showValidation && !bothChecked ? validationId : undefined}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#1D3658]"
                />
                <span>{REQUIRED_ACKNOWLEDGEMENTS[0].label}</span>
              </label>
              <label className="flex items-start gap-3 text-sm leading-6 text-mk-navy">
                <input
                  type="checkbox"
                  name="acceptPrivacy"
                  checked={privacyChecked}
                  onChange={(event) => setPrivacyChecked(event.target.checked)}
                  aria-describedby={showValidation && !bothChecked ? validationId : undefined}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#1D3658]"
                />
                <span>{REQUIRED_ACKNOWLEDGEMENTS[1].label}</span>
              </label>
            </div>

            {showValidation && !bothChecked ? (
              <p id={validationId} role="alert" className="mt-4 text-sm leading-6 text-mk-danger">
                Please confirm both acknowledgements to continue.
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={acceptAndContinue}
                aria-disabled={!bothChecked}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-mk-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-mk-accent focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-mk-navy sm:w-auto"
              >
                Accept and continue
              </button>
              <Link
                href="/"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-mk-slate transition hover:text-mk-navy focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 sm:w-auto"
              >
                Return to MK Fraud Insights
              </Link>
            </div>

            <p className="mt-4 text-[11px] leading-5 text-mk-muted">
              Terms version {FRAUD_READINESS_TERMS_VERSION} · Privacy Notice version{' '}
              {PRIVACY_NOTICE_VERSION}
            </p>
          </div>
        </div>
      </dialog>

      <div
        ref={gatedRef}
        data-terms-accepted={accepted ? 'true' : 'false'}
        className={accepted ? undefined : 'pointer-events-none select-none opacity-45'}
      >
        {children}
      </div>
    </>
  );
}
