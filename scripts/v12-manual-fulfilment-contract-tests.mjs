import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getPostPurchaseCopy } from '../src/lib/commercial/post-purchase-copy.ts';
import { parseInvoiceRequest } from '../src/lib/commercial/invoice-details.ts';
import {
  buildInternalOrderCreatedMessage,
  buildInternalPaymentReceivedMessage
} from '../src/lib/notifications/message-templates.ts';
import { sendEmail } from '../src/lib/notifications/email-provider.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assertIncludes = (relativePath, needle, label) => assert(read(relativePath).includes(needle), `${label}: expected ${relativePath} to include ${needle}`);
const assertNotIncludes = (relativePath, needle, label) => assert(!read(relativePath).includes(needle), `${label}: expected ${relativePath} not to include ${needle}`);

const essential = getPostPurchaseCopy('essential');
const comprehensive = getPostPurchaseCopy('comprehensive');
assert.equal(essential.productLabel, 'Essential Fraud Readiness');
assert.equal(comprehensive.productLabel, 'Comprehensive Fraud Readiness');
assert.equal(essential.paymentSummary, 'Once your EFT payment is confirmed, MK prepares your Essential Fraud Readiness report.');
assert.equal(comprehensive.paymentSummary, 'Once your EFT payment is confirmed, MK prepares the full Comprehensive Fraud Readiness package.');
assert.equal(comprehensive.deliverableSummary, 'A detailed report with supporting registers, target-state control design and implementation material.');
assert.notDeepEqual(essential.nextSteps, comprehensive.nextSteps, 'Essential and Comprehensive must have distinct post-purchase next steps');
assert.match(essential.nextSteps.join(' '), /EFT|payment reference/i);
assert.match(essential.nextSteps.join(' '), /Essential.*report/i);
assert.match(essential.nextSteps.join(' '), /send.*directly/i);
assert.match(comprehensive.nextSteps.join(' '), /full Comprehensive.*package/i);
assert.match(comprehensive.nextSteps.join(' '), /registers.*implementation material/i);
assert.match(comprehensive.nextSteps.join(' '), /MK prepares the full Comprehensive.*package/i);
assert.match(comprehensive.nextSteps.join(' '), /MK sends the completed package directly/i);
for (const copy of [essential, comprehensive]) {
  const customerCopy = [copy.paymentSummary, copy.deliverableSummary, ...copy.nextSteps].join(' ');
  assert.doesNotMatch(customerCopy, /named reviewer|independent(?:ly)? validat|assurance opinion|automated (?:delivery|email)|customer portal|access link|customer access token|price floor/i);
  assert.doesNotMatch(customerCopy, /—/u, 'Post-purchase customer copy must not contain an em dash');
}

const validInvoice = {
  invoiceRequested: true,
  invoiceDetails: {
    legalName: 'Synthetic Organisation',
    addressee: 'Synthetic Contact',
    billingEmail: 'billing@example.test',
    billingAddress: '1 Test Street',
    vatNumber: 'VAT-123',
    registrationNumber: 'REG-123',
    purchaseOrderReference: 'PO-123'
  }
};
const parsedInvoice = parseInvoiceRequest(validInvoice);
assert.equal(parsedInvoice.ok, true, 'Valid invoice details remain accepted');
assert.equal(parsedInvoice.value.invoiceDetails.billingEmail, 'billing@example.test');
assert.equal(parseInvoiceRequest({
  ...validInvoice,
  invoiceDetails: { ...validInvoice.invoiceDetails, unexpected: 'must be rejected' }
}).ok, false, 'Invoice details remain a closed schema');
const noInvoice = parseInvoiceRequest({ invoiceRequested: false });
assert.equal(noInvoice.ok, true);
assert.equal(noInvoice.value.invoiceDetails.billingEmail, '');

const internalOrder = buildInternalOrderCreatedMessage({
  orderReference: 'MKORD-TEST-001',
  assessmentReference: 'MKFRS-TEST-001',
  organisationName: 'Synthetic Organisation',
  customerName: 'Synthetic Contact',
  customerEmail: 'customer@example.test',
  customerPhone: '+27 10 000 0000',
  productName: 'Essential Fraud Readiness',
  amountCents: 750000,
  currency: 'ZAR',
  paymentReference: 'MKORD-TEST-001',
  invoiceRequested: true,
  invoiceDetails: validInvoice.invoiceDetails,
  adminUrl: 'https://mkfraud.co.za/score/admin/orders/MKORD-TEST-001'
});
assert.match(internalOrder.subject, /MK action/);
assert.match(internalOrder.text, /MKFRS-TEST-001/);
assert.match(internalOrder.text, /Invoice requested: Yes/);
assert.match(internalOrder.text, /billing@example\.test/);
assert.match(internalOrder.text, /manual EFT payment/);
assert.doesNotMatch(internalOrder.text, /confirm by email|secure link|report is ready/i);
assert.doesNotMatch(internalOrder.text, /—/u);

