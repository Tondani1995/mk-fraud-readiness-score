import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FulfilmentActions } from '@/components/admin/FulfilmentActions';
import { FulfilmentReviewPanel } from '@/components/admin/FulfilmentReviewPanel';
import { DeliveryAccessPanel } from '@/components/admin/DeliveryAccessPanel';
import { ManualDeliveryPanel } from '@/components/admin/ManualDeliveryPanel';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { formatOrderAmount, getAdminOrderDetail } from '@/lib/orders/manual-eft-orders';
import { getPhase1OrderOperations } from '@/lib/reports/phase1-operations';
import { getPhase1SchemaCapability, PHASE1_SCHEMA_ERROR_MESSAGE } from '@/lib/reports/phase1-schema-capability';
import { logCapabilityQueryFailure, type QueryFailureDiagnostic } from '@/lib/reports/capability-diagnostics';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPaymentOrderOperations } from '@/lib/payments/payment-operations';
import { ACCESS_TOKEN_ROLES, DELIVERY_RETRY_ROLES, getOrderDeliveryState } from '@/lib/reports/delivery-recovery-service';
import { PHASE1_QUEUE_LABELS } from '@/lib/reports/phase1-operations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'not requested').replace(/_/g, ' ');
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('en-ZA') : 'Not recorded';
}

// currentDeliveryBucket is 'not_ready' | 'delivery_pending' | 'delivered' | 'delivery_failed'
// (classifyDeliveryBucket() in src/lib/reports/phase1-operations.ts, shared with the admin
// orders list); PHASE1_QUEUE_LABELS covers the latter three (they are also this page's
// admin-list queue keys) but has no 'not_ready' entry, since that bucket only ever appears
// here, never as a list queue.
function deliveryBucketLabel(bucket: string) {
  return bucket === 'not_ready' ? 'Not Yet Queued' : (PHASE1_QUEUE_LABELS as Record<string, string>)[bucket] ?? cleanStatus(bucket);
}

function SnapshotValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-mk-ink">{value || 'Not captured'}</p>
    </div>
  );
}

const ORDER_DETAIL_REQUEST_PATH = '/score/admin/orders/[orderReference]';

async function getReportVersions(db: any, orderId: string, capabilityAvailable: boolean) {
  if (!capabilityAvailable) {
    const base = await db.from('reports')
      .select('id,report_reference,version_number,status,generated_at,storage_bucket,storage_path,checksum')
      .eq('order_id', orderId).order('version_number', { ascending: false });
    if (base.error) {
      const failedQuery = logCapabilityQueryFailure('reports:base', base.error, { requestPath: ORDER_DETAIL_REQUEST_PATH });
      return { reports: [], available: false, failedQuery };
    }
    return { reports: (base.data ?? []).map((report: any) => ({ ...report, storage_status: 'NOT_STORED' })), available: true, failedQuery: null as QueryFailureDiagnostic | null };
  }
  const detailed = await db.from('reports')
    .select('id,report_reference,version_number,status,generated_at,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status,storage_verified_at')
    .eq('order_id', orderId).order('version_number', { ascending: false });
  if (detailed.error) {
    const failedQuery = logCapabilityQueryFailure('reports:detailed', detailed.error, { requestPath: ORDER_DETAIL_REQUEST_PATH });
    return { reports: [], available: false, failedQuery };
  }
  return { reports: detailed.data ?? [], available: true, failedQuery: null as QueryFailureDiagnostic | null };
}

