import Link from "next/link";
import Wrapper from "@/components/website/Wrapper";
import { PublicAdvisoryEnquiryForm } from "@/components/website/FraudReadiness/PublicAdvisoryEnquiryForm";

/**
 * Public, pre-assessment MK Advisory intake.
 *
 * A prospect who chooses Advisory from the storefront has no assessment and therefore no private
 * Snapshot link, so they cannot use /score/advisory/[assessmentRef]. They still belong in the MK
 * Advisory workflow rather than a generic contact form: Advisory is a scoped engagement, and the
 * questions MK needs answered are the same ones the Snapshot Advisory form asks.
 *
 * A prospect who completes an assessment first reaches Advisory through the Snapshot instead, and
 * their assessment context travels with the enquiry automatically.
 */
export default function PublicAdvisoryEnquiryPage() {
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="bg-[#001030]">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                MK Advisory
              </p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                Discuss an Advisory engagement
              </h1>
              <p className="mt-6 text-lg leading-8 text-white/75">
                MK Advisory is scoped and contracted for the work in front of you — it is not
                bought online. Tell us what you are dealing with and we will come to the scoping
                conversation prepared, with a view on approach, effort and fees.
              </p>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
          <div className="grid gap-12 lg:grid-cols-[1.4fr_0.6fr] lg:gap-16">
            <PublicAdvisoryEnquiryForm />

            <aside>
              <h2 className="text-lg font-semibold tracking-tight text-[#001030]">
                What happens next
              </h2>
              <dl className="mt-5 space-y-5">
                <div>
                  <dt className="text-sm font-semibold text-[#001030]">We read it properly</dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-700">
                    Your enquiry goes to MK directly with the context you provide, and you get a
                    reference for it.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[#001030]">A scoping conversation</dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-700">
                    We contact you the way you asked, to understand the work and whether MK is the
                    right fit for it.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[#001030]">Scope, then a proposal</dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-700">
                    Deliverables, timing and fees are agreed in writing before any engagement
                    begins. Nothing is charged for this enquiry.
                  </dd>
                </div>
              </dl>

              <div className="mt-8 border-t border-slate-200 pt-6">
                <p className="text-sm leading-6 text-slate-700">
                  Would a structured read on where you stand help first?
                </p>
                <Link
                  href="/score/start"
                  className="mt-3 inline-flex text-sm font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 transition hover:text-[#1D3658]"
                >
                  Start the Fraud Readiness Assessment
                </Link>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  If you choose Advisory after completing it, MK carries your assessment context
                  into the enquiry automatically.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </Wrapper>
  );
}
