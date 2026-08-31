import Link from "next/link";
import Wrapper from "@/components/website/Wrapper";
import { FRAUD_READINESS_TERMS_SECTIONS } from "@/lib/legal/fraud-readiness-terms-content";
import {
  FRAUD_READINESS_TERMS_VERSION,
  PRIVACY_NOTICE_PATH,
  PRIVACY_NOTICE_VERSION,
} from "@/lib/legal/fraud-readiness-terms";

/**
 * The assessment-specific terms, presented as a document rather than an interface.
 *
 * No accordion: a person reading terms before accepting them needs to be able to read straight
 * through, search the page and print it. Collapsing clauses behind triggers is a pattern that
 * suits marketing FAQs and works against informed acceptance.
 */
export default function FraudReadinessAssessmentTermsPage() {
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="bg-[#001030]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                Legal
              </p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                Fraud Readiness Assessment Terms
              </h1>
              <p className="mt-6 text-base leading-7 text-white/75">
                These terms govern the MK Fraud Insights Fraud Readiness
                Assessment and the Snapshot, Essential and Comprehensive outputs
                prepared from it. They are accepted before an assessment is
                created.
              </p>
              <p className="mt-6 text-sm leading-6 text-white/60">
                Version {FRAUD_READINESS_TERMS_VERSION} · Read together with the{" "}
                <Link
                  href={PRIVACY_NOTICE_PATH}
                  className="font-semibold text-white underline underline-offset-4 hover:text-white/80"
                >
                  Privacy Notice
                </Link>{" "}
                (version {PRIVACY_NOTICE_VERSION})
              </p>
            </div>
          </div>
        </section>

        {/* Same left edge as the hero: a document that steps inward from its own title reads as
            two unrelated pages. The measure is constrained inside, not by re-centring. */}
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            {/* No document-status panel. LEGAL_REVIEW_STATUS is an internal marker for MK's own
                review workflow: a customer being asked to accept these terms must not be told the
                document they are accepting is unfinished. */}
            <div className="space-y-12">
              {FRAUD_READINESS_TERMS_SECTIONS.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-heading`}
                >
                  <h2
                    id={`${section.id}-heading`}
                    className="border-b border-slate-300 pb-3 text-xl font-semibold tracking-tight text-[#001030] sm:text-2xl"
                  >
                    {section.title}
                  </h2>
                  <div className="mt-6 space-y-7">
                    {section.clauses.map((clause) => (
                      <div key={clause.heading}>
                        <h3 className="text-base font-semibold text-[#001030]">
                          {clause.heading}
                        </h3>
                        {clause.paragraphs.map((paragraph) => (
                          <p
                            key={paragraph}
                            className="mt-3 text-[15px] leading-7 text-slate-700"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-14 border-t border-slate-300 pt-8">
              <p className="text-sm leading-6 text-slate-700">
                Questions about these terms:{" "}
                <a
                  href="mailto:hello@mkfraud.co.za"
                  className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]"
                >
                  hello@mkfraud.co.za
                </a>
              </p>
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <Link
                  href="/fraud-readiness"
                  className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]"
                >
                  Compare Fraud Readiness options
                </Link>
                <Link
                  href="/terms-of-use"
                  className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]"
                >
                  General Terms of Use
                </Link>
                <Link
                  href={PRIVACY_NOTICE_PATH}
                  className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]"
                >
                  Privacy Notice
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Wrapper>
  );
}
