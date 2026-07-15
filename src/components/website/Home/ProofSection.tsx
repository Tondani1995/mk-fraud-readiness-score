"use client";

import {
  Briefcase,
  ShieldCheck,
  TrendingUp,
  Check,
  Award,
  ArrowRight,
  Star,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/website/ui/button";

export default function ProofSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const proofPoints = [
    {
      icon: Briefcase,
      title: "Practitioner-Led",
      description:
        "Built by professionals with hands-on experience across fraud strategy, prevention, controls, and awareness.",
      highlights: ["15+ years experience", "Multi-industry expertise", "Real fraud cases"],
    },
    {
      icon: ShieldCheck,
      title: "Practical by Design",
      description:
        "Focused on people, processes, and decision points — not just policies or systems.",
      highlights: ["Action-oriented", "No tick-box compliance", "Operational focus"],
    },
    {
      icon: TrendingUp,
      title: "Outcome Focused",
      description:
        "Designed to reduce leakage, improve visibility, and enable faster, more confident responses.",
      highlights: ["Measurable results", "ROI-driven", "Sustainable impact"],
    },
  ];

  return (
    <section className="relative overflow-hidden bg-[#001030]">
      <div className="absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-white/6 blur-3xl" />
        <div className="absolute -right-28 -bottom-28 h-[640px] w-[640px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d3658]/35 blur-3xl" />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:44px_44px] opacity-25" />

      <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="mb-16 max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-2.5 shadow-lg backdrop-blur-xl">
            <Award className="h-4 w-4 text-white/85" />
            <span className="text-sm font-bold uppercase tracking-wide text-white/90">
              Proven Expertise
            </span>
            <Star className="h-4 w-4 fill-white text-white" />
          </div>

          <h2 className="mb-6 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            Built for{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-white">real-world</span>
              <span className="absolute -bottom-2 left-0 h-3 w-full bg-white/12 blur-sm" />
            </span>{" "}
            fraud risk
          </h2>

          <p className="leading-relaxed text-white/75">
            Grounded in operational reality — focused on outcomes, not theory, tools, or tick-box
            compliance.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link href="/contact" className="w-full sm:w-auto">
              <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-semibold text-[#001030] shadow-lg transition-all duration-300 hover:scale-[1.03] hover:bg-white/90">
                Book a call
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/insights" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="w-full rounded-xl border-2 border-white/20 bg-transparent px-8 py-6 text-base font-semibold text-white transition-all duration-300 hover:border-white/35 hover:bg-white/5"
              >
                View insights
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {proofPoints.map((point, index) => {
            const Icon = point.icon;
            const isHovered = hoveredCard === index;

            return (
              <div
                key={point.title}
                className="relative"
                onMouseEnter={() => setHoveredCard(index)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <div
                  className={`absolute -inset-0.5 rounded-3xl bg-white/10 blur-2xl transition-opacity duration-500 ${isHovered ? "opacity-70" : "opacity-0"
                    }`}
                />

                <div
                  className={`relative h-full overflow-hidden rounded-3xl border bg-white/5 p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 ${isHovered
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

                  <div className="relative">
                    <div className="mb-6 flex items-start justify-between gap-6">
                      <div
                        className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/12 bg-white/8 shadow-sm transition-transform duration-500 ${isHovered ? "rotate-6 scale-110" : ""
                          }`}
                      >
                        <Icon className="h-7 w-7 text-white" strokeWidth={2.5} />
                      </div>

                      <div
                        className={`h-16 w-16 rounded-full bg-white/10 blur-2xl transition-all duration-500 ${isHovered ? "scale-150 opacity-100" : "scale-0 opacity-0"
                          }`}
                      />
                    </div>

                    <h3 className="mb-3 text-2xl font-bold leading-tight text-white">{point.title}</h3>

                    <p className="mb-6 leading-relaxed text-white/75">{point.description}</p>

                    <div className="space-y-3">
                      {point.highlights.map((highlight, idx) => (
                        <div
                          key={highlight}
                          className={`flex items-center gap-3 transition-all duration-300 ${isHovered ? "translate-x-1" : ""
                            }`}
                          style={{ transitionDelay: `${idx * 40}ms` }}
                        >
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
                            <Check className="h-4 w-4 text-white" strokeWidth={3} />
                          </div>
                          <span className="text-sm font-semibold text-white/85">{highlight}</span>
                        </div>
                      ))}
                    </div>

                    <Link
                      href="/about"
                      className={`mt-8 flex items-center justify-between rounded-2xl border border-white/12 bg-white/6 p-5 transition-all duration-500 hover:bg-white/10 ${isHovered ? "translate-y-0" : ""
                        }`}
                    >
                      <span className="text-sm font-bold text-white/90">Learn more</span>
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#001030] transition-transform duration-300 ${isHovered ? "translate-x-1" : ""
                          }`}
                      >
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    </Link>
                  </div>

                  <div
                    className={`pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-white/10 blur-3xl transition-opacity duration-500 ${isHovered ? "opacity-100" : "opacity-0"
                      }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
