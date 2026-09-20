import { ExternalLink } from "lucide-react";
import Link from "next/link";
import Wrapper from "@/components/website/Wrapper";
import TrackedLink from "@/components/website/TrackedLink";
import LatestInsightsSection from "@/components/website/insights/LatestInsightsSection";
import { CtaLink } from "@/components/website/primitives/CtaLink";
import { LINKEDIN_URL } from "@/lib/website/site";

export default function Insights() {
    return (
        <Wrapper>
            <main className="bg-white">
                <section className="bg-[#001030] text-white" aria-labelledby="insights-heading">
                    <div className="mx-auto w-full max-w-7xl px-5 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8 lg:py-20">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">Insights</p>
                        <h1 id="insights-heading" className="mt-4 max-w-[18ch] text-[2.1rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.25rem]">
                            Analysis of the fraud risks facing South African organisations.
                        </h1>
                        <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
                            Fraud trends, control weaknesses and practical guidance for leaders managing fraud risk
                            outside the traditional financial sector.
                        </p>
                        <p className="mt-5 text-[15px] leading-7 text-white/70">
                            Working through what AI-enabled fraud means for your controls?{" "}
                            <Link href="/ai-fraud-readiness" className="font-semibold text-[#a9d4ce] underline underline-offset-4 hover:text-white">
                                Read AI Fraud Readiness
                            </Link>
                        </p>
                    </div>
                </section>

                <LatestInsightsSection title="Latest insights" subtitle="Filter by topic, or browse everything MK has published." />

                <section className="border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="insights-follow-heading">
                    <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:px-8">
                        <div>
                            <h2 id="insights-follow-heading" className="text-2xl font-semibold leading-tight tracking-tight text-[#001030] sm:text-3xl">
                                Follow MK on LinkedIn for new analysis.
                            </h2>
                            <p className="mt-3 text-base leading-7 text-slate-600">
                                New articles and commentary are shared there first. If an article raises a question about
                                your own organisation, speak to MK directly.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:flex sm:flex-wrap lg:justify-end">
                            <TrackedLink
                                href={LINKEDIN_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                eventName="social_click"
                                eventParams={{ platform: "linkedin", placement: "insights_follow" }}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#001030] px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#1d3658]"
                            >
                                Follow on LinkedIn <ExternalLink aria-hidden="true" className="h-4 w-4" />
                            </TrackedLink>
                            <CtaLink href="/contact" variant="secondary" ctaName="speak_to_mk" placement="insights_follow">
                                Speak to MK
                            </CtaLink>
                        </div>
                    </div>
                </section>
            </main>
        </Wrapper>
    );
}
