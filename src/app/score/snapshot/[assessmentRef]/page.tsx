import { headers } from 'next/headers';
import { ResultChrome, ResultFooter } from '@/components/layout/ResultChrome';
import { SnapshotResult } from '@/components/assessment/SnapshotResult';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { buildCommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { buildCachedSnapshotNarrative } from '@/lib/snapshot/narrative-cache';

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
      return 'Open your result using the private link we sent you after you submitted the assessment.';
    case 'rate_limited':
      return 'Too many attempts have been made to open this result. Please wait a few minutes and try your private link again.';
    case 'snapshot_not_available':
      return 'Your result is not available yet. If you have just submitted the assessment, please try your private link again shortly.';
    default:
      return 'This result link is no longer valid. Please use the most recent private link we sent you, or request a new one.';
  }
}

function AccessError({ assessmentRef, reason }: { assessmentRef: string; reason: string }) {
  return (
    <ResultChrome assessmentReference={assessmentRef}>
      <section className="mx-auto max-w-[1120px] px-[18px] py-16 md:px-6">
        <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">Private result</p>
        <h1 className="mt-2.5 max-w-[20ch] text-[26px] font-semibold tracking-tight text-mk-navy md:text-[36px]">
          Private result link required
        </h1>
        <p className="mt-4 max-w-[60ch] text-base leading-7 text-mk-slate">{accessMessage(reason)}</p>
        <p className="mt-6 text-[11px] uppercase tracking-[0.14em] text-mk-muted">Assessment reference · {assessmentRef}</p>
      </section>
      <ResultFooter assessmentReference={assessmentRef} />
    </ResultChrome>
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
  const snapshotNarrative = await buildCachedSnapshotNarrative({ snapshot, insights: commercialInsights });
  // Only a persisted version identifier is shown. Where the run carries no graph version the
  // method line omits it rather than inventing one.
  const methodologyVersion = snapshot.adaptiveMetrics?.graphVersion ?? null;

  return (
    <ResultChrome assessmentReference={snapshot.assessmentReference} resultUrl={publicSnapshotUrl}>
      <SnapshotResult
        snapshot={snapshot}
        snapshotUrl={publicSnapshotUrl}
        commercialInsights={commercialInsights}
        snapshotNarrative={snapshotNarrative}
        methodologyVersion={methodologyVersion}
      />
      <ResultFooter assessmentReference={snapshot.assessmentReference} methodologyVersion={methodologyVersion} />
    </ResultChrome>
  );
}
