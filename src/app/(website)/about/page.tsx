import { ArrowRight, CheckCircle2, Shield } from "lucide-react";
import Link from "next/link";

import Wrapper from "@/components/website/Wrapper";
import HowWeWorkSection from "@/components/website/About/HowWeWorkSection";
import { Button } from "@/components/website/ui/button";

const focusAreas = [
    "Fraud health checks grounded in real operating environments",
    "Fraud programme design that can be implemented by frontline teams",
    "Awareness and resilience work that helps people spot the warning signs",
    "Controls, playbooks and advisory support aligned to business priorities",
];

export default function About() {
    return (
        <Wrapper>
            <main className="bg-white">
                <section className="relative overflow-hidden bg-[#001030]">
                    <div className="absolute inset-0">
                        <div className="absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                        <div className="absolute -right-28 -bottom-28 h-[640px] w-[640px] rounded-full bg-[#1d3658]/25 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:56px_56px]" />
                    </div>

                    <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                        <div className="mx-auto max-w-3xl text-center">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 shadow-sm backdrop-blur">
                                <Shield className="h-4 w-4 text-white" />
                                <span className="text-sm font-bold uppercase tracking-wide text-white">About us</span>
                            </div>

                            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                                MK Fraud <span className="text-[#c8d6ff]">Insights</span>
                            </h1>

                            <p className="mt-6 leading-relaxed text-slate-200">
                                MK Fraud Insights is a South African fraud risk and strategy consultancy focused on helping organisations build practical fraud capability, reduce leakage and protect customers.
                            </p>

                            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <Link href="/contact" className="w-full sm:w-auto">
                                    <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                        Book a call
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

                <section className="relative overflow-hidden bg-white">
                    <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
                        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
                            <div className="lg:col-span-5">
                                <p className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">Built by practitioners</p>
                                <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl">
                                    Practical fraud support for real operating environments
                                </h2>
                                <p className="mt-5 leading-relaxed text-slate-600">
                                    Our work is designed around what actually happens inside businesses: customer journeys, staff decisions, process gaps, control weaknesses and the fraud methods that exploit them.
                                </p>
                            </div>

                            <div className="lg:col-span-7">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {focusAreas.map((item) => (
                                        <div key={item} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
                                            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#001030]">
                                                <CheckCircle2 className="h-5 w-5 text-white" />
                                            </div>
                                            <p className="font-semibold leading-relaxed text-[#001030]">{item}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <HowWeWorkSection />

                <section className="relative overflow-hidden bg-[#001030]">
                    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
                        <div className="overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur lg:p-12">
                            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
                                <div className="lg:col-span-7">
                                    <h3 className="text-2xl font-bold leading-tight text-white lg:text-3xl">
                                        Ready to strengthen your fraud defences?
                                    </h3>
                                    <p className="mt-3 text-slate-200">
                                        Book a call to discuss how we can help your organisation build practical fraud capability and reduce risk.
                                    </p>
                                </div>
                                <div className="lg:col-span-5 lg:text-right">
                                    <Link href="/contact">
                                        <Button className="rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100">
                                            Book a call
                                            <ArrowRight className="ml-2 h-5 w-5" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </Wrapper>
    );
}
