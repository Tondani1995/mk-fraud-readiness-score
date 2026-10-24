import Link from "next/link";
import { CAPABILITIES } from "@/lib/website/capabilities";

export default function CapabilitiesSection() {
  return (
    <section
      className="clarity-capabilities"
      id="how-we-help"
      aria-labelledby="home-capabilities-heading"
    >
      <div className="clarity-container">
        <div className="section-intro">
          <p className="clarity-eyebrow">03 / HOW WE HELP</p>
          <div>
            <h2 id="home-capabilities-heading">
              The question comes first.
              <br />
              <em>The right support follows.</em>
            </h2>
            <p>
              Four points of entry into a specialist advisory practice. Start
              where your organisation needs clarity.
            </p>
          </div>
        </div>
        <ol className="capability-rows">
          {CAPABILITIES.map((c, i) => (
            <li key={c.id}>
              <Link href={`/services#${c.id}`}>
                <span className="capability-number">0{i + 1}</span>
                <h3>{c.name}</h3>
                <p>{c.question}</p>
                <span className="capability-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="capability-after">
          <p>
            Fraud Readiness is our flagship assessment. Our practice extends to
            strategy, controls, training and ongoing monitoring.
          </p>
          <Link href="/services">Explore the full service portfolio ↗</Link>
        </div>
      </div>
    </section>
  );
}
