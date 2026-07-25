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
