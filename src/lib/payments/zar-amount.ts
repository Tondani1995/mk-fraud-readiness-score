/**
 * Operator-facing manual payment amounts are entered in ZAR major units, but the payment
 * service and database contract are integer cents. The admin form previously sent a field
 * named amountCents, so an operator reading "ZAR 7,500.00" naturally typed 7500 and the
 * backend recorded 7500 cents, which is ZAR 75.00.
 *
 * Conversion is done once, here, with integer string arithmetic. Floating point is never used,
 * because 7500.55 * 100 is not exactly 750055 in binary floating point and money must not be
 * silently altered by representation error.
 */
export function parseZarAmountToCents(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  if (!value) return null;
  // Digits, optionally one decimal point with one or two decimal places. No sign, no
  // separators, no exponent: an operator-entered money value must be unambiguous.
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = `${match[1]}${(match[2] ?? '').padEnd(2, '0')}`;
  const parsed = Number(cents);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Integer cents rendered as the ZAR major-unit value an operator reads on the order. */
export function formatCentsAsZarInput(amountCents: unknown): string {
  const cents = Number(amountCents);
  if (!Number.isFinite(cents) || cents < 0) return '';
  const whole = Math.trunc(cents / 100);
  const remainder = Math.abs(cents % 100);
  return `${whole}.${String(remainder).padStart(2, '0')}`;
}

/**
 * One admin status submission resolved to the amount the payment service may use.
 *
 * `confirmation` is the only shape carrying an amount, so a manual payment confirmation cannot
 * reach the payment service without one.
 */
export type ManualPaymentAmountResolution =
  | { kind: 'invalid' }
  | { kind: 'confirmation'; amountCents: number }
  | { kind: 'no_confirmation' };

/**
 * A manual payment_received submission must always state the amount actually received. A missing,
 * blank or malformed field fails closed here rather than reaching confirmManualPayment() and
 * being defaulted to the order total.
 *
 * A stale form carrying only the retired `amountCents` field arrives as a missing ZAR amount.
 * That value was denominated in cents and is ambiguous against the ZAR major-unit contract, so it
 * is never reinterpreted -- the submission fails closed and the operator re-enters the amount.
 *
 * Non-payment status updates are unaffected by the presence requirement.
 */
export function resolveManualPaymentAmount(status: string, rawAmountZar: unknown): ManualPaymentAmountResolution {
  const confirmation = status === 'payment_received';
  const missing = rawAmountZar === null || rawAmountZar === undefined || String(rawAmountZar).trim() === '';
  if (missing) return confirmation ? { kind: 'invalid' } : { kind: 'no_confirmation' };
  const amountCents = parseZarAmountToCents(rawAmountZar);
  if (amountCents === null) return { kind: 'invalid' };
  return confirmation ? { kind: 'confirmation', amountCents } : { kind: 'no_confirmation' };
}
