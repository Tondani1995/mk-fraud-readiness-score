import { headers } from 'next/headers';
import { ResultChrome, ResultFooter } from '@/components/layout/ResultChrome';
import { AdvisoryEnquiryForm } from '@/components/assessment/AdvisoryEnquiryForm';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

export const dynamic = 'force-dynamic';

type AdvisoryPageProps = {
  params: Promise<{ assessmentRef: string }>;
  searchParams?: Promise<{ token?: string }>;
};

function requestOriginFor(requestHeaders: Pick<Headers, 'get'>) {
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) return null;
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function accessMessage(reason: string) {
  switch (reason) {
    case 'missing_token':
      return 'Open this conversation from the private Snapshot link created after you submitted the assessment.';
    case 'rate_limited':
      return 'Too many attempts have been made to open this conversation. Please wait a few minutes and try again.';
    case 'snapshot_not_available':
      return 'Your result is not available yet. Please use the private Snapshot link again shortly.';
    default:
      return 'This private conversation link is no longer valid. Please use the most recent private Snapshot link.';
  }
}

function AccessError({ assessmentRef, reason }: { assessmentRef: string; reason: string }) {
  return (
    <ResultChrome assessmentReference={assessmentRef}>
      <section className="mx-auto max-w-[920px] px-[18px] py-16 md:px-6">
        <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">MK Advisory</p>
        <h1 className="mt-2.5 max-w-[20ch] text-[26px] font-semibold tracking-tight text-mk-navy md:text-[36px]">Private Snapshot link required</h1>
        <p className="mt-4 max-w-[60ch] text-base leading-7 text-mk-slate">{accessMessage(reason)}</p>
        <p className="mt-6 text-[11px] uppercase tracking-[0.14em] text-mk-muted">Assessment reference · {assessmentRef}</p>
      </section>
      <ResultFooter assessmentReference={assessmentRef} />
    </ResultChrome>
  );
}

export default async function AdvisoryPage(props: AdvisoryPageProps) {
  const params = await props.params;
  const search = await props.searchParams;
  const token = search?.token;
  if (!token) return <AccessError assessmentRef={params.assessmentRef} reason="missing_token" />;

  const requestHeaders = await headers();
  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(requestHeaders, 'advisory_page'), ...RATE_LIMITS.assessmentResumePerIp() },
    { key: `advisory_page:ref:${params.assessmentRef}`, ...RATE_LIMITS.assessmentResumePerReference() }
  ]);
  if (!rateLimit.allowed) return <AccessError assessmentRef={params.assessmentRef} reason="rate_limited" />;

  const validation = await validateSnapshotToken({
    assessmentReference: params.assessmentRef,
    rawToken: token,
    ipAddress: requestHeaders.get('x-forwarded-for'),
    consume: false
  });
  if (!validation.ok) return <AccessError assessmentRef={params.assessmentRef} reason={validation.reason} />;

  const snapshot = await loadFreeSnapshotByReference(validation.assessment.assessment_reference, validation.assessment.current_score_run_id);
  if (!snapshot) return <AccessError assessmentRef={params.assessmentRef} reason="snapshot_not_available" />;

  const snapshotPath = `/score/snapshot/${encodeURIComponent(snapshot.assessmentReference)}?token=${encodeURIComponent(token)}`;
  const requestOrigin = requestOriginFor(requestHeaders);
  const publicSnapshotUrl = requestOrigin ? `${requestOrigin}${snapshotPath}` : snapshotPath;

  return (
    <ResultChrome assessmentReference={snapshot.assessmentReference} resultUrl={publicSnapshotUrl}>
      <AdvisoryEnquiryForm
        assessmentReference={snapshot.assessmentReference}
        snapshotToken={token}
        snapshotPath={snapshotPath}
        organisationName={snapshot.organisationName}
        maturity={snapshot.finalMaturity}
        score={snapshot.overallScore}
      />
      <ResultFooter assessmentReference={snapshot.assessmentReference} methodologyLabel="MK Fraud Readiness Methodology" />
    </ResultChrome>
  );
}
