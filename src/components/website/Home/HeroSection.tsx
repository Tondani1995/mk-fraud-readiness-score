import { CtaLink } from '@/components/website/primitives/CtaLink';
export default function HeroSection() {
  return <section className="border-b border-mk-line bg-white" aria-labelledby="home-hero-heading">
    <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">Independent fraud risk advisory</p>
      <div className="mt-7 grid gap-12 lg:grid-cols-[1.25fr_0.8fr] lg:gap-20">
        <div><h1 id="home-hero-heading" className="max-w-[22ch] text-4xl font-medium leading-[1.25] tracking-normal text-mk-navy sm:text-5xl">Turn fraud readiness into a management decision.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-mk-muted">We help South African organisations understand where their fraud exposure sits, whether existing controls genuinely cover it, and what management should address first.</p>
          <div className="mt-8 flex flex-wrap gap-4"><CtaLink href="/score/start" ctaName="assess_your_organisation" placement="home_hero">Assess your organisation</CtaLink><CtaLink href="/contact" variant="secondary" ctaName="speak_to_mk" placement="home_hero">Speak to MK</CtaLink></div>
          <p className="mt-5 text-base leading-relaxed text-mk-muted">The assessment is free, and your Snapshot is visible only to your organisation.</p>
        </div>
        <div className="border-t border-mk-line pt-6 lg:mt-2"><h2 className="text-lg font-medium leading-relaxed text-mk-navy">Three questions leadership should be able to answer</h2><ul className="mt-5 divide-y divide-mk-line text-base leading-relaxed text-mk-muted"><li className="py-4">Where does our fraud exposure actually sit?</li><li className="py-4">Do the controls we have genuinely cover it?</li><li className="py-4">What should we fix first?</li></ul></div>
      </div>
    </div>
  </section>;
}
