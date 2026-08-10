import { requireServerEnv } from '@/lib/env/server';

export type OperationalAlertSeverity = 'warning' | 'critical';
export type OperationalAlertStatus = 'open' | 'acknowledged' | 'resolved';

export type OperationalAlertRow = {
  id: string;
  alert_key: string;
  severity: OperationalAlertSeverity;
  category: string;
  report_id: string | null;
  email_event_id: string | null;
  detail_json: Record<string, unknown>;
  status: OperationalAlertStatus;
  created_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_by: string | null;
  last_status_changed_at: string;
};

/**
 * Pure decision logic, split out from the network call below so it can be unit-tested directly
 * against a fixture OpenAPI document without needing a real running PostgREST server -- this
 * repo's live-check test harness (embedded-postgres) runs raw Postgres only, no PostgREST layer,
 * so this is the only part of capability detection that can be exercised as a "live" check here.
 */
export function specHasOperationalAlertLifecycleCapability(spec: { paths?: Record<string, unknown> } | null | undefined): boolean {
  return Boolean(spec?.paths?.['/rpc/transition_phase14_operational_alert']);
}

/**
 * Checks whether transition_phase14_operational_alert (Release D, 20260725150000) exists on the
 * connected database, without ever calling it. Reads PostgREST's own OpenAPI schema document (a
 * GET, side-effect-free) rather than attempting the RPC and catching a "function not found" error
 * -- so a Preview deployment pointed at a cloud project that has not received Release D's migration
 * never shows the operator a raw PostgREST/Postgres error, and never falls back to a direct table
 * write. Fails closed (capability absent) on any error, including a network failure.
 */
export async function checkOperationalAlertLifecycleCapability(accessToken: string): Promise<boolean> {
  try {
    const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
    const anonKey = requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/openapi+json'
      },
      cache: 'no-store'
    });
    if (!response.ok) return false;
    const spec = (await response.json()) as { paths?: Record<string, unknown> };
    return specHasOperationalAlertLifecycleCapability(spec);
  } catch {
    return false;
  }
}

export const OPERATIONAL_ALERT_VALID_TRANSITIONS: Record<OperationalAlertStatus, OperationalAlertStatus[]> = {
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved', 'open'],
  resolved: ['open']
};

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * This platform's operators are South African MK users; the date picker's YYYY-MM-DD values are
 * calendar days in their local operational timezone (Africa/Johannesburg, SAST), not UTC calendar
 * days. SAST has been a fixed UTC+02:00 offset year-round since 1994 -- South Africa does not
 * observe DST -- so the conversion is a constant, but it is named and centralized here rather than
 * left as unexplained `+2`/`-2` arithmetic scattered through the page.
 */
const SOUTH_AFRICA_OPERATIONAL_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

/**
 * Strictly validates a YYYY-MM-DD calendar date. `Date.parse`/the `Date` constructor alone accept
 * and silently roll over impossible dates (e.g. `new Date(Date.UTC(2026, 1, 31))` becomes March 3,
 * not an error) -- this parses the components, constructs the intended UTC date, and round-trips
 * it, rejecting the input unless the constructed date's year/month/day match exactly what was
 * typed. Rejects month 00/13+, day 00, Feb 31, Apr 31, Feb 29 on a non-leap year, and anything not
 * shaped like YYYY-MM-DD.
 */
function parseStrictCalendarDate(raw: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_ONLY.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (roundTrip.getUTCFullYear() !== year || roundTrip.getUTCMonth() !== month - 1 || roundTrip.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * The UTC instant of 00:00:00 SAST on the given SAST calendar day -- i.e. the *previous* UTC
 * calendar day at 22:00:00, since SAST is UTC+2. `Date.UTC` correctly rolls `day + 1` into the
 * next month/year on its own, so the exclusive end bound for one day is computed the same way as
 * the start bound for the next, with no separate increment step to get wrong.
 */
function sastCalendarDayStartUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - SOUTH_AFRICA_OPERATIONAL_UTC_OFFSET_MS);
}

