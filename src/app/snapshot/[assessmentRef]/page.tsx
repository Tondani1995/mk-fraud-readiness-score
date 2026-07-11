import { headers } from 'next/headers';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { FreeSnapshotCard } from '@/components/assessment/FreeSnapshot';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { buildCommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

type SnapshotPageProps = {
  params: { assessmentRef: string };
  searchParams?: { token?: string; embed?: string };
};

function requestOriginFor(requestHeaders: Pick<Headers, 'get'>) {
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) return null;
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function AccessError({ assessmentRef, reason }: { assessmentRef: string; reason: string }) {
  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Free snapshot access"
        title="Private snapshot link required"
        description="The free snapshot can only be opened from the private snapshot link issued after assessment submission."
      />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Assessment reference</CardTitle>
            <Badge>{assessmentRef}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
            <p className="font-semibold">Snapshot cannot be opened.</p>
            <p className="mt-2">Reason: {reason}. Use the private snapshot link created after the assessment was submitted.</p>
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  );
}

export default async function SnapshotShellPage({ params, searchParams }: SnapshotPageProps) {
  const token = searchParams?.token;
  const embedded = searchParams?.embed === '1';

  if (!token) return <AccessError assessmentRef={params.assessmentRef} reason="missing_token" />;

  const requestHeaders = await headers();
  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(requestHeaders, 'snapshot_page'), ...RATE_LIMITS.assessmentResumePerIp() },
    { key: `snapshot_page:ref:${params.assessmentRef}`, ...RATE_LIMITS.assessmentResumePerReference() }
  ]);

  if (!rateLimit.allowed) return <AccessError assessmentRef={params.assessmentRef} reason="rate_limited" />;

  const validation = await validateSnapshotToken({
    assessmentReference: params.assessmentRef,
    rawToken: token,
    ipAddress: requestHeaders.get('x-forwarded-for'),
    consume: false
  });

  if (!validation.ok) return <AccessError assessmentRef={params.assessmentRef} reason={validation.reason} />;

  const snapshot = await loadFreeSnapshotByReference(
    validation.assessment.assessment_reference,
    validation.assessment.current_score_run_id
  );

  if (!snapshot) return <AccessError assessmentRef={params.assessmentRef} reason="snapshot_not_available" />;

  await trackAssessmentEvent({
    eventType: 'snapshot_viewed',
    assessmentId: validation.assessment.id,
    organisationId: validation.assessment.organisation_id,
    respondentId: validation.assessment.primary_respondent_id,
    metadata: {
      assessment_reference: validation.assessment.assessment_reference,
      embedded
    }
  });

  const snapshotUrl = `/score/snapshot/${validation.assessment.assessment_reference}?token=${encodeURIComponent(token)}${embedded ? '&embed=1' : ''}`;
  const requestOrigin = requestOriginFor(requestHeaders);
  const publicSnapshotUrl = requestOrigin ? `${requestOrigin}${snapshotUrl}` : snapshotUrl;
  const commercialInsights = buildCommercialSnapshotInsights(snapshot);

  return (
    <SectionShell className={embedded ? 'py-0' : 'py-12'}>
      {!embedded ? (
        <PageHeader
          eyebrow="Free readiness snapshot"
          title="Your Fraud Readiness Snapshot"
          description="This view is loaded from the persisted score run and can be safely refreshed without recalculating or unlocking the assessment."
        />
      ) : null}
      <FreeSnapshotCard snapshot={snapshot} snapshotUrl={publicSnapshotUrl} commercialInsights={commercialInsights} />
    </SectionShell>
  );
}