const internalPayment = buildInternalPaymentReceivedMessage({
  orderReference: 'MKORD-TEST-001',
  amountCents: 750000,
  currency: 'ZAR',
  paymentSource: 'manual_admin',
  verifiedAtIso: '2026-08-31T10:00:00.000Z',
  adminUrl: 'https://mkfraud.co.za/score/admin/orders/MKORD-TEST-001'
});
assert.match(internalPayment.text, /payment was recorded/i);
assert.doesNotMatch(internalPayment.text, /we will email you|secure link/i);

const previousProviderMode = process.env.MK_EMAIL_PROVIDER_MODE;
process.env.MK_EMAIL_PROVIDER_MODE = 'disabled';
const transportInput = {
  from: 'MK Fraud Insights <hello@mkfraud.co.za>',
  to: 'customer@example.test',
  replyTo: null,
  subject: 'Synthetic test',
  text: 'Synthetic test',
  html: '<p>Synthetic test</p>',
  idempotencyKey: 'synthetic-email-event'
};
const customerAttempt = await sendEmail({ ...transportInput, audience: 'customer' });
assert.equal(customerAttempt.ok, false, 'The provider boundary rejects customer transactional audience');
assert.equal(customerAttempt.error, 'Customer transactional email is disabled for V1.2.');
const customerDisabled = await sendEmail({ ...transportInput, audience: 'customer_report_ready' });
assert.deepEqual(customerDisabled, { ok: true, mode: 'disabled', providerMessageId: null }, 'Report-ready delivery remains available through the shared disabled/test/live mode boundary');
const internalDisabled = await sendEmail({ ...transportInput, audience: 'internal' });
assert.deepEqual(internalDisabled, { ok: true, mode: 'disabled', providerMessageId: null }, 'Internal notifications still use the shared provider mode boundary');
if (previousProviderMode === undefined) delete process.env.MK_EMAIL_PROVIDER_MODE;
else process.env.MK_EMAIL_PROVIDER_MODE = previousProviderMode;

const orderService = 'src/lib/commercial/order-service.ts';
const legacyEssentialOrder = 'src/lib/orders/manual-eft-orders.ts';
const paymentService = 'src/lib/payments/payment-service.ts';
const phase1Generation = 'src/lib/reports/phase1-manual-fulfilment.ts';
const statusRoute = 'src/app/score/admin/orders/[orderReference]/status/route.ts';
const internalNotification = 'src/lib/notifications/internal-assessment-notifications.ts';
const internalOrderNotification = 'src/lib/notifications/internal-order-notifications.ts';
const provider = 'src/lib/notifications/email-provider.ts';
const reportDelivery = 'src/lib/reports/email/report-delivery-service-core.ts';
const deliveryWorker = 'src/lib/fulfilment/delivery-worker.ts';
const orderStatus = 'src/lib/commercial/customer-order-status.ts';
const orderJourney = 'src/components/commercial/OrderJourney.tsx';
const comprehensiveWorkspace = 'src/components/comprehensive/CustomerOrderStatusWorkspace.tsx';
const adminSendRoute = 'src/app/score/api/admin/reports/[reportId]/send-email/route.ts';
const fulfilmentActions = 'src/components/admin/FulfilmentActions.tsx';

