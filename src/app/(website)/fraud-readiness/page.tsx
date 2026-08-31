import Link from "next/link";
import Wrapper from "@/components/website/Wrapper";
import { FraudReadinessComparison } from "@/components/website/FraudReadiness/FraudReadinessComparison";
import { FraudReadinessOptions } from "@/components/website/FraudReadiness/FraudReadinessOptions";

/**
 * The Fraud Readiness storefront.
 *
 * A prospect who wants to understand and choose a commercial option before starting an assessment
 * previously had nowhere to do it: the three products only appeared after submission, inside the
 * Snapshot. This page is that missing step, and it is deliberately quiet — a serious buyer
 * evaluating a fraud-risk engagement is not persuaded by decoration.
 */
export default function FraudReadinessPage() {
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="bg-[#001030]">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                Fraud Readiness
              </p>
              <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Choose the depth of fraud-readiness insight your organisation needs.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
                Essential and Comprehensive begin with the Fraud Readiness Assessment and differ in
                how far MK takes the result — from a prioritised diagnosis of where you stand, to a
                designed control environment with an implementation programme. Advisory can be
                discussed with MK directly, whether or not you have assessed yet.
              </p>
              <p className="mt-6 max-w-2xl text-sm leading-7 text-white/70">
                All amounts are in South African Rand. Essential and Comprehensive are confirmed
                after you have completed the assessment and seen your Snapshot; nothing is charged
                before then. If you choose Advisory after completing an assessment, MK carries your
                assessment context into the enquiry automatically.
              </p>
            </div>
          </div>
        </section>

        <div className="py-20 lg:py-24">
          <FraudReadinessOptions />
        </div>

        <div className="bg-slate-50 py-20 lg:py-24">
          <FraudReadinessComparison />
        </div>

        <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-[#001030] sm:text-3xl">
              What every option has in common
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-700">
              The assessment is completed by your organisation and the responses are self-reported.
              MK Fraud Insights analyses what you tell us; for Essential and Comprehensive we do not
              inspect evidence, test whether controls operate in practice, or express an opinion on
              them. Where that depth is required, it is Advisory work and is scoped and contracted
              separately.
            </p>
            <p className="mt-4 text-base leading-7 text-slate-700">
              Responsibility for decisions taken on the basis of any output remains with your
              management.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/score/start"
                className="inline-flex min-h-12 items-center justify-center bg-[#001030] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#1D3658] focus:outline-none focus:ring-2 focus:ring-[#1D3658] focus:ring-offset-2"
              >
                Start the Fraud Readiness Assessment
              </Link>
              <Link
                href="/fraud-readiness-assessment-terms"
                className="inline-flex min-h-12 items-center justify-center px-2 py-3 text-sm font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 transition hover:text-[#1D3658] focus:outline-none focus:ring-2 focus:ring-[#1D3658] focus:ring-offset-2"
              >
                Read the Fraud Readiness Assessment Terms
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Wrapper>
  );
}
