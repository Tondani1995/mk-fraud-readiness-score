import Link from 'next/link';

type Links = { organisationLabel: string; sessionId: string; tokens: { respondent: string; management: string; reviewer: string }; functions: { fn: string; slug: string; token: string }[] };

/** Stand-in for invitations and sign-in in the fictional harness. A production service would authenticate each role. */
export function SessionLinks({ view }: { view: Links }) {
  const row = (label: string, href: string, text: string, data: string) => (
    <li className="border-b border-mk-line py-4 last:border-0" data-link={data}>
      <Link href={href} className="font-medium text-mk-navy underline underline-offset-4">{label}</Link>
      <p className="mt-1 text-sm leading-6 text-mk-muted">{text}</p>
    </li>
  );
  return (
    <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6" data-review-links>
      <p className="clarity-eyebrow">Fictional review session</p>
      <h1 className="mt-3 text-3xl font-semibold text-mk-ink">{view.organisationLabel}</h1>
      <p className="mt-4 text-base leading-7 text-mk-ink">
        Each person involved in a review gets a different link. In a production service these would be invitations with sign-in; here they are plain links on this computer, so treat
        them as a way to look at each role, not as security.
      </p>
      <ul className="mt-6 rounded-md border border-mk-line bg-white px-5">
        {row('Respondent: complete the interview', `/review/s/${view.tokens.respondent}`, 'The person who answers for the organisation, within the limit of 95 screens.', 'respondent')}
        {row('Management view', `/review/s/${view.tokens.management}`, 'What needs an answer, evidence or remediation, and who acts next.', 'management')}
        {row('MK reviewer workspace', `/review/s/${view.tokens.reviewer}`, 'Evidence and conclusions recorded against the exact answer version.', 'reviewer')}
      </ul>
      <h2 className="mt-8 text-lg font-semibold text-mk-ink">Accountable functions</h2>
      <p className="mt-2 text-sm leading-6 text-mk-muted">Each function sees only its own questions. A package fills when the respondent answers &ldquo;I don&rsquo;t know&rdquo; or when open questions are sent after the interview.</p>
      <ul className="mt-3 grid gap-x-6 rounded-md border border-mk-line bg-white px-5 sm:grid-cols-2">
        {view.functions.map((f) => (
          <li key={f.slug} className="border-b border-mk-line py-3 sm:[&:nth-last-child(-n+2)]:border-0" data-link={`owner-${f.slug}`}>
            <Link href={`/review/s/${f.token}`} className="text-sm font-medium text-mk-navy underline underline-offset-4">{f.fn}</Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