export type OperationalAlertDateRange = {
  fromIso?: string;
  toExclusiveIso?: string;
  invalid: Array<'from' | 'to'>;
  /** Both dates individually parsed, but "from" is chronologically after "to" -- a contradictory range, not an invalid single value. */
  rangeOrderInvalid: boolean;
};

/**
 * Turns raw <input type="date"> values (bare YYYY-MM-DD, interpreted as SAST operational calendar
 * days -- see sastCalendarDayStartUtc) into UTC ISO bounds safe to compare against created_at
 * (timestamptz). The end date is deliberately the *exclusive* start of the following SAST day, not
 * an inclusive bound on the selected day itself -- an inclusive `lte` on a bare date compares
 * against midnight and silently drops every event from later that same day. Malformed or
 * calendar-impossible values (see parseStrictCalendarDate) are dropped, not passed to the
 * database, and reported via `invalid`; a valid-but-contradictory range (from after to) is
 * reported via `rangeOrderInvalid` and both bounds are dropped rather than sending either
 * contradictory bound to a query.
 */
export function normalizeOperationalAlertDateRange(fromRaw: string | undefined, toRaw: string | undefined): OperationalAlertDateRange {
  const invalid: Array<'from' | 'to'> = [];

  const fromParsed = fromRaw ? parseStrictCalendarDate(fromRaw) : undefined;
  if (fromRaw && !fromParsed) invalid.push('from');

  const toParsed = toRaw ? parseStrictCalendarDate(toRaw) : undefined;
  if (toRaw && !toParsed) invalid.push('to');

  let fromIso = fromParsed ? sastCalendarDayStartUtc(fromParsed.year, fromParsed.month, fromParsed.day).toISOString() : undefined;
  let toExclusiveIso = toParsed ? sastCalendarDayStartUtc(toParsed.year, toParsed.month, toParsed.day + 1).toISOString() : undefined;

  let rangeOrderInvalid = false;
  if (fromParsed && toParsed) {
    const fromStartMs = sastCalendarDayStartUtc(fromParsed.year, fromParsed.month, fromParsed.day).getTime();
    const toStartMs = sastCalendarDayStartUtc(toParsed.year, toParsed.month, toParsed.day).getTime();
    if (fromStartMs > toStartMs) {
      rangeOrderInvalid = true;
      fromIso = undefined;
      toExclusiveIso = undefined;
    }
  }

  return { fromIso, toExclusiveIso, invalid, rangeOrderInvalid };
}

export type OperationalAlertQueryFilters = {
  status: OperationalAlertStatus | 'all';
  severity: OperationalAlertSeverity | 'all';
  category?: string;
  dateRange: OperationalAlertDateRange;
};

/**
 * A structural subset of the supabase-js query builder -- typed narrowly so the same function
 * can run against the real Supabase client on the page and against a plain recording mock in
 * tests, without either side needing the other's concrete type.
 */
export interface OperationalAlertQueryLike {
  eq(column: string, value: unknown): this;
  gte(column: string, value: unknown): this;
  lt(column: string, value: unknown): this;
  order(column: string, options: { ascending: boolean }): this;
  range(from: number, to: number): this;
}

/**
 * Severity/category/date filters only -- never status. This is the one function every status
 * count query (open/acknowledged/resolved) and the list query itself all go through, so a
 * selected status filter can never leak an extra `.eq('status', ...)` into another status's own
 * count. Each caller appends exactly one status condition (or none) on top of this.
 */
export function applyOperationalAlertNonStatusFilters<Q extends OperationalAlertQueryLike>(query: Q, filters: OperationalAlertQueryFilters): Q {
  let q = query;
  if (filters.severity !== 'all') q = q.eq('severity', filters.severity);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.dateRange.fromIso) q = q.gte('created_at', filters.dateRange.fromIso);
  if (filters.dateRange.toExclusiveIso) q = q.lt('created_at', filters.dateRange.toExclusiveIso);
  return q;
}

