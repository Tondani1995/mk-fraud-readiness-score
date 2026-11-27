import { notFound } from "next/navigation";
import Wrapper from "@/components/website/Wrapper";
import NewsletterSignup from "@/components/website/newsletter/NewsletterSignup";
import { NEWSLETTER_ENABLED } from "@/lib/marketing/newsletter-flag";
import { buildPageMetadata } from "@/lib/website/site";

// The website layout streams a loading screen, so notFound() here arrives after a 200 status. While
// the newsletter is disabled the page must therefore also say noindex, or search engines would
// index a soft 404.
export const metadata = {
  ...buildPageMetadata({
    title: "MK Fraud Signals",
    description:
      "MK Fraud Signals is a weekly email from MK Fraud Insights: practitioner-led fraud risk analysis and one practical management consideration for South African organisations.",
    path: "/mk-fraud-signals",
  }),
  ...(NEWSLETTER_ENABLED ? {} : { robots: { index: false, follow: false } }),
};

const issueParts = [
  {
    title: "A practitioner's reading of the week",
    body: "One fraud development that matters to South African organisations, explained by someone who has investigated and controlled it, not summarised from a feed.",
  },
  {
    title: "One management consideration",
    body: "A specific question an executive, audit committee or risk owner can put to their team this week, and what a good answer looks like.",
  },
  {
    title: "Nothing you did not ask for",
    body: "Weekly, short and in plain language. One invitation to related MK work at most. Unsubscribe in one click from any issue.",
  },
];

export default function MkFraudSignalsPage() {
  if (!NEWSLETTER_ENABLED) notFound();

  return (
    <Wrapper>
      <main className="bg-white">
        <section className="bg-mk-navy text-white" aria-labelledby="signals-heading">
          <div className="mk-frame grid gap-10 pb-12 pt-10 sm:pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:py-20">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-paper">MK Fraud Signals</p>
              <h1 id="signals-heading" className="mt-4 max-w-[20ch] text-[2.1rem] font-semibold leading-[1.08] tracking-normal sm:text-5xl lg:text-[3.25rem]">
                Weekly fraud risk analysis for the people who own the controls.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
                A short email each week from MK Fraud Insights on where fraud exposure is moving in South Africa and what
                leadership should ask about it.
              </p>
            </div>
            <div className="rounded-brand border border-white/15 bg-white/[0.04] p-6">
              <NewsletterSignup source="publication_page" tone="dark" heading="Subscribe" />
            </div>
          </div>
        </section>

        <section className="border-t border-mk-line bg-white" aria-labelledby="signals-what-heading">
          <div className="mk-frame py-12 sm:py-16">
            <h2 id="signals-what-heading" className="text-2xl font-semibold leading-tight tracking-normal text-mk-navy sm:text-3xl">What each issue contains</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {issueParts.map((part) => (
                <div key={part.title} className="border-t-2 border-mk-sage pt-5">
                  <h3 className="text-lg font-semibold text-mk-navy">{part.title}</h3>
                  <p className="mt-2 text-[15px] leading-7 text-slate-600">{part.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 max-w-3xl text-[13px] leading-6 text-slate-500">
              Subscribing is entirely optional and is never a condition of using the Fraud Readiness assessment, sending
              an enquiry or buying any MK service. We send MK Fraud Signals only to people who confirm their subscription
              from the email we send them.
            </p>
          </div>
        </section>
      </main>
    </Wrapper>
  );
}
