import { notFound } from 'next/navigation';
import { reviewEngineBuild, reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { reviewStoreKind } from '@/lib/readiness-review/database-config';
import { ReviewStartForm } from '@/components/readiness-review/ReviewStartForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Start a fictional review' };

export default function ReviewStartPage() {
  if (!reviewHarnessStatus().enabled) notFound();
  // Copy follows the build a new session will use: build 1.6 runs in stages with no screen limit; build 1.5 keeps its 95.
  const staged = reviewEngineBuild() === '1.6';
  const database = reviewStoreKind() === 'database';
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-review-start>
      <p className="clarity-eyebrow">Fraud Readiness review</p>
      <h1 className="mt-3 text-3xl font-semibold text-mk-ink">How the review works</h1>
      <div className="mt-6 space-y-4 text-base leading-7 text-mk-ink">
        <p>
          {staged
            ? 'The review has two parts. In the first, one person answers for the organisation in an interview that runs in stages: a core stage of the confirmations every assessment needs, then a breadth stage of the rest that apply. It can be stopped and resumed, and an area can be handed to the function that owns it. Where that person does not know an answer, the question goes to the function that would know.'
            : 'The review has two stages. In the first, one person answers for the organisation in an interview of at most 95 screens. The interview establishes which fraud exposures apply and asks directly about the controls that matter most for them. Where that person does not know an answer, the question goes to the function that would know.'}
        </p>
        <p>
          {staged
            ? 'The first part ends with a Snapshot. It lists the gaps the organisation reported, the questions waiting for an owner and the material scenarios not yet established. It contains no score and makes no prediction about controls that were not asked.'
            : 'The first stage ends with a Snapshot. It lists the gaps the organisation reported, the questions waiting for an owner and the material scenarios that are still open. It contains no score and makes no prediction about controls that were not asked.'}
        </p>
        <p>
          {staged
            ? 'In the second part, accountable functions answer their own questions on their own pages, and management sees what needs an answer or remediation and who acts next.'
            : 'In the second stage, accountable functions answer their own questions outside the 95-screen limit, and management sees what needs an answer or remediation and who acts next.'}{' '}
          The assessment is complete when the interview is completed and its outstanding information is answered; anything declined, unanswered or not known stays listed as outstanding.
          Whether a report can be issued with information outstanding is an MK commercial decision. Evidence review is not part of the assessment; it is a separate Advisory service.
        </p>
      </div>
      <h2 className="mt-10 text-xl font-semibold text-mk-ink">Start a fictional review</h2>
      <p className="mt-2 text-sm leading-6 text-mk-muted">
        {database
          ? 'This candidate runs on a restricted test deployment with an isolated test database, for MK\u2019s inspection. Use an invented organisation and invented answers only.'
          : 'This candidate runs on a fictional local harness for MK\u2019s inspection. Use an invented organisation and invented answers only.'}
      </p>
      <ReviewStartForm />
    </article>
  );
}
