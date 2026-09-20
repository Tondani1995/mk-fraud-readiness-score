import { CtaLink } from '@/components/website/primitives/CtaLink';

const managementQuestions = [
  'Where does our fraud exposure actually sit?',
  'Do the controls we have genuinely cover it?',
  'What should we fix first?'
];

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#001030] text-white" aria-labelledby="home-hero-heading">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(169,212,206,0.14),transparent_40%)]"
      />
      <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">
            Independent fraud risk advisory
          </p>
          <h1
            id="home-hero-heading"
            className="mt-4 max-w-[15ch] text-[2.15rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.9rem]"
          >
            Turn fraud readiness into a management decision.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
            We help organisations identify where fraud exposure sits, determine whether existing controls actually
            cover it, and decide what to fix first.
          </p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
            <CtaLink href="/score/start" variant="primaryOnDark" arrow ctaName="assess_your_organisation" placement="home_hero">
              Assess your organisation
            </CtaLink>
            <CtaLink href="/contact" variant="secondaryOnDark" ctaName="speak_to_mk" placement="home_hero">
              Speak to MK
            </CtaLink>
          </div>
        </div>

        <div className="hidden min-w-0 lg:block">
          <div className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Three questions leadership should be able to answer
            </p>
            <ol className="mt-6 divide-y divide-white/10">
              {managementQuestions.map((question, index) => (
                <li key={question} className="flex gap-5 py-5 first:pt-0 last:pb-0">
                  <span className="mt-1 text-sm font-semibold tabular-nums text-[#a9d4ce]">0{index + 1}</span>
                  <span className="text-xl font-medium leading-snug text-white">{question}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
