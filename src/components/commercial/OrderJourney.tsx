'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import type { InvoiceDetails } from '@/lib/commercial/invoice-details';
import { COMMERCIAL_CATALOGUE, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import { getPostPurchaseCopy } from '@/lib/commercial/post-purchase-copy';
import { trackEvent } from '@/lib/website/gtag';
import { MkMark } from '@/components/website/marks/MkMark';

/**
 * Three steps on one focused route: confirm, billing, payment.
 *
 * Billing is prefilled from data the assessment already holds -- organisation name, respondent
 * name and email -- and every prefilled field stays editable, with no "edit" affordance to
 * discover. Nothing is submitted the customer has not seen.
 *
 * The closed invoice schema, orders.invoice_requested, orders.invoice_details and the
 * price-bound order creation path are untouched; this component only changes where and how the
 * same payload is collected.
 *
 * Presentation (25 Nov 2026): the journey uses the MK lane language. Progress is a hairline with
 * three nodes, the order facts live in one summary panel instead of being repeated in each step,
 * and the payment step gives the payment details a single emphasised panel with per-value copy.
 */

const SCORE_BASE_PATH = '/score';

export type OrderConfirmation = {
  tier?: SelfServicePaidTier;
  orderReference: string;
  productName: string;
  amountDisplay: string;
  paymentReference: string;
  invoiceRequested: boolean;
  assessmentReference?: string;
  eftInstructions?: {
    active: true;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    branchCode: string;
    accountType: string | null;
    currency: string;
    paymentReferenceInstruction: string;
    customerInstruction: string;
    contactEmail: string | null;
  };
};

const EMPTY_INVOICE_DETAILS: InvoiceDetails = {
  legalName: '',
  billingAddress: '',
  addressee: '',
  billingEmail: '',
  vatNumber: '',
  registrationNumber: '',
  purchaseOrderReference: ''
};

function invoiceDetailsReady(details: InvoiceDetails) {
  return Boolean(
    details.legalName.trim() &&
      details.billingAddress.trim() &&
      details.addressee.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.billingEmail.trim())
  );
}

const OUTCOME: Record<SelfServicePaidTier, string> = {
  essential: 'Know where you stand.',
  comprehensive: 'Design what needs to change.'
};

const primaryButton =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-brand bg-mk-navy px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-mk-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-mk-navy focus-visible:ring-offset-2 disabled:opacity-60';
const quietLink =
  'inline-flex min-h-11 items-center text-[15px] font-semibold text-mk-navy underline decoration-mk-line decoration-2 underline-offset-[6px] transition-colors hover:decoration-mk-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-mk-navy focus-visible:ring-offset-2';

