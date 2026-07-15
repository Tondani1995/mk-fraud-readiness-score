"use client";

import {
    Search,
    FileCheck,
    CheckCircle2,
    AlertTriangle,
    Award,
    ArrowRight,
    Sparkles,
    BarChart3,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";
import Link from "next/link";

export default function FraudHealthCheckSection() {
    const whatYouReceive = [
        {
            icon: BarChart3,
            title: "Self health-check score",
            description:
                "Start with the Fraud Readiness Score to see readiness, exposure and priority gaps before a deeper engagement.",
        },
        {
            icon: FileCheck,
            title: "Prioritised fraud risk register",
            description:
                "A clear view of your fraud exposures ranked by impact and likelihood once MK reviews the context.",
        },
        {
            icon: Search,
            title: "Control gap analysis",
            description:
                "Understand where controls are failing, missing, or being bypassed in real workflows.",
        },
        {
            icon: CheckCircle2,
            title: "Practical recommendations",
            description:
                "Actionable steps tailored to your operational environment — not generic frameworks.",
        },
    ];

    const thisIs = [
        "A self-check entry point into a deeper MK Fraud Health Check",
        "Diagnostic and action-oriented",
        "Focused on people, process, exposure and control points",
    ];

    const thisIsNot = [
        "A forensic investigation",
        "A regulatory audit",
        "A guarantee of zero fraud",
    ];

    return (
        <section id="health-check" className="relative overflow-hidden bg-white">
            <div className="absolute inset-0">
                <div className="absolute -left-40 top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/6 blur-3xl" />
                <div className="absolute -right-44 bottom-24 h-[560px] w-[560px] rounded-full bg-blue-500/5 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] bg-[size:56px_56px]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-5 py-2.5 shadow-sm">
                        <Award className="h-4 w-4 text-[#1d3658]" />
                        <span className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                            Health Check Pathway
                        </span>
                        <Sparkles className="h-4 w-4 text-[#1d3658]" />
                    </div>

                    <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#1d3658] sm:text-4xl lg:text-5xl">
                        Fraud Health Check
                    </h2>

                    <p className="mt-4 leading-relaxed text-slate-600">
                        The Fraud Readiness Score is the self health-check entry point. It gives an immediate snapshot first, then helps decide whether the organisation needs a detailed report or a fuller MK Fraud Health Check.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
                    <div className="lg:col-span-7">
                        <div className="mb-6 flex items-end justify-between gap-4">
                            <h3 className="text-2xl font-bold leading-tight text-[#1d3658] sm:text-3xl">
                                What you receive
                            </h3>
                            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm sm:flex">
                                <span className="h-2 w-2 rounded-full bg-[#1d3658]" />
                                Assessment first, advisory after
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {whatYouReceive.map((item, index) => {
                                const Icon = item.icon;
                                return (
                                    <div
                                        key={index}
                                        className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
                                    >
                                        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#1d3658]/5 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />

                                        <div className="flex items-start gap-4">
                                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-[#1d3658]/15 bg-[#1d3658]/5">
                                                <Icon className="h-6 w-6 text-[#1d3658]" strokeWidth={2.5} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-base font-bold leading-tight text-[#1d3658]">
                                                    {item.title}
                                                </h4>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                        <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-[#1d3658]">Outcome</p>
                                        <p className="text-sm leading-relaxed text-slate-600">
                                            You know your score, your exposure context and whether a deeper report or health check is needed.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-4 py-2 text-sm font-semibold text-[#1d3658]">
                                    Self-check first
                                </div>
                            </div>
                            <div className="h-1 w-full bg-[#1d3658]/20" />
                        </div>
                    </div>

                    <div className="lg:col-span-5">
                        <div className="lg:sticky lg:top-8 space-y-5">
                            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                                <div className="border-b border-slate-200 bg-slate-50 p-6">
                                    <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
                                        Clarity
                                    </p>
                                    <h3 className="mt-1 text-2xl font-bold leading-tight text-[#1d3658]">
                                        What this is (and isn&apos;t)
                                    </h3>
                                </div>

                                <div className="p-6">
                                    <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-green-600">
                                                <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={3} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-green-900">This is</p>
                                                <ul className="mt-2 space-y-2">
                                                    {thisIs.map((item, index) => (
                                                        <li key={index} className="flex items-start gap-2 text-sm text-green-900">
                                                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-700" />
                                                            <span className="font-semibold">{item}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                                        <p className="font-bold text-[#1d3658]">This is not</p>
                                        <ul className="mt-2 space-y-2">
                                            {thisIsNot.map((item, index) => (
                                                <li key={index} className="flex items-start gap-2 text-sm text-slate-700">
                                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                                    <span className="font-semibold">{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="mt-6 rounded-2xl border border-[#1d3658]/15 bg-[#1d3658]/5 p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                                <AlertTriangle className="h-5 w-5 text-white" strokeWidth={2.5} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#1d3658]">
                                                    Start with the self health check
                                                </p>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                                                    Complete the Fraud Readiness Score and use the result to decide whether to request the detailed report or broader advisory support.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <Link href="/fraud-readiness-score">
                                                <Button className="w-full rounded-xl bg-[#1d3658] py-6 text-base text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#152a44]">
                                                    <span className="flex items-center justify-center gap-2">
                                                        Start the Assessment
                                                        <ArrowRight className="h-5 w-5" />
                                                    </span>
                                                </Button>
                                            </Link>
                                        </div>

                                        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#1d3658]/15 bg-white p-4">
                                            <div className="mt-0.5 h-2 w-2 rounded-full bg-[#1d3658]" />
                                            <p className="text-sm font-semibold text-slate-700">
                                                The full Health Check remains available when the score shows deeper review is needed.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute bottom-0 left-0 h-px w-full bg-slate-200" />
        </section>
    );
}
