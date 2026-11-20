import { CtaLink } from "@/components/website/primitives/CtaLink";
import { ExposureSystem } from "@/components/clarity/ExposureSystem";

export default function HeroSection() {
  return (
    <section
      className="border-b border-mk-line bg-white"
      aria-labelledby="home-hero-heading"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
            Independent fraud risk advisory
          </p>
          <h1
            id="home-hero-heading"
            className="mt-6 max-w-[23ch] text-4xl font-medium leading-[1.25] tracking-normal text-mk-navy sm:text-5xl"
          >
            Turn fraud readiness into a management decision.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-mk-muted">
            We help South African organisations understand where their fraud
            exposure sits, whether existing controls genuinely cover it, and
            what management should address first.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink
              href="/score/start"
              ctaName="assess_your_organisation"
              placement="home_hero"
            >
              Assess your organisation
            </CtaLink>
            <CtaLink
              href="/contact"
              variant="secondary"
              ctaName="speak_to_mk"
              placement="home_hero"
            >
              Speak to MK
            </CtaLink>
          </div>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-mk-muted">
            The assessment is free, and your Snapshot is visible only to your
            organisation.
          </p>
        </div>
        <ExposureSystem />
      </div>
    </section>
  );
}
