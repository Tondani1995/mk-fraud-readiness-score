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
            <p className="hero-index">01 / SEE WHAT MATTERS</p>
            <h1 id="home-hero-heading">
              See the whole
              <br />
              <em>fraud picture.</em>
            </h1>
            <p className="hero-description">
              Where are you exposed?
              <br />
              Do your controls cover it?
              <br />
              <strong>What should you fix first?</strong>
            </p>
            <p className="hero-support">
              MK brings your organisation’s fraud exposure into one clear
              management view.
            </p>
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
