"use client";

import Wrapper from "@/components/website/Wrapper";
import { MkMark } from "@/components/website/marks/MkMark";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/website/ui/accordion";
import Link from "next/link";

export default function Industries() {
    const industries = [
        {
            key: "retail",
            title: "Retail & Consumer Businesses",
            summary:
                "High-volume transactions create perfect cover for refund abuse, loyalty exploitation, and employee-enabled loss.",
            what: [
                "Refund abuse, returns manipulation, and false claims",
                "Loyalty and rewards programme exploitation",
                "Employee-assisted theft and internal collusion",
            ],
            why: [
                "High transaction volumes mask small but frequent abuse",
                "Frontline staff prioritise customer experience over controls",
                "Limited visibility across channels (in-store, online, customer service)",
            ],
            affects: ["Revenue leakage", "Customer trust", "Staff accountability"],
        },
        {
            key: "logistics",
            title: "Logistics, Distribution & Supply Chains",
            summary:
                "Fraud hides where physical movement and system records don’t reconcile, often across third parties.",
            what: [
                "Ghost deliveries and falsified proof of delivery",
                "Inventory shrinkage and stock diversion",
                "Supplier and employee collusion",
            ],
            why: [
                "Manual processes and third-party operators",
                "Weak reconciliation between movement and system records",
                "Limited oversight across extended supply chains",
            ],
            affects: ["Cost of goods sold", "Operational efficiency", "Supplier relationships"],
        },
        {
            key: "public",
            title: "Public Sector & State-Linked Entities",
            summary:
                "Complex rules, fragmented accountability, and weak consequences create repeatable control failures.",
            what: [
                "Procurement manipulation and bid rigging",
                "Identity misuse and benefit fraud",
                "Asset misappropriation",
            ],
            why: [
                "Complex procurement rules create loopholes",
                "Fragmented accountability and oversight",
                "Limited consequences for control failures",
            ],
            affects: ["Public funds", "Institutional credibility", "Service delivery"],
        },
        {
            key: "utilities",
            title: "Utilities & Infrastructure Providers",
            summary:
                "Legacy environments + large physical networks make monitoring hard and manipulation easy.",
            what: [
                "Meter tampering and usage manipulation",
                "Billing fraud and account interference",
                "Contractor and maintenance collusion",
            ],
            why: [
                "Legacy systems with limited monitoring",
                "Operational focus on continuity over control",
                "Large physical networks that are hard to supervise",
            ],
            affects: ["Revenue assurance", "Infrastructure sustainability", "Customer trust"],
        },
        {
            key: "social",
            title: "Education, Healthcare & Social Services",
            summary:
                "Trust-based models and admin complexity create blind spots for eligibility, claims, and supplier fraud.",
            what: [
                "False claims and eligibility abuse",
                "Procurement and supplier fraud",
                "Identity and access misuse",
            ],
            why: [
                "High administrative complexity",
                "Trust-based operating models",
                "Underinvestment in fraud controls",
            ],
            affects: ["Funding and budgets", "Service quality", "Reputational integrity"],
        },
        {
            key: "digital",
            title: "Digital Platforms & Service Providers",
            summary:
                "Fast growth without matching controls leads to account takeovers, policy abuse, and insider-enabled loss.",
            what: [
                "Account takeovers and identity abuse",
                "Platform manipulation and policy exploitation",
                "Insider-enabled abuse",
            ],
            why: [
                "Rapid scaling without proportional control design",
                "Over-reliance on automated decisioning without oversight",
                "Misalignment between growth and risk management",
            ],
            affects: ["Platform integrity", "User trust", "Regulatory exposure"],
        },
    ];

    const primary =
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-brand px-6 text-[15px] font-semibold transition-colors";
    const lists = (industry: (typeof industries)[number]) => (
        <dl className="grid gap-6 sm:grid-cols-3 sm:gap-8">
            {[
                ["What it looks like", industry.what],
                ["Why it persists", industry.why],
                ["What it affects", industry.affects],
            ].map(([label, items]) => (
                <div key={label as string} className="border-t border-mk-line pt-4">
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">{label as string}</dt>
                    <dd className="mt-3">
                        <ul className="space-y-2.5">
                            {(items as string[]).map((t) => (
                                <li key={t} className="text-[15px] leading-relaxed text-mk-navy">
                                    {t}
                                </li>
                            ))}
                        </ul>
                    </dd>
                </div>
            ))}
        </dl>
    );

    return (
        <Wrapper>
            <div className="bg-white">
                <section className="bg-mk-navy text-white" aria-labelledby="industries-heading">
                    <div className="mk-frame mk-split py-16 lg:items-end lg:py-24">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Industry focus</p>
                            <h1 id="industries-heading" className="mk-display mt-5 max-w-[16ch] font-medium">
                                Fraud risk does not follow industry labels
                            </h1>
                        </div>
                        <div>
                            <p className="mk-measure text-base leading-relaxed text-white/80 sm:text-lg">
                                It follows operational patterns, incentives, and control weaknesses. We focus on how
                                fraud manifests in real operating environments.
                            </p>
                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link href="/contact" className={`${primary} bg-white text-mk-navy hover:bg-mk-surface`}>
                                    Book a strategy call
                                    <MkMark name="arrow" />
                                </Link>
                                <Link href="/services" className={`${primary} border border-white/30 text-white hover:border-white/60`}>
                                    View services
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                <section aria-labelledby="environments-heading">
                    <div className="mk-frame py-16 lg:py-24">
                        <div className="mk-split">
                            <h2 id="environments-heading" className="mk-heading max-w-[18ch] font-medium text-mk-navy">
                                Choose your operating environment
                            </h2>
                            <p className="mk-measure text-base leading-relaxed text-mk-muted lg:pt-2">
                                Across industries, fraud thrives where controls are misaligned with how work
                                actually gets done. We help you identify those gaps and close them practically.
                            </p>
                        </div>

                        {/* Small screens: one environment open at a time. */}
                        <div className="mt-10 lg:hidden">
                            <Accordion type="single" collapsible className="border-b border-mk-line">
                                {industries.map((industry) => (
                                    <AccordionItem key={industry.key} value={industry.key} className="border-t border-mk-line">
                                        <AccordionTrigger className="py-5 text-left hover:no-underline">
                                            <span>
                                                <span className="block text-lg font-semibold text-mk-navy">{industry.title}</span>
                                                <span className="mt-1 block text-sm font-normal leading-relaxed text-mk-muted">
                                                    {industry.summary}
                                                </span>
                                            </span>
                                        </AccordionTrigger>
                                        <AccordionContent className="pb-8">
                                            {lists(industry)}
                                            <Link href="/contact" className="mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-mk-navy underline decoration-mk-line underline-offset-4">
                                                Discuss this risk
                                                <MkMark name="arrow" />
                                            </Link>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>

                        {/* Larger screens: an editorial index, every environment visible at once. */}
                        <div className="mt-16 hidden lg:block">
                            {industries.map((industry) => (
                                <article
                                    key={industry.key}
                                    id={industry.key}
                                    className="mk-split scroll-mt-28 border-t border-mk-line py-10"
                                    aria-labelledby={`${industry.key}-title`}
                                >
                                    <div>
                                        <h3 id={`${industry.key}-title`} className="text-2xl font-medium leading-snug text-mk-navy">
                                            {industry.title}
                                        </h3>
                                        <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-mk-muted">{industry.summary}</p>
                                        <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-mk-navy underline decoration-mk-line underline-offset-4 hover:decoration-mk-navy">
                                            Speak to MK
                                            <MkMark name="arrow" />
                                        </Link>
                                    </div>
                                    {lists(industry)}
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="bg-mk-navy text-white" aria-labelledby="industries-cta">
                    <div className="mk-frame mk-split py-16 lg:items-center lg:py-20">
                        <div>
                            <h2 id="industries-cta" className="mk-heading max-w-[22ch] font-medium">
                                Ready to address fraud risk in your industry?
                            </h2>
                            <p className="mk-measure mt-3 leading-relaxed text-white/80">
                                Speak to MK about how fraud manifests in your operating environment and how
                                we can help you build effective defences.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 lg:justify-end">
                            <Link href="/contact" className={`${primary} bg-white text-mk-navy hover:bg-mk-surface`}>
                                Book a strategy call
                                <MkMark name="arrow" />
                            </Link>
                            <Link href="/services" className={`${primary} border border-white/30 text-white hover:border-white/60`}>
                                Explore services
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </Wrapper>
    );
}
