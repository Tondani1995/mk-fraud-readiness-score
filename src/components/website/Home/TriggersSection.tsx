import Link from 'next/link';
import { CtaLink } from '@/components/website/primitives/CtaLink';
import { Eyebrow } from '@/components/website/primitives/Eyebrow';
import { ENGAGEMENT_TRIGGERS } from '@/lib/website/capabilities';

export default function TriggersSection() {
  return (
    <section className="clarity-triggers border-t border-slate-200 bg-mk-paper" aria-labelledby="home-triggers-heading">
      <div className="mx-auto w-full max-w-7xl px-5 py-9 sm:px-6 sm:py-12 lg:px-8 lg:py-10">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <Eyebrow>When to bring MK in</Eyebrow>
            <h2
              id="home-triggers-heading"
              className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-normal text-mk-navy sm:text-4xl lg:text-[2.6rem]"
            >
              Signs it is time to bring in specialist support.
            </h2>
          </div>
          <div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {ENGAGEMENT_TRIGGERS.slice(0, 3).map((trigger) => (
              <li key={trigger} className="flex gap-3 py-3.5 text-[15px] leading-6 text-mk-navy sm:gap-4 sm:py-5 sm:text-base sm:leading-7">
                <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-brand bg-mk-accent sm:mt-[0.7rem]" />
                <span>
                  {trigger}
                  {trigger.startsWith('AI has changed') ? (
                    <>
                      {' '}
                      <Link href="/ai-fraud-readiness" className="font-semibold text-mk-accent underline underline-offset-4 hover:text-mk-navy">
                        AI Fraud Readiness
                      </Link>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <details className="mt-4 border-t border-mk-line py-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-mk-accent">More situations where MK can help</summary>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {ENGAGEMENT_TRIGGERS.slice(3).map((trigger) => (
              <li key={trigger} className="flex gap-3 py-3.5 text-[15px] leading-6 text-mk-navy sm:gap-4 sm:py-5 sm:text-base sm:leading-7">
                <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-brand bg-mk-accent sm:mt-[0.7rem]" />
                <span>
                  {trigger}
                  {trigger.startsWith('AI has changed') ? (
                    <>
                      {' '}
                      <Link href="/ai-fraud-readiness" className="font-semibold text-mk-accent underline underline-offset-4 hover:text-mk-navy">
                        AI Fraud Readiness
                      </Link>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          </details></div>
        </div>

        <div className="mt-10 rounded-panel bg-mk-navy px-4 py-8 text-white min-[360px]:px-5 sm:mt-14 sm:px-10 sm:py-10 lg:mt-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14 lg:py-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">
              Find out where your organisation stands.
            </h2>
            <p className="mt-3 text-base leading-7 text-white/75">
              Start with the free assessment, or talk to MK directly about the question you are trying to answer.
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap lg:mt-0 lg:shrink-0">
            <CtaLink href="/score/start" variant="primaryOnDark" arrow ctaName="assess_your_organisation" placement="home_closing">
              Assess your organisation
            </CtaLink>
            <CtaLink href="/contact" variant="secondaryOnDark" ctaName="speak_to_mk" placement="home_closing">
              Speak to MK
            </CtaLink>
          </div>
        </div>
      </div>
    </section>
  );
}
