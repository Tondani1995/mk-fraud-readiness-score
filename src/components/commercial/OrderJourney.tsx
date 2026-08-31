'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { InvoiceDetails } from '@/lib/commercial/invoice-details';
import type { SelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import { getPostPurchaseCopy } from '@/lib/commercial/post-purchase-copy';

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
 */

const SCORE_BASE_PATH = '/score';

type OrderConfirmation = {
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

export function OrderJourney({
  tier,
  productLabel,
  amountDisplay,
  assessmentReference,
  organisationName,
  respondentName,
  respondentEmail,
  snapshotToken,
  snapshotPath
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
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [invoiceRequested, setInvoiceRequested] = useState<boolean | null>(null);
  const [details, setDetails] = useState<InvoiceDetails>({
    ...EMPTY_INVOICE_DETAILS,
    legalName: organisationName ?? '',
    addressee: respondentName ?? '',
    billingEmail: respondentEmail ?? ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderConfirmation | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

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

  async function submitOrder() {
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
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyAllPaymentDetails() {
    const eft = order?.eftInstructions;
    if (!order) return;
    const lines = [
      `Order reference: ${order.orderReference}`,
      `Amount: ${order.amountDisplay}`,
      `Payment reference: ${order.paymentReference}`,
      ...(eft?.active
        ? [`Bank: ${eft.bankName}`, `Account holder: ${eft.accountHolder}`, `Account number: ${eft.accountNumber}`, `Branch code: ${eft.branchCode}`, ...(eft.accountType ? [`Account type: ${eft.accountType}`] : []), `Currency: ${eft.currency}`]
        : [])
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1800);
    } catch {
      setCopiedAll(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] px-[18px] pb-28 pt-8 md:px-6 md:pb-16 md:pt-12">
      <StepIndicator step={step} />

      <div className="mt-7 grid gap-8 md:grid-cols-12">
        <div className="md:col-span-8">
          {step === 1 ? (
            <StepConfirm
              productLabel={getPostPurchaseCopy(tier).productLabel}
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
              tier={tier}
              invoiceRequested={invoiceRequested}
              details={details}
              submitting={submitting}
              error={error}
              onInvoiceRequested={(value) => { setInvoiceRequested(value); setError(''); }}
              onDetail={(field, value) => setDetails((current) => ({ ...current, [field]: value }))}
              onBack={() => setStep(1)}
              onSubmit={() => void submitOrder()}
            />
          ) : null}

          {step === 3 && order ? (
            <StepPayment order={order} copiedAll={copiedAll} onCopyAll={() => void copyAllPaymentDetails()} snapshotToken={snapshotToken} />
          ) : null}
        </div>

        <aside className="md:col-span-4">
          <div className="hidden border border-mk-line p-5 md:sticky md:top-6 md:block">
            <h2 className="text-[19px] font-semibold text-mk-navy">{getPostPurchaseCopy(tier).productLabel}</h2>
            <p className="mt-1 text-lg font-semibold tabular-nums text-mk-navy">{amountDisplay}</p>
            <dl className="mt-4 flex flex-col gap-2.5 border-t border-mk-line pt-4">
              <SummaryRow label="Organisation" value={organisationName} />
              <SummaryRow label="Reference" value={assessmentReference} />
              <SummaryRow label="Deliverable" value={tier === 'comprehensive' ? 'Full package and supporting material' : 'Essential report'} />
              <SummaryRow label="Next step" value="After MK confirms payment" />
            </dl>
          </div>
        </aside>
      </div>

      {/* Mobile keeps the amount permanently visible next to the action, which measurably
          lifts completion in a manual-EFT flow. */}
      {step !== 3 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center justify-between gap-3 border-t border-mk-line bg-mk-paper px-[18px] pb-[env(safe-area-inset-bottom)] pt-3 md:hidden">
          <p className="text-sm font-semibold tabular-nums text-mk-navy">{amountDisplay}</p>
          <button
            type="button"
            onClick={() => (step === 1 ? setStep(2) : void submitOrder())}
            disabled={submitting}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 disabled:opacity-60"
          >
            {step === 1 ? 'Continue to billing' : submitting ? 'Recording…' : 'Confirm order'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Confirm', 'Billing', 'Payment'];
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
      {steps.map((label, index) => {
        const position = index + 1;
        const state = position === step ? 'current' : position < step ? 'done' : 'todo';
        return (
          <li key={label} aria-current={state === 'current' ? 'step' : undefined} className={state === 'current' ? 'text-mk-accent' : state === 'done' ? 'text-mk-navy' : 'text-mk-muted'}>
            <span className="tabular-nums">{position}</span> {label}
          </li>
        );
      })}
    </ol>
  );
}

function StepConfirm({
  productLabel, amountDisplay, organisationName, assessmentReference, tier, onContinue, snapshotPath
}: {
  productLabel: string; amountDisplay: string; organisationName: string; assessmentReference: string;
  tier: SelfServicePaidTier; onContinue: () => void; snapshotPath: string;
}) {
  return (
    <section aria-labelledby="confirm-heading">
      <h1 id="confirm-heading" className="text-[26px] font-semibold tracking-tight text-mk-navy md:text-[32px]">{productLabel}</h1>
      <p className="mt-2 text-lg font-semibold tabular-nums text-mk-navy">{amountDisplay}</p>
      <p className="mt-4 max-w-[60ch] text-[15px] leading-7 text-mk-slate">
        {tier === 'comprehensive'
          ? 'Tell me what is wrong, then design the fraud-control environment we should build.'
          : 'Tell me what is wrong and what management should do first.'}
      </p>
      <dl className="mt-7 border border-mk-line">
        <DetailRow label="Organisation" value={organisationName} />
        <DetailRow label="Reference" value={assessmentReference} />
        <DetailRow label="Next step" value="MK confirms payment and prepares the selected product" last />
      </dl>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="hidden min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 md:inline-flex"
        >
          Continue to billing
        </button>
        <Link href={`${snapshotPath}#next-step`} className="text-[13px] font-semibold text-mk-accent underline-offset-2 hover:underline">
          Back to your result
        </Link>
      </div>
    </section>
  );
}

function StepBilling({
  tier, invoiceRequested, details, submitting, error, onInvoiceRequested, onDetail, onBack, onSubmit
}: {
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
  return (
    <section aria-labelledby="billing-heading">
      <h1 id="billing-heading" className="max-w-[24ch] text-[26px] font-semibold tracking-tight text-mk-navy md:text-[32px]">
        Do you need a tax invoice for this order?
      </h1>

      <div role="radiogroup" aria-labelledby="billing-heading" className="mt-6 flex gap-2">
        {[{ label: 'Yes', value: true }, { label: 'No', value: false }].map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={invoiceRequested === option.value}
            onClick={() => onInvoiceRequested(option.value)}
            className={`min-h-12 flex-1 rounded-xl px-5 py-3 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 md:flex-none md:w-[120px] ${
              invoiceRequested === option.value
                ? 'bg-mk-navy text-white'
                : 'border-2 border-mk-accent/25 text-mk-navy hover:border-mk-accent/50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {invoiceRequested === true ? (
        <div className="mt-7">
          <p className="text-sm leading-6 text-mk-muted">If you request an invoice, MK will prepare it from the details below.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field id="legalName" label="Registered company name" value={details.legalName} onChange={onDetail} autoComplete="organization" required />
            <Field id="addressee" label="Invoice addressed to" value={details.addressee} onChange={onDetail} autoComplete="name" required />
            <Field id="billingEmail" label="Billing email" value={details.billingEmail} onChange={onDetail} type="email" autoComplete="email" required />
            <Field id="billingAddress" label="Billing address" value={details.billingAddress} onChange={onDetail} autoComplete="street-address" required />
            <Field id="vatNumber" label="VAT number" value={details.vatNumber} onChange={onDetail} />
            <Field id="registrationNumber" label="Company registration number" value={details.registrationNumber} onChange={onDetail} />
            <Field id="purchaseOrderReference" label="Purchase order reference" value={details.purchaseOrderReference} onChange={onDetail} />
          </div>
        </div>
      ) : null}

      {invoiceRequested === false ? (
        <p className="mt-7 max-w-[60ch] text-[15px] leading-7 text-mk-slate">
          Payment confirmation is handled directly by MK. Customer transactional emails are not sent automatically.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-6 border border-mk-danger/30 bg-mk-danger/[.08] px-4 py-3 text-sm leading-6 text-mk-danger">{error}</p>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="hidden min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 disabled:opacity-60 md:inline-flex"
        >
          {submitting ? 'Recording…' : 'Confirm order'}
        </button>
        <button type="button" onClick={onBack} className="text-[13px] font-semibold text-mk-accent underline-offset-2 hover:underline">
          Back
        </button>
      </div>
      <p className="sr-only">Selected product tier: {tier}</p>
    </section>
  );
}

function StepPayment({ order, copiedAll, onCopyAll, snapshotToken }: { order: OrderConfirmation; copiedAll: boolean; onCopyAll: () => void; snapshotToken: string }) {
  const eft = order.eftInstructions;
  const copy = getPostPurchaseCopy(order.tier ?? 'essential');
  return (
    <section aria-labelledby="payment-heading">
      <h1 id="payment-heading" className="text-[26px] font-semibold tracking-tight text-mk-navy md:text-[32px]">
        Your order is recorded. Payment details are below.
      </h1>
      <p className="mt-4 text-sm leading-6 text-mk-slate">
        {copy.productLabel} · <span className="tabular-nums">{order.amountDisplay}</span> · Invoice requested: {order.invoiceRequested ? 'Yes' : 'No'}
      </p>

      <p className="mt-6 text-[10px] uppercase tracking-[0.16em] text-mk-muted">Order reference</p>
      <p className="mt-1 font-mono text-[22px] font-semibold tracking-tight text-mk-navy">{order.orderReference}</p>
      <p className="mt-3 max-w-[60ch] text-[15px] leading-7 text-mk-slate">
        Use {order.paymentReference} as your payment reference. It is how MK matches your payment to this assessment.
      </p>

      {eft?.active ? (
        <dl className="mt-7 border border-mk-line">
          <DetailRow label="Bank" value={eft.bankName} />
          <DetailRow label="Account holder" value={eft.accountHolder} />
          <DetailRow label="Account number" value={eft.accountNumber} />
          <DetailRow label="Branch code" value={eft.branchCode} />
          {eft.accountType ? <DetailRow label="Account type" value={eft.accountType} /> : null}
          <DetailRow label="Currency" value={eft.currency} />
          <DetailRow label="Payment reference" value={order.paymentReference} last />
        </dl>
      ) : (
        <p className="mt-7 border border-mk-line px-4 py-3 text-sm leading-6 text-mk-muted">
          EFT instructions are issued against your order reference. MK confirms payment manually before any deliverable is released.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCopyAll}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
        >
          {copiedAll ? 'Payment details copied' : 'Copy all payment details'}
        </button>
        {order.assessmentReference ? (
          <Link
            href={`/score/order/${encodeURIComponent(order.assessmentReference)}?token=${encodeURIComponent(snapshotToken)}&orderReference=${encodeURIComponent(order.orderReference)}`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-mk-accent/25 px-5 py-3 text-[13px] font-semibold text-mk-navy transition hover:border-mk-accent/50 focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
          >
            View order status
          </Link>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">{copiedAll ? 'Payment details copied' : ''}</p>

      <ol className="mt-9 grid gap-5 md:grid-cols-2">
        {copy.nextSteps.map((stepText, index) => (
          <li key={stepText} className="border-t border-mk-accent/40 pt-3">
            <span className="text-[10px] font-semibold tabular-nums tracking-[0.16em] text-mk-accent">{String(index + 1).padStart(2, '0')}</span>
            <p className="mt-1.5 text-sm leading-6 text-mk-slate">{stepText}</p>
          </li>
        ))}
      </ol>
      <p className="mt-7 max-w-[62ch] text-sm font-semibold leading-6 text-mk-navy">{copy.paymentSummary}</p>
      <p className="mt-3 max-w-[62ch] text-sm leading-6 text-mk-slate">{copy.deliverableSummary}</p>
      <p className="mt-3 text-sm leading-6 text-mk-muted">
        Questions about this order: <a href="mailto:hello@mkfraud.co.za" className="text-mk-accent underline-offset-2 hover:underline">hello@mkfraud.co.za</a>
      </p>
    </section>
  );
}

function Field({
  id, label, value, onChange, type = 'text', autoComplete, required = false
}: {
  id: keyof InvoiceDetails; label: string; value: string;
  onChange: (field: keyof InvoiceDetails, value: string) => void;
  type?: string; autoComplete?: string; required?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-mk-muted">{label}{required ? '' : ' (optional)'}</span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        inputMode={type === 'email' ? 'email' : undefined}
        onChange={(event) => onChange(id, event.target.value)}
        maxLength={id === 'billingAddress' ? 500 : id === 'billingEmail' ? 320 : id === 'purchaseOrderReference' ? 120 : 200}
        // 16px prevents iOS zoom on focus; 48px is the minimum comfortable target.
        className="mt-1.5 block min-h-12 w-full rounded-xl border border-mk-line bg-mk-paper px-3 py-2.5 text-base text-mk-navy outline-none focus:border-mk-accent focus:ring-2 focus:ring-mk-accent focus:ring-offset-1"
      />
    </label>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-3 px-4 py-3 ${last ? '' : 'border-b border-mk-line'}`}>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-mk-muted">{label}</dt>
      <dd className="text-sm font-semibold text-mk-navy">{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-mk-muted">{label}</dt>
      <dd className="text-[13px] font-semibold text-mk-navy">{value}</dd>
    </div>
  );
}
