/**
 * One report-reference and version rule for the whole generation path.
 *
 * The reference is printed inside the PDF, used to name the stored object and persisted as
 * reports.report_reference, which is globally unique. Those three had the rule written out
 * separately, so a version allocated in one scope could produce a reference that a different
 * scope refused to persist -- which is exactly how a completed Essential generation reached
 * finalisation and failed on reports_report_reference_key after the provider and storage spend.
 *
 * The database mirror of this rule is public.mk_report_reference() in
 * supabase/migrations/20260907170000_report_lineage_assessment_scope.sql. For Comprehensive the
 * database function emits the bare reference and the existing
 * ensure_comprehensive_report_reference_namespace() trigger applies the -COMP- namespace, so both
 * sides converge on the value this function returns.
 */
import { COMPREHENSIVE_REPORT_TYPE, ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE } from './report-entitlement';

export type ReportReferenceType = string;

/** The assessment reference as it appears inside a report reference for this report type. */
export function reportScopedAssessmentReference(assessmentReference: string, reportType: ReportReferenceType): string {
  if (reportType === ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE) {
    return assessmentReference.replaceAll('-COMP-', '-ESS-');
  }
  if (reportType === COMPREHENSIVE_REPORT_TYPE) {
    return assessmentReference.includes('-COMP-') ? assessmentReference : `${assessmentReference}-COMP`;
  }
  return assessmentReference;
}

/** `RPT-<scoped assessment reference>-V<version>`. */
export function buildReportReference(input: {
  assessmentReference: string;
  reportType: ReportReferenceType;
  versionNumber: number;
}): string {
  return `RPT-${reportScopedAssessmentReference(input.assessmentReference, input.reportType)}-V${input.versionNumber}`;
}

export type ReportIdentityConflict =
  | 'version_number_already_used'
  | 'report_reference_already_used';

export type ReportIdentityPreflight =
  | { ok: true }
  | { ok: false; conflict: ReportIdentityConflict; conflictingReportId: string };

/**
 * Proves, before any provider call, that the claimed report identity can actually be persisted.
 *
 * The authoritative uniqueness scope is (assessment_id, report_type, version_number) plus the
 * globally unique report_reference. Both are checked against every existing report for this
 * assessment and report type -- including rows carrying a different order_id or none at all,
 * which is precisely the class the order-scoped allocator could not see.
 *
 * This is a fail-closed pre-check, not a lock. The database constraints remain the authority; the
 * point is to discover a deterministic collision before AI, PDF and storage spend rather than at
 * finalisation.
 */
export function preflightReportIdentity(input: {
  versionNumber: number;
  reportReference: string;
  existingReports: Array<{ id: string; version_number: number | string; report_reference: string }>;
}): ReportIdentityPreflight {
  for (const existing of input.existingReports) {
    if (Number(existing.version_number) === input.versionNumber) {
      return { ok: false, conflict: 'version_number_already_used', conflictingReportId: existing.id };
    }
    if (existing.report_reference === input.reportReference) {
      return { ok: false, conflict: 'report_reference_already_used', conflictingReportId: existing.id };
    }
  }
  return { ok: true };
}
