import { CtaLink } from "@/components/website/primitives/CtaLink";
import { ExposureSystem } from "@/components/clarity/ExposureSystem";

export default function HeroSection() {
  return (
    <section className="clarity-hero" aria-labelledby="home-hero-heading">
      <div className="clarity-container">
        <div className="hero-kicker">
          <span className="clarity-eyebrow">
            <i /> INDEPENDENT FRAUD RISK ADVISORY
          </span>
          <span className="hero-location">
            SOUTH AFRICA · A MANAGEMENT PERSPECTIVE
          </span>
        </div>
        <div className="hero-composition">
          <div className="hero-copy">
            <p className="hero-index">01 / EXPOSURE. READINESS. DECISIONS.</p>
            <h1 id="home-hero-heading">
              <span>Turn fraud readiness</span>
              <span className="headline-emphasis">into a management decision.</span>
            </h1>
            <p className="hero-description">Understand your fraud exposure. Evaluate whether your controls cover it. Decide what management should prioritise.</p>
            <p className="hero-support">Specialist fraud risk advisory for South African organisations.</p>
            <div className="hero-actions">
              <CtaLink
                href="/score/start"
                ctaName="assess_your_organisation"
                placement="home_hero"
                arrow
              >
                Assess your organisation
              </CtaLink>
              <CtaLink
                href="/contact"
                variant="secondary"
                ctaName="speak_to_mk"
                placement="home_hero"
              >
                Speak to MK ↗
              </CtaLink>
            </div>
            <p className="hero-footnote">
              Free assessment. Private Snapshot. An informed next step.
            </p>
          </div>
          <ExposureSystem />
        </div>
        <div className="hero-bottom">
          <span>EXPOSURE, CONTROLS & ACCOUNTABILITY</span>
          <a href="#home-problem-heading">
            A different perspective on readiness{" "}
            <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
