"use client";

import { Button } from "@/components/website/ui/button";
import {
  ShieldCheck,
  Radar,
  Users,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

export default function HeroSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const fraudPoints = [
    {
      icon: ShieldCheck,
      title: "Weak Internal Controls",
      description: "Trusted processes exploited quietly over time.",
    },
    {
      icon: Radar,
      title: "Limited Fraud Visibility",
      description: "Losses hidden inside operational noise.",
    },
    {
      icon: Users,
      title: "People as the Front Line",
      description: "Staff unsure how to recognise or escalate fraud.",
    },
    {
      icon: AlertTriangle,
      title: "Reactive Responses",
      description: "Action only after losses become visible.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-[#001030]">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[-120px] top-[-120px] h-[520px] w-[520px] rounded-full bg-white/6 blur-3xl" />
        <div className="absolute right-[-140px] bottom-[-140px] h-[620px] w-[620px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d3658]/35 blur-3xl" />
      </div>

      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:28px_28px] opacity-35" />

      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.85fr)] lg:items-center lg:gap-16">
          <div className="min-w-0 space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-2 backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-white/90" />
              <span className="text-sm font-semibold text-white/90">
                {"Fraud Strategy \u2022 Threat Intelligence \u2022 Readiness Assessment"}
              </span>
              <Sparkles className="h-4 w-4 text-white/90" />
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[3.75rem]">
                Fraud is not only a{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 text-white">banking</span>
                  <span className="absolute -bottom-2 left-0 h-3 w-full bg-white/15 blur-sm" />
                </span>{" "}
                problem.
              </h1>

              <p className="max-w-xl leading-relaxed text-white/75">
                We help non-financial organisations see where fraud risk already lives, measure how ready they are, and decide what to fix first.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
              <Link href="/fraud-readiness-score#start-score" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="group w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.03] hover:bg-white/90"
                >
                  <span className="flex items-center gap-2">
                    Assess Your Organisation
                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              {[
                "Fraud Readiness Score",
                "Fraud Health Checks",
                "Threat Intelligence",
                "Awareness & Resilience",
                "Internal Controls",
              ].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-all duration-300 hover:scale-105 hover:bg-white/8"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="relative min-w-0">
            <div className="absolute -inset-8 -z-10 rounded-3xl bg-white/6 blur-3xl" />

            <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/5 p-7 shadow-2xl backdrop-blur-xl lg:p-9">
              <div className="mb-7 flex items-start justify-between gap-6">
                <h3 className="max-w-sm text-xl font-bold leading-tight text-white lg:text-2xl">
                  Where fraud hides in real organisations
                </h3>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fraudPoints.map((point, index) => {
                  const Icon = point.icon;
                  const isHovered = hoveredCard === index;

                  return (
                    <div
                      key={index}
                      className="group relative overflow-hidden rounded-2xl border border-white/12 bg-white/5 p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-white/8 hover:shadow-lg"
                      onMouseEnter={() => setHoveredCard(index)}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      <div
                        className={`absolute inset-0 opacity-0 transition-opacity duration-300 ${isHovered ? "opacity-100" : ""}`}
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(29,54,88,0.10) 55%, rgba(255,255,255,0.06) 100%)",
                        }}
                      />

                      <div className="relative flex items-start gap-4">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-xl border border-white/12 bg-white/8 shadow-sm transition-transform duration-300 ${isHovered ? "rotate-3 scale-[1.06]" : ""}`}
                        >
                          <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
                        </div>

                        <div className="flex-1">
                          <p className="mb-1 font-semibold text-white">{point.title}</p>
                          <p className="text-sm leading-relaxed text-white/70">{point.description}</p>
                        </div>
                      </div>

                      <div
                        className={`absolute bottom-0 left-0 h-[3px] w-full transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-0"}`}
                        style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-7 overflow-hidden rounded-2xl border border-white/12 bg-white/6 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#001030]">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-white/85">
                    Start with the self-assessment, then use the score to decide whether you need a full MK Fraud Health Check.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
