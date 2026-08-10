/**
 * MP-031: READ-ONLY disposition report for historic and in-flight R5,000 Essential orders.
 *
 * This script issues SELECT statements only. It contains no INSERT, UPDATE, DELETE or DDL, and it
 * refuses to run if anything in its own source would mutate (asserted at startup). The owner
 * decides what happens to each order - complete, cancel, refund or explicitly honour. Nothing here
 * decides that, and nothing here writes it.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/joint-launch-r5k-disposition-report.mjs --environment production
 *
 *   --json    emit machine-readable JSON instead of the table
 *   --out F   also write the JSON to file F
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPERSEDED_ESSENTIAL_PRICE_CENTS = 500000;

// Self-check: this file must never be able to mutate. Any write verb against the data API or a SQL
// mutation keyword in the source is a hard stop, so the read-only guarantee is enforced, not just
// documented.
const source = fs.readFileSync(new URL(import.meta.url), 'utf8');
const mutationPattern = /\.(insert|update|upsert|delete)\s*\(|\brpc\s*\(|\b(INSERT INTO|UPDATE |DELETE FROM|ALTER |DROP |TRUNCATE)\b/;
const guardedSource = source.replace(/mutationPattern\s*=\s*\/[^\n]*\n/, '');
if (mutationPattern.test(guardedSource)) {
  console.error('REFUSING TO RUN: this report must be read-only but its source contains a mutation.');
  process.exit(2);
}

const args = process.argv.slice(2);
function flag(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? true) : fallback;
}

const environment = String(flag('--environment', process.env.MK_ENVIRONMENT ?? 'unspecified'));
const asJson = args.includes('--json');
const outFile = flag('--out', null);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. No credential is printed by this script.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function selectAll(table, columns, apply = (query) => query) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await apply(db.from(table).select(columns).range(from, from + pageSize - 1));
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

const orders = await selectAll(
  'orders',
  'id,order_reference,status,amount_cents,currency,created_at,verified_at,verified_by,organisation_name,customer_email,'
  + 'assessment_id,product_price_version_id,products:product_id(product_code,name),assessments:assessment_id(assessment_reference,status)',
  (query) => query.eq('amount_cents', SUPERSEDED_ESSENTIAL_PRICE_CENTS).order('created_at', { ascending: true })
);

const orderIds = orders.map((order) => order.id);

const reports = orderIds.length
  ? await selectAll('reports', 'id,order_id,status,released_at,generated_at', (query) => query.in('order_id', orderIds))
  : [];

const deliveries = orderIds.length
  ? await selectAll(
    'manual_report_delivery_attempts',
    'id,order_id,status,created_at',
    (query) => query.in('order_id', orderIds)
  ).catch(() => [])
  : [];

const assessmentIds = [...new Set(orders.map((order) => order.assessment_id).filter(Boolean))];
const sentEmails = assessmentIds.length
  ? await selectAll(
    'email_events',
    'id,assessment_id,status,template_key',
    (query) => query.in('assessment_id', assessmentIds).eq('status', 'sent')
  ).catch(() => [])
  : [];

const sentEmailsByAssessment = new Map();
for (const event of sentEmails) {
  sentEmailsByAssessment.set(event.assessment_id, (sentEmailsByAssessment.get(event.assessment_id) ?? 0) + 1);
}

const reportsByOrder = new Map();
for (const report of reports) {
  if (!reportsByOrder.has(report.order_id)) reportsByOrder.set(report.order_id, []);
  reportsByOrder.get(report.order_id).push(report);
}
const deliveriesByOrder = new Map();
for (const attempt of deliveries) {
  if (!deliveriesByOrder.has(attempt.order_id)) deliveriesByOrder.set(attempt.order_id, []);
  deliveriesByOrder.get(attempt.order_id).push(attempt);
}

const PAID_STATUSES = new Set(['payment_received', 'verified']);
const CLOSED_STATUSES = new Set(['cancelled', 'expired', 'refunded', 'rejected']);
const RELEASED_REPORT_STATUSES = new Set(['released', 'approved']);
const SUCCEEDED_DELIVERY_STATUSES = new Set(['sent', 'delivered', 'succeeded', 'completed']);

/**
 * Delivery is deliberately judged on delivery evidence, not on a report row existing. A report in
 * 'generated' has been produced but not put in a customer's hands; treating that as delivered would
 * understate what MK still owes.
 */
