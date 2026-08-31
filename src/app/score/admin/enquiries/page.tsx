import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import {
  cleanEnquiryStatus,
  enquiryContactEmail,
  enquiryContactName,
  enquiryOrganisationName,
  enquiryTypeLabel,
  getAdminPersonalisedEnquiryList,
  labelForChoice
} from '@/lib/admin/personalised-enquiries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['all', 'received', 'open', 'in_review', 'closed'];

/**
 * A public enquiry has no linked organisation or respondent row, so identity is read from the
 * enquiry's own lead columns instead. The shared helpers resolve either shape.
 */
function reasonOrInterest(enquiry: any) {
  return labelForChoice(enquiry.primary_reason ?? enquiry.service_interest);
}

export default async function AdminPersonalisedEnquiriesPage(props: { searchParams?: Promise<{ status?: string; search?: string }> }) {
  const searchParams = await props.searchParams;
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin']);
  const status = searchParams?.status ?? 'all';
  const search = searchParams?.search ?? '';
  const enquiries = await getAdminPersonalisedEnquiryList({ status, search });

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Commercial workflow"
          title="Enquiries"
          description="Every customer enquiry MK receives: MK Advisory raised from a completed assessment, MK Advisory raised publicly before an assessment, general website contact enquiries, and historical personalised report requests. No enquiry creates a payment obligation, an order or a report."
        />

        <Card>
          <CardHeader><CardTitle>Enquiry queue</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <form action="/score/admin/enquiries" className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select name="status" defaultValue={status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanEnquiryStatus(option)}</option>)}
              </select>
              <input name="search" defaultValue={search} placeholder="Search reference, email, name or company" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <Button type="submit">Filter</Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted">
                  <tr><th className="py-2">Enquiry</th><th>Path</th><th>Assessment</th><th>Organisation</th><th>Contact</th><th>Reason / interest</th><th>Status</th><th>Updated</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-mk-line">
                  {enquiries.map((enquiry: any) => (
                    <tr key={enquiry.id}>
                      <td className="py-3 font-semibold text-mk-ink">{enquiry.request_reference ?? 'Pending reference'}</td>
                      <td className="py-3"><Badge>{enquiryTypeLabel(enquiry.request_type, enquiry.assessment_id)}</Badge></td>
                      <td className="py-3 text-mk-muted">{enquiry.assessments?.assessment_reference ?? 'Not linked'}</td>
                      <td className="py-3 text-mk-muted">{enquiryOrganisationName(enquiry)}</td>
                      <td className="py-3 text-mk-muted">
                        <div className="space-y-1">
                          <p className="font-semibold text-mk-ink">{enquiryContactName(enquiry)}</p>
                          <p>{enquiryContactEmail(enquiry)}</p>
                          {enquiry.contact_phone ? <p>{enquiry.contact_phone}</p> : null}
                        </div>
                      </td>
                      <td className="py-3 text-mk-muted">{reasonOrInterest(enquiry)}</td>
                      <td className="py-3"><Badge>{cleanEnquiryStatus(enquiry.status)}</Badge></td>
                      <td className="py-3 text-mk-muted">{new Date(enquiry.updated_at ?? enquiry.created_at).toLocaleDateString('en-ZA')}</td>
                      <td className="py-3 text-right">
                        {enquiry.request_reference ? <Link className="font-semibold text-mk-brassDark" href={`/score/admin/enquiries/${enquiry.request_reference}`}>Open</Link> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!enquiries.length ? <p className="text-sm leading-6 text-mk-muted">No enquiries match the current filter.</p> : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