export default async function AdminOrderDetailPage(
  props: {
    params: Promise<{ orderReference: string }>;
    searchParams?: Promise<{ report_error?: string; report_generated?: string; message?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);
  const db = createSupabaseServiceClient() as any;
  const detail = await getAdminOrderDetail(params.orderReference);
  if (!detail) notFound();
  const { order, events, auditEvents } = detail;
  const capability = await getPhase1SchemaCapability(db, { requestPath: ORDER_DETAIL_REQUEST_PATH });
  const capabilityAvailable = capability.status === 'available';
  const [reportResult, operations, payment, realDeliveryState] = await Promise.all([
    getReportVersions(db, order.id, capabilityAvailable),
    getPhase1OrderOperations(order.id, capability, { requestPath: ORDER_DETAIL_REQUEST_PATH }),
    getPaymentOrderOperations(order.id, order.status),
    getOrderDeliveryState(order.id)
  ]);
  const reportVersions = reportResult.reports;
  const operationalAvailable = capabilityAvailable && operations.schemaAvailable && reportResult.available;
  const failedDependencies: QueryFailureDiagnostic[] = [
    ...(capability.failedQuery ? [capability.failedQuery] : []),
    ...((operations as any).failedQueries ?? []),
    ...(reportResult.failedQuery ? [reportResult.failedQuery] : [])
  ];
  const latestReport = reportVersions[0] ?? null;
  // Manual operator delivery is persisted in the existing Phase 1 delivery-attempt
  // table. provider_mode=disabled distinguishes an operator-sent customer email from the
  // historical provider-double test path; DELIVERED is written only by the existing
  // complete_manual_report_delivery RPC.
  const { data: manualDelivery } = latestReport
    ? await db.from('manual_report_delivery_attempts')
        .select('completed_at,recipient_email,requested_by')
        .eq('report_id', latestReport.id)
        .eq('status', 'DELIVERED')
        .eq('provider_mode', 'disabled')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const { data: manualDeliveryActor } = manualDelivery?.requested_by
    ? await db.from('admin_profiles').select('full_name,email').eq('id', manualDelivery.requested_by).maybeSingle()
    : { data: null };
  const storageCandidate = Boolean(latestReport?.storage_bucket && latestReport?.storage_path && latestReport?.checksum);
  const storageReady = Boolean(latestReport?.storage_status === 'VERIFIED' && latestReport.storage_bucket && latestReport.storage_path);
  const generationState = operations.latestGeneration?.status ?? (storageReady ? 'REPORT_READY' : 'NOT_REQUESTED');
  const generationStuck = ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(generationState)
    && Date.now() - new Date(operations.latestGeneration?.updated_at ?? 0).getTime() > 15 * 60 * 1_000;
  // Legacy/manual provider-double delivery action (src/lib/reports/phase1-manual-delivery.ts),
  // sourced from manual_report_delivery_attempts -- drives FulfilmentActions' "Initiate/Retry
  // Delivery" button only. It is NOT the current Release C customer-delivery status; that is
  // realDeliveryState.currentDeliveryStatus below (src/lib/reports/delivery-recovery-service.ts's
  // getOrderDeliveryState), sourced from report_delivery_authorizations (and email_events for a
  // post-send bounce/complaint) via the same shared classifyDeliveryBucket() the admin orders
  // list uses (src/lib/reports/phase1-operations.ts).
  const legacyDeliveryState = operations.latestDelivery?.status ?? 'NOT_READY';
  const currentDeliveryStatus = realDeliveryState.currentDeliveryStatus;
  const currentDeliveryBucket = realDeliveryState.currentDeliveryBucket;
  const canGenerate = ['platform_admin', 'reviewer', 'approver'].includes(admin.role);
  const canRegenerate = ['platform_admin', 'approver'].includes(admin.role);
  const canDeliver = ['platform_admin', 'approver'].includes(admin.role);
  const eft = order.eft_instructions_snapshot ?? {};
  const assessment = order.assessments;
  const dataRequest = order.data_requests;
  const isComprehensive = order.products?.product_code === 'mk_validated_assessment';

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Paid report fulfilment"
          title={order.order_reference}
          description={isComprehensive ? 'Automated Comprehensive report generation and secure delivery control.' : 'Manual, recoverable Essential report generation and delivery control.'}
        />

        {(searchParams?.message || searchParams?.report_error || searchParams?.error) ? (
          <div role="status" className={`rounded-xl border p-4 text-sm ${searchParams?.report_error || searchParams?.error ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
            {searchParams.message ?? cleanStatus(searchParams.report_error ?? searchParams.error)}
          </div>
        ) : null}

        {!operationalAvailable ? (
          <div className="rounded-xl border border-mk-brass/40 bg-mk-cream p-4 text-sm text-mk-ink">
            <p>{capability.status === 'available' ? PHASE1_SCHEMA_ERROR_MESSAGE : capability.message}</p>
            {failedDependencies.length ? (
              <ul className="mt-2 space-y-1 text-xs text-mk-muted">
                {failedDependencies.map((failure, index) => (
                  <li key={`${failure.query}-${index}`}>
                    <span className="font-semibold text-mk-ink">{failure.query}</span>
                    {' — '}{failure.safeMessage}
                    {failure.code ? ` (code ${failure.code})` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Fulfilment status</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <SnapshotValue label="Payment state" value={cleanStatus(payment.record.state ?? order.status)} />
              <SnapshotValue label="Generation state" value={cleanStatus(generationState)} />
              <SnapshotValue label="Latest attempt" value={operations.latestGeneration?.id ?? 'No attempt'} />
              <SnapshotValue label="Report version" value={latestReport ? `Version ${latestReport.version_number}` : 'No report'} />
              <SnapshotValue label="Storage state" value={cleanStatus(latestReport?.storage_status ?? 'NOT_STORED')} />
              <SnapshotValue label="Customer delivery status (Release C)" value={deliveryBucketLabel(currentDeliveryBucket)} />
              <SnapshotValue label="Generation retry count" value={String(operations.latestGeneration?.retry_count ?? 0)} />
            </div>
            {operations.latestGeneration?.safe_operational_error ? (
              <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
                {operations.latestGeneration.safe_operational_error}
              </div>
            ) : null}
            <FulfilmentActions
              orderReference={order.order_reference}
              reportId={latestReport?.id}
              generationState={generationState}
              generationStuck={generationStuck}
              deliveryState={legacyDeliveryState}
              eligible={order.status === 'payment_received'}
              storageReady={storageReady}
              storageCandidate={storageCandidate}
              canGenerate={canGenerate}
              canRegenerate={canRegenerate}
              canDeliver={canDeliver}
              capabilityAvailable={operationalAvailable}
            />
            {canDeliver && storageReady && !isComprehensive ? (
              <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-xs leading-5 text-mk-muted">
                <span className="font-semibold text-mk-ink">Legacy/manual delivery.</span> The button above (and the retry
                state it reacts to, currently <span className="font-semibold">{cleanStatus(legacyDeliveryState)}</span>)
                operates the older provider-double delivery mechanism, not real customer email. It does not reflect and
                cannot change the current Release C customer-delivery status shown above. Use{' '}
                <a href="#real-delivery" className="font-semibold text-mk-brassDark">Real delivery &amp; customer access</a>{' '}
                below for the authoritative status and its controls.
                {operations.latestDelivery?.safe_operational_error ? (
                  <span className="mt-2 block text-mk-danger">{operations.latestDelivery.safe_operational_error}</span>
                ) : null}
              </div>
            ) : null}
            {operations.latestGeneration ? (
              <FulfilmentReviewPanel
                orderReference={order.order_reference}
                attemptId={operations.latestGeneration.id}
                status={operations.latestGeneration.status}
                retryCount={operations.latestGeneration.retry_count ?? 0}
                maxAttempts={(operations.latestGeneration as any).max_attempts ?? 5}
                nextAttemptAt={(operations.latestGeneration as any).next_attempt_at ?? null}
                leaseExpiresAt={(operations.latestGeneration as any).lease_expires_at ?? null}
                canReview={['platform_admin', 'reviewer', 'approver'].includes(admin.role)}
                canRecover={['platform_admin', 'finance_admin'].includes(admin.role)}
              />
            ) : null}
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-mk-brassDark">
              {operations.generationHistory.length ? <a href="#generation-history">View Generation History</a> : null}
              {operations.deliveryHistory.length ? <a href="#delivery-history">View Legacy Manual Delivery History</a> : null}
            </div>
          </CardContent>
        </Card>

        <div id="real-delivery"><Card>
          <CardHeader>
            <CardTitle>Real delivery &amp; customer access</CardTitle>
            <p className="mt-1 text-xs font-normal text-mk-muted">
              Authoritative Release C customer-delivery record — the source of the &ldquo;Customer delivery status&rdquo; shown above
              and of the admin orders list&rsquo;s delivery queues. Sourced from report_delivery_authorizations and, for a
              bounce or spam complaint after a successful send, email_events.
            </p>
          </CardHeader>
          <CardContent>
            <DeliveryAccessPanel
              orderReference={order.order_reference}
              reportId={latestReport?.id ?? null}
              authorizations={realDeliveryState.authorizations}
              accessTokens={realDeliveryState.accessTokens}
              recipientException={realDeliveryState.recipientException}
              canRetryDelivery={DELIVERY_RETRY_ROLES.includes(admin.role)}
              canManageAccessTokens={ACCESS_TOKEN_ROLES.includes(admin.role)}
            />
          </CardContent>
        </Card></div>

        {!isComprehensive ? <ManualDeliveryPanel
          orderReference={order.order_reference}
          organisationName={order.organisation_name ?? assessment?.organisations?.legal_name ?? assessment?.organisations?.trading_name ?? 'your organisation'}
          reportReference={latestReport?.report_reference ?? null}
          reportFileName={latestReport?.file_name ?? null}
          recipientEmail={order.customer_email ?? assessment?.respondents?.email ?? null}
          productCode={order.products?.product_code ?? null}
          storageReady={storageReady}
          paymentConfirmed={order.status === 'payment_received'}
          deliveredAt={manualDelivery?.completed_at ?? null}
          deliveredBy={manualDeliveryActor?.full_name ?? manualDeliveryActor?.email ?? null}
        /> : null}

        <Card>
          <CardHeader><CardTitle>Payment automation</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <SnapshotValue label="Expected amount" value={formatOrderAmount(payment.record.expected_amount_cents ?? order.amount_cents, payment.record.currency ?? order.currency)} />
              <SnapshotValue label="Received amount" value={payment.record.received_amount_cents == null ? 'Not received' : formatOrderAmount(payment.record.received_amount_cents, payment.record.currency)} />
              <SnapshotValue label="Confirmation source" value={cleanStatus(payment.record.confirmation_source)} />
              <SnapshotValue label="Verification" value={cleanStatus(payment.record.verification_result)} />
              <SnapshotValue label="Provider transaction" value={payment.record.provider_transaction_reference ?? 'Not captured'} />
              <SnapshotValue label="Event time" value={dateTime(payment.record.last_event_at)} />
              <SnapshotValue label="Fulfilment trigger" value={cleanStatus(payment.record.fulfilment_trigger_result)} />
              <SnapshotValue label="Review reason" value={payment.record.review_reason ?? 'None'} />
            </div>
            {payment.capability.status !== 'available' ? <p className="rounded-xl border border-mk-line bg-mk-cream p-4 text-sm">{payment.capability.message}</p> : null}
            <div className="space-y-3">{payment.events.map((event: any) => <div key={event.id} className="rounded-xl border border-mk-line p-4 text-sm"><div className="flex flex-wrap gap-2"><Badge>{cleanStatus(event.new_state)}</Badge><span className="text-mk-muted">{dateTime(event.created_at)}</span></div><p className="mt-2">{cleanStatus(event.old_state)} → {cleanStatus(event.new_state)} · {cleanStatus(event.source)}</p><p className="mt-1 text-xs text-mk-muted">Verification: {cleanStatus(event.verification_result)} · Reference: {event.technical_reference}</p>{event.safe_note ? <p className="mt-2">{event.safe_note}</p> : null}</div>)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Order summary</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SnapshotValue label="Status" value={cleanStatus(order.status)} />
            <SnapshotValue label="Assessment" value={assessment?.assessment_reference} />
            <SnapshotValue label="Report request" value={dataRequest?.status ? cleanStatus(dataRequest.status) : 'No linked request'} />
            <SnapshotValue label="Organisation" value={order.organisation_name ?? assessment?.organisations?.legal_name ?? assessment?.organisations?.trading_name} />
            <SnapshotValue label="Customer" value={order.customer_name ?? order.customer_email ?? assessment?.respondents?.full_name} />
            <SnapshotValue label="Email" value={order.customer_email ?? assessment?.respondents?.email} />
            <SnapshotValue label="Product" value={order.product_name} />
            <SnapshotValue label="Amount" value={formatOrderAmount(order.amount_cents, order.currency)} />
            <SnapshotValue label="Created" value={dateTime(order.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Report versions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {reportVersions.map((report: any) => (
              <div key={report.id} className="grid gap-3 rounded-xl border border-mk-line bg-white p-4 text-sm md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(report.status)}</Badge><span className="font-semibold text-mk-ink">{report.report_reference}</span></div>
                  <p className="mt-2 text-mk-muted">Version {report.version_number} · Storage {cleanStatus(report.storage_status)} · {dateTime(report.generated_at)}</p>
                  <p className="mt-1 text-xs text-mk-muted">{report.file_name ?? 'PDF metadata pending'}{report.file_size_bytes ? ` · ${Number(report.file_size_bytes).toLocaleString()} bytes` : ''}</p>
                </div>
                <Badge>{report.storage_status === 'VERIFIED' ? 'Private · verified' : 'Unavailable'}</Badge>
              </div>
            ))}
            {!reportVersions.length ? <p className="text-sm text-mk-muted">No report versions generated yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Order notifications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {operations.notifications.map((event: any) => (
              <div key={event.id} className="grid gap-2 rounded-xl border border-mk-line bg-white p-4 text-sm md:grid-cols-3">
                <SnapshotValue label="Notification" value={cleanStatus(event.notification_type)} />
                <SnapshotValue label="State" value={`${cleanStatus(event.status)} · ${cleanStatus(event.provider_mode)}`} />
                <SnapshotValue label="Recorded" value={dateTime(event.created_at)} />
                {event.error_message ? <p className="md:col-span-3 text-mk-danger">{event.error_message}</p> : null}
              </div>
            ))}
            {!operations.notifications.length ? <p className="text-sm text-mk-muted">No notification records found.</p> : null}
            <p className="text-xs text-mk-muted">Internal MK notifications are sent only when the configured provider mode permits it. Customer report delivery is tracked through the protected fulfilment worker and secure access record.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment status update</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
              Manual and verified-provider confirmation share one payment state machine. A valid final payment creates the exact Comprehensive fulfilment attempt when the selected product is Comprehensive; Essential retains its existing payment boundary.
            </div>
            <form action={`/score/admin/orders/${order.order_reference}/status`} method="post" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[190px_160px_100px_1fr_auto]">
              <select name="status" defaultValue={order.status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanStatus(option)}</option>)}
              </select>
              <input name="amountCents" type="number" min="0" defaultValue={order.amount_cents} aria-label="Received amount in cents" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <input name="currency" defaultValue={order.currency} aria-label="Payment currency" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <input name="note" placeholder="Admin note for activity timeline" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <input name="idempotencyKey" type="hidden" value={`manual-payment:${order.order_reference}`} />
              <Button type="submit">Update status</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <div id="generation-history"><Card>
            <CardHeader><CardTitle>Generation history</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {operations.generationHistory.map((attempt: any) => (
                <div key={attempt.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(attempt.status)}</Badge><span>Version {attempt.report_version}</span></div>
                  <p className="mt-2 text-mk-muted">Requested {dateTime(attempt.requested_at)} · Retry {attempt.retry_count}</p>
                  <p className="mt-1 text-xs text-mk-muted">Reference: {attempt.technical_reference}</p>
                  {attempt.safe_operational_error ? <p className="mt-2 text-mk-danger">{attempt.safe_operational_error}</p> : null}
                </div>
              ))}
              {!operations.generationHistory.length ? <p className="text-sm text-mk-muted">No generation attempts recorded.</p> : null}
            </CardContent>
          </Card></div>

          <div id="delivery-history"><Card>
            <CardHeader>
              <CardTitle>Legacy manual delivery history</CardTitle>
              <p className="mt-1 text-xs font-normal text-mk-muted">
                Provider-double attempts only (manual_report_delivery_attempts) — not real customer email. See &ldquo;Real
                delivery &amp; customer access&rdquo; above for actual delivery history.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {operations.deliveryHistory.map((attempt: any) => (
                <div key={attempt.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(attempt.status)}</Badge><span>{cleanStatus(attempt.provider_mode)}</span></div>
                  <p className="mt-2 text-mk-muted">Requested {dateTime(attempt.requested_at)} · Retry {attempt.retry_count}</p>
                  <p className="mt-1 text-xs text-mk-muted">Reference: {attempt.technical_reference}</p>
                  {attempt.safe_operational_error ? <p className="mt-2 text-mk-danger">{attempt.safe_operational_error}</p> : null}
                </div>
              ))}
              {!operations.deliveryHistory.length ? <p className="text-sm text-mk-muted">No delivery attempts recorded.</p> : null}
            </CardContent>
          </Card></div>
        </div>

        <Card>
          <CardHeader><CardTitle>Order activity timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {events.map((event: any) => (
              <div key={event.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(event.event_type)}</Badge><span className="text-mk-muted">{dateTime(event.created_at)}</span></div>
                {(event.previous_status || event.new_status) ? <p className="mt-2 text-mk-muted">{cleanStatus(event.previous_status)} → {cleanStatus(event.new_status)}</p> : null}
                <p className="mt-2 text-xs text-mk-muted">Actor: {event.actor_admin_user_id ? `admin ${event.actor_admin_user_id}` : cleanStatus(event.metadata_json?.actor_type ?? 'system')}</p>
                {event.note ? <p className="mt-2 text-mk-ink">{event.note}</p> : null}
                {event.metadata_json?.technical_reference ? <p className="mt-2 text-xs text-mk-muted">Reference: {event.metadata_json.technical_reference} · Retry {event.metadata_json.retry_count ?? 0}</p> : null}
              </div>
            ))}
            {!events.length ? <p className="text-sm text-mk-muted">No order events recorded yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {auditEvents.map((event: any) => (
              <div key={event.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{event.actor_type}</Badge><span className="font-semibold text-mk-ink">{cleanStatus(event.action)}</span></div>
                <p className="mt-2 text-mk-muted">{dateTime(event.created_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>EFT instruction snapshot</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SnapshotValue label="Bank" value={eft.bankName ?? eft.bank_name} />
            <SnapshotValue label="Account holder" value={eft.accountHolder ?? eft.account_holder} />
            <SnapshotValue label="Branch code" value={eft.branchCode ?? eft.branch_code} />
          </CardContent>
        </Card>

        <Button asChild variant="secondary"><Link href="/score/admin/orders">Back to fulfilment queue</Link></Button>
      </div>
    </AdminShell>
  );
}
