import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { cleanEnquiryStatus, getAdminPersonalisedEnquiryList, labelForChoice } from '@/lib/admin/personalised-enquiries';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['all', 'received', 'open', 'in_review', 'closed'];

function organisationName(enquiry: any) {
  return enquiry.organisations?.legal_name ?? enquiry.organisations?.trading_name ?? 'Organisation';
}

function respondentName(enquiry: any) {
  return enquiry.respondents?.full_name ?? enquiry.respondents?.email ?? enquiry.requested_by_email ?? 'Respondent';
}

function respondentEmail(enquiry: any) {
  return enquiry.respondents?.email ?? enquiry.requested_by_email ?? 'Email not captured';
}

export default async function AdminPersonalisedEnquiriesPage({ searchParams }: { searchParams?: { status?: string; search?: string } }) {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin']);
  const status = searchParams?.status ?? 'all';
  const search = searchParams?.search ?? '';
  const enquiries = await getAdminPersonalisedEnquiryList({ status, search });

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Commercial workflow"
          title="Personalised enquiries"
          description="Review high-value personalised report enquiries raised from private snapshot pages. These enquiries do not create payment obligations or reports automatically."
        />

        <Card>
          <CardHeader><CardTitle>Enquiry queue</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <form action="/score/admin/enquiries" className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select name="status" defaultValue={status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanEnquiryStatus(option)}</option>)}
              </select>
              <input name="search" defaultValue={search} placeholder="Search enquiry or email" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <Button type="submit">Filter</Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted">
                  <tr><th className="py-2">Enquiry</th><th>Assessment</th><th>Organisation</th><th>Contact</th><th>Reason</th><th>Status</th><th>Updated</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-mk-line">
                  {enquiries.map((enquiry: any) => (
                    <tr key={enquiry.id}>
                      <td className="py-3 font-semibold text-mk-ink">{enquiry.request_reference ?? 'Pending reference'}</td>
                      <td className="py-3 text-mk-muted">{enquiry.assessments?.assessment_reference ?? 'Unlinked'}</td>
                      <td className="py-3 text-mk-muted">{organisationName(enquiry)}</td>
                      <td className="py-3 text-mk-muted">
                        <div className="space-y-1">
                          <p className="font-semibold text-mk-ink">{respondentName(enquiry)}</p>
                          <p>{respondentEmail(enquiry)}</p>
                        </div>
                      </td>
                      <td className="py-3 text-mk-muted">{labelForChoice(enquiry.primary_reason)}</td>
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
            {!enquiries.length ? <p className="text-sm leading-6 text-mk-muted">No personalised enquiries match the current filter.</p> : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
