"use client";

import Link from "next/link";
import { Button } from "@/components/website/ui/button";
import { CheckCircle2, Shield, ArrowRight, BarChart3 } from "lucide-react";

export default function LeadMagnetSection() {
  return (
    <section
      id="fraud-readiness-score"
      className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white"
      aria-labelledby="readiness-score-title"
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-[#1d3658]/10 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/8 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/20 bg-[#1d3658]/5 px-5 py-2.5 shadow-sm backdrop-blur">
              <Shield className="h-4 w-4 text-[#1d3658]" />
              <span className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                Free self-assessment
              </span>
            </div>

            <h2
              id="readiness-score-title"
              className="mt-6 text-2xl font-bold tracking-tight leading-tight text-[#001030] sm:text-3xl lg:text-5xl"
            >
              Fraud Readiness Score
              <span className="ml-2 text-[#1d3658]/70">(Free snapshot)</span>
            </h2>

            <p className="mt-4 max-w-xl leading-relaxed text-slate-600">
              Replace the static checklist with a live assessment. The score gives organisations an immediate view of readiness, exposure, and the control areas that need attention first.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                "Immediate readiness score",
                "Exposure profile",
                "Priority control gaps",
                "Detailed report option",
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1d3658]/10">
                    <CheckCircle2 className="h-5 w-5 text-[#1d3658]" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{t}</p>
                </div>
              ))}
            </div>

            <p className="mt-6 text-sm text-slate-500">
              The self-assessment is the entry point. A full MK report can be requested after the score is generated.
            </p>
          </div>

          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-2xl">
              <div className="border-b border-slate-200 bg-slate-50/60 px-7 py-6">
                <h3 className="text-xl font-bold leading-tight tracking-tight text-[#001030]">
                  Start with the assessment
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Complete the self-assessment and see the free snapshot immediately after submission.
                </p>
              </div>

              <div className="space-y-5 px-7 py-7">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#001030] text-white">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-bold text-[#001030]">Self-check first. Advisory after.</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        This is designed to help prospects understand their position before they ask for a full health check, remediation plan, or detailed report.
                      </p>
                    </div>
                  </div>
                </div>

                <Link href="/fraud-readiness-score#start-score" className="block">
                  <Button className="h-12 w-full rounded-lg bg-[#001030] text-base font-bold text-white shadow-lg transition-all duration-300 hover:scale-[1.01] hover:bg-[#001030]/95">
                    Start the Fraud Readiness Assessment
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>

                <p className="text-xs leading-relaxed text-slate-500">
                  No account is required. The free snapshot is generated from the submitted self-assessment. Detailed reports are handled by MK Fraud Insights after request confirmation.
                </p>
              </div>

              <div className="border-t border-slate-200 bg-white px-7 py-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Powered by MK Fraud Insights</p>
                  <div className="h-2 w-24 rounded-full bg-[#1d3658]/15" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-px w-full bg-[#1d3658]/15" />
    </section>
  );
}
