"use client";

import {
    Layers,
    Users,
    Shield,
    Target,
    CheckCircle2,
    ArrowRight,
    FileText,
    Sparkles,
    FileCheck,
} from "lucide-react";
import { Button } from "@/components/website/ui/button";

export default function FraudProgrammeDesignSection() {
    const outputs = [
        {
            icon: Layers,
            title: "Fraud strategy and operating model",
            description:
                "Clear direction on how prevention, detection, and response work in your organisation — end to end.",
        },
        {
            icon: Users,
            title: "Roles and accountability definition",
            description:
                "Who owns what, who decides what, and who is accountable — with practical decision rights.",
        },
        {
            icon: Shield,
            title: "Governance and escalation design",
            description:
                "Simple escalation pathways that get issues to the right level, fast — without bureaucracy.",
        },
    ];

    const benefits = [
        "Strategic clarity on fraud priorities",
        "Clear roles and decision rights",
        "Practical governance structure",
        "Escalation pathways that work",
    ];

    const components = [
        "Fraud programme strategy (one-page + detail)",
        "Operating model + RACI (roles / decisions / accountability)",
        "Governance forums, cadence, and reporting",
        "Escalation playbook (triage → route → resolve)",
        "Control ownership & performance measures",
    ];

    return (
        <section id="programme-design" className="relative overflow-hidden bg-white">
            {/* background texture (light + on-brand) */}
            <div className="absolute inset-0">
                <div className="absolute -left-40 top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/6 blur-3xl" />
                <div className="absolute -right-44 bottom-24 h-[560px] w-[560px] rounded-full bg-blue-500/5 blur-3xl" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a08_1px,transparent_1px),linear-gradient(to_bottom,#0f172a08_1px,transparent_1px)] bg-[size:56px_56px]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                {/* header */}
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-5 py-2.5 shadow-sm">
                        <Layers className="h-4 w-4 text-[#1d3658]" />
                        <span className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                            Service Three
                        </span>
                        <Sparkles className="h-4 w-4 text-[#1d3658]" />
                    </div>

                    <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#1d3658] sm:text-4xl lg:text-5xl">
                        Fraud Programme{" "}
                        <span className="relative inline-block">
                            <span className="relative z-10 text-[#1d3658]">Design</span>
                            <span className="absolute -bottom-1 left-0 h-2 w-full bg-[#1d3658]/10 blur-sm" />
                        </span>
                    </h2>

                    <p className="mt-4 leading-relaxed text-slate-600">
                        Design or refresh your fraud strategy, governance model, and operating framework to
                        match your risk exposure and organisational maturity.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
                    {/* LEFT: outputs */}
                    <div className="lg:col-span-7">
                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h3 className="text-2xl font-bold leading-tight text-[#1d3658] sm:text-3xl">Outputs</h3>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                                    A practical programme blueprint — designed to work inside real workflows.
                                </p>
                            </div>

                            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-[#1d3658]" />
                                Built for execution
                            </div>
                        </div>

                        <div className="space-y-4">
                            {outputs.map((item, index) => {
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
                                                <h4 className="text-base font-bold leading-tight text-[#1d3658]">{item.title}</h4>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                                    {item.description}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4 h-px w-full bg-slate-100" />
                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-xs font-semibold text-slate-500">Deliverable</span>
                                            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform duration-300 group-hover:translate-x-1" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* supporting strip */}
                        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                        <FileText className="h-5 w-5 text-white" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-[#1d3658]">Outcome</p>
                                        <p className="text-sm leading-relaxed text-slate-600">
                                            A clear fraud programme you can run — with ownership, governance, and
                                            escalation that actually works.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-[#1d3658]/5 px-4 py-2 text-sm font-semibold text-[#1d3658]">
                                    Typical: 8–10 weeks
                                </div>
                            </div>
                            <div className="h-1 w-full bg-[#1d3658]/20" />
                        </div>
                    </div>

                    {/* RIGHT: benefits + components + CTA */}
                    <div className="lg:col-span-5">
                        <div className="space-y-5 lg:sticky lg:top-8">
                            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                                <div className="border-b border-slate-200 bg-slate-50 p-6">
                                    <p className="text-sm font-bold uppercase tracking-wide text-slate-600">
                                        Programme benefits
                                    </p>
                                    <h3 className="mt-1 text-2xl font-bold leading-tight text-[#1d3658]">
                                        Make fraud ownership real
                                    </h3>
                                </div>

                                <div className="p-6">
                                    <div className="rounded-2xl border border-[#1d3658]/15 bg-[#1d3658]/5 p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                                <Target className="h-5 w-5 text-white" strokeWidth={2.5} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#1d3658]">Designed for operations</p>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                                                    A programme aligned to day-to-day workflows — not a slide deck that
                                                    sits on a shared drive.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-3">
                                        {benefits.map((item, index) => (
                                            <div
                                                key={index}
                                                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                                            >
                                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#1d3658]">
                                                    <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={3} />
                                                </div>
                                                <span className="text-sm font-semibold text-slate-700">{item}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                        <div className="border-b border-slate-200 bg-slate-50 p-5">
                                            <div className="flex items-center gap-3">
                                                <Shield className="h-5 w-5 text-[#1d3658]" />
                                                <span className="text-sm font-bold text-[#1d3658]">
                                                    Programme components
                                                </span>
                                            </div>
                                        </div>
                                        <div className="space-y-3 p-5">
                                            {components.map((item, index) => (
                                                <div key={index} className="flex items-start gap-3">
                                                    <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#1d3658]" />
                                                    <span className="text-sm text-slate-600">{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-6 rounded-2xl border border-[#1d3658]/15 bg-[#1d3658]/5 p-5">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]">
                                                <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-[#1d3658]">Ready to design your programme?</p>
                                                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                                                    We’ll align fraud strategy, ownership, and governance to your operating
                                                    reality.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <Button className="w-full rounded-xl bg-[#1d3658] py-6 text-base text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#152a44]">
                                                <span className="flex items-center justify-center gap-2">
                                                    Design Your Programme
                                                    <ArrowRight className="h-5 w-5" />
                                                </span>
                                            </Button>
                                        </div>

                                        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#1d3658]/15 bg-white p-4">
                                            <div className="mt-0.5 h-2 w-2 rounded-full bg-[#1d3658]" />
                                            <p className="text-sm font-semibold text-slate-700">
                                                Typical timeline: 8–10 weeks from discovery to final programme design.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* small reassurance card */}
                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1d3658]/10">
                                        <FileCheck className="h-5 w-5 text-[#1d3658]" strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-[#1d3658]">Aligned to your maturity</p>
                                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                                            We design what you can realistically run now — and what to evolve next.
                                        </p>
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
