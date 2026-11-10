import { notFound } from 'next/navigation';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { ReviewStartForm } from '@/components/readiness-review/ReviewStartForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Start a fictional review' };

export default function ReviewStartPage() {
  if (!reviewHarnessStatus().enabled) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-review-start>
      <p className="clarity-eyebrow">Fraud Readiness review</p>
      <h1 className="mt-3 text-3xl font-semibold text-mk-ink">How the review works</h1>
      <div className="mt-6 space-y-4 text-base leading-7 text-mk-ink">
        <p>
          The review has two stages. In the first, one person answers for the organisation in an interview of at most 95 screens. The interview establishes which fraud exposures apply
          and asks directly about the controls that matter most for them. Where that person does not know an answer, the question goes to the function that would know.
        </p>
        <p>
          The first stage ends with a Snapshot. It lists the gaps the organisation reported, the questions waiting for an owner, the material scenarios that are still open and the
          evidence an MK reviewer would need to see. It contains no score and makes no prediction about controls that were not asked.
        </p>
        <p>
          In the second stage, accountable functions answer their own questions outside the 95-screen limit, an MK reviewer can record evidence and conclusions against each answer, and
          management sees what needs an answer, evidence or remediation and who acts next. The review is complete only when an authorised MK reviewer has concluded on scope, evidence and
          findings, and the conditions for that are still a proposal awaiting MK approval.
        </p>
      </div>
      <h2 className="mt-10 text-xl font-semibold text-mk-ink">Start a fictional review</h2>
      <p className="mt-2 text-sm leading-6 text-mk-muted">
        This candidate runs on a fictional local harness for MK&rsquo;s inspection. Use an invented organisation and invented answers only.
      </p>
      <ReviewStartForm />
    </article>
  );
}