export function OrderJourney({
  tier,
  productLabel,
  amountDisplay,
  assessmentReference,
  organisationName,
  respondentName,
  respondentEmail,
  snapshotToken,
  snapshotPath,
  initialStep = 1,
  initialInvoiceRequested = null,
  initialInvoiceDetails = null,
  initialOrder = null,
  visualReview = false
}: {
  tier: SelfServicePaidTier;
  productLabel: string;
  amountDisplay: string;
  assessmentReference: string;
  organisationName: string;
  respondentName: string | null;
  respondentEmail: string | null;
  snapshotToken: string;
  snapshotPath: string;
  initialStep?: 1 | 2 | 3;
  initialInvoiceRequested?: boolean | null;
  initialInvoiceDetails?: Partial<InvoiceDetails> | null;
  initialOrder?: OrderConfirmation | null;
  /** Preview-only fixture mode. It never changes the normal customer order path. */
  visualReview?: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [invoiceRequested, setInvoiceRequested] = useState<boolean | null>(initialInvoiceRequested);
  const [details, setDetails] = useState<InvoiceDetails>({
    ...EMPTY_INVOICE_DETAILS,
    legalName: organisationName ?? '',
    addressee: respondentName ?? '',
    billingEmail: respondentEmail ?? '',
    ...initialInvoiceDetails
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderConfirmation | null>(initialOrder);
  const [copied, setCopied] = useState<string | null>(null);
  const invoiceEventSentRef = useRef(false);
  const orderEventSentRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRenderRef = useRef(true);

  // The order exists once step 3 is reached, so a browser back from there needs a warning.
  useEffect(() => {
    if (step !== 3) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step]);

  // A step change is a new page in all but URL: return to the top and move focus to its heading.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  async function submitOrder() {
    if (visualReview) {
      setError('This is a deterministic visual-review fixture. No order is recorded.');
      return;
    }
    if (invoiceRequested === null) {
      setError('Please choose whether you need a tax invoice before continuing.');
      return;
    }
    if (invoiceRequested && !invoiceDetailsReady(details)) {
      setError('Please complete the required billing details before continuing.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${SCORE_BASE_PATH}/api/assessments/${assessmentReference}/paid-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          snapshotToken,
          invoiceRequested,
          invoiceDetails: invoiceRequested ? details : {}
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setError(body.errors?.[0] ?? 'Your order could not be recorded. Please contact MK Fraud Insights.');
        return;
      }
      setOrder(body.order ?? null);
      const catalogueProduct = COMMERCIAL_CATALOGUE[tier];
      if (!orderEventSentRef.current && catalogueProduct.priceCents !== null) {
        orderEventSentRef.current = true;
        trackEvent('order_recorded', {
          tier,
          value: catalogueProduct.priceCents / 100,
          currency: catalogueProduct.currency
        });
      }
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      setCopied(null);
    }
  }

  function copyAllPaymentDetails() {
    const eft = order?.eftInstructions;
    if (!order) return;
    const lines = [
      `Order reference: ${order.orderReference}`,
      `Amount: ${order.amountDisplay}`,
      `Payment reference: ${order.paymentReference}`,
      ...(eft?.active
        ? [
            `Bank: ${eft.bankName}`,
            `Account holder: ${eft.accountHolder}`,
            `Account number: ${eft.accountNumber}`,
            `Branch code: ${eft.branchCode}`,
            ...(eft.accountType ? [`Account type: ${eft.accountType}`] : []),
            `Currency: ${eft.currency}`
          ]
        : [])
    ];
    void copyText('all', lines.join('\n'));
  }

  const copy = getPostPurchaseCopy(tier);
  const summaryNextStep =
    step === 1
      ? 'Review billing requirements'
      : step === 2
        ? 'Confirm order, then make EFT payment'
        : getPostPurchaseCopy(tier).paymentSummary;

  return (
    <div
      data-order-journey="true"
      data-order-step={step}
      className="mx-auto max-w-[1120px] px-[18px] pb-32 pt-8 md:px-6 md:pb-20 md:pt-12"
    >
      <OrderProgress step={step} />

      <div className="mt-8 grid gap-10 md:mt-12 md:grid-cols-12 md:gap-x-12 lg:gap-x-16">
        <div className="min-w-0 md:col-span-7">
          {step === 1 ? (
            <StepConfirm
              headingRef={headingRef}
              productLabel={copy.productLabel}
              amountDisplay={amountDisplay}
              organisationName={organisationName}
              assessmentReference={assessmentReference}
              tier={tier}
              onContinue={() => setStep(2)}
              snapshotPath={snapshotPath}
            />
          ) : null}

          {step === 2 ? (
            <StepBilling
              headingRef={headingRef}
              tier={tier}
              invoiceRequested={invoiceRequested}
              details={details}
              submitting={submitting}
              error={error}
              onInvoiceRequested={(value) => {
                setInvoiceRequested(value);
                setError('');
                if (value && !invoiceEventSentRef.current) {
                  invoiceEventSentRef.current = true;
                  trackEvent('invoice_requested', { tier });
                }
              }}
              onDetail={(field, value) => setDetails((current) => ({ ...current, [field]: value }))}
              onBack={() => setStep(1)}
              onSubmit={() => void submitOrder()}
            />
          ) : null}

          {step === 3 && order ? (
            <StepPayment
              headingRef={headingRef}
              order={order}
              copied={copied}
              onCopy={(key, text) => void copyText(key, text)}
              onCopyAll={copyAllPaymentDetails}
              snapshotToken={snapshotToken}
              visualReview={visualReview}
            />
          ) : null}
        </div>

        <aside className="order-first min-w-0 md:order-none md:col-span-5" aria-label="Order summary">
          <OrderSummary
            tier={tier}
            productLabel={copy.productLabel}
            fallbackLabel={productLabel}
            amountDisplay={amountDisplay}
            organisationName={organisationName}
            assessmentReference={assessmentReference}
            nextStep={summaryNextStep}
          />
        </aside>
      </div>

      {/* Mobile keeps the amount permanently visible next to the action, which measurably
          lifts completion in a manual-EFT flow. */}
      {step !== 3 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-mk-line bg-mk-paper md:hidden">
          <div className="flex min-h-16 items-center justify-between gap-3 px-[18px] pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
            <p className="min-w-0 text-sm leading-tight text-mk-navy">
              <span className="block text-[12px] text-mk-muted">{copy.productLabel}</span>
              <span className="font-semibold tabular-nums">{amountDisplay}</span>
            </p>
            <button
              type="button"
              onClick={() => (step === 1 ? setStep(2) : void submitOrder())}
              disabled={submitting}
              className={`${primaryButton} shrink-0 px-5`}
            >
              {step === 1 ? 'Continue to billing' : submitting ? 'Recording…' : 'Confirm order'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Progress as an MK lane: one hairline, three nodes, the completed part drawn in navy. */
function OrderProgress({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Confirm', 'Billing', 'Payment'];
  return (
    <nav aria-label="Order progress">
      <ol className="relative grid grid-cols-3">
        <span aria-hidden="true" className="absolute left-0 right-0 top-[5px] h-px bg-mk-line" />
        <span
          aria-hidden="true"
          className="absolute left-0 top-[5px] h-px origin-left bg-mk-navy transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ width: '100%', transform: `scaleX(${(step - 1) / 2})` }}
        />
        {steps.map((label, index) => {
          const position = index + 1;
          const state = position === step ? 'current' : position < step ? 'done' : 'todo';
          return (
            <li
              key={label}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`relative pt-6 ${index === 1 ? 'text-center' : index === 2 ? 'text-right' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0 h-[11px] w-[11px] rounded-full transition-colors ${
                  index === 0 ? 'left-0' : index === 1 ? 'left-1/2 -translate-x-1/2' : 'right-0'
                } ${
                  state === 'done'
                    ? 'bg-mk-navy'
                    : state === 'current'
                      ? 'border-2 border-mk-navy bg-mk-sage'
                      : 'border border-mk-line bg-mk-paper'
                }`}
              />
              <span
                className={`text-[13px] ${
                  state === 'todo' ? 'text-mk-muted' : 'text-mk-navy'
                } ${state === 'current' ? 'font-semibold' : 'font-medium'}`}
              >
                {label}
                {state === 'done' ? <span className="sr-only"> (completed)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * One summary for the whole journey. On larger screens it stays beside the step; on a phone it
 * opens as a disclosure above the step so the price and product are never hidden.
 */
function OrderSummary({
  tier,
  productLabel,
  fallbackLabel,
  amountDisplay,
  organisationName,
  assessmentReference,
  nextStep
}: {
  tier: SelfServicePaidTier;
  productLabel: string;
  fallbackLabel: string;
  amountDisplay: string;
  organisationName: string;
  assessmentReference: string;
  nextStep: string;
}) {
  const rows = (
    <dl className="divide-y divide-mk-line border-t border-mk-line">
      <SummaryRow label="Organisation" value={organisationName} />
      <SummaryRow label="Reference" value={assessmentReference} mono />
      <SummaryRow
        label="Deliverable"
        value={tier === 'comprehensive' ? 'Full package and supporting material' : 'Essential report'}
      />
      <SummaryRow label="Payment" value="EFT, confirmed by MK" />
      <SummaryRow label="Next step" value={nextStep} />
    </dl>
  );
  return (
    <>
      <details className="group border-y border-mk-line bg-mk-paper px-4 md:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">Your order</span>
            <span className="block text-[15px] font-semibold leading-snug text-mk-navy">{productLabel || fallbackLabel}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[15px] font-semibold tabular-nums text-mk-navy">
            {amountDisplay}
            <MkMark name="arrowDown" className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <div className="pb-4">{rows}</div>
      </details>

      <div className="hidden md:sticky md:top-24 md:block">
        <div className="border-t-2 border-mk-navy pt-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">Your order</p>
          <h2 className="mt-2 text-[20px] font-semibold leading-snug text-mk-navy">{productLabel || fallbackLabel}</h2>
          <p className="mt-1 text-[15px] text-mk-muted">{OUTCOME[tier]}</p>
          <p className="mt-5 text-[28px] font-medium leading-none tabular-nums text-mk-navy">{amountDisplay}</p>
          <div className="mt-6">{rows}</div>
        </div>
      </div>
    </>
  );
}

function StepConfirm({
  headingRef,
  productLabel,
  amountDisplay,
  organisationName,
  assessmentReference,
  tier,
  onContinue,
  snapshotPath
}: {
  headingRef: RefObject<HTMLHeadingElement>;
  productLabel: string;
  amountDisplay: string;
  organisationName: string;
  assessmentReference: string;
  tier: SelfServicePaidTier;
  onContinue: () => void;
  snapshotPath: string;
}) {
  const copy = getPostPurchaseCopy(tier);
  const process = [
    ['Confirm billing', 'Tell us whether you need a tax invoice. Your details are prefilled from the assessment.'],
    ['Pay by EFT', 'You receive the bank details and a payment reference as soon as the order is recorded.'],
    ['MK confirms payment', copy.paymentSummary]
  ] as const;
  return (
    <section aria-labelledby="confirm-heading">
      <h1
        id="confirm-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-[28px] font-medium leading-tight tracking-normal text-mk-navy outline-none md:text-[36px]"
      >
        {productLabel}
      </h1>
      <p className="mt-3 text-[17px] font-medium text-mk-navy">
        {tier === 'comprehensive' ? 'Design what needs to change.' : 'Know where you stand.'}
      </p>
      <p className="mt-3 max-w-[58ch] text-base leading-7 text-mk-slate">{copy.deliverableSummary}</p>

      <div className="mt-9">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">How your order works</h2>
        <ol className="mt-5">
          {process.map(([title, body], index) => (
            <li key={title} className="relative grid grid-cols-[20px_1fr] gap-x-4 pb-6 last:pb-0">
              {index < process.length - 1 ? (
                <span aria-hidden="true" className="absolute bottom-0 left-[9.5px] top-[14px] w-px bg-mk-line" />
              ) : null}
              <span
                aria-hidden="true"
                className={`relative mt-[5px] h-[11px] w-[11px] justify-self-center rounded-full ${
                  index === 0 ? 'border-2 border-mk-navy bg-mk-sage' : 'border border-mk-navy/40 bg-mk-paper'
                }`}
              />
              <div>
                <h3 className="text-[15px] font-semibold text-mk-navy">{title}</h3>
                <p className="mt-1 max-w-[52ch] text-[15px] leading-6 text-mk-slate">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <dl className="mt-9 divide-y divide-mk-line border-y border-mk-line md:hidden">
        <DetailRow label="Organisation" value={organisationName} />
        <DetailRow label="Reference" value={assessmentReference} />
        <DetailRow label="Amount" value={amountDisplay} />
      </dl>

      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={onContinue} className={`${primaryButton} hidden md:inline-flex`}>
          Continue to billing
          <MkMark name="arrow" />
        </button>
        <Link href={`${snapshotPath}#next-step`} className={quietLink}>
          Back to your result
        </Link>
      </div>
    </section>
  );
}

function StepBilling({
  headingRef,
  tier,
  invoiceRequested,
  details,
  submitting,
  error,
  onInvoiceRequested,
  onDetail,
  onBack,
  onSubmit
}: {
  headingRef: RefObject<HTMLHeadingElement>;
  tier: SelfServicePaidTier;
  invoiceRequested: boolean | null;
  details: InvoiceDetails;
  submitting: boolean;
  error: string;
  onInvoiceRequested: (value: boolean) => void;
  onDetail: (field: keyof InvoiceDetails, value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const options = [
    { label: 'Yes', value: true, hint: 'MK issues a VAT invoice to the billing contact you name below.' },
    { label: 'No', value: false, hint: 'Go straight to the EFT payment details.' }
  ];
  return (
    <section aria-labelledby="billing-heading">
      <h1
        id="billing-heading"
        ref={headingRef}
        tabIndex={-1}
        className="max-w-[24ch] text-[28px] font-medium leading-tight tracking-normal text-mk-navy outline-none md:text-[36px]"
      >
        Do you need a tax invoice for this order?
      </h1>

      <fieldset className="mt-7">
        <legend className="sr-only">Do you need a tax invoice for this order?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const checked = invoiceRequested === option.value;
            return (
              <label
                key={option.label}
                className={`relative flex min-h-[72px] cursor-pointer items-start gap-3 rounded-brand border px-4 py-4 transition-colors focus-within:ring-2 focus-within:ring-mk-navy focus-within:ring-offset-2 ${
                  checked ? 'border-mk-navy bg-mk-surface' : 'border-mk-line hover:border-mk-navy/40'
                }`}
              >
                <input
                  type="radio"
                  name="invoiceRequested"
                  value={option.label}
                  checked={checked}
                  onChange={() => onInvoiceRequested(option.value)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                    checked ? 'border-mk-navy' : 'border-mk-navy/40'
                  }`}
                >
                  {checked ? <span className="h-2 w-2 rounded-full bg-mk-navy" /> : null}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-mk-navy">{option.label}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-mk-slate">{option.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {invoiceRequested === true ? (
        <div className="mt-9">
          <p className="max-w-[58ch] text-[15px] leading-6 text-mk-slate">
            MK will prepare the VAT invoice using the details below and send it to the billing email you provide.
          </p>
          <fieldset className="mt-6">
            <legend className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">Invoice details</legend>
            <div className="mt-4 grid gap-x-5 gap-y-5 sm:grid-cols-2">
              <Field
                id="legalName"
                label="Registered company name"
                value={details.legalName}
                onChange={onDetail}
                autoComplete="organization"
                required
              />
              <Field
                id="addressee"
                label="Invoice addressed to"
                value={details.addressee}
                onChange={onDetail}
                autoComplete="name"
                required
              />
              <Field
                id="billingEmail"
                label="Billing email"
                value={details.billingEmail}
                onChange={onDetail}
                type="email"
                autoComplete="email"
                required
              />
              <Field
                id="billingAddress"
                label="Billing address"
                value={details.billingAddress}
                onChange={onDetail}
                autoComplete="street-address"
                required
              />
            </div>
          </fieldset>
          <fieldset className="mt-8 border-t border-mk-line pt-6">
            <legend className="float-left w-full text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">
              Optional references
            </legend>
            <div className="clear-both grid gap-x-5 gap-y-5 pt-4 sm:grid-cols-2">
              <Field id="vatNumber" label="VAT number" value={details.vatNumber} onChange={onDetail} />
              <Field
                id="registrationNumber"
                label="Company registration number"
                value={details.registrationNumber}
                onChange={onDetail}
              />
              <Field
                id="purchaseOrderReference"
                label="Purchase order reference"
                value={details.purchaseOrderReference}
                onChange={onDetail}
              />
            </div>
          </fieldset>
        </div>
      ) : null}

      {invoiceRequested === false ? (
        <p className="mt-8 max-w-[58ch] border-l-2 border-mk-sage pl-4 text-[15px] leading-7 text-mk-slate">
          No tax invoice is required. Confirm your order to view the EFT payment details and payment reference.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-7 border-l-2 border-mk-danger bg-mk-danger/[.06] px-4 py-3 text-sm leading-6 text-mk-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={onSubmit} disabled={submitting} className={`${primaryButton} hidden md:inline-flex`}>
          {submitting ? 'Recording…' : 'Confirm order'}
        </button>
        <button type="button" onClick={onBack} className={quietLink}>
          <MkMark name="arrowBack" className="mr-2 h-4 w-4" />
          Back
        </button>
      </div>
      <p className="mt-5 max-w-[58ch] text-sm leading-6 text-mk-muted">
        Confirming records your order at the price shown. Payment is made afterwards by EFT; nothing is charged here.
      </p>
      <p className="sr-only">Selected product tier: {tier}</p>
    </section>
  );
}

function StepPayment({
  headingRef,
  order,
  copied,
  onCopy,
  onCopyAll,
  snapshotToken,
  visualReview
}: {
  headingRef: RefObject<HTMLHeadingElement>;
  order: OrderConfirmation;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
  onCopyAll: () => void;
  snapshotToken: string;
  visualReview: boolean;
}) {
  const eft = order.eftInstructions;
  const copy = getPostPurchaseCopy(order.tier ?? 'essential');
  return (
    <section aria-labelledby="payment-heading">
      <h1
        id="payment-heading"
        ref={headingRef}
        tabIndex={-1}
        className="max-w-[22ch] text-[28px] font-medium leading-tight tracking-normal text-mk-navy outline-none md:text-[36px]"
      >
        Your order is recorded. Payment details are below.
      </h1>
      <p className="mt-4 text-[15px] leading-6 text-mk-slate">
        {copy.productLabel} · <span className="tabular-nums">{order.amountDisplay}</span> · Invoice requested:{' '}
        {order.invoiceRequested ? 'Yes' : 'No'}
      </p>

      <div className="mt-8 border border-mk-line border-l-2 border-l-mk-sage bg-mk-paper px-5 py-6 md:px-7 md:py-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">Amount to pay</p>
        <p className="mt-2 text-[26px] font-medium leading-none tabular-nums text-mk-navy md:text-[30px]">{order.amountDisplay}</p>
        <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">Payment reference</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="min-w-0 text-[19px] font-semibold leading-snug tabular-nums text-mk-navy md:text-[22px]">{order.paymentReference}</p>
          <CopyButton
            label="payment reference"
            done={copied === 'reference'}
            onClick={() => onCopy('reference', order.paymentReference)}
          />
        </div>
        <p className="mt-5 max-w-[60ch] text-[15px] leading-6 text-mk-slate">
          Use {order.paymentReference} as your payment reference. It is how MK matches your payment to this assessment.
        </p>

        {eft?.active ? (
          <dl className="mt-6 divide-y divide-mk-line border-y border-mk-line">
            <DetailRow label="Bank" value={eft.bankName} />
            <DetailRow label="Account holder" value={eft.accountHolder} />
            <DetailRow
              label="Account number"
              value={eft.accountNumber}
              action={
                <CopyButton
                  label="account number"
                  done={copied === 'account'}
                  onClick={() => onCopy('account', eft.accountNumber)}
                />
              }
            />
            <DetailRow label="Branch code" value={eft.branchCode} />
            {eft.accountType ? <DetailRow label="Account type" value={eft.accountType} /> : null}
            <DetailRow label="Currency" value={eft.currency} />
            <DetailRow label="Payment reference" value={order.paymentReference} />
          </dl>
        ) : (
          <p className="mt-6 border-t border-mk-line pt-4 text-[15px] leading-6 text-mk-slate">
            EFT instructions are issued against your order reference. MK confirms payment manually before any
            deliverable is released.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" onClick={onCopyAll} className={primaryButton}>
            {copied === 'all' ? 'Payment details copied' : 'Copy all payment details'}
          </button>
          {order.assessmentReference && !visualReview ? (
            <Link
              href={`/score/order/${encodeURIComponent(order.assessmentReference)}?token=${encodeURIComponent(snapshotToken)}&orderReference=${encodeURIComponent(order.orderReference)}`}
              className={quietLink}
            >
              View order status
            </Link>
          ) : null}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied === 'all' ? 'Payment details copied' : copied ? 'Copied' : ''}
      </p>

      <dl className="mt-8">
        <dt className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">Order reference</dt>
        <dd className="mt-1 break-all text-[17px] font-semibold tabular-nums text-mk-navy">{order.orderReference}</dd>
      </dl>

      <div className="mt-10">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-muted">What happens next</h2>
        <ol className="mt-5">
          {copy.nextSteps.map((stepText, index) => (
            <li key={stepText} className="relative grid grid-cols-[20px_1fr] gap-x-4 pb-5 last:pb-0">
              {index < copy.nextSteps.length - 1 ? (
                <span aria-hidden="true" className="absolute bottom-0 left-[9.5px] top-[14px] w-px bg-mk-line" />
              ) : null}
              <span
                aria-hidden="true"
                className={`relative mt-[5px] h-[11px] w-[11px] justify-self-center rounded-full ${
                  index === 0 ? 'border-2 border-mk-navy bg-mk-sage' : 'border border-mk-navy/40 bg-mk-paper'
                }`}
              />
              <p className="max-w-[56ch] text-[15px] leading-6 text-mk-slate">{stepText}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-8 text-sm leading-6 text-mk-muted">
        Questions about this order:{' '}
        <a href="mailto:hello@mkfraud.co.za" className="font-semibold text-mk-navy underline decoration-mk-line underline-offset-4">
          hello@mkfraud.co.za
        </a>
      </p>
    </section>
  );
}

function CopyButton({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? `Copied ${label}` : `Copy ${label}`}
      className="inline-flex min-h-11 items-center px-1 text-[13px] font-semibold text-mk-navy underline decoration-mk-line decoration-2 underline-offset-4 transition-colors hover:decoration-mk-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-mk-navy"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required = false
}: {
  id: keyof InvoiceDetails;
  label: string;
  value: string;
  onChange: (field: keyof InvoiceDetails, value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm font-medium text-mk-navy">
        {label}
        {required ? '' : <span className="font-normal text-mk-muted"> (optional)</span>}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        aria-required={required || undefined}
        autoComplete={autoComplete}
        inputMode={type === 'email' ? 'email' : undefined}
        onChange={(event) => onChange(id, event.target.value)}
        maxLength={
          id === 'billingAddress'
            ? 500
            : id === 'billingEmail'
              ? 320
              : id === 'purchaseOrderReference'
                ? 120
                : 200
        }
        // 16px prevents iOS zoom on focus; 48px is the minimum comfortable target.
        className="mt-2 block min-h-12 w-full rounded-[8px] border border-mk-line bg-mk-paper px-3.5 py-2.5 text-base text-mk-navy outline-none transition-colors hover:border-mk-navy/40 focus:border-mk-navy focus:ring-2 focus:ring-mk-navy/15"
      />
    </label>
  );
}

function DetailRow({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-sm text-mk-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-3 text-[15px] font-semibold tabular-nums text-mk-navy">
        <span className="break-all">{value}</span>
        {action}
      </dd>
    </div>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const long = value.length > 42;
  return (
    <div className={long ? 'py-3' : 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3'}>
      <dt className="text-sm text-mk-muted">{label}</dt>
      <dd
        className={`text-sm font-semibold text-mk-navy ${long ? 'mt-1 leading-6' : 'max-w-full text-right'} ${mono ? 'break-all tabular-nums' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
