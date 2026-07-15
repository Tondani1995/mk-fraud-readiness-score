"use client";

import { Target, Users, Shield, Zap, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/website/ui/button";
import { useState } from "react";
import Link from "next/link";

export default function HowWeWorkSection() {
    const [hoveredPrinciple, setHoveredPrinciple] = useState<number | null>(null);

    const principles = [
        {
            icon: Target,
            title: "Practical",
            description: "Grounded in operational reality",
            detail: "We design solutions that work in your actual operating environment, not theoretical ideals.",
        },
        {
            icon: Shield,
            title: "Structured",
            description: "Clear methodology and process",
            detail: "Every engagement follows a defined approach that delivers measurable outcomes.",
        },
        {
            icon: Users,
            title: "Operational",
            description: "Focused on real-world execution",
            detail: "We work where fraud actually happens — in processes, decisions, and frontline operations.",
        },
    ];

    const differentiators = [
        "Not generic frameworks",
        "Not audit checklists",
        "Not theoretical exercises",
        "Not compliance-only solutions",
    ];

    const deliverInstead = [
        "Controls designed for your operations",
        "Solutions tailored to real fraud patterns",
        "Practical playbooks staff can execute",
        "Outcomes aligned to business priorities",
    ];

    return (
        <section className="relative overflow-hidden bg-white">
            <div className="absolute inset-0 -z-10">
                <div className="absolute -left-24 top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                <div className="absolute -right-24 -top-24 h-[520px] w-[520px] rounded-full bg-slate-900/5 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b12240a_1px,transparent_1px),linear-gradient(to_bottom,#0b12240a_1px,transparent_1px)] bg-[size:56px_56px]" />
            </div>

            <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                <div className="mx-auto mb-14 max-w-3xl text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-white px-5 py-2.5 shadow-sm">
                        <Zap className="h-4 w-4 text-[#1d3658]" />
                        <span className="text-sm font-bold uppercase tracking-wide text-[#001030]">
                            Our approach
                        </span>
                    </div>

                    <h2 className="mt-6 text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-5xl">
                        How we work
                    </h2>

                    <p className="mt-4 leading-relaxed text-slate-600">
                        Practical, structured, and grounded in operational reality — not frameworks built for
                        audits.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {principles.map((principle, index) => {
                        const Icon = principle.icon;
                        const isHovered = hoveredPrinciple === index;

                        return (
                            <div
                                key={principle.title}
                                className="group relative"
                                onMouseEnter={() => setHoveredPrinciple(index)}
                                onMouseLeave={() => setHoveredPrinciple(null)}
                            >
                                <div
                                    className={`absolute -inset-1 rounded-3xl bg-[#001030]/10 opacity-0 blur-xl transition-all duration-500 ${isHovered ? "opacity-100" : ""
                                        }`}
                                />
                                <div
                                    className={`relative h-full overflow-hidden rounded-3xl border bg-white p-8 transition-all duration-500 ${isHovered
                                            ? "scale-[1.02] border-[#1d3658]/25 shadow-2xl"
                                            : "border-slate-200 shadow-xl"
                                        }`}
                                >
                                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#001030] shadow-lg transition-transform duration-300 group-hover:rotate-6">
                                        <Icon className="h-8 w-8 text-white" strokeWidth={2.5} />
                                    </div>

                                    <h3 className="text-2xl font-bold leading-tight text-[#001030]">{principle.title}</h3>
                                    <p className="mt-2 text-sm font-semibold text-slate-500">{principle.description}</p>
                                    <p className="mt-4 leading-relaxed text-slate-600">{principle.detail}</p>

                                    <div
                                        className={`absolute bottom-0 left-0 h-1 w-full bg-[#001030] transition-all duration-500 ${isHovered ? "opacity-100" : "opacity-0"
                                            }`}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-14 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
                    <div className="lg:col-span-6">
                        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl lg:p-10">
                            <h3 className="text-2xl font-bold leading-tight text-[#001030]">What sets us apart</h3>
                            <p className="mt-4 leading-relaxed text-slate-600">
                                We don’t rely on off-the-shelf solutions. Our work is tailored to your risk profile
                                and how your teams actually operate.
                            </p>

                            <div className="mt-7 space-y-3">
                                {differentiators.map((item) => (
                                    <div
                                        key={item}
                                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#1d3658]/25 hover:shadow-lg"
                                    >
                                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-100">
                                            <span className="h-2 w-2 rounded-full bg-[#001030]" />
                                        </div>
                                        <span className="font-semibold text-slate-700">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-6">
                        <div className="overflow-hidden rounded-3xl border border-[#001030]/15 bg-[#001030] p-8 shadow-2xl lg:p-10">
                            <div className="flex items-center justify-between gap-6">
                                <h3 className="text-2xl font-bold leading-tight text-white">What we deliver instead</h3>
                                <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex">
                                    <Shield className="h-6 w-6 text-white" strokeWidth={2.5} />
                                </div>
                            </div>

                            <div className="mt-7 space-y-3">
                                {deliverInstead.map((item) => (
                                    <div
                                        key={item}
                                        className="flex items-start gap-3 rounded-2xl border border-white/12 bg-white/5 p-4 backdrop-blur"
                                    >
                                        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                                            <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={3} />
                                        </div>
                                        <span className="font-semibold text-slate-100">{item}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <Link href="/services" className="w-full sm:w-auto">
                                    <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                        View services
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                                <Link href="/contact" className="w-full sm:w-auto">
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                    >
                                        Book a call
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-10 overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-xl lg:p-10">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#001030] shadow-lg">
                            <Shield className="h-6 w-6 text-white" strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-lg font-bold text-[#001030]">Built for operational environments</p>
                            <p className="mt-2 leading-relaxed text-slate-600">
                                We work with leadership and frontline teams to map fraud pathways, strengthen
                                controls, and embed practical prevention measures that function in real business
                                operations — not just on paper.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
