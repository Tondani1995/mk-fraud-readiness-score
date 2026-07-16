import Wrapper from "@/components/website/Wrapper";
import { StartAssessmentForm } from "@/components/assessment/StartAssessmentForm";
import { ArrowRight, BarChart3, CheckCircle2, FileText, Shield } from "lucide-react";
import Link from "next/link";

export default function FraudReadinessScorePage() {
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="relative overflow-hidden bg-[#001030]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />
          <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)] lg:items-center lg:gap-16">
              <div className="min-w-0 max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-white/90 backdrop-blur">
                  <BarChart3 className="h-4 w-4" />
                  Free fraud readiness snapshot
                </div>
                <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[3.7rem]">
                  Assess your organisation before committing to a full fraud health check.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-8 text-white/75">
                  The Fraud Readiness Score is a structured self-assessment that helps your organisation understand readiness, exposure and priority control gaps. Once submitted, you receive a free snapshot immediately and can request a detailed MK report.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href="#start-score" className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-4 font-semibold text-[#001030] shadow-lg transition hover:bg-white/90">
                    Assess Your Organisation
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                  <Link href="/services#health-check" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-7 py-4 font-semibold text-white transition hover:bg-white/5">
                    View Health Check
                  </Link>
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur">
                <div className="grid gap-4">
                  {[
                    [Shield, "Readiness", "Measures how prepared the organisation is across governance, controls, detection, response and culture."],
                    [BarChart3, "Exposure", "Separates inherent fraud exposure from control weakness, so the score is read in proper context."],
                    [FileText, "Report option", "After the free snapshot, the client can request a detailed MK report for a fee."],
                  ].map(([Icon, title, text]) => {
                    const ItemIcon = Icon as typeof Shield;
                    return (
                      <div key={String(title)} className="rounded-2xl border border-white/12 bg-white/6 p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#001030]">
                            <ItemIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-white">{String(title)}</p>
                            <p className="mt-1 text-sm leading-6 text-white/70">{String(text)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
            <div className="grid gap-5 md:grid-cols-3">
              {[
                "No account required",
                "Immediate free snapshot",
                "Detailed report request available after scoring",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1d3658]/10">
                      <CheckCircle2 className="h-5 w-5 text-[#1d3658]" />
                    </div>
                    <p className="font-semibold text-[#001030]">{item}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="start-score" className="scroll-mt-24 bg-slate-50 md:scroll-mt-28">
          <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8 lg:py-20">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">Assessment</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#001030] sm:text-4xl">Assess your organisation</h2>
              <p className="mt-4 leading-7 text-slate-600">
                Complete the organisation details, move into the fraud readiness questions, and receive a free snapshot immediately after submission.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl md:p-8" data-native-assessment-start="true">
              <StartAssessmentForm />
            </div>
          </div>
        </section>
      </main>
    </Wrapper>
  );
}
