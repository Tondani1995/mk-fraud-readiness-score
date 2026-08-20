// Release C message builders. Inline TypeScript, matching the existing messageCopy() style in
// src/lib/reports/email/report-delivery-service-core.ts:83-92 -- deliberately not a new
// templating library and not the unused email_templates table (see
// docs/safe-launch/14-release-c-existing-delivery-audit.md Q14, 15-...-design.md "Message
// templates"). Every builder returns { subject, text, html } with no assessment-sensitive
// content anywhere and, for the report-ready message specifically, no storage path and no
// permanent URL.

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function money(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(amountCents / 100);
}

const SUPPORT_EMAIL = process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim() || 'hello@mkfraud.co.za';
const ADMIN_BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://mkfraud.co.za';

export type OrderConfirmationInput = {
  customerName: string | null;
  orderReference: string;
  productName: string;
  amountCents: number;
  currency: string;
  eftAccountSummary: string; // pre-formatted, non-sensitive EFT instructions summary
  paymentReference: string;
};

export function buildOrderConfirmationMessage(input: OrderConfirmationInput) {
  const name = input.customerName?.trim() || 'there';
  const amount = money(input.amountCents, input.currency);
  const subject = `Order confirmed: ${input.orderReference}`;
  const text = `Hi ${name},\n\nThank you for your order with MK Fraud Insights.\n\nOrder reference: ${input.orderReference}\nProduct: ${input.productName}\nAmount: ${amount}\nPayment method: Manual EFT\nPayment reference (please use exactly): ${input.paymentReference}\n\n${input.eftAccountSummary}\n\nOnce we have verified your payment, we will confirm by email and begin fulfilment. Reports are typically prepared within a few business days after verified payment -- we will let you know if that changes for your order.\n\nQuestions? Contact us at ${SUPPORT_EMAIL}.\n\nRegards,\nMK Fraud Insights`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Thank you for your order with MK Fraud Insights.</p><ul><li>Order reference: <strong>${escapeHtml(input.orderReference)}</strong></li><li>Product: ${escapeHtml(input.productName)}</li><li>Amount: ${escapeHtml(amount)}</li><li>Payment method: Manual EFT</li><li>Payment reference (please use exactly): <strong>${escapeHtml(input.paymentReference)}</strong></li></ul><p>${escapeHtml(input.eftAccountSummary)}</p><p>Once we have verified your payment, we will confirm by email and begin fulfilment.</p><p>Questions? Contact us at ${escapeHtml(SUPPORT_EMAIL)}.</p><p>Regards,<br><strong>MK Fraud Insights</strong></p>`;
  return { subject, text, html };
}

export type AdminNewOrderAlertInput = {
  orderReference: string;
  organisationName: string | null;
  customerName: string | null;
  productName: string;
  amountCents: number;
  currency: string;
};

export function buildAdminNewOrderAlertMessage(input: AdminNewOrderAlertInput) {
  const amount = money(input.amountCents, input.currency);
  const adminUrl = `${ADMIN_BASE_URL}/score/admin/orders/${encodeURIComponent(input.orderReference)}`;
  const subject = `New order: ${input.orderReference}`;
  const text = `A new order was created.\n\nOrder reference: ${input.orderReference}\nOrganisation: ${input.organisationName ?? 'Not captured'}\nCustomer: ${input.customerName ?? 'Not captured'}\nProduct: ${input.productName}\nAmount: ${amount}\n\nExpected action: verify manual EFT payment against the reference above.\nTarget response time: within 1 business day.\n\nOpen: ${adminUrl}`;
  const html = `<p>A new order was created.</p><ul><li>Order reference: <strong>${escapeHtml(input.orderReference)}</strong></li><li>Organisation: ${escapeHtml(input.organisationName ?? 'Not captured')}</li><li>Customer: ${escapeHtml(input.customerName ?? 'Not captured')}</li><li>Product: ${escapeHtml(input.productName)}</li><li>Amount: ${escapeHtml(amount)}</li></ul><p>Expected action: verify manual EFT payment against the reference above.<br>Target response time: within 1 business day.</p><p><a href="${escapeHtml(adminUrl)}">Open order in admin</a></p>`;
  return { subject, text, html };
}

export type PaymentConfirmedInput = {
  customerName: string | null;
  orderReference: string;
  amountCents: number;
  currency: string;
  verifiedAtIso: string;
};

export function buildPaymentConfirmedMessage(input: PaymentConfirmedInput) {
  const name = input.customerName?.trim() || 'there';
  const amount = money(input.amountCents, input.currency);
  const verifiedDate = new Date(input.verifiedAtIso).toLocaleDateString('en-ZA');
  const subject = `Payment confirmed: ${input.orderReference}`;
  const text = `Hi ${name},\n\nWe have verified your payment for order ${input.orderReference}.\n\nAmount confirmed: ${amount}\nVerification date: ${verifiedDate}\n\nYour report is now being prepared. We will email you a secure link as soon as it is ready and has passed our quality review. This is not an instant process -- please allow the fulfilment period we quoted at order confirmation.\n\nQuestions? Contact us at ${SUPPORT_EMAIL}.\n\nRegards,\nMK Fraud Insights`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>We have verified your payment for order <strong>${escapeHtml(input.orderReference)}</strong>.</p><ul><li>Amount confirmed: ${escapeHtml(amount)}</li><li>Verification date: ${escapeHtml(verifiedDate)}</li></ul><p>Your report is now being prepared. We will email you a secure link as soon as it is ready and has passed our quality review.</p><p>Questions? Contact us at ${escapeHtml(SUPPORT_EMAIL)}.</p><p>Regards,<br><strong>MK Fraud Insights</strong></p>`;
  return { subject, text, html };
}

