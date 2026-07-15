"use client";

import Link from "next/link";
import {
    Radar,
    FileText,
    ShieldCheck,
    BookOpen,
    CheckCircle2,
    ArrowRight,
    Sparkles,
    AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";

export default function ThreatIntelligenceSection() {
    const whatYouReceive = [
        {
            icon: Radar,
            title: "Threat-to-Fraud Map",
            description:
                "A ranked view of which external threats are most likely to translate into fraud loss in your specific workflows \u2014 updated as the threat environment shifts.",
        },
        {
            icon: FileText,
            title: "Monthly Threat Intelligence Brief",
            description:
                "A concise briefing on emerging fraud-enabling threats: active pretexts, impersonation trends, and social engineering patterns relevant to your sector.",
        },
        {
            icon: ShieldCheck,
            title: "Verification & Escalation Updates",
            description:
                "Specific changes to verification steps, decision rights, and escalation logic \u2014 tied directly to the threats currently targeting your environment.",
        },
        {
            icon: BookOpen,
            title: "Pretext & Scenario Library",
            description:
                "An updated library of active fraud pretexts and manipulation scripts for use in staff training and escalation playbooks.",
        },
    ];

    const thisIs = [
        "Ongoing monitoring that keeps your fraud controls current",
        "Threat signals translated into operational fraud actions",
        "Early warning that feeds directly into your controls, escalation logic, and training",
    ];

    const thisIsNot = [
        "Executive protection or physical security",
        "A generic threat intelligence subscription",
        "A replacement for your existing fraud programme",
    ];

    return (
        <section id="threat-intelligence" className="relative overflow-hidden bg-white">
            <div className="absolute inset-0">
                <div className="absolute -left-40 top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/6 blur-3xl" />
                <div className="absolute -right-44 bottom-24 h-[560px] w-[560px] rounded-full bg-blue-500/5 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] bg-[size:56px_56px]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                <div className="mx-auto mb-12 max-w-4xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-5 py-2.5 shadow-sm">
                        <Radar className="h-4 w-4 text-[#1d3658]" />
                        <span className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                            Service Two
                        </span>
                        <Sparkles className="h-4 w-4 text-[#1d3658]" />
                    </div>

                    <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#1d3658] sm:text-4xl lg:text-5xl">
                        Threat Intelligence for Fraud
                    </h2>

                    <p className="mt-4 leading-relaxed text-slate-600">
                        Your fraud controls are only as effective as the threats they were built for.
                        As manipulation tactics, impersonation methods, and social engineering scripts
                        evolve, static controls create blind spots &mdash; and losses follow. We monitor
                        the external threat environment relevant to your sector and workflows, and
                        translate emerging signals into updated controls, verification steps, and staff
                        playbooks &mdash; so your fraud programme stays current without starting from
                        scratch.
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
                                Intelligence-led updates
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

                                        <div className="mt-4 h-px w-full bg-slate-100" />
                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-xs font-semibold text-slate-500">
                                                Deliverable
                                            </span>
                                            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform duration-300 group-hover:translate-x-1" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-col gap-4 p-6 sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                        <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-[#1d3658]">Outcome</p>
                                        <p className="text-sm leading-relaxed text-slate-600">
                                            You always know what is being used against organisations like
                                            yours and your controls reflect it.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-4 py-2 text-xs font-semibold text-[#1d3658]">
                                    Ongoing monthly retainer, with an optional 2-week
                                    Threat-to-Fraud Diagnostic Sprint as a starting point.
                                </div>
                            </div>
                            <div className="h-1 w-full bg-[#1d3658]/20" />
                        </div>
                    </div>

                    <div className="lg:col-span-5">
                        <div className="space-y-5 lg:sticky lg:top-8">
                            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                                <div className="border-b border-slate-200 bg-slate-50 p-6">
                                    <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
                                        Threat intelligence fit
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
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
                                                <svg
                                                    className="h-5 w-5 text-slate-600"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                    strokeWidth={3}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M6 18L18 6M6 6l12 12"
                                                    />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="font-bold text-[#1d3658]">This isn&apos;t</p>
                                                <ul className="mt-2 space-y-2">
                                                    {thisIsNot.map((item, index) => (
                                                        <li key={index} className="flex items-start gap-2 text-sm text-slate-700">
                                                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                                            <span className="font-semibold">{item}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 rounded-2xl border border-[#1d3658]/15 bg-[#1d3658]/5 p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                                <AlertTriangle className="h-5 w-5 text-white" strokeWidth={2.5} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#1d3658]">
                                                    Ready to keep your fraud controls current?
                                                </p>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                                                    Let&apos;s translate relevant threat signals into controls,
                                                    verification steps, and staff playbooks that stay current.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <Link href="/contact">
                                                <Button className="w-full rounded-xl bg-[#1d3658] py-6 text-base text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#152a44]">
                                                    <span className="flex items-center justify-center gap-2">
                                                        Discuss Threat Intelligence
                                                        <ArrowRight className="h-5 w-5" />
                                                    </span>
                                                </Button>
                                            </Link>
                                        </div>

                                        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#1d3658]/15 bg-white p-4">
                                            <p className="text-sm font-medium text-slate-700">
                                                Ongoing monthly retainer, with an optional 2-week
                                                Threat-to-Fraud Diagnostic Sprint as a starting point.
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
