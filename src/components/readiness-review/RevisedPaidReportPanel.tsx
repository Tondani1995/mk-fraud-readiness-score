'use client';

import { useState } from 'react';

/**
 * B5 (restricted test only): request Essential or Comprehensive from a completed revised assessment. The customer
 * does not answer again. Step 1 submits the stored answers (binding them to an assessment record); step 2 places the
 * order through the existing paid-order route; the existing private order-status page takes over from there.
 */

type Tier = 'essential' | 'comprehensive';
type Bound = { assessmentReference: string; snapshotToken: string; outstanding: number };
type Ordered = { orderReference: string; amountDisplay: string; productName: string; tier: Tier };

export function RevisedPaidReportPanel(props: { token: string; organisationLabel: string; prices: Record<Tier, string>; notice: string }) {
  const [form, setForm] = useState({ organisationLegalName: props.organisationLabel, contactName: '', contactEmail: '', contactRole: '', acceptTerms: false });
  const [bound, setBound] = useState<Bound | null>(null);
  const [orders, setOrders] = useState<Ordered[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitAnswers(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/review/api/s/${encodeURIComponent(props.token)}/commercial`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.message ?? 'The assessment could not be submitted.');
      setBound({ assessmentReference: body.assessmentReference, snapshotToken: body.snapshotToken, outstanding: body.outstanding });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The assessment could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  async function order(tier: Tier) {
    if (!bound) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/score/api/assessments/${encodeURIComponent(bound.assessmentReference)}/paid-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotToken: bound.snapshotToken, tier, invoiceRequested: false })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.errors?.[0] ?? 'The order could not be created.');
      setOrders((current) => [...current.filter((o) => o.tier !== tier), { tier, orderReference: body.order.orderReference, amountDisplay: body.order.amountDisplay, productName: body.order.productName }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The order could not be created.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1 block w-full rounded-md border border-mk-line px-3 py-2 text-sm text-mk-ink';
  return (
    <section className="mt-10 rounded-md border border-mk-line bg-white p-5" data-revised-paid-report aria-labelledby="revised-paid-report">
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-amber-700" data-restricted-notice>{props.notice}</p>
      <h2 id="revised-paid-report" className="mt-2 text-xl font-semibold text-mk-ink">Request a paid report from these answers</h2>
      <p className="mt-2 text-sm leading-6 text-mk-muted">
        Essential ({props.prices.essential}) and Comprehensive ({props.prices.comprehensive}) are written from the answers you have already given. You do not answer again.
        Once submitted, these answers are fixed for the report.
      </p>
      {!bound ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitAnswers}>
          <label className="text-sm font-medium text-mk-ink">Organisation legal name
            <input name="organisationLegalName" className={field} required value={form.organisationLegalName} onChange={(e) => setForm({ ...form, organisationLegalName: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-mk-ink">Contact person
            <input name="contactName" className={field} required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-mk-ink">Email address
            <input name="contactEmail" type="email" className={field} required value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-mk-ink">Role (optional)
            <input name="contactRole" className={field} value={form.contactRole} onChange={(e) => setForm({ ...form, contactRole: e.target.value })} />
          </label>
          <label className="flex gap-2 text-sm text-mk-ink sm:col-span-2">
            <input name="acceptTerms" type="checkbox" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
            <span>I accept the <a className="underline" href="/fraud-readiness-score/terms" target="_blank" rel="noreferrer">assessment terms</a> and the privacy notice.</span>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="rounded-md bg-mk-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" data-submit-answers>
              {busy ? 'Submitting…' : 'Submit these answers'}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 space-y-3 text-sm" data-bound-assessment={bound.assessmentReference}>
          <p className="text-mk-ink">Assessment <strong>{bound.assessmentReference}</strong> submitted.{bound.outstanding ? ` ${bound.outstanding} questions were still outstanding and are reported as outstanding.` : ''}</p>
          <div className="flex flex-wrap gap-3">
            {(['essential', 'comprehensive'] as Tier[]).map((tier) => (
              <button key={tier} type="button" disabled={busy || orders.some((o) => o.tier === tier)} onClick={() => order(tier)}
                className="rounded-md border border-mk-ink px-4 py-2 font-semibold text-mk-ink disabled:opacity-50" data-order-tier={tier}>
                Order {tier === 'essential' ? 'Essential' : 'Comprehensive'} ({props.prices[tier]})
              </button>
            ))}
          </div>
          {orders.map((o) => (
            <p key={o.orderReference} className="text-mk-ink" data-order-reference={o.orderReference}>
              {o.productName}: order <strong>{o.orderReference}</strong>, {o.amountDisplay}, awaiting payment.{' '}
              <a className="underline" href={`/score/order/${encodeURIComponent(bound.assessmentReference)}?token=${encodeURIComponent(bound.snapshotToken)}&orderReference=${encodeURIComponent(o.orderReference)}`}>Open the private order page</a>
            </p>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700" data-panel-error>{error}</p>}
    </section>
  );
}
