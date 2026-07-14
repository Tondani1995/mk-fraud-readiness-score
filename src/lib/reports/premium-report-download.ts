import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requirePhase14Action } from './phase14-security';
import { readVerifiedReportObject, type VerifiedDownloadEntitlement } from './download-verification';

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
  return { bytes, entitlement };
}
