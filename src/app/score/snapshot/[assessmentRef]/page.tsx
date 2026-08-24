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
import { deterministicSnapshotNarrative, loadCachedSnapshotNarrative } from '@/lib/snapshot/narrative';

type SnapshotPageProps = {
  params: Promise<{ assessmentRef: string }>;
  searchParams?: Promise<{ token?: string }>;
};

function requestOriginFor(requestHeaders: Pick<Headers, 'get'>) {
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) return null;
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Customer-facing explanation for a snapshot that cannot be opened.
 *
 * The raw reason was previously printed as "Reason: missing_token", which tells a
 * customer nothing and exposes an internal code. The codes still flow through the
 * component so the branch that produced the failure is unchanged; only what the
 * customer reads is different. Unrecognised reasons fall back to the general message
 * rather than printing whatever string arrived -- validation.reason comes from the
 * token validator and is not a vetted customer string.
 */
function accessMessage(reason: string) {
  switch (reason) {
    case 'missing_token':
      return 'Open your snapshot using the private link we sent you after you submitted the assessment.';
    case 'rate_limited':
      return 'Too many attempts have been made to open this snapshot. Please wait a few minutes and try your private link again.';
    case 'snapshot_not_available':
      return 'Your snapshot is not available yet. If you have just submitted the assessment, please try your private link again shortly.';
    default:
      return 'This snapshot link is no longer valid. Please use the most recent private link we sent you, or request a new one.';
  }
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
            <p className="mt-2">{accessMessage(reason)}</p>
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  );
}

export default async function SnapshotShellPage(props: SnapshotPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const token = searchParams?.token;

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
      assessment_reference: validation.assessment.assessment_reference
    }
  });

  const snapshotUrl = `/score/snapshot/${validation.assessment.assessment_reference}?token=${encodeURIComponent(token)}`;
  const requestOrigin = requestOriginFor(requestHeaders);
  const publicSnapshotUrl = requestOrigin ? `${requestOrigin}${snapshotUrl}` : snapshotUrl;
  const commercialInsights = buildCommercialSnapshotInsights(snapshot);
  // The page never calls a provider. A newly completed assessment gets its single Mini enrichment
  // after submission; reopen/refresh reads the immutable cache and otherwise renders the strong
  // deterministic fallback immediately.
  const snapshotNarrative = await loadCachedSnapshotNarrative(snapshot)
    ?? deterministicSnapshotNarrative(snapshot, commercialInsights, 'snapshot_enrichment_pending');

  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Free readiness snapshot"
        title="Your Fraud Readiness Snapshot"
        description="This view is loaded from the persisted score run and can be safely refreshed without recalculating or unlocking the assessment."
      />
      <FreeSnapshotCard snapshot={snapshot} snapshotUrl={publicSnapshotUrl} commercialInsights={commercialInsights} snapshotNarrative={snapshotNarrative} />
    </SectionShell>
  );
}
