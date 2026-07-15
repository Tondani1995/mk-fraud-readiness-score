"use client";

import { GraduationCap, Map, Layers, ArrowRight, Clock3, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/website/ui/button";

export default function HowItWorksSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const steps = [
    {
      icon: GraduationCap,
      title: "Train & Sensitise",
      description:
        "Targeted fraud awareness for employees, customers, and suppliers - focused on recognition, response, and escalation.",
      timeline: "Weeks 1-2",
      outcomes: ["Role-based training", "Fraud signals & escalation", "Simple playbooks"],
    },
    {
      icon: Map,
      title: "Assess & Map",
      description:
        "Review controls, behaviours, incident patterns, and external threat signals to understand how fraud actually enters your organisation.",
      timeline: "Weeks 3-4",
      outcomes: [
        "Process & control mapping",
        "Threat-to-fraud signals",
        "Exposure hotspots",
        "Prioritised fixes",
      ],
    },
    {
      icon: Layers,
      title: "Build & Embed",
      description:
        "Translate insight and threat intelligence into practical controls, playbooks, and ongoing enablement that support everyday decision-making.",
      timeline: "Month 2-3",
      outcomes: ["Controls that fit ops", "Ownership & accountability", "Ongoing resilience"],
    },
  ];

  return (
    <section className="relative overflow-hidden bg-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -left-28 -top-28 h-[560px] w-[560px] rounded-full bg-[#1d3658]/10 blur-3xl" />
        <div className="absolute -right-28 -bottom-28 h-[560px] w-[560px] rounded-full bg-slate-900/5 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b12240a_1px,transparent_1px),linear-gradient(to_bottom,#0b12240a_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-white px-5 py-2.5 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-[#1d3658]" />
            <span className="text-sm font-bold uppercase tracking-wide text-[#001030]">
              Our Process
            </span>
          </div>

          <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-5xl">
            From awareness to intelligence-led{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-[#1d3658]">fraud resilience</span>
              <span className="absolute -bottom-2 left-0 h-3 w-full bg-[#1d3658]/15 blur-sm" />
            </span>
          </h2>

          <p className="mt-6 leading-relaxed text-slate-600">
            A clear, practical path that turns awareness, insight, and threat intelligence into
            action and embeds fraud resilience into daily operations.
          </p>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link href="/contact" className="w-full sm:w-auto">
              <Button className="w-full rounded-xl bg-[#001030] px-8 py-6 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:scale-[1.03] hover:bg-[#0b1b44]">
                Begin your journey
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/services" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full rounded-xl border-2 border-[#1d3658]/25 px-8 py-6 text-base font-semibold text-[#001030] transition-all duration-300 hover:border-[#1d3658]/45 hover:bg-[#1d3658]/5"
              >
                Explore services
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative mt-14">
          <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-slate-200 md:block" />

          <div className="space-y-6 md:space-y-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isHovered = hoveredCard === index;
              const isLeft = index % 2 === 0;

              return (
                <div
                  key={step.title}
                  className="relative"
                  onMouseEnter={() => setHoveredCard(index)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div className="absolute left-1/2 top-8 hidden -translate-x-1/2 md:block">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1d3658]/15 bg-white shadow-sm">
                      <Icon className="h-6 w-6 text-[#1d3658]" strokeWidth={2.5} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-10">
                    <div className={isLeft ? "md:pr-12" : "md:pr-12 md:opacity-0 md:pointer-events-none"}>
                      <div
                        className={`relative overflow-hidden rounded-3xl border bg-white p-7 shadow-lg transition-all duration-500 md:p-8 ${isHovered ? "-translate-y-1 border-[#1d3658]/20 shadow-2xl" : "border-slate-200"}`}
                      >
                        <div
                          className={`absolute inset-0 opacity-0 transition-opacity duration-500 ${isHovered ? "opacity-100" : ""}`}
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(29,54,88,0.06) 0%, rgba(0,16,48,0.04) 55%, rgba(64,80,80,0.04) 100%)",
                          }}
                        />

                        <div className="relative">
                          <div className="flex items-start justify-between gap-6">
                            <div>
                              <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/12 bg-white px-3 py-1 text-xs font-semibold text-[#001030] shadow-sm">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1d3658] text-white">
                                  {index + 1}
                                </span>
                                <span className="whitespace-nowrap">{step.timeline}</span>
                              </div>
                              <h3 className="mt-4 text-2xl font-bold leading-tight text-[#001030]">{step.title}</h3>
                            </div>
                            <div className="hidden items-center gap-2 text-sm font-semibold text-[#1d3658] sm:flex">
                              <Clock3 className="h-4 w-4" />
                              <span>{step.timeline}</span>
                            </div>
                          </div>

                          <p className="mt-3 leading-relaxed text-slate-600">{step.description}</p>

                          <ul className="mt-5 space-y-2">
                            {step.outcomes.map((o) => (
                              <li key={o} className="flex items-start gap-2 text-sm text-slate-600">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#1d3658]" />
                                <span>{o}</span>
                              </li>
                            ))}
                          </ul>

                          <div
                            className={`mt-6 flex items-center gap-2 text-sm font-semibold text-[#1d3658] transition-transform duration-300 ${isHovered ? "translate-x-1" : ""}`}
                          >
                            <span>Next</span>
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>

                        <div
                          className={`absolute bottom-0 left-0 h-[3px] w-full bg-[#1d3658] transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"}`}
                        />
                      </div>
                    </div>

                    <div className={isLeft ? "md:pl-12 md:opacity-0 md:pointer-events-none" : "md:pl-12"}>
                      <div
                        className={`relative overflow-hidden rounded-3xl border bg-white p-7 shadow-lg transition-all duration-500 md:p-8 ${isHovered ? "-translate-y-1 border-[#1d3658]/20 shadow-2xl" : "border-slate-200"}`}
                      >
                        <div
                          className={`absolute inset-0 opacity-0 transition-opacity duration-500 ${isHovered ? "opacity-100" : ""}`}
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(29,54,88,0.06) 0%, rgba(0,16,48,0.04) 55%, rgba(64,80,80,0.04) 100%)",
                          }}
                        />

                        <div className="relative">
                          <div className="flex items-start justify-between gap-6">
                            <div>
                              <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/12 bg-white px-3 py-1 text-xs font-semibold text-[#001030] shadow-sm">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1d3658] text-white">
                                  {index + 1}
                                </span>
                                <span className="whitespace-nowrap">{step.timeline}</span>
                              </div>
                              <h3 className="mt-4 text-2xl font-bold leading-tight text-[#001030]">{step.title}</h3>
                            </div>
                            <div className="hidden items-center gap-2 text-sm font-semibold text-[#1d3658] sm:flex">
                              <Clock3 className="h-4 w-4" />
                              <span>{step.timeline}</span>
                            </div>
                          </div>

                          <p className="mt-3 leading-relaxed text-slate-600">{step.description}</p>

                          <ul className="mt-5 space-y-2">
                            {step.outcomes.map((o) => (
                              <li key={o} className="flex items-start gap-2 text-sm text-slate-600">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#1d3658]" />
                                <span>{o}</span>
                              </li>
                            ))}
                          </ul>

                          <div
                            className={`mt-6 flex items-center gap-2 text-sm font-semibold text-[#1d3658] transition-transform duration-300 ${isHovered ? "translate-x-1" : ""}`}
                          >
                            <span>Next</span>
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>

                        <div
                          className={`absolute bottom-0 left-0 h-[3px] w-full bg-[#1d3658] transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"}`}
                        />
                      </div>
                    </div>
                  </div>

                  {index < steps.length - 1 && (
                    <div className="pointer-events-none absolute left-1/2 top-[92px] hidden -translate-x-1/2 md:block">
                      <div className="h-10 w-px bg-slate-200" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="relative z-10 mt-12 flex flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-sm font-semibold text-[#1d3658]">Ready to get started?</p>
              <p className="mt-1 text-lg font-bold text-[#001030]">
                Let&apos;s map your fraud exposure and prioritise fixes.
              </p>
            </div>
            <Link href="/contact" className="w-full sm:w-auto">
              <Button className="w-full rounded-xl bg-[#001030] px-8 py-6 text-base font-semibold text-white shadow-lg transition-all duration-300 hover:scale-[1.03] hover:bg-[#0b1b44]">
                Book a call
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
