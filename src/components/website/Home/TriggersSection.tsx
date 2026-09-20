import Link from 'next/link';
import { CtaLink } from '@/components/website/primitives/CtaLink';
import { Eyebrow } from '@/components/website/primitives/Eyebrow';
import { ENGAGEMENT_TRIGGERS } from '@/lib/website/capabilities';

export default function TriggersSection() {
  return (
    <section className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="home-triggers-heading">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <Eyebrow>When to bring MK in</Eyebrow>
            <h2
              id="home-triggers-heading"
              className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-[2.6rem]"
            >
              Signs it is time to bring in specialist support.
            </h2>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200">
            {ENGAGEMENT_TRIGGERS.map((trigger) => (
              <li key={trigger} className="flex gap-3 py-3.5 text-[15px] leading-6 text-[#001030] sm:gap-4 sm:py-5 sm:text-base sm:leading-7">
                <span aria-hidden="true" className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1d3658] sm:mt-[0.7rem]" />
                <span>
                  {trigger}
                  {trigger.startsWith('AI has changed') ? (
                    <>
                      {' '}
                      <Link href="/ai-fraud-readiness" className="font-semibold text-[#1d3658] underline underline-offset-4 hover:text-[#001030]">
                        AI Fraud Readiness
                      </Link>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 rounded-[1.5rem] bg-[#001030] px-4 py-8 text-white min-[360px]:px-5 sm:mt-14 sm:px-10 sm:py-10 lg:mt-20 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14 lg:py-14">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
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
