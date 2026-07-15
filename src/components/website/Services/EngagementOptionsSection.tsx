"use client";

import {
    Search,
    Radar,
    Layers,
    Users,
    ShieldCheck,
    ArrowRight,
    CheckCircle2,
    Sparkles,
    Calendar,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";
import Link from "next/link";
import { useState } from "react";

export default function EngagementOptionsSection() {
    const [hoveredOption, setHoveredOption] = useState<number | null>(null);

    const options = [
        {
            icon: Search,
            badge: "Starter",
            title: "Fraud Health Check",
            description:
                "Perfect for organisations that need to understand fraud exposure and get a clear action plan.",
            includes: [
                "Complete fraud diagnostic",
                "30/60/90-day action plan",
                "Priority recommendations",
                "Control gap analysis",
            ],
            timeline: "4–6 weeks",
            bestFor: "First step in fraud risk management",
        },
        {
            icon: Radar,
            badge: "Monitor",
            title: "Threat Intelligence for Fraud",
            description:
                "For organisations that need their fraud controls to stay current as threats evolve \u2014 with early warning built into their programme.",
            includes: [
                "Threat-to-Fraud Map for key workflows",
                "Monthly threat intelligence brief",
                "Updated verification and escalation triggers",
                "Quarterly deep-dive workshops",
            ],
            timeline: "Ongoing monthly retainer",
            bestFor: "Organisations that want fraud controls that adapt as threats change",
        },
        {
            icon: Layers,
            badge: "Build",
            title: "Health Check + Programme Design",
            description:
                "For organisations ready to build a comprehensive fraud framework based on diagnostic insights.",
            includes: [
                "Everything in Starter",
                "Fraud programme framework",
                "Governance & operating model",
                "Policies & standards",
                "Metrics & reporting structure",
            ],
            timeline: "12–18 weeks",
            bestFor: "Building lasting fraud capability",
        },
        {
            icon: Users,
            badge: "Enable",
            title: "Awareness & Resilience Enablement",
            description:
                "Targeted enablement for employees, customers, and suppliers to reduce fraud at decision points.",
            includes: [
                "Audience-specific training",
                "Continuous enablement programme",
                "Reporting path integration",
                "Real scenario simulations",
            ],
            timeline: "6–8 weeks",
            bestFor: "Strengthening human defences",
        },
        {
            icon: ShieldCheck,
            badge: "Strengthen",
            title: "Internal Fraud & Procurement Controls",
            description:
                "Strengthen internal and third-party controls without adding operational friction.",
            includes: [
                "Control framework review",
                "Accountability strengthening",
                "Early warning systems",
                "Vendor risk integration",
            ],
            timeline: "6–10 weeks",
            bestFor: "Operational control improvement",
        },
    ];

    return (
        <section className="relative overflow-hidden bg-white">
            {/* Light theme background texture (logo theme, no multi-color gradients) */}
            <div className="absolute inset-0">
                <div className="absolute -left-28 -top-28 h-[560px] w-[560px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                <div className="absolute -right-32 -bottom-32 h-[680px] w-[680px] rounded-full bg-[#1d3658]/6 blur-3xl" />
                <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#001030]/5 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                {/* Header */}
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-5 py-2.5 shadow-sm backdrop-blur-xl">
                        <Sparkles className="h-4 w-4 text-[#1d3658]" />
                        <span className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                            Flexible Engagement
                        </span>
                    </div>

                    <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-5xl">
                        Choose your{" "}
                        <span className="relative inline-block">
                            <span className="relative z-10 text-[#1d3658]">starting point</span>
                            <span className="absolute -bottom-2 left-0 h-3 w-full bg-[#1d3658]/10 blur-sm" />
                        </span>
                    </h2>

                    <p className="mt-6 leading-relaxed text-slate-600">
                        Select the engagement that matches your fraud risk maturity and business priorities.
                        Every option delivers practical outcomes.
                    </p>
                </div>

                {/* Cards */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {options.map((option, index) => {
                        const Icon = option.icon;
                        const isHovered = hoveredOption === index;

                        return (
                            <div
                                key={option.title}
                                className="relative"
                                onMouseEnter={() => setHoveredOption(index)}
                                onMouseLeave={() => setHoveredOption(null)}
                            >
                                <div
                                    className={`absolute -inset-0.5 rounded-3xl bg-[#1d3658]/10 blur-2xl transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"
                                        }`}
                                />

                                <div
                                    className={`relative h-full overflow-hidden rounded-3xl border bg-white p-7 shadow-xl transition-all duration-500 sm:p-8 ${isHovered
                                            ? "-translate-y-1 border-[#1d3658]/25 shadow-2xl"
                                            : "border-slate-200"
                                        }`}
                                >
                                    {/* subtle hover wash */}
                                    <div
                                        className={`absolute inset-0 opacity-0 transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"
                                            }`}
                                        style={{
                                            background:
                                                "linear-gradient(135deg, rgba(29,54,88,0.06) 0%, rgba(0,16,48,0.04) 60%, rgba(29,54,88,0.05) 100%)",
                                        }}
                                    />

                                    <div className="relative">
                                        <div className="mb-6 flex items-start justify-between gap-6">
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[#1d3658]/15 bg-[#1d3658]/5">
                                                    <Icon
                                                        className="h-7 w-7 text-[#1d3658]"
                                                        strokeWidth={2.5}
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold uppercase tracking-wide text-[#1d3658]/70">
                                                        {option.badge}
                                                    </p>
                                                    <h3 className="mt-1 text-2xl font-bold leading-tight text-[#001030]">
                                                        {option.title}
                                                    </h3>
                                                </div>
                                            </div>

                                            <div className="rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-4 py-1.5">
                                                <span className="text-xs font-bold text-[#1d3658]">
                                                    Option
                                                </span>
                                            </div>
                                        </div>

                                        <p className="mb-6 leading-relaxed text-slate-600">
                                            {option.description}
                                        </p>

                                        <div className="mb-6">
                                            <p className="text-sm font-bold uppercase tracking-wide text-[#1d3658]/80">
                                                What’s included
                                            </p>
                                            <div className="mt-4 space-y-3">
                                                {option.includes.map((item) => (
                                                    <div key={item} className="flex items-start gap-3">
                                                        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#1d3658]/10">
                                                            <CheckCircle2
                                                                className="h-4 w-4 text-[#1d3658]"
                                                                strokeWidth={3}
                                                            />
                                                        </div>
                                                        <span className="text-sm font-semibold text-slate-800">
                                                            {item}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-[#1d3658]" />
                                                    <p className="text-xs font-bold uppercase tracking-wide text-[#1d3658]/80">
                                                        Timeline
                                                    </p>
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                                    {option.timeline}
                                                </p>
                                            </div>

                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                                <div className="flex items-center gap-2">
                                                    <Sparkles className="h-4 w-4 text-[#1d3658]" />
                                                    <p className="text-xs font-bold uppercase tracking-wide text-[#1d3658]/80">
                                                        Best for
                                                    </p>
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                                    {option.bestFor}
                                                </p>
                                            </div>
                                        </div>

                                        <Button className="w-full rounded-xl bg-[#001030] py-6 text-base text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#001030]/90">
                                            <span className="flex items-center justify-center gap-2">
                                                Select this option
                                                <ArrowRight className="h-5 w-5" />
                                            </span>
                                        </Button>

                                        <div
                                            className={`absolute bottom-0 left-0 h-[3px] w-full bg-[#1d3658]/20 transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"
                                                }`}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Helper CTA */}
                <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-8 lg:p-10">
                    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
                        <div>
                            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-4 py-2">
                                <span className="text-sm font-semibold text-[#1d3658]">
                                    Need help choosing?
                                </span>
                            </div>
                            <h3 className="text-2xl font-bold leading-tight text-[#001030] sm:text-3xl">
                                Not sure which option fits your needs?
                            </h3>
                            <p className="mt-4 leading-relaxed text-slate-600">
                                Book a call and we’ll recommend the quickest, highest-impact path based on your
                                operating environment and fraud risk profile.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                            <Link href="/contact" className="w-full sm:w-auto">
                                <Button className="w-full rounded-xl bg-[#001030] px-8 py-6 text-base text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#001030]/90">
                                    <span className="flex items-center justify-center gap-2">
                                        Book a scoping call
                                        <ArrowRight className="h-5 w-5" />
                                    </span>
                                </Button>
                            </Link>

                            <Link href="/services" className="w-full sm:w-auto">
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl border-2 border-[#1d3658]/25 bg-transparent px-8 py-6 text-base text-[#1d3658] transition-all duration-300 hover:border-[#1d3658]/40 hover:bg-[#1d3658]/5"
                                >
                                    View services
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 h-px w-full bg-slate-200" />
        </section>
    );
}