function deliveredToCustomer(orderReports, orderDeliveries, sentEmailCount) {
  if (orderReports.some((report) => RELEASED_REPORT_STATUSES.has(report.status))) return true;
  if (orderDeliveries.some((attempt) => SUCCEEDED_DELIVERY_STATUSES.has(String(attempt.status)))) return true;
  return sentEmailCount > 0;
}

/**
 * "Commercially active" means the order is neither closed nor already fully satisfied: money is
 * either owed, or owed-for against something not yet delivered. It is an observation, not a
 * decision, and it is never written back.
 */
function commerciallyActive(order, delivered) {
  if (CLOSED_STATUSES.has(order.status)) return false;
  if (PAID_STATUSES.has(order.status) && delivered) return false;
  return true;
}

const rows = orders.map((order) => {
  const product = Array.isArray(order.products) ? order.products[0] : order.products;
  const assessment = Array.isArray(order.assessments) ? order.assessments[0] : order.assessments;
  const orderReports = reportsByOrder.get(order.id) ?? [];
  const orderDeliveries = deliveriesByOrder.get(order.id) ?? [];
  const sentEmailCount = sentEmailsByAssessment.get(order.assessment_id) ?? 0;
  const delivered = deliveredToCustomer(orderReports, orderDeliveries, sentEmailCount);

  return {
    orderId: order.id,
    orderReference: order.order_reference,
    environment,
    organisationName: order.organisation_name,
    assessmentReference: assessment?.assessment_reference ?? null,
    assessmentStatus: assessment?.status ?? null,
    productCode: product?.product_code ?? null,
    amountCents: order.amount_cents,
    currency: order.currency,
    createdAt: order.created_at,
    currentStatus: order.status,
    paid: PAID_STATUSES.has(order.status),
    manuallyVerifiedAt: order.verified_at ?? null,
    reportCount: orderReports.length,
    reportStatuses: orderReports.map((report) => report.status),
    reportGenerated: orderReports.some((report) => report.status !== 'superseded'),
    reportDelivered: delivered,
    deliveryAttemptCount: orderDeliveries.length,
    sentEmailEventCount: sentEmailCount,
    // Null on every pre-existing order: this lane deliberately does not backfill historical rows.
    productPriceVersionId: order.product_price_version_id ?? null,
    commerciallyActive: commerciallyActive(order, delivered),
    ownerDisposition: 'PENDING_OWNER_DECISION'
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  environment,
  supersededPriceCents: SUPERSEDED_ESSENTIAL_PRICE_CENTS,
  totalOrders: rows.length,
  paid: rows.filter((row) => row.paid).length,
  unpaid: rows.filter((row) => !row.paid).length,
  reportGenerated: rows.filter((row) => row.reportGenerated).length,
  reportDelivered: rows.filter((row) => row.reportDelivered).length,
  commerciallyActive: rows.filter((row) => row.commerciallyActive).length,
  withPriceVersionBackfill: rows.filter((row) => row.productPriceVersionId).length,
  mutationsPerformed: 0,
  note: 'Read-only. No order was modified. Disposition (complete / cancel / refund / explicitly honour) is the owner\'s decision.'
};

const payload = { summary, orders: rows };

if (outFile) {
  fs.writeFileSync(String(outFile), `${JSON.stringify(payload, null, 2)}\n`);
}

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`R5,000 Essential order disposition - ${environment}`);
  console.log(`generated ${summary.generatedAt}`);
  console.log('');
  for (const row of rows) {
    console.log(
      [
        row.orderReference.padEnd(22),
        String(row.currentStatus).padEnd(18),
        row.paid ? 'paid    ' : 'unpaid  ',
        row.reportGenerated ? 'generated    ' : 'not-generated',
        row.reportDelivered ? 'delivered    ' : 'not-delivered',
        row.commerciallyActive ? 'ACTIVE  ' : 'settled ',
        row.organisationName ?? ''
      ].join(' ')
    );
  }
  console.log('');
  console.log(JSON.stringify(summary, null, 2));
}