/** Non-status filters plus the list's own status filter (if any) -- used only for the row list, never for a count. */
export function applyOperationalAlertListFilters<Q extends OperationalAlertQueryLike>(query: Q, filters: OperationalAlertQueryFilters): Q {
  let q = applyOperationalAlertNonStatusFilters(query, filters);
  if (filters.status !== 'all') q = q.eq('status', filters.status);
  return q;
}

/**
 * Builds the admin list query with the required global ordering applied *before* pagination:
 * critical before warning (severity ascending -- the check constraint permits only
 * 'critical'/'warning', and 'critical' < 'warning' lexically, so ascending order is
 * critical-first without depending on a third value never being added), newest first within
 * each severity band, id ascending as a final deterministic tie-breaker, and only then
 * `.range()`. Ordering must be applied by the database, not by re-sorting an already-paginated
 * page in application code -- an older critical alert on page 2 must not be hidden behind 25
 * newer warnings that all sorted ahead of it in the database's own `created_at desc` order. The
 * `id` tie-breaker exists because severity and created_at alone are not unique: two alerts with
 * the same severity and the same (or equal-precision-truncated) created_at timestamp would
 * otherwise have no defined relative order, and Postgres does not guarantee a stable order for
 * ties across repeated executions of the same query without one.
 */
export function buildOperationalAlertListQuery<Q extends OperationalAlertQueryLike>(
  query: Q,
  filters: OperationalAlertQueryFilters,
  page: number,
  pageSize: number
): Q {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const offset = (safePage - 1) * pageSize;
  return applyOperationalAlertListFilters(query, filters)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + pageSize - 1);
}

export type OperationalAlertCountResult = { count: number | null; error: unknown };

/**
 * Renders a count query's result safely: an error becomes an explicit "unavailable" marker, not
 * a silently-displayed 0 that reads as "genuinely zero alerts in this state" to an operator.
 */
export function formatOperationalAlertCount(result: OperationalAlertCountResult | null | undefined): string {
  if (!result || result.error) return '—';
  return String(result.count ?? 0);
}

// Every category actually emitted anywhere in this codebase as of Release D (confirmed by reading
// every insert site into phase14_operational_alerts across supabase/migrations/*.sql, and every
// db.rpc('record_phase14_operational_alert', ...) call site in src/ -- not assumed). Each entry
// controls both what an operator sees and which detail_json keys, if any, are safe to surface --
// unknown categories fall through to the generic default below and show no detail_json content at
// all, per the presentation rule that unknown categories get a summary plus non-sensitive
// identifiers only.
type CategoryPresentation = {
  summary: string;
  recoveryGuidance: string;
  recoveryLink?: string;
  safeDetailKeys: string[];
};

