import Link from 'next/link';
import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getFulfilmentSchemaCapability } from '@/lib/reports/phase1-schema-capability';
import { generateSyntheticComprehensiveReport } from '@/lib/comprehensive/synthetic-fixture-generation';
import { assertReportAccessEligible, resolveCurrentReportId } from '@/lib/reports/report-access-eligibility';
import { issuePrivateReportSignedUrl, readVerifiedPrivatePdf, recordPrivateReportAccessEvidence } from '@/lib/reports/private-report-access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'generated').replace(/_/g, ' ');
}

async function getRecentReports(db: any) {
  const { data, error } = await db
    .from('reports')
    .select('id, report_reference, version_number, status, synthetic_demonstration, synthetic_certification_ref, generated_at, storage_bucket, storage_path, orders(order_reference, organisation_name), assessments(assessment_reference)')
    .order('generated_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('recent reports query failed', error);
    return [];
  }
  return data ?? [];
}

const syntheticComprehensiveProofFixtures = [
  { label: 'ORG-01 · Ubuntu Home & Lifestyle Retail', assessmentReference: 'MKFRS-2026-DE94607709', requestKey: 'synthetic-proof-ORG-01-comprehensive-v1-20260904' },
  { label: 'ORG-02 · Mahlasedi Infrastructure Services', assessmentReference: 'MKFRS-2026-80B6B23791', requestKey: 'synthetic-proof-ORG-02-comprehensive-v1-20260904' },
  { label: 'ORG-03 · MzansiLink Marketplace', assessmentReference: 'MKFRS-2026-A68F8A2017', requestKey: 'synthetic-proof-ORG-03-comprehensive-v1-20260904' }
] as const;

async function generateSyntheticProofFixture(formData: FormData) {
  'use server';
  const admin = await requireAdmin(['platform_admin']);
  const assessmentReference = String(formData.get('assessmentReference') ?? '');
  const fixture = syntheticComprehensiveProofFixtures.find((item) => item.assessmentReference === assessmentReference);
  if (!fixture) throw new Error('The requested synthetic proof fixture is not allowlisted.');
  const result = await generateSyntheticComprehensiveReport({
    assessmentReference: fixture.assessmentReference,
    requestedBy: admin.id,
    requestKey: fixture.requestKey
  });
  redirect(`/score/admin/reports?syntheticReport=${encodeURIComponent(result.reportId)}`);
}

async function downloadSyntheticProofFixture(formData: FormData) {
  'use server';
  const admin = await requireAdmin(['platform_admin']);
  const reportId = String(formData.get('reportId') ?? '').trim();
  const technicalReference = crypto.randomUUID();
  const db = createSupabaseServiceClient() as any;
  const { data: report, error: reportError } = await db.from('reports')
    .select('id,assessment_id,organisation_id,order_id,score_run_id,report_type,report_reference,version_number,status,synthetic_demonstration,synthetic_certification_ref,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status')
    .eq('id', reportId)
    .maybeSingle();
  if (reportError || !report || !report.synthetic_demonstration || report.order_id || report.storage_status !== 'VERIFIED') throw new Error('The synthetic owner-review report is not eligible for download.');
  const { data: assessment, error: assessmentError } = await db.from('assessments')
    .select('id,organisation_id,current_score_run_id,synthetic_demonstration,synthetic_certification_ref')
    .eq('id', report.assessment_id)
    .maybeSingle();
  if (assessmentError || !assessment || !assessment.synthetic_demonstration || assessment.synthetic_certification_ref !== report.synthetic_certification_ref || assessment.organisation_id !== report.organisation_id || assessment.current_score_run_id !== report.score_run_id) throw new Error('The synthetic owner-review report does not match its assessment.');
  const currentReportId = await resolveCurrentReportId(db, assessment.id, report.report_type);
  assertReportAccessEligible({ report, currentReportId, expectedOrganisationId: assessment.organisation_id, actualOrganisationId: report.organisation_id, purpose: 'admin_download' });
  const expectedPrefix = report.report_type === 'mk_validated'
    ? `${assessment.organisation_id}/${assessment.id}/synthetic-comprehensive/v${report.version_number}/`
    : `${assessment.organisation_id}/${assessment.id}/v${report.version_number}/`;
  await readVerifiedPrivatePdf(db, report, expectedPrefix);
  const signedUrl = await issuePrivateReportSignedUrl(db, report, 'download');
  if (!signedUrl) throw new Error('A secure synthetic report link could not be created.');
  const auditError = await recordPrivateReportAccessEvidence({ db, report, adminId: admin.id, mode: 'download', success: true, technicalReference });
  if (auditError) throw new Error('Synthetic report access could not be audited.');
  redirect(signedUrl);
}

