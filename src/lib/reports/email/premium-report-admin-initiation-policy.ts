import { z } from 'zod';

const UUID = z.string().uuid();
const ORDER_REFERENCE = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const REPORT_REFERENCE = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
const EMAIL = z.string().trim().email().max(320);

export const premiumReportAdminInitiationInputSchema = z.object({
  orderId: UUID.optional(),
  orderReference: ORDER_REFERENCE.optional(),
  reportId: UUID.optional(),
  reportReference: REPORT_REFERENCE.optional(),
  recipient: EMAIL.optional()
}).strict().superRefine((value, context) => {
  if (!value.orderId && !value.orderReference) {
    context.addIssue({ code: 'custom', path: ['orderId'], message: 'An order id or order reference is required.' });
  }
  if (!value.reportId && !value.reportReference) {
    context.addIssue({ code: 'custom', path: ['reportId'], message: 'A report id or report reference is required.' });
  }
});

export type PremiumReportAdminInitiationInput = z.infer<typeof premiumReportAdminInitiationInputSchema>;

export class PremiumReportInitiationPolicyError extends Error {
  constructor(
    readonly reason: string,
    message: string,
    readonly status = 409
  ) {
    super(message);
    this.name = 'PremiumReportInitiationPolicyError';
  }
}
export function assertCertificationEnvironment(vercelEnvironment?: string, nodeEnvironment?: string) {
  const vercel = vercelEnvironment?.trim().toLowerCase();
  const node = nodeEnvironment?.trim().toLowerCase();
  if (vercel === 'production' || (!vercel && node === 'production')) {
    throw new PremiumReportInitiationPolicyError(
      'production_forbidden',
      'This certification delivery route is unavailable in Production.',
      403
    );
  }
}

export function assertTestProviderMode(mode: string) {
  if (mode !== 'test') {
    throw new PremiumReportInitiationPolicyError(
      'provider_mode_not_test',
      'Controlled certification delivery requires the test provider mode.',
      409
    );
  }
}

export function assertApprovedRecipient(recipient: string, allowlist: string[] | null) {
  if (!allowlist || !allowlist.includes(recipient.trim().toLowerCase())) {
    throw new PremiumReportInitiationPolicyError(
      'recipient_not_allowlisted',
      'The resolved recipient is not on the controlled certification allowlist.',
      403
    );
  }
}

export function assertExactlyOneValidPaymentTransition(count: number | null | undefined) {
  if (count !== 1) {
    throw new PremiumReportInitiationPolicyError(
      'payment_transition_count_invalid',
      'The order does not have exactly one valid payment transition.',
      409
    );
  }
}
