"use client";

import {
    Users,
    TrendingUp,
    Eye,
    CheckCircle2,
    ArrowRight,
    Lightbulb,
    Shield,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/website/ui/accordion";

export default function FraudAwarenessTrainingSection() {
    /**
     * Logo palette (single-theme, no cyan/blue accents)
     * - Primary: #1d3658
     * - Deep:    #001030
     * - Tints:   derived via opacity
     */
    const focusAreas = [
        {
            icon: Users,
            title: "Frontline awareness",
            description:
                "Helping frontline staff recognise fraud risks they encounter daily and know how to respond.",
        },
        {
            icon: TrendingUp,
            title: "Manager escalation",
            description:
                "Equipping managers to identify patterns, assess risks, and escalate issues effectively.",
        },
        {
            icon: Eye,
            title: "Executive oversight",
            description:
                "Providing executives with visibility into fraud risks and control effectiveness.",
        },
    ];

    const benefits = [
        { title: "Role-specific", description: "Tailored to each level", icon: Users },
        { title: "Practical focus", description: "Real scenarios and risks", icon: Shield },
        { title: "Clear actions", description: "Know what to do next", icon: CheckCircle2 },
        { title: "Ongoing support", description: "Not one-time training", icon: Lightbulb },
    ];

    const approachPoints = [
        "Scenarios based on real fraud patterns",
        "Practical examples from your industry",
        "Clear guidance on what to do and who to tell",
        "Regular reinforcement, not one-time events",
    ];

    const deliverables = [
        "Role-based training materials",
        "Real scenario examples",
        "Escalation guidance",
        "Ongoing reinforcement plan",
    ];

    return (
        <section
            id="awareness"
            className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-50"
        >
            {/* soft background (logo theme only) */}
            <div className="absolute inset-0 -z-10">
                <div className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-[#1d3658]/10 blur-3xl" />
                <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/8 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
            </div>

            <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                {/* header */}
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/20 bg-[#1d3658]/5 px-5 py-2.5 shadow-sm backdrop-blur">
                        <Lightbulb className="h-4 w-4 text-[#1d3658]" />
                        <span className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                            Service Four
                        </span>
                    </div>

                    <h2 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-5xl">
                        Fraud Awareness &{" "}
                        <span className="relative inline-block">
                            <span className="relative z-10 text-[#1d3658]">Training</span>
                            <span className="absolute -bottom-2 left-0 h-3 w-full bg-[#1d3658]/10 blur-sm" />
                        </span>
                    </h2>

                    <p className="leading-relaxed text-slate-600">
                        Practical training that helps staff recognise fraud risks relevant to their roles and
                        environments.
                    </p>
                </div>

                {/* Focus areas */}
                <div className="mb-12">
                    <h3 className="mb-6 text-center text-xl font-bold leading-tight text-[#1d3658] sm:text-2xl">
                        Focus areas
                    </h3>

                    {/* Mobile: accordion */}
                    <div className="md:hidden">
                        <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
                            <Accordion type="single" collapsible className="p-2">
                                {focusAreas.map((area, idx) => {
                                    const Icon = area.icon;
                                    return (
                                        <AccordionItem
                                            key={idx}
                                            value={`focus-${idx}`}
                                            className="mb-2 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-1 last:mb-0"
                                        >
                                            <AccordionTrigger className="py-4 text-left no-underline hover:no-underline">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#001030] shadow-lg">
                                                        <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                    </div>
                                                    <span className="font-bold text-[#001030]">{area.title}</span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-4 text-slate-600">
                                                {area.description}
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                        </div>
                    </div>

                    {/* Desktop: cards */}
                    <div className="hidden md:grid grid-cols-3 gap-6">
                        {focusAreas.map((area, index) => {
                            const Icon = area.icon;
                            return (
                                <div
                                    key={index}
                                    className="group relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
                                >
                                    <div className="absolute -inset-1 rounded-3xl bg-[#1d3658]/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                                    <div className="relative">
                                        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#001030] shadow-lg transition-transform duration-300 group-hover:rotate-6">
                                            <Icon className="h-8 w-8 text-white" strokeWidth={2.5} />
                                        </div>

                                        <h4 className="mb-3 text-2xl font-bold leading-tight text-[#001030]">{area.title}</h4>
                                        <p className="leading-relaxed text-slate-600">{area.description}</p>
                                    </div>
                                    <div className="absolute bottom-0 left-0 h-1 w-full bg-[#1d3658]/15" />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Two column: Approach + Benefits */}
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
                    {/* Approach */}
                    <div className="lg:col-span-7">
                        <div className="relative overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-2xl lg:p-10">
                            <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full bg-[#1d3658]/10 blur-3xl" />
                            <div className="relative">
                                <div className="mb-8 flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-3xl font-bold leading-tight text-[#001030]">Training approach</h3>
                                        <p className="mt-3 leading-relaxed text-slate-600">
                                            Role-based training designed for how fraud actually presents in your operating
                                            environment.
                                        </p>
                                    </div>
                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-[#1d3658]/15 bg-[#1d3658]/5">
                                        <Shield className="h-6 w-6 text-[#1d3658]" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {approachPoints.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-start gap-4 rounded-2xl border-2 border-slate-200 bg-slate-50/60 p-5 transition-all duration-300 hover:border-[#1d3658]/25 hover:bg-white hover:shadow-lg"
                                        >
                                            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#001030]">
                                                <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={3} />
                                            </div>
                                            <p className="font-semibold text-slate-700">{item}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 rounded-2xl border-2 border-[#1d3658]/10 bg-[#1d3658]/5 p-6">
                                    <div className="flex items-start gap-3">
                                        <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1d3658]" />
                                        <div>
                                            <p className="text-sm font-bold text-[#001030]">Relevant to your environment</p>
                                            <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                Training is tailored to the fraud risks present in your specific operations,
                                                not generic content.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Benefits */}
                    <div className="lg:col-span-5">
                        <div className="relative overflow-hidden rounded-3xl border-2 border-[#001030]/10 bg-[#001030] p-8 shadow-2xl lg:p-10">
                            <div className="absolute -left-24 -bottom-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
                            <div className="relative">
                                <div className="mb-7">
                                    <h3 className="text-3xl font-bold leading-tight text-white">Service benefits</h3>
                                    <p className="mt-3 text-white/80">
                                        Staff who can recognise fraud risks and respond appropriately, reducing
                                        successful fraud attempts.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {benefits.map((b, index) => {
                                        const Icon = b.icon;
                                        return (
                                            <div
                                                key={index}
                                                className="rounded-2xl border-2 border-white/15 bg-white/5 p-5 backdrop-blur-sm transition-all duration-300 hover:border-white/25 hover:bg-white/10"
                                            >
                                                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                                                    <Icon className="h-5 w-5 text-white" />
                                                </div>
                                                <p className="text-sm font-bold text-white">{b.title}</p>
                                                <p className="mt-1 text-xs text-white/75">{b.description}</p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 rounded-2xl border-2 border-white/15 bg-white/5 p-6 backdrop-blur-sm">
                                    <p className="text-sm font-bold text-white">Deliverables</p>
                                    <div className="mt-3 space-y-2">
                                        {deliverables.map((item, idx) => (
                                            <div key={idx} className="flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={3} />
                                                <span className="text-sm text-white">{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button className="mt-6 w-full rounded-2xl bg-white px-6 py-6 text-base text-[#001030] shadow-xl transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                    <span className="flex items-center justify-center gap-2">
                                        Start training programme
                                        <ArrowRight className="h-5 w-5" />
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 h-px w-full bg-slate-200" />
        </section>
    );
}
