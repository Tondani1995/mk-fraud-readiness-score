import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Wrapper from '@/components/website/Wrapper';
import CapabilityDetail from '@/components/website/Services/CapabilityDetail';
import ServicesHero from '@/components/website/Services/ServicesHero';
import { CtaLink } from '@/components/website/primitives/CtaLink';
import { Eyebrow } from '@/components/website/primitives/Eyebrow';
import { CAPABILITIES } from '@/lib/website/capabilities';

export default function ServicesPage() {
  return (
    <Wrapper>
      <main className="bg-white">
        <ServicesHero />
        {CAPABILITIES.map((capability, index) => (
          <CapabilityDetail key={capability.id} capability={capability} tone={index % 2 === 1 ? 'grey' : 'white'} />
        ))}

        <section id="investigation-support" className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="investigation-support-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:px-8 lg:py-20">
            <div>
              <Eyebrow>Investigation support</Eyebrow>
              <h2 id="investigation-support-heading" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl">
                When the work moves beyond advisory.
              </h2>
            </div>
            <div className="space-y-4 text-base leading-7 text-slate-600">
              <p>
                MK can help frame the fraud problem, preserve the management view of what is known, identify the control questions that need to be answered and support the organisation&apos;s response.
              </p>
              <p>
                Where formal investigative or forensic work is required, that work is delivered through specialist investigative partners. This keeps the scope clear: MK remains the fraud strategy and risk adviser while the formal investigation is carried out by the appropriately qualified specialist.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white" aria-labelledby="services-next-heading">
          <div className="mx-auto w-full max-w-7xl px-5 pb-12 pt-10 sm:px-6 sm:pb-20 sm:pt-12 lg:px-8">
            <div className="rounded-[1.5rem] bg-[#001030] px-4 py-8 text-white min-[360px]:px-5 sm:px-10 sm:py-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14 lg:py-12">
              <div className="max-w-xl">
                <h2 id="services-next-heading" className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
                  Not sure which capability fits?
                </h2>
                <p className="mt-3 text-base leading-7 text-white/75">
                  You do not need to begin with Fraud Readiness. Describe the problem in front of you - training, internal fraud, supplier risk, digital or cyber-enabled fraud, AI-enabled fraud, controls, monitoring or something broader - and MK can suggest the sensible point of entry.
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap lg:mt-0 lg:shrink-0">
                <CtaLink href="/score/start" variant="primaryOnDark" arrow ctaName="assess_your_organisation" placement="services_closing">
                  Assess your organisation
                </CtaLink>
                <CtaLink href="/contact" variant="secondaryOnDark" ctaName="speak_to_mk" placement="services_closing">
                  Speak to MK
                </CtaLink>
              </div>
            </div>
            <p className="mt-6 text-[15px] leading-7 text-slate-600">
              Looking for sector context?{' '}
              <Link href="/industries" className="font-semibold text-[#1d3658] underline underline-offset-4 hover:text-[#001030]">
                See how fraud exposure differs by industry
              </Link>
              <ArrowRight aria-hidden="true" className="ml-1 inline h-4 w-4 align-[-2px] text-[#1d3658]" />
            </p>
          </div>
        </section>
      </main>
    </Wrapper>
  );
}
