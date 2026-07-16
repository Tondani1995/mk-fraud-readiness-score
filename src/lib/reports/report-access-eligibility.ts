// Phase 14 launch readiness -- H5: application-layer (TypeScript) defense-in-depth checks at the
// real delivery and download paths, on top of (never instead of) the authoritative database
// enforcement (public.phase14_delivery_entitlement for email delivery; the direct
// order/storage/checksum checks already in createSecurePhase1ReportAccess for admin download).
//
// This is intentionally the ONLY function in the codebase permitted to decide whether a report
// row may be handed to anyone -- email attachment, admin signed link, or a future customer-facing
// download endpoint. Its status/currentness rules are a deliberate, documented mirror of
// public.phase14_delivery_entitlement's rules (see supabase/migrations/0017_phase14_canonical_
// disabled_foundation.sql, function body around line 1696) so the TS and SQL layers cannot
// silently drift apart. There is no parameter anywhere in this module that skips the currentness
// or status check for any purpose -- a future customer-facing download helper that reuses
// resolveCurrentReportId + assertReportAccessEligible gets the same enforcement for free and has
// no way to opt out of it, which is the guarantee H5 explicitly asks to prove.
export type ReportAccessPurpose = 'email_delivery' | 'admin_download' | 'customer_download';

export type ReportAccessEligibilityRecord = {
  id: string;
  order_id: string | null;
  report_type: string;
  status: string;
  version_number: number;
  storage_bucket: string | null;
  storage_path: string | null;
  checksum: string | null;
};

export type ReportAccessEligibilityInput = {
  report: ReportAccessEligibilityRecord;
  // The id of whatever the caller has independently resolved to be the CURRENT report for this
  // (assessment_id, report_type) -- see resolveCurrentReportId below. Passing null means
  // "currentness does not apply to this purpose" and must only ever be done deliberately by a
  // caller that has its own reason not to care (there is no such caller in this codebase today).
  currentReportId: string | null;
  expectedOrderId?: string | null;
  expectedOrganisationId?: string | null;
  actualOrganisationId?: string | null;
  purpose: ReportAccessPurpose;
};

export class ReportAccessEligibilityError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'ReportAccessEligibilityError';
    this.reason = reason;
  }
}

// Statuses that can never be delivered or downloaded, regardless of purpose -- mirrors
// phase14_delivery_entitlement's `v_report.status in ('draft','superseded','voided')` check.
const STATUS_FORBIDDEN_ALWAYS = new Set(['draft', 'superseded', 'voided']);

// Purpose-specific allow-lists -- mirrors phase14_delivery_entitlement's
// `p_purpose = 'email_delivery' and status not in (...)` / `p_purpose = 'admin_download' and
// status not in (...)` branches exactly. customer_download is stricter than either (only a fully
// released report), since no such endpoint exists yet and there is no reason to pre-approve a
// wider set before one is designed and reviewed.
const STATUS_ALLOWED_BY_PURPOSE: Record<ReportAccessPurpose, ReadonlySet<string>> = {
  email_delivery: new Set(['generated', 'approved', 'released']),
  admin_download: new Set(['generated', 'under_review', 'approved', 'released']),
  customer_download: new Set(['released'])
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function assertReportAccessEligible(input: ReportAccessEligibilityInput): void {
  const { report, purpose } = input;

  if (input.expectedOrderId && report.order_id !== input.expectedOrderId) {
    throw new ReportAccessEligibilityError(
      'report_order_mismatch', 'The report does not belong to the expected order.'
    );
  }
  if (input.expectedOrganisationId && input.actualOrganisationId
      && input.expectedOrganisationId !== input.actualOrganisationId) {
    throw new ReportAccessEligibilityError(
      'report_organisation_mismatch', 'The report does not belong to the expected organisation.'
    );
  }
  if (STATUS_FORBIDDEN_ALWAYS.has(report.status)) {
    throw new ReportAccessEligibilityError(
      'report_status_ineligible', `Report status '${report.status}' can never be delivered or downloaded.`
    );
  }
  if (!STATUS_ALLOWED_BY_PURPOSE[purpose].has(report.status)) {
    throw new ReportAccessEligibilityError(
      'report_status_forbidden_for_purpose', `Report status '${report.status}' is not eligible for ${purpose}.`
    );
  }
  if (input.currentReportId !== null && input.currentReportId !== report.id) {
    throw new ReportAccessEligibilityError(
      'report_not_current_version',
      'This report is not the current authorised version for its assessment and report type.'
    );
  }
  if (!report.storage_bucket || !report.storage_path || !SHA256_HEX.test(report.checksum ?? '')) {
    throw new ReportAccessEligibilityError(
      'report_storage_metadata_invalid', 'The report has no verified storage metadata.'
    );
  }
}

// Independently resolves what "current" means for a report's (assessment_id, report_type),
// mirroring phase14_delivery_entitlement's own query exactly:
//   select id from reports where assessment_id=... and report_type=...
//     and status not in ('superseded','voided','draft') order by version_number desc limit 1
// Callers pass the result into assertReportAccessEligible's currentReportId rather than trusting
// the report row's own claim about itself (a report can never assert its own currentness).
export async function resolveCurrentReportId(
  db: any, assessmentId: string, reportType: string
): Promise<string | null> {
  const { data, error } = await db.from('reports')
    .select('id, version_number')
    .eq('assessment_id', assessmentId)
    .eq('report_type', reportType)
    .not('status', 'in', '(superseded,voided,draft)')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
