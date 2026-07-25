import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';
import {
  applyOperationalAlertNonStatusFilters,
  buildOperationalAlertListQuery,
  checkOperationalAlertLifecycleCapability,
  extractSafeAlertDetails,
  formatOperationalAlertCount,
  getOperationalAlertPresentation,
  normalizeOperationalAlertDateRange,
  type OperationalAlertQueryFilters,
  type OperationalAlertRow,
  type OperationalAlertSeverity,
  type OperationalAlertStatus
} from '@/lib/reports/operational-alerts';
import { OperationalAlertActions } from '@/components/admin/OperationalAlertsControl';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 25;
const STATUS_OPTIONS: Array<OperationalAlertStatus | 'all'> = ['all', 'open', 'acknowledged', 'resolved'];
const SEVERITY_OPTIONS: Array<OperationalAlertSeverity | 'all'> = ['all', 'critical', 'warning'];
const MUTATION_ROLES = new Set(['platform_admin', 'reviewer']);

function cleanCategory(category: string) {
  return category.replace(/_/g, ' ');
}

type OrderLink = { orderReference: string; href: string } | null;

async function resolveOrderLinks(db: ReturnType<typeof createSupabaseAuthenticatedServerClient>, alerts: OperationalAlertRow[]): Promise<Map<string, OrderLink>> {
  const reportIds = [...new Set(alerts.map((a) => a.report_id).filter((v): v is string => Boolean(v)))];
  const emailEventIds = [...new Set(alerts.map((a) => a.email_event_id).filter((v): v is string => Boolean(v)))];
  const byAlertId = new Map<string, OrderLink>();
  if (reportIds.length === 0 && emailEventIds.length === 0) return byAlertId;

  const [reportRows, emailEventRows] = await Promise.all([
    reportIds.length
      ? db.from('reports').select('id, orders(order_reference)').in('id', reportIds)
      : Promise.resolve({ data: [] as any[] }),
    emailEventIds.length
      ? db.from('email_events').select('id, orders(order_reference)').in('id', emailEventIds)
      : Promise.resolve({ data: [] as any[] })
  ]);

  const reportToOrderRef = new Map<string, string>();
  for (const row of (reportRows.data ?? []) as any[]) {
    const ref = row.orders?.order_reference;
    if (ref) reportToOrderRef.set(row.id, ref);
  }
  const emailEventToOrderRef = new Map<string, string>();
  for (const row of (emailEventRows.data ?? []) as any[]) {
    const ref = row.orders?.order_reference;
    if (ref) emailEventToOrderRef.set(row.id, ref);
  }

  for (const alert of alerts) {
    const ref = (alert.report_id ? reportToOrderRef.get(alert.report_id) : undefined)
      ?? (alert.email_event_id ? emailEventToOrderRef.get(alert.email_event_id) : undefined);
    byAlertId.set(alert.id, ref ? { orderReference: ref, href: `/score/admin/orders/${encodeURIComponent(ref)}` } : null);
  }
  return byAlertId;
}

