"use client";

import { ShieldAlert, TrendingDown, Users, AlertCircle } from "lucide-react";
import { useState } from "react";

export default function ProblemSection() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const problems = [
    {
      icon: ShieldAlert,
      title: "Hidden Loss",
      description:
        "Fraud often hides inside operational noise, small exceptions, and manual workarounds, going unnoticed until it becomes material.",
    },
    {
      icon: TrendingDown,
      title: "Misaligned Controls",
      description:
        "Many controls are built for audit and compliance, not prevention. As a result, fraud is detected late or managed reactively.",
    },
    {
      icon: Users,
      title: "People Are the Gap",
      description:
        "When roles, escalation paths, and accountability are unclear, even well-intentioned staff become part of the exposure.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-white">

      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="mb-14 max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-white px-5 py-2.5 shadow-sm">
            <AlertCircle className="h-4 w-4 text-[#1d3658]" />
            <span className="text-sm font-bold uppercase tracking-wide text-[#001030]">
              Core Problem
            </span>
          </div>

          <h2 className="mb-6 text-3xl font-bold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-5xl">
            Fraud is already embedded in your{" "}
            <span className="relative inline-block">
              <span className="relative z-10 text-[#1d3658]">operating model</span>
            </span>
          </h2>

          <p className="leading-relaxed text-slate-600">
            Most organisations don&apos;t see fraud clearly because it hides inside everyday
            processes, trusted roles, and operational noise.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {problems.map((problem, index) => {
            const Icon = problem.icon;
            const isHovered = hoveredCard === index;

            return (
              <div
                key={index}
                className="relative"
                onMouseEnter={() => setHoveredCard(index)}
                onMouseLeave={() => setHoveredCard(null)}
              >

                <div
                  className={`relative h-full overflow-hidden rounded-3xl border bg-white p-8 shadow-lg transition-all duration-500 ${isHovered
                      ? "-translate-y-1 border-[#1d3658]/18 shadow-2xl"
                      : "border-slate-200"
                    }`}
                >
                  <div
                    className={`absolute inset-0 opacity-0 transition-opacity duration-500 ${isHovered ? "opacity-100" : ""
                      }`}
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(29,54,88,0.06) 0%, rgba(0,16,48,0.04) 55%, rgba(64,80,80,0.04) 100%)",
                    }}
                  />

                  <div className="relative">
                    <div className="mb-6">
                      <div
                        className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#1d3658]/15 bg-white shadow-sm transition-transform duration-500 ${isHovered ? "rotate-6 scale-110" : ""
                          }`}
                      >
                        <Icon className="h-7 w-7 text-[#1d3658]" strokeWidth={2.5} />
                      </div>
                    </div>

                    <h3 className="mb-4 text-2xl font-bold leading-tight text-[#001030]">
                      {problem.title}
                    </h3>

                    <p className="leading-relaxed text-slate-600">{problem.description}</p>
                  </div>


                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
