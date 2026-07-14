export type PremiumReportEmailStatus =
  | 'queued'
  | 'sending'
  | 'provider_acceptance_uncertain'
  | 'reconciliation_required'
  | 'sent'
  | 'failed_before_provider'
  | 'delivery_delayed'
  | 'delivered'
  | 'delivery_failed'
  | 'bounced'
  | 'complained';

export const ACCEPTED_EMAIL_STATUSES = new Set<PremiumReportEmailStatus>([
  'sent', 'delivery_delayed', 'delivered', 'bounced', 'complained'
]);

export const UNRESOLVED_PROVIDER_STATUSES: PremiumReportEmailStatus[] = [
  'sending', 'provider_acceptance_uncertain', 'reconciliation_required'
];

export function stateAfterDispatchFailure(input: {
  dispatchStarted: boolean;
  providerMessageId: string | null;
}): PremiumReportEmailStatus {
  if (!input.dispatchStarted) return 'failed_before_provider';
  return input.providerMessageId ? 'provider_acceptance_uncertain' : 'reconciliation_required';
}

export function mayStartProviderSend(status: PremiumReportEmailStatus, forceResend: boolean) {
  if (UNRESOLVED_PROVIDER_STATUSES.includes(status)) return false;
  if (status === 'failed_before_provider' || status === 'queued') return true;
  return forceResend && ACCEPTED_EMAIL_STATUSES.has(status);
}

export function stateAfterExpiredSendLease(status: PremiumReportEmailStatus): PremiumReportEmailStatus {
  return status === 'sending' ? 'reconciliation_required' : status;
}