export type ReportReadyInput = {
  customerName: string | null;
  orderReference: string;
  accessUrl: string; // the /score/report/access/[token] route, not a storage URL
  expiresAtIso: string;
};

export function buildReportReadyMessage(input: ReportReadyInput) {
  const name = input.customerName?.trim() || 'there';
  const expiresDate = new Date(input.expiresAtIso).toLocaleDateString('en-ZA');
  const subject = `Your report is ready: ${input.orderReference}`;
  // Deliberately no assessment/risk content, no storage path, no permanent URL.
  const text = `Hi ${name},\n\nYour MK Fraud Readiness report for order ${input.orderReference} is ready and has passed our quality review.\n\nAccess your report securely: ${input.accessUrl}\n\nThis link expires on ${expiresDate}. If it expires, contact us at ${SUPPORT_EMAIL} and we will issue a new one -- your report does not need to be regenerated.\n\nRegards,\nMK Fraud Insights`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Your MK Fraud Readiness report for order <strong>${escapeHtml(input.orderReference)}</strong> is ready and has passed our quality review.</p><p><a href="${escapeHtml(input.accessUrl)}">Access your report securely</a></p><p>This link expires on ${escapeHtml(expiresDate)}. If it expires, contact us at ${escapeHtml(SUPPORT_EMAIL)} and we will issue a new one -- your report does not need to be regenerated.</p><p>Regards,<br><strong>MK Fraud Insights</strong></p>`;
  return { subject, text, html };
}

export type InternalExceptionAlertInput = {
  orderReference: string;
  failedStage: string;
  ageDescription: string;
  technicalReference: string;
  requiredAction?: string | null;
  ownerHint?: string | null;
  recoveryPath: string; // MK-domain admin route, never a raw Vercel URL
};

export function buildInternalExceptionAlertMessage(input: InternalExceptionAlertInput) {
  const recoveryUrl = `${ADMIN_BASE_URL}${input.recoveryPath}`;
  const subject = `[Action needed] ${input.failedStage}: ${input.orderReference}`;
  const requiredAction = input.requiredAction ?? 'Review the order and choose an authorised recovery action.';
  const text = `An exception needs attention.\n\nOrder reference: ${input.orderReference}\nFailed stage: ${input.failedStage}\nAge: ${input.ageDescription}\nTechnical reference: ${input.technicalReference}\nRequired administrator action: ${requiredAction}\nAssigned owner: ${input.ownerHint ?? 'Unassigned'}\n\nRecover: ${recoveryUrl}`;
  const html = `<p>An exception needs attention.</p><ul><li>Order reference: <strong>${escapeHtml(input.orderReference)}</strong></li><li>Failed stage: ${escapeHtml(input.failedStage)}</li><li>Age: ${escapeHtml(input.ageDescription)}</li><li>Technical reference: ${escapeHtml(input.technicalReference)}</li><li>Required administrator action: ${escapeHtml(requiredAction)}</li><li>Assigned owner: ${escapeHtml(input.ownerHint ?? 'Unassigned')}</li></ul><p><a href="${escapeHtml(recoveryUrl)}">Recover this order</a></p>`;
  return { subject, text, html };
}
