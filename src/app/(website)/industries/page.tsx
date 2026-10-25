"use client";

import {
    ShoppingCart,
    Truck,
    Building2,
    Zap,
    GraduationCap,
    Globe,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
} from "lucide-react";
import Wrapper from "@/components/website/Wrapper";
import { Button } from "@/components/website/ui/button";
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
            icon: ShoppingCart,
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
            icon: Truck,
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
            icon: Building2,
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
            icon: Zap,
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
            icon: GraduationCap,
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
            icon: Globe,
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

    return (
        <Wrapper>
            <div className="bg-white">
                {/* HERO (dark) */}
                <section className="relative overflow-hidden bg-mk-navy">

                    <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                        <div className="mx-auto max-w-3xl text-center">
                            <div className="inline-flex items-center gap-2 rounded-brand border border-white/15 bg-white/5 px-5 py-2.5 ">
                                <AlertTriangle className="h-4 w-4 text-white" />
                                <span className="text-sm font-semibold uppercase tracking-wide text-white">
                                    Industry focus
                                </span>
                            </div>

                            <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-normal text-white sm:text-4xl lg:text-5xl">
                                Fraud risk does not follow{" "}
                                <span className="relative inline-block">
                                    <span className="relative z-10 text-mk-line">industry labels</span>
                                </span>
                            </h1>

                            <p className="mt-5 leading-relaxed text-slate-200">
                                It follows operational patterns, incentives, and control weaknesses. We focus on how
                                fraud manifests in real operating environments.
                            </p>

                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <Link href="/contact" className="w-full sm:w-auto">
                                    <Button className="w-full rounded-brand bg-white px-8 py-6 text-base font-semibold text-mk-navy shadow-soft transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                        Book a strategy call
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="/services" className="w-full sm:w-auto">
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-brand border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                    >
                                        View services
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CONTENT (light) */}
                <section className="relative overflow-hidden bg-white">

                    <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
                        <div className="mx-auto mb-10 max-w-3xl text-center">
                            <h2 className="text-2xl font-semibold leading-tight tracking-normal text-mk-navy sm:text-3xl">
                                Choose your operating environment
                            </h2>
                            <p className="mt-3 leading-relaxed text-slate-600">
                                On mobile, tap an industry to expand details in-place (no jumping to the bottom).
                            </p>
                        </div>

                        {/* MOBILE: accordion */}
                        <div className="lg:hidden">
                            <Accordion type="single" collapsible className="space-y-4">
                                {industries.map((industry) => {
                                    const Icon = industry.icon;
                                    return (
                                        <AccordionItem
                                            key={industry.key}
                                            value={industry.key}
                                            className="overflow-hidden rounded-brand border border-slate-200 bg-white shadow-soft"
                                        >
                                            <AccordionTrigger className="px-5 py-5 text-left hover:no-underline">
                                                <div className="flex w-full items-start gap-4">
                                                    <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-brand bg-mk-navy">
                                                        <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-base font-semibold text-mk-navy">{industry.title}</p>
                                                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                            {industry.summary}
                                                        </p>
                                                    </div>
                                                </div>
                                            </AccordionTrigger>

                                            <AccordionContent className="px-5 pb-6">
                                                <div className="mt-2 rounded-brand border border-slate-200 bg-slate-50 p-5">
                                                    <div className="space-y-5">
                                                        <div>
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <AlertTriangle className="h-4 w-4 text-mk-navy shrink-0" />
                                                                <p className="text-sm font-semibold text-mk-navy">What it looks like</p>
                                                            </div>
                                                            <ul className="space-y-2">
                                                                {industry.what.map((t) => (
                                                                    <li key={t} className="flex items-start gap-2">
                                                                        <span className="mt-2 h-1.5 w-1.5 rounded-brand bg-mk-navy" />
                                                                        <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>

                                                        <div>
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <AlertTriangle className="h-4 w-4 text-mk-navy shrink-0" />
                                                                <p className="text-sm font-semibold text-mk-navy">Why it persists</p>
                                                            </div>
                                                            <ul className="space-y-2">
                                                                {industry.why.map((t) => (
                                                                    <li key={t} className="flex items-start gap-2">
                                                                        <span className="mt-2 h-1.5 w-1.5 rounded-brand bg-mk-navy" />
                                                                        <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>

                                                        <div>
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <CheckCircle2 className="h-4 w-4 text-mk-navy shrink-0" />
                                                                <p className="text-sm font-semibold text-mk-navy">Affects</p>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {industry.affects.map((t) => (
                                                                    <span
                                                                        key={t}
                                                                        className="rounded-brand border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                                                    >
                                                                        {t}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-3 pt-2">
                                                            <Link href="/contact" className="w-full">
                                                                <Button className="w-full rounded-brand bg-mk-navy py-6 text-base font-semibold text-white hover:bg-mk-navy">
                                                                    Discuss this risk
                                                                    <ArrowRight className="ml-2 h-5 w-5" />
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                        </div>

                        {/* DESKTOP: list + sticky detail (no mobile jump problem) */}
                        <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8">
                            <div className="lg:col-span-5">
                                <div className="space-y-4">
                                    {industries.map((industry) => {
                                        const Icon = industry.icon;
                                        return (
                                            <a
                                                key={industry.key}
                                                href={`#${industry.key}`}
                                                className="group flex items-start gap-4 rounded-brand border border-slate-200 bg-white p-5 shadow-soft transition-all duration-300  hover:border-mk-accent/25 hover:shadow-soft"
                                            >
                                                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-brand bg-mk-navy">
                                                    <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <p className="text-base font-semibold text-mk-navy">{industry.title}</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                        {industry.summary}
                                                    </p>
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 rounded-brand border border-mk-accent/12 bg-white p-6 shadow-soft">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-brand bg-mk-navy">
                                            <CheckCircle2 className="h-6 w-6 text-white" strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <p className="text-lg font-semibold text-mk-navy">Our focus</p>
                                            <p className="mt-1 leading-relaxed text-slate-700">
                                                Across industries, fraud thrives where controls are misaligned with how work
                                                actually gets done. We help you identify those gaps and close them
                                                practically.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-7">
                                <div className="sticky top-24 space-y-5">
                                    {industries.map((industry) => {
                                        const Icon = industry.icon;
                                        return (
                                            <div
                                                key={industry.key}
                                                id={industry.key}
                                                className="scroll-mt-24 rounded-brand border border-slate-200 bg-white p-8 shadow-soft"
                                            >
                                                <div className="flex items-start justify-between gap-6">
                                                    <div className="flex items-start gap-4">
                                                        <div className="mt-0.5 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-brand bg-mk-navy">
                                                            <Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-2xl font-semibold leading-tight text-mk-navy">{industry.title}</h3>
                                                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                                                                {industry.summary}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                                                    <div className="rounded-brand border border-slate-200 bg-slate-50 p-5">
                                                        <p className="mb-3 text-sm font-semibold text-mk-navy">What it looks like</p>
                                                        <ul className="space-y-2">
                                                            {industry.what.map((t) => (
                                                                <li key={t} className="flex items-start gap-2">
                                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-brand bg-mk-navy" />
                                                                    <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div className="rounded-brand border border-slate-200 bg-slate-50 p-5">
                                                        <p className="mb-3 text-sm font-semibold text-mk-navy">Why it persists</p>
                                                        <ul className="space-y-2">
                                                            {industry.why.map((t) => (
                                                                <li key={t} className="flex items-start gap-2">
                                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-brand bg-mk-navy" />
                                                                    <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div className="rounded-brand border border-slate-200 bg-slate-50 p-5">
                                                        <p className="mb-3 text-sm font-semibold text-mk-navy">Affects</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {industry.affects.map((t) => (
                                                                <span
                                                                    key={t}
                                                                    className="rounded-brand border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                                                >
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>

                                                        <div className="mt-5">
                                                            <Link href="/contact">
                                                                <Button className="w-full rounded-brand bg-mk-navy py-6 text-base font-semibold text-white hover:bg-mk-navy">
                                                                    Speak to MK
                                                                    <ArrowRight className="ml-2 h-5 w-5" />
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* CTA (dark) */}
                <section className="relative overflow-hidden bg-mk-navy">

                    <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
                        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
                            <div className="lg:col-span-7">
                                <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
                                    Ready to address fraud risk in your industry?
                                </h2>
                                <p className="mt-3 leading-relaxed text-slate-200">
                                    Speak to MK about how fraud manifests in your operating environment and how
                                    we can help you build effective defences.
                                </p>
                            </div>

                            <div className="lg:col-span-5">
                                <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                                    <Link href="/contact" className="w-full sm:w-auto">
                                        <Button className="w-full rounded-brand bg-white px-8 py-6 text-base font-semibold text-mk-navy shadow-soft transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                            Book a strategy call
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </Link>
                                    <Link href="/services" className="w-full sm:w-auto">
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-brand border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                        >
                                            Explore services
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </Wrapper>
    );
}
