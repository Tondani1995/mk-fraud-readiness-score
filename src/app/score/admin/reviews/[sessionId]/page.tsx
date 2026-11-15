import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { contactFor } from '@/lib/readiness-review/contacts';
import { snapshotForSession } from '@/lib/readiness-review/service';
import { SnapshotDocument } from '@/components/readiness-review/SnapshotDocument';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = { title: 'Fraud Readiness review' };

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : 'Not yet');

/**
 * MK's console page for one revised review (owner direction, 15 November 2026): who started it, how far they got, the
 * score and the customer's Snapshot, reached straight from the started, completed and stalled emails. The console's own
 * access check applies; the respondent's private link is never shown.
 */
export default async function AdminReviewPage(props: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await props.params;
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) notFound();
  const contact = await contactFor(sessionId).catch(() => null);
  if (!contact) notFound();
  const snapshot = await snapshotForSession(sessionId).catch(() => null);
  const score = snapshot?.view.score;
  const unknown = snapshot ? snapshot.view.waiting.filter((w: any) => w.provenance?.kind === 'respondent-unknown').length : null;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6" data-admin-review={sessionId}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <PageHeader
            eyebrow="Fraud Readiness review"
            title={contact.organisationLabel}
            description={snapshot?.interviewComplete ? 'Completed. The Snapshot below is what the respondent sees.' : 'In progress. The Snapshot below reflects the answers so far.'}
          />
          <Link className="rounded-xl border border-mk-line px-4 py-2 text-sm font-semibold text-mk-ink hover:bg-mk-surface" href="/score/admin/orders">Order controls</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader><CardTitle>Respondent</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-semibold text-mk-ink">{contact.fullName}</p>
              <p><a className="text-mk-navy underline underline-offset-4" href={`mailto:${contact.email}`}>{contact.email}</a></p>
              <p className="text-mk-muted">{contact.roleTitle ?? 'Role not given'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-semibold text-mk-ink">{snapshot?.interviewComplete ? 'Completed' : 'In progress'}</p>
              <p className="text-mk-muted">{snapshot ? `${snapshot.view.status.screensUsed} questions answered` : `${contact.actionCount} actions recorded`}</p>
              <p className="text-mk-muted">Started {when(contact.createdAt)}</p>
              <p className="text-mk-muted">Last activity {when(contact.lastActionAt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Score</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-3xl font-semibold text-mk-ink tabular-nums">{score?.available ? `${score.percent}%` : 'Not yet'}</p>
              {score?.available && <p className="text-mk-muted">{score.counted} of {score.applicable} scenarios counted</p>}
              {unknown !== null && <p className="text-mk-muted">{unknown} answered &ldquo;I don&rsquo;t know&rdquo;</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Report</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-semibold text-mk-ink">{contact.bound ? 'Report requested' : 'No report requested yet'}</p>
              <p className="text-mk-muted">{contact.bound ? 'The order is in Order controls.' : 'Ordering is open from the respondent’s Snapshot once half the scenarios are covered.'}</p>
            </CardContent>
          </Card>
        </div>

        {snapshot ? (
          <div className="rounded-xl border border-mk-line bg-white">
            <SnapshotDocument view={snapshot.view} token="" role="management" ordering="live" customer />
          </div>
        ) : (
          <p className="text-sm text-mk-muted">The Snapshot could not be prepared from the stored answers.</p>
        )}
      </div>
    </AdminShell>
  );
}
