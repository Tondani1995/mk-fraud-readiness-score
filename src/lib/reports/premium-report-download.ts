import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requirePhase14Action } from './phase14-security';
import { readVerifiedReportObject, type VerifiedDownloadEntitlement } from './download-verification';

// H5 note: this Phase 14 helper is not currently wired to any route -- the live admin download
// endpoint (src/app/score/api/admin/reports/[reportId]/download/route.ts) uses
// createSecurePhase1ReportAccess (phase1-report-access.ts) instead, which is why that file (not
// this one) received the new report-access-eligibility.ts checks for status/currentness. This
// function already goes through the authoritative public.assert_premium_report_download_entitlement
// RPC, which calls phase14_delivery_entitlement and enforces status/currentness/storage/entitlement
// in SQL -- so it is already safe were it wired to a route. If this function (or any future
// customer-facing download helper) is ever connected to a live endpoint, route it through
// resolveCurrentReportId + assertReportAccessEligible from report-access-eligibility.ts as well,
// exactly as report-delivery-service-core.ts and phase1-report-access.ts now do, so the
// application-layer defense-in-depth check is never skipped just because a new call site forgot
// to add it by hand.
export async function downloadPremiumReport(reportId: string) {
  const { client: privilegedDb } = await requirePhase14Action('report_download');
  const { data, error } = await privilegedDb.rpc('assert_premium_report_download_entitlement', {
    p_report_id: reportId,
    p_purpose: 'admin_download'
  });
  if (error || !data) throw error ?? new Error('Report download entitlement was not established.');
  const entitlement = data as VerifiedDownloadEntitlement;
  const db = createSupabaseServiceClient() as any;
  const bytes = await readVerifiedReportObject(db, entitlement);
  return { bytes, entitlement, auditClient: privilegedDb };
}