const CATEGORY_PRESENTATION: Record<string, CategoryPresentation> = {
  comprehensive_evidence_orphan_object: {
    summary: 'A Comprehensive evidence file was uploaded to private storage, its database row failed to save, and the automatic cleanup of that object also failed.',
    recoveryGuidance: 'The object is orphaned: it exists in the private comprehensive-evidence bucket with no evidence row describing it, so no reviewer, retention or erasure process will ever reach it. Remove it manually using the bucket and storage path shown here. The customer’s upload did not succeed, so they will need to submit the evidence again.',
    safeDetailKeys: ['bucket', 'storage_path', 'engagement_id', 'order_id', 'reason', 'cleanup_error']
  },
  provider_event_payload_conflict: {
    summary: 'A provider (Resend) sent two different payloads for the same event ID.',
    recoveryGuidance: 'Do not resend. Compare the two payloads in the provider dashboard for this event ID before deciding whether to trust either.',
    safeDetailKeys: ['provider']
  },
  report_temporary_object_cleanup_failed: {
    summary: 'A generated report’s temporary storage object could not be cleaned up after the configured number of attempts.',
    recoveryGuidance: 'Not a customer-facing failure -- the final report object is unaffected. Locate the object via the linked report and remove it manually if storage cost matters, or leave it for the next scheduled sweep.',
    safeDetailKeys: ['bucket', 'attempt_count']
  },
  delivery_finalization_replay_conflict: {
    summary: 'A delivery-finalization webhook replay did not match the authorization’s currently persisted state.',
    recoveryGuidance: 'Open the linked order’s delivery panel and compare the authorization’s current status against the provider’s dashboard before retrying delivery.',
    recoveryLink: '#real-delivery',
    safeDetailKeys: ['incoming_provider']
  },
  storage_cleanup_verification_failed: {
    summary: 'A storage-cleanup job could not verify its target object’s expected checksum before deleting it, and was blocked rather than deleting blind.',
    recoveryGuidance: 'Verify the object manually before allowing cleanup to proceed. Do not force-delete without confirming the checksum out of band.',
    safeDetailKeys: ['bucket', 'reason']
  },
  delivery_complaint: {
    summary: 'The recipient marked a delivered email as spam/complaint with the provider.',
    recoveryGuidance: 'Resend to this recipient is suppressed by default. Reissuing a report-access link for this recipient requires an explicit override -- see the delivery runbook.',
    recoveryLink: '#real-delivery',
    safeDetailKeys: []
  },
  delivery_permanent_bounce: {
    summary: 'The recipient address permanently bounced (provider-confirmed, not retryable).',
    recoveryGuidance: 'The recipient address is very likely wrong or no longer valid. Use the order’s recipient-correction action before attempting redelivery.',
    recoveryLink: '#real-delivery',
    safeDetailKeys: []
  },
  report_download_object_missing: {
    summary: 'A customer report download was requested but its storage object could not be found.',
    recoveryGuidance: 'Check the linked report’s generation history -- the report may need to be regenerated.',
    safeDetailKeys: []
  },
  report_download_object_size_invalid: {
    summary: 'A customer report’s stored object size did not match what was recorded at generation time.',
    recoveryGuidance: 'Treat the stored object as untrustworthy until reverified. Do not serve it to a customer without re-checking storage-side integrity.',
    safeDetailKeys: []
  },
  report_download_checksum_mismatch: {
    summary: 'A customer report download’s checksum did not match the checksum recorded at generation time.',
    recoveryGuidance: 'Do not treat the served file as verified. Investigate before allowing further downloads of this report version.',
    safeDetailKeys: []
  },
  report_email_checksum_mismatch: {
    summary: 'A report email’s attached/linked content checksum did not match the checksum recorded at generation time.',
    recoveryGuidance: 'Do not resend from this report version until the mismatch is understood. Check the report’s generation history.',
    safeDetailKeys: []
  }
};

const DEFAULT_PRESENTATION: CategoryPresentation = {
  summary: 'An operational condition was flagged that does not have a specific runbook entry yet.',
  recoveryGuidance: 'Review the linked order/report context and this alert’s category name; escalate if the category is unfamiliar rather than guessing at a resolution.',
  safeDetailKeys: []
};

export function getOperationalAlertPresentation(category: string): CategoryPresentation {
  return CATEGORY_PRESENTATION[category] ?? DEFAULT_PRESENTATION;
}

/**
 * Extracts only the allow-listed, non-sensitive keys for a category from its detail_json. Never
 * returns the raw object -- an unknown/unlisted key is dropped, not passed through. This is the
 * single choke point that keeps customer emails, names, tokens, credentials, and permanent storage
 * URLs (none of which any current category's safeDetailKeys list includes) out of the admin page.
 */
export function extractSafeAlertDetails(category: string, detailJson: Record<string, unknown> | null | undefined): Record<string, string> {
  const { safeDetailKeys } = getOperationalAlertPresentation(category);
  const safe: Record<string, string> = {};
  if (!detailJson) return safe;
  for (const key of safeDetailKeys) {
    const value = detailJson[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') continue;
    safe[key] = String(value);
  }
  return safe;
}
