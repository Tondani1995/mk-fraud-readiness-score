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
