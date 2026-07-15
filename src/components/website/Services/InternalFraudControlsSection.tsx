"use client";

import {
    ShieldCheck,
    AlertTriangle,
    Eye,
    TrendingUp,
    CheckCircle2,
    ArrowRight,
    Lock,
    Settings,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";
import Link from "next/link";
import { useState } from "react";

export default function ControlsMonitoringSection() {
    const [hoveredOutput, setHoveredOutput] = useState<number | null>(null);

    const outputs = [
        {
            icon: ShieldCheck,
            title: "Preventive and detective control design",
            description:
                "Controls that stop fraud before it happens and detect it when prevention fails.",
        },
        {
            icon: Eye,
            title: "Monitoring and escalation logic",
            description:
                "Clear processes for identifying issues and ensuring they reach the right people.",
        },
        {
            icon: TrendingUp,
            title: "Practical control recommendations",
            description:
                "Solutions tailored to your systems and processes — not generic frameworks.",
        },
    ];

    const benefits = [
        {
            title: "Embedded controls",
            description: "Designed for existing systems",
            icon: Settings,
        },
        {
            title: "Clear escalation",
            description: "Issues reach decision-makers",
            icon: AlertTriangle,
        },
        {
            title: "Prevention focus",
            description: "Stop fraud earlier",
            icon: ShieldCheck,
        },
        {
            title: "Operational flow",
            description: "No business slowdown",
            icon: TrendingUp,
        },
    ];

    const deliverables = [
        "Control design documentation",
        "Monitoring framework",
        "Escalation pathways",
        "Implementation guidance",
    ];

    return (
        <section id="controls" className="relative overflow-hidden bg-[#001030]">
            {/* background texture (no gradients) */}
            <div className="absolute inset-0">
                <div className="absolute -left-28 -top-28 h-[560px] w-[560px] rounded-full bg-white/6 blur-3xl" />
                <div className="absolute -right-32 -bottom-32 h-[680px] w-[680px] rounded-full bg-white/5 blur-3xl" />
                <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d3658]/35 blur-3xl" />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />

            <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                {/* Header */}
                <div className="mx-auto mb-14 max-w-3xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-2.5 shadow-lg backdrop-blur-xl">
                        <Lock className="h-4 w-4 text-white/85" />
                        <span className="text-sm font-bold uppercase tracking-wide text-white/90">
                            Service Five
                        </span>
                    </div>

                    <h2 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                        Controls &{" "}
                        <span className="relative inline-block">
                            <span className="relative z-10 text-[#c8d6ff]">Monitoring Design</span>
                            <span className="absolute -bottom-2 left-0 h-3 w-full bg-white/12 blur-sm" />
                        </span>
                    </h2>

                    <p className="mt-6 leading-relaxed text-white/75">
                        Support in designing and embedding fraud controls that work within existing systems and
                        processes.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
                    {/* LEFT: Outputs */}
                    <div className="lg:col-span-7">
                        <div className="mb-6">
                            <h3 className="text-2xl font-bold leading-tight text-white sm:text-3xl">What you receive</h3>
                            <p className="mt-2 leading-relaxed text-white/70">
                                Practical control designs that integrate with your operations without adding
                                unnecessary complexity.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {outputs.map((o, index) => {
                                const Icon = o.icon;
                                const isHovered = hoveredOutput === index;

                                return (
                                    <div
                                        key={o.title}
                                        className="relative"
                                        onMouseEnter={() => setHoveredOutput(index)}
                                        onMouseLeave={() => setHoveredOutput(null)}
                                    >
                                        <div
                                            className={`absolute -inset-0.5 rounded-3xl bg-white/10 blur-2xl transition-opacity duration-500 ${isHovered ? "opacity-70" : "opacity-0"
                                                }`}
                                        />

                                        <div
                                            className={`relative overflow-hidden rounded-3xl border bg-white/5 p-7 shadow-2xl backdrop-blur-xl transition-all duration-500 sm:p-8 ${isHovered
                                                    ? "-translate-y-1 border-white/18 bg-white/8"
                                                    : "border-white/10"
                                                }`}
                                        >
                                            <div
                                                className={`absolute inset-0 opacity-0 transition-opacity duration-500 ${isHovered ? "opacity-100" : ""
                                                    }`}
                                                style={{
                                                    background:
                                                        "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(29,54,88,0.12) 55%, rgba(255,255,255,0.05) 100%)",
                                                }}
                                            />

                                            <div className="relative flex items-start gap-5">
                                                <div
                                                    className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/8 shadow-sm transition-transform duration-500 ${isHovered ? "rotate-6 scale-110" : ""
                                                        }`}
                                                >
                                                    <Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                                                </div>

                                                <div className="min-w-0">
                                                    <h4 className="text-xl font-bold leading-tight text-white">{o.title}</h4>
                                                    <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-base">
                                                        {o.description}
                                                    </p>
                                                </div>
                                            </div>

                                            <div
                                                className={`absolute bottom-0 left-0 h-[3px] w-full bg-white/25 transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"
                                                    }`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur-xl sm:p-8">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10">
                                    <Settings className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <p className="text-base font-bold text-white">Embedded in your systems</p>
                                    <p className="mt-2 text-sm leading-relaxed text-white/75">
                                        We design controls that work inside your existing technology and processes so
                                        they stay practical, adoptable, and sustainable.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Benefits + CTA */}
                    <div className="lg:col-span-5">
                        <div className="lg:sticky lg:top-8 space-y-6">
                            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-xl sm:p-8">
                                <div className="mb-6 flex items-start justify-between gap-6">
                                    <div>
                                        <p className="text-sm font-bold uppercase tracking-wide text-white/75">
                                            Service benefits
                                        </p>
                                        <p className="mt-2 text-2xl font-bold text-white">
                                            Controls designed to work in practice
                                        </p>
                                    </div>
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8">
                                        <Lock className="h-6 w-6 text-white" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {benefits.map((b) => {
                                        const Icon = b.icon;
                                        return (
                                            <div
                                                key={b.title}
                                                className="rounded-2xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/8"
                                            >
                                                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                                                    <Icon className="h-5 w-5 text-white" />
                                                </div>
                                                <p className="text-sm font-bold text-white">{b.title}</p>
                                                <p className="mt-1 text-xs leading-relaxed text-white/70">
                                                    {b.description}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                                    <p className="text-sm font-bold text-white">Deliverables</p>
                                    <div className="mt-4 space-y-3">
                                        {deliverables.map((d) => (
                                            <div key={d} className="flex items-center gap-3">
                                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/12">
                                                    <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={3} />
                                                </div>
                                                <span className="text-sm font-semibold text-white/85">{d}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                                    <p className="text-sm font-bold text-white">Typical timeline</p>
                                    <p className="mt-2 text-3xl font-bold text-white">
                                        6–8 <span className="text-base font-semibold text-white/70">weeks</span>
                                    </p>
                                    <p className="mt-2 text-sm leading-relaxed text-white/70">
                                        From discovery to control design and implementation guidance.
                                    </p>
                                </div>

                                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                    <Link href="/contact" className="w-full">
                                        <Button className="w-full rounded-xl bg-white px-8 py-6 text-base text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-white/90">
                                            <span className="flex items-center justify-center gap-2">
                                                Design your controls
                                                <ArrowRight className="h-5 w-5" />
                                            </span>
                                        </Button>
                                    </Link>
                                    <Link href="/services" className="w-full">
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-xl border-2 border-white/20 bg-transparent px-8 py-6 text-base text-white transition-all duration-300 hover:border-white/35 hover:bg-white/5"
                                        >
                                            View services
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </Link>
                                </div>

                                <p className="mt-5 text-xs leading-relaxed text-white/60">
                                    We focus on controls that teams actually use — aligned to workflows, decision
                                    points, and operational reality.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 h-px w-full bg-white/20" />
        </section>
    );
}