assertNotIncludes('src/app/score/order/new/page.tsx', 'orderStep={{ current: 1, total: 3 }}', 'Order route does not render stale static progress chrome');
assertIncludes(orderService, 'notifyInternalOrderCreated', 'Catalogue paid orders use the internal order notification boundary');
assertNotIncludes(orderService, 'queueInternalNotification', 'Catalogue paid orders do not bypass the internal order notification boundary');
assertIncludes(legacyEssentialOrder, 'notifyInternalOrderCreated', 'Essential EFT orders use the internal order notification boundary');
assertIncludes(legacyEssentialOrder, 'invoice_details', 'Essential EFT orders preserve invoice details');
assertIncludes(paymentService, 'notifyInternalPaymentReceived', 'Payment confirmation queues an internal notification');
assertNotIncludes(paymentService, 'recordPaymentConfirmedNotification', 'Payment confirmation does not dispatch the customer template directly');
assertNotIncludes(paymentService, 'dispatchImmediateFulfilment', 'Verified payment does not dispatch an automatic fulfilment worker');
assertIncludes(paymentService, "fulfilment_trigger_result: 'NOT_REQUESTED'", 'Verified payment records the shared manual fulfilment boundary');
assertIncludes(paymentService, 'manual fulfilment workflow', 'Payment confirmation directs operators to the shared manual fulfilment workflow');
const phase1Source = read(phase1Generation);
const comprehensiveBranchStart = phase1Source.indexOf('if (isComprehensive) {');
const essentialBranchStart = phase1Source.indexOf('} else {', comprehensiveBranchStart);
assert.ok(comprehensiveBranchStart >= 0 && essentialBranchStart > comprehensiveBranchStart, 'Comprehensive generation branch remains explicit');
assert.doesNotMatch(
  phase1Source.slice(comprehensiveBranchStart, essentialBranchStart),
  /doGetAutomationFlags\(db\)/,
  'Comprehensive generation does not read the retired Phase 14 automation authority'
);
assert.match(
  phase1Source.slice(essentialBranchStart),
  /const flags = await doGetAutomationFlags\(db\)/,
  'Essential generation retains its existing automation-flag behaviour'
);
assertNotIncludes(statusRoute, 'dispatchImmediateFulfilment', 'Payment status changes cannot start report generation');
assertNotIncludes(statusRoute, 'waitUntil', 'Payment status changes do not launch a background fulfilment worker');
assertIncludes(statusRoute, 'confirmManualPayment', 'Manual payment confirmation remains operator-controlled');
assertIncludes(internalNotification, "audience: 'internal'", 'Current notification dispatch labels the provider audience');
assertIncludes(provider, "audience !== 'internal' && audience !== 'customer_report_ready'", 'The low-level email boundary admits only internal and report-ready audiences');
assertIncludes(internalOrderNotification, 'invoice_details: invoiceDetails', 'Internal order notification includes the closed invoice details when requested');
assertNotIncludes(internalOrderNotification, 'buildOrderConfirmationMessage', 'Internal order notification does not use the customer confirmation template');
assertNotIncludes(internalOrderNotification, 'buildPaymentConfirmedMessage', 'Internal payment notification does not use the customer payment template');
assertIncludes(orderJourney, 'Review billing requirements', 'Order summary names the billing review as the confirm-step next action');
assertIncludes(orderJourney, 'Confirm order, then make EFT payment', 'Order summary names EFT payment as the billing-step next action');
assertIncludes(orderJourney, 'getPostPurchaseCopy(tier).paymentSummary', 'Payment-step order summary uses product-specific preparation copy');
assertIncludes(orderJourney, 'MK will prepare the VAT invoice using the details below and send it to the billing email you provide.', 'Invoice helper explains VAT invoice delivery');
assertIncludes(orderJourney, 'No tax invoice is required. Confirm your order to view the EFT payment details and payment reference.', 'No-invoice state uses customer-facing payment guidance');
assertNotIncludes(orderJourney, 'Customer transactional emails are not sent automatically.', 'Order journey does not expose internal email implementation language');
assertNotIncludes(orderJourney, 'supporting management, register and implementation material from the Comprehensive product catalogue', 'Order journey does not expose the retired Comprehensive catalogue phrase');

const reportDeliverySource = read(reportDelivery);
const deliveryFunction = reportDeliverySource.slice(reportDeliverySource.indexOf('export async function deliverPremiumReportEmail'));
assert.match(deliveryFunction, /void input;\s*throw new Error\(`\$\{MANUAL_CUSTOMER_DELIVERY_REASON\}/, 'Automated report email fails closed before claims or provider work');
assertIncludes(deliveryWorker, "'issue_customer_report_access_token'", 'The active delivery worker issues the secure customer token');
assertIncludes(deliveryWorker, "'finalize_delivery'", 'The active delivery worker finalises the exact delivery authorization');
assertIncludes(deliveryWorker, "'fail_delivery'", 'The active delivery worker preserves retry/terminal failure handling');
assertIncludes(orderStatus, 'const engagement: CustomerPaidOrderStatus[\'engagement\'] = null', 'Customer order status does not expose reviewed-engagement or access-token state');
assertNotIncludes(orderStatus, "from('comprehensive_engagements')", 'Customer order status does not depend on a reviewed Comprehensive engagement');
assertIncludes(adminSendRoute, 'MANUAL_CUSTOMER_DELIVERY_REASON', 'Admin customer-send route reports the manual delivery boundary');
assertIncludes(fulfilmentActions, 'Customer delivery is handled directly by MK', 'Admin fulfilment actions explain the shared manual customer-delivery path');
assertIncludes(orderJourney, 'getPostPurchaseCopy', 'Order journey uses product-specific post-purchase copy');
assertNotIncludes(orderJourney, 'Sent to the delivery email held for this order', 'Order journey does not promise automated customer delivery');
assertIncludes(comprehensiveWorkspace, 'getPostPurchaseCopy', 'Comprehensive status uses product-specific post-purchase copy');
assertNotIncludes(comprehensiveWorkspace, 'customerAccessToken', 'Comprehensive status does not render a customer access token');

console.log('V1.2 commercial fulfilment contract tests passed: atomic payment, shared manual preparation/delivery, protected report access, internal notifications, manual invoice handling and Essential isolation are covered.');
