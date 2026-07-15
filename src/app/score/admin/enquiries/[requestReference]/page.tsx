import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { cleanEnquiryStatus, getAdminPersonalisedEnquiryDetail, labelForChoice, recordPersonalisedEnquiryOpened } from '@/lib/admin/personalised-enquiries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-mk-ink">{value || 'Not captured'}</p>
    </div>
  );
}

function displayAreas(value: unknown) {
  if (!Array.isArray(value) || !value.length) return 'Not captured';
  return value.map((item) => labelForChoice(String(item))).join(', ');
}

export default async function AdminPersonalisedEnquiryDetailPage({ params }: { params: { requestReference: string } }) {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin']);
  const enquiry = await getAdminPersonalisedEnquiryDetail(params.requestReference);
  if (!enquiry) notFound();

  await recordPersonalisedEnquiryOpened(enquiry, admin);

  const organisation = enquiry.organisations?.legal_name ?? enquiry.organisations?.trading_name ?? 'Organisation';
  const contactName = enquiry.respondents?.full_name ?? enquiry.requested_by_email ?? 'Respondent';
  const contactEmail = enquiry.respondents?.email ?? enquiry.requested_by_email ?? null;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Personalised report enquiry"
          title={enquiry.request_reference}
          description="Review the respondent context and follow-up preference for the high-value personalised report path. No order, payment obligation or report is created automatically."
        />

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Enquiry summary</CardTitle>
              <Badge>{cleanEnquiryStatus(enquiry.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Detail label="Assessment" value={enquiry.assessments?.assessment_reference} />
            <Detail label="Organisation" value={organisation} />
            <Detail label="Contact" value={contactName} />
            <Detail label="Email" value={contactEmail} />
            <Detail label="Primary reason" value={labelForChoice(enquiry.primary_reason)} />
            <Detail label="Preferred contact" value={labelForChoice(enquiry.preferred_contact_method)} />
            <Detail label="Timeframe" value={labelForChoice(enquiry.preferred_consultation_timeframe)} />
            <Detail label="Consent captured" value={enquiry.consent_contact ? 'Yes' : 'No'} />
            <Detail label="Created" value={new Date(enquiry.created_at).toLocaleString('en-ZA')} />
            <div className="md:col-span-3">
              <Detail label="Areas of focus" value={displayAreas(enquiry.areas_of_focus)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Respondent note</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
              {enquiry.notes || 'No additional note was supplied.'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Commercial boundary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-mk-muted">
            <p>This enquiry is a lead for MK follow-up. It does not create a manual EFT order, generate a PDF, unlock a report, trigger customer download or create an automatic payment obligation.</p>
            <p>Use the linked assessment and internal MK process to decide the next commercial step.</p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary"><Link href="/score/admin/enquiries">Back to enquiries</Link></Button>
          {enquiry.assessments?.assessment_reference ? <Button asChild variant="secondary"><Link href={`/score/admin/assessments/${enquiry.assessments.assessment_reference}`}>Open assessment</Link></Button> : null}
        </div>
      </div>
    </AdminShell>
  );
}
