"use client";

import { Button } from "@/components/website/ui/button";
import {
    ArrowRight,
    Shield,
    CheckCircle2,
    Target,
    Users,
    Layers,
    Radar,
    ShieldCheck,
    Star,
    User,
    BrainCircuit,
} from "lucide-react";
import Link from "next/link";

export default function ServicesHero() {
    const principles = [
        { icon: Target, text: "Results-focused fraud interventions" },
        { icon: Users, text: "People-led, operational solutions" },
        { icon: Shield, text: "Practical controls that reduce leakage" },
    ];

    const services = [
        {
            icon: Users,
            title: "Awareness & Resilience",
            description:
                "Enable employees, customers, and suppliers to recognise fraud early and respond with confidence.",
            href: "/services#awareness",
        },
        {
            icon: Radar,
            title: "Fraud Health Check",
            description:
                "Understand where fraud risk exists, how it manifests, and why existing controls fail.",
            href: "/services#health-check",
        },
        {
            icon: ShieldCheck,
            title: "Internal Fraud Controls",
            description:
                "Build practical, fit-for-purpose controls aligned to real operational workflows.",
            href: "/services#controls",
        },
        {
            icon: Layers,
            title: "Fraud Programme Design",
            description:
                "Embed ownership, escalation, and decision support so prevention works day-to-day.",
            href: "/services#programme-design",
        },
        {
            icon: BrainCircuit,
            title: "Threat Intelligence",
            description:
                "Monitor evolving fraud-enabling threats and translate them into current controls, playbooks, and escalation triggers.",
            href: "/services#threat-intelligence",
        },
    ];

    return (
        <section className="relative overflow-hidden bg-[#001030]">
            {/* subtle background texture */}
            <div className="absolute inset-0">
                <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                <div className="absolute -right-32 -bottom-32 h-[640px] w-[640px] rounded-full bg-[#1d3658]/25 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
                    {/* LEFT CONTENT */}
                    <div className="lg:col-span-6 space-y-7">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 backdrop-blur">
                            <Shield className="h-4 w-4 text-white" />
                            <span className="text-sm font-bold uppercase tracking-wide text-white">
                                Services
                            </span>
                        </div>

                        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                            Move from reactive fraud response to
                            <span className="relative ml-2 inline-block">
                                <span className="relative z-10 text-[#c8d6ff]">
                                    Structured Prevention
                                </span>
                                <span className="absolute -bottom-1 left-0 h-2 w-full bg-white/10 blur-sm" />
                            </span>
                        </h1>

                        {/* Client intro copy */}
                        <p className="max-w-xl leading-relaxed text-slate-200">
                            Our services are designed to help organisations move from reactive fraud response to
                            structured, practical fraud risk management.
                        </p>

                        <div className="space-y-4">
                            {principles.map((p, index) => {
                                const Icon = p.icon;
                                return (
                                    <div key={index} className="flex items-center gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10">
                                            <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                                        </div>
                                        <span className="text-base font-semibold text-white sm:text-lg">
                                            {p.text}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Link href="/contact" className="w-full sm:w-auto">
                                <Button className="w-full rounded-xl bg-white px-8 py-6 text-base text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                    Book a strategy call
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>

                            <Link href="#services" className="w-full sm:w-auto">
                                <Button
                                    variant="outline"
                                    className="w-full rounded-xl border-2 border-white/25 bg-transparent px-8 py-6 text-base text-white transition-all duration-300 hover:border-white/40 hover:bg-white/5"
                                >
                                    View services
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                        </div>

                        {/* social proof (no metrics) */}
                        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                            <div className="flex -space-x-2">
                                {[1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#001030] bg-white/10"
                                    >
                                        <User className="h-5 w-5 text-white/80" />
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <Star
                                            key={i}
                                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                                        />
                                    ))}
                                </div>
                                <span className="text-sm font-medium text-slate-300">
                                    Trusted by organisations across South Africa
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL */}
                    <div className="lg:col-span-6 relative" id="services">
                        <div className="absolute -inset-6 rounded-3xl bg-white/5 blur-2xl" />

                        <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-7 backdrop-blur-xl lg:p-9">
                            <div className="mb-6 flex items-center justify-between">
                                <h3 className="text-xl font-bold leading-tight text-white sm:text-2xl">
                                    Services overview
                                </h3>
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                                    <CheckCircle2 className="h-6 w-6 text-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {services.map((s, index) => {
                                    const Icon = s.icon;
                                    const isLastCard = index === services.length - 1;

                                    return (
                                        <Link
                                            key={index}
                                            href={s.href}
                                            className={`rounded-2xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:bg-white/10 ${isLastCard ? "sm:col-span-2" : ""
                                                }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
                                                    <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-white">{s.title}</p>
                                                    <p className="mt-1 text-sm leading-relaxed text-slate-200">
                                                        {s.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>

                            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
                                <p className="text-sm font-semibold text-white">
                                    Designed for operational environments
                                </p>
                                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                                    We focus on where fraud actually happens — inside real workflows, decision points,
                                    and frontline processes.
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