export default async function AdminReportsPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const db = createSupabaseServiceClient() as any;
  const reports = await getRecentReports(db);
  const capability = await getFulfilmentSchemaCapability(db);
  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader eyebrow="Report control" title="Generated report versions" description="Review generated report versions and access controlled admin downloads. Essential reports can be generated directly from a completed assessment; legacy order-linked reports remain supported." />
        {capability.status !== 'available' ? <div className="rounded-xl border border-mk-brass/40 bg-mk-cream p-4 text-sm text-mk-ink">{capability.message}</div> : null}
        {admin.role === 'platform_admin' ? <Card><CardHeader><CardTitle>Synthetic Comprehensive proof fixtures</CardTitle></CardHeader><CardContent><p className="mb-4 max-w-3xl text-sm leading-6 text-mk-muted">Platform-admin-only owner-review controls for the isolated synthetic demonstration route. These samples are marked synthetic, stay in private storage and never create an order or customer delivery.</p><div className="grid gap-3 md:grid-cols-3">{syntheticComprehensiveProofFixtures.map((fixture) => <form key={fixture.assessmentReference} action={generateSyntheticProofFixture} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4"><input type="hidden" name="assessmentReference" value={fixture.assessmentReference} /><p className="mb-3 text-sm font-semibold text-mk-ink">{fixture.label}</p><Button type="submit">Generate Comprehensive</Button></form>)}</div></CardContent></Card> : null}
        <Card><CardHeader><CardTitle>Recent reports</CardTitle></CardHeader><CardContent className="space-y-3">
          {reports.map((report: any) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mk-line bg-white p-4 text-sm"><div><div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(report.status)}</Badge>{report.synthetic_demonstration ? <Badge>Synthetic owner review</Badge> : null}<span className="font-semibold text-mk-ink">{report.report_reference}</span></div><p className="mt-2 text-mk-muted">Version {report.version_number} · {report.assessments?.assessment_reference ?? 'Assessment not linked'} · {report.orders?.organisation_name ?? (report.synthetic_demonstration ? 'Synthetic demonstration organisation' : 'Organisation not captured')}</p><p className="mt-1 text-mk-muted">Generated {report.generated_at ? new Date(report.generated_at).toLocaleString('en-ZA') : 'date not captured'}</p></div><div className="flex flex-wrap gap-2">{report.orders?.order_reference ? <Button asChild variant="secondary"><Link href={`/score/admin/orders/${report.orders.order_reference}`}>Open order</Link></Button> : null}{report.synthetic_demonstration && report.storage_bucket && report.storage_path ? <form action={downloadSyntheticProofFixture}><input type="hidden" name="reportId" value={report.id} /><Button type="submit">Download owner-review sample</Button></form> : null}{capability.status === 'available' && report.storage_bucket && report.storage_path && report.orders?.order_reference ? <><Button asChild variant="secondary"><a href={`/score/api/admin/reports/${report.id}/preview?order=${encodeURIComponent(report.orders.order_reference)}`}>Preview</a></Button><Button asChild><a href={`/score/api/admin/reports/${report.id}/download?order=${encodeURIComponent(report.orders.order_reference)}`}>Download</a></Button></> : null}</div></div>)}
          {!reports.length ? <p className="text-sm leading-6 text-mk-muted">No generated reports yet. Essential reports are generated by an authorised MK administrator from a completed, scored assessment.</p> : null}
        </CardContent></Card>
      </div>
    </AdminShell>
  );
}
