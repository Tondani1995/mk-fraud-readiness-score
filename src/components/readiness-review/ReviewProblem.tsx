import { ReplayError, RulesetIntegrityError } from '@/lib/readiness-review/session';
import { StoreUnavailable } from '@/lib/readiness-review/store';

/**
 * A truthful page for a review that cannot be shown: recorded under a different ruleset, stored in a form that cannot
 * be read, or a build whose ruleset failed its integrity check. Returns null for anything else, which is rethrown.
 */
export function reviewProblem(error: unknown) {
  if (error instanceof ReplayError) {
    return (
      <Problem title="This review was recorded with a different version of the method">
        It is not reinterpreted with the current rules. {error.message}
      </Problem>
    );
  }
  if (error instanceof StoreUnavailable) {
    return <Problem title="This review cannot be read at the moment">{error.message}</Problem>;
  }
  if (error instanceof RulesetIntegrityError) {
    return <Problem title="The review track is unavailable">Its ruleset failed an integrity check, so no review is shown or changed. {error.message}</Problem>;
  }
  return null;
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-review-problem>
      <h1 className="text-2xl font-semibold text-mk-ink">{title}</h1>
      <p className="mt-4 text-base leading-7 text-mk-ink">{children}</p>
    </article>
  );
}