export default async function OperationalAlertsPage({
  searchParams
}: {
  searchParams?: { status?: string; severity?: string; category?: string; from?: string; to?: string; page?: string };
}) {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) {
    // requireAdmin already redirects when there is truly no session; this is defence in depth,
    // matching every other admin page's pattern in this codebase.
    throw new Error('No active session.');
  }
  const db = createSupabaseAuthenticatedServerClient(accessToken);

  const statusFilter = (STATUS_OPTIONS as string[]).includes(searchParams?.status ?? '') ? (searchParams?.status as OperationalAlertStatus | 'all') : 'all';
  const severityFilter = (SEVERITY_OPTIONS as string[]).includes(searchParams?.severity ?? '') ? (searchParams?.severity as OperationalAlertSeverity | 'all') : 'all';
  const categoryFilter = searchParams?.category?.trim() || undefined;
  const fromDate = searchParams?.from?.trim() || undefined;
  const toDate = searchParams?.to?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(searchParams?.page ?? '1', 10) || 1);

  // Invalid date-filter values are dropped here, before ever reaching a query -- they are never
  // passed to `.gte()`/`.lt()`, so a malformed query-string value cannot surface a raw database
  // error. `dateRange.invalid` drives the notice banner below instead.
  const dateRange = normalizeOperationalAlertDateRange(fromDate, toDate);
  const filters: OperationalAlertQueryFilters = { status: statusFilter, severity: severityFilter, category: categoryFilter, dateRange };

  // Global ordering (critical before warning, newest first within each severity) is applied by
  // the database, before `.range()` -- see buildOperationalAlertListQuery's own comment. An older
  // critical alert must surface on page 1 even if 25 newer warnings exist; re-sorting an
  // already-paginated page in application code cannot fix that, since the wrong rows would
  // already have been paginated in.
  const listQuery = buildOperationalAlertListQuery(
    db.from('phase14_operational_alerts').select('*', { count: 'exact' }) as any,
    filters,
    page,
    PAGE_SIZE
  );

  // Status counts share every filter except status -- applyOperationalAlertNonStatusFilters never
  // applies a `.eq('status', ...)`, so selecting one status in the list filter cannot force the
  // other two counts to zero by ANDing two conflicting status conditions together.
  const [{ data: rawAlerts, count, error: listError }, openCount, acknowledgedCount, resolvedCount, capability] = await Promise.all([
    listQuery,
    applyOperationalAlertNonStatusFilters(db.from('phase14_operational_alerts').select('id', { count: 'exact', head: true }) as any, filters).eq('status', 'open'),
    applyOperationalAlertNonStatusFilters(db.from('phase14_operational_alerts').select('id', { count: 'exact', head: true }) as any, filters).eq('status', 'acknowledged'),
    applyOperationalAlertNonStatusFilters(db.from('phase14_operational_alerts').select('id', { count: 'exact', head: true }) as any, filters).eq('status', 'resolved'),
    checkOperationalAlertLifecycleCapability(accessToken)
  ]);

  if (listError) throw new Error(listError.message);

  const alerts = (rawAlerts ?? []) as OperationalAlertRow[];
  const countsUnavailable = Boolean(openCount.error || acknowledgedCount.error || resolvedCount.error);

  const orderLinks = await resolveOrderLinks(db, alerts);
  const canMutate = MUTATION_ROLES.has(admin.role);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  function filterHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = { status: statusFilter === 'all' ? undefined : statusFilter, severity: severityFilter === 'all' ? undefined : severityFilter, category: categoryFilter, from: fromDate, to: toDate, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `?${query}` : '?';
  }

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operational readiness"
          title="Operational alerts"
          description="Read-only visibility into everything phase14_operational_alerts already records -- storage-cleanup failures, provider-event conflicts, bounce/complaint suppression, and report-integrity mismatches. Lifecycle actions are audited and role-gated."
        />

        {!capability && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Lifecycle actions (acknowledge / resolve / reopen) require the integrated Release D migration,
            which this environment does not currently have. Alerts below are shown read-only.
          </div>
        )}

        {dateRange.invalid.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Ignored invalid date filter{dateRange.invalid.length > 1 ? 's' : ''}: {dateRange.invalid.join(', ')}.
            Use the YYYY-MM-DD format shown in the date pickers below.
          </div>
        )}

        {countsUnavailable && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
            One or more status counts could not be loaded. The badges below marked “—” are unavailable, not zero -- reload to retry.
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <Badge className="bg-red-50 text-red-800">Open: {formatOperationalAlertCount(openCount)}</Badge>
          <Badge className="bg-amber-50 text-amber-800">Acknowledged: {formatOperationalAlertCount(acknowledgedCount)}</Badge>
          <Badge className="bg-emerald-50 text-emerald-800">Resolved: {formatOperationalAlertCount(resolvedCount)}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="get" className="grid gap-3 sm:grid-cols-5">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">Status</span>
                <select name="status" defaultValue={statusFilter} className="w-full rounded-xl border border-mk-line px-3 py-2 text-sm">
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">Severity</span>
                <select name="severity" defaultValue={severityFilter} className="w-full rounded-xl border border-mk-line px-3 py-2 text-sm">
                  {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">Category</span>
                <input type="text" name="category" defaultValue={categoryFilter ?? ''} placeholder="exact category key" className="w-full rounded-xl border border-mk-line px-3 py-2 text-sm" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">From</span>
                <input type="date" name="from" defaultValue={fromDate ?? ''} className="w-full rounded-xl border border-mk-line px-3 py-2 text-sm" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">To</span>
                <input type="date" name="to" defaultValue={toDate ?? ''} className="w-full rounded-xl border border-mk-line px-3 py-2 text-sm" />
              </label>
              <div className="sm:col-span-5">
                <button type="submit" className="rounded-full bg-mk-ink px-5 py-2 text-sm font-semibold text-mk-cream">Apply filters</button>
                <Link href="/score/admin/operational-alerts" className="ml-3 text-sm text-mk-muted underline">Clear</Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {alerts.length === 0 && (
            <Card><CardContent><p className="text-sm text-mk-muted">No alerts match these filters.</p></CardContent></Card>
          )}
          {alerts.map((alert) => {
            const presentation = getOperationalAlertPresentation(alert.category);
            const safeDetails = extractSafeAlertDetails(alert.category, alert.detail_json);
            const orderLink = orderLinks.get(alert.id) ?? null;
            return (
              <Card key={alert.id}>
                <CardContent>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={alert.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>{alert.severity}</Badge>
                        <Badge className={alert.status === 'open' ? 'bg-red-50 text-red-700' : alert.status === 'acknowledged' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}>{alert.status}</Badge>
                        <span className="text-xs uppercase tracking-[0.1em] text-mk-muted">{cleanCategory(alert.category)}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-mk-ink">{presentation.summary}</p>
                      <p className="mt-1 text-xs text-mk-muted">{presentation.recoveryGuidance}</p>
                      {Object.keys(safeDetails).length > 0 && (
                        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mk-muted">
                          {Object.entries(safeDetails).map(([k, v]) => (
                            <div key={k}><dt className="inline font-semibold">{k}: </dt><dd className="inline">{v}</dd></div>
                          ))}
                        </dl>
                      )}
                      <p className="mt-2 text-xs text-mk-muted">
                        Created {new Date(alert.created_at).toLocaleString()}
                        {alert.acknowledged_at ? ` · Acknowledged ${new Date(alert.acknowledged_at).toLocaleString()}` : ''}
                        {alert.resolved_at ? ` · Resolved ${new Date(alert.resolved_at).toLocaleString()}` : ''}
                      </p>
                      {orderLink && (
                        <Link href={orderLink.href + (presentation.recoveryLink ?? '')} className="mt-2 inline-block text-xs font-semibold text-mk-brassDark underline">
                          Open order {orderLink.orderReference}
                        </Link>
                      )}
                    </div>
                    {canMutate && capability && (
                      <OperationalAlertActions alertId={alert.id} status={alert.status} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-2">
            {page > 1 && <Link href={filterHref({ page: String(page - 1) })} className="rounded-full border border-mk-line px-4 py-2 text-sm">Previous</Link>}
            <span className="px-4 py-2 text-sm text-mk-muted">Page {page} of {totalPages}</span>
            {page < totalPages && <Link href={filterHref({ page: String(page + 1) })} className="rounded-full border border-mk-line px-4 py-2 text-sm">Next</Link>}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
