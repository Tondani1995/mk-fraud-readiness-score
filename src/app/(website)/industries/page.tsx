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
                "Fraud hides where physical movement and system records don’t reconcile — often across third parties.",
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
                <section className="relative overflow-hidden bg-[#001030]">
                    <div className="absolute inset-0">
                        <div className="absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                        <div className="absolute -right-28 -bottom-28 h-[640px] w-[640px] rounded-full bg-[#1d3658]/25 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px]" />
                    </div>

                    <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                        <div className="mx-auto max-w-3xl text-center">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 backdrop-blur">
                                <AlertTriangle className="h-4 w-4 text-white" />
                                <span className="text-sm font-bold uppercase tracking-wide text-white">
                                    Industry focus
                                </span>
                            </div>

                            <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                                Fraud risk does not follow{" "}
                                <span className="relative inline-block">
                                    <span className="relative z-10 text-[#c8d6ff]">industry labels</span>
                                    <span className="absolute -bottom-2 left-0 h-3 w-full bg-white/10 blur-sm" />
                                </span>
                            </h1>

                            <p className="mt-5 leading-relaxed text-slate-200">
                                It follows operational patterns, incentives, and control weaknesses. We focus on how
                                fraud manifests in real operating environments.
                            </p>

                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <Link href="/contact" className="w-full sm:w-auto">
                                    <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                        Book a strategy call
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="/services" className="w-full sm:w-auto">
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
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
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute -left-24 top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute -right-24 bottom-0 h-[560px] w-[560px] rounded-full bg-slate-900/5 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b12240a_1px,transparent_1px),linear-gradient(to_bottom,#0b12240a_1px,transparent_1px)] bg-[size:56px_56px]" />
                    </div>

                    <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
                        <div className="mx-auto mb-10 max-w-3xl text-center">
                            <h2 className="text-2xl font-bold leading-tight tracking-tight text-[#001030] sm:text-3xl">
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
                                            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                                        >
                                            <AccordionTrigger className="px-5 py-5 text-left hover:no-underline">
                                                <div className="flex w-full items-start gap-4">
                                                    <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#001030]">
                                                        <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-base font-bold text-[#001030]">{industry.title}</p>
                                                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                            {industry.summary}
                                                        </p>
                                                    </div>
                                                </div>
                                            </AccordionTrigger>

                                            <AccordionContent className="px-5 pb-6">
                                                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                    <div className="space-y-5">
                                                        <div>
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <AlertTriangle className="h-4 w-4 text-[#001030] shrink-0" />
                                                                <p className="text-sm font-bold text-[#001030]">What it looks like</p>
                                                            </div>
                                                            <ul className="space-y-2">
                                                                {industry.what.map((t) => (
                                                                    <li key={t} className="flex items-start gap-2">
                                                                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#001030]" />
                                                                        <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>

                                                        <div>
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <AlertTriangle className="h-4 w-4 text-[#001030] shrink-0" />
                                                                <p className="text-sm font-bold text-[#001030]">Why it persists</p>
                                                            </div>
                                                            <ul className="space-y-2">
                                                                {industry.why.map((t) => (
                                                                    <li key={t} className="flex items-start gap-2">
                                                                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#001030]" />
                                                                        <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>

                                                        <div>
                                                            <div className="mb-2 flex items-center gap-2">
                                                                <CheckCircle2 className="h-4 w-4 text-[#001030] shrink-0" />
                                                                <p className="text-sm font-bold text-[#001030]">Affects</p>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {industry.affects.map((t) => (
                                                                    <span
                                                                        key={t}
                                                                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                                                    >
                                                                        {t}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-3 pt-2">
                                                            <Link href="/contact" className="w-full">
                                                                <Button className="w-full rounded-xl bg-[#001030] py-6 text-base font-semibold text-white hover:bg-[#0b1b44]">
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
                                                className="group flex items-start gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#1d3658]/25 hover:shadow-lg"
                                            >
                                                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#001030]">
                                                    <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <p className="text-base font-bold text-[#001030]">{industry.title}</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                        {industry.summary}
                                                    </p>
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 rounded-3xl border border-[#1d3658]/12 bg-white p-6 shadow-sm">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#001030]">
                                            <CheckCircle2 className="h-6 w-6 text-white" strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-[#001030]">Our focus</p>
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
                                                className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"
                                            >
                                                <div className="flex items-start justify-between gap-6">
                                                    <div className="flex items-start gap-4">
                                                        <div className="mt-0.5 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#001030]">
                                                            <Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-2xl font-bold leading-tight text-[#001030]">{industry.title}</h3>
                                                            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                                                                {industry.summary}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                        <p className="mb-3 text-sm font-bold text-[#001030]">What it looks like</p>
                                                        <ul className="space-y-2">
                                                            {industry.what.map((t) => (
                                                                <li key={t} className="flex items-start gap-2">
                                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#001030]" />
                                                                    <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                        <p className="mb-3 text-sm font-bold text-[#001030]">Why it persists</p>
                                                        <ul className="space-y-2">
                                                            {industry.why.map((t) => (
                                                                <li key={t} className="flex items-start gap-2">
                                                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#001030]" />
                                                                    <span className="text-sm font-medium text-slate-700">{t}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                        <p className="mb-3 text-sm font-bold text-[#001030]">Affects</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {industry.affects.map((t) => (
                                                                <span
                                                                    key={t}
                                                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                                                >
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>

                                                        <div className="mt-5">
                                                            <Link href="/contact">
                                                                <Button className="w-full rounded-xl bg-[#001030] py-6 text-base font-semibold text-white hover:bg-[#0b1b44]">
                                                                    Book a call
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
                <section className="relative overflow-hidden bg-[#001030]">
                    <div className="absolute inset-0">
                        <div className="absolute -left-28 -bottom-28 h-[640px] w-[640px] rounded-full bg-white/5 blur-3xl" />
                        <div className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/20 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px]" />
                    </div>

                    <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
                        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
                            <div className="lg:col-span-7">
                                <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
                                    Ready to address fraud risk in your industry?
                                </h2>
                                <p className="mt-3 leading-relaxed text-slate-200">
                                    Book a call to discuss how fraud manifests in your operating environment and how
                                    we can help you build effective defences.
                                </p>
                            </div>

                            <div className="lg:col-span-5">
                                <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                                    <Link href="/contact" className="w-full sm:w-auto">
                                        <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                            Book a strategy call
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </Link>
                                    <Link href="/services" className="w-full sm:w-auto">
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
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
