"use client";

import { ArrowRight, BarChart3, CheckCircle2, FileText, Shield } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/website/ui/button";

export default function FraudReadinessScoreSection() {
  const features = [
    {
      icon: BarChart3,
      title: "Immediate readiness score",
      description: "A structured self-assessment that gives the client a free readiness snapshot after submission.",
    },
    {
      icon: Shield,
      title: "Exposure and control context",
      description: "The score is read against exposure so high-risk operating models and weak controls are not confused.",
    },
    {
      icon: FileText,
      title: "Detailed report option",
      description: "After the free snapshot, the client can request a detailed MK report for a fee.",
    },
  ];

  return (
    <section id="readiness-score" className="relative overflow-hidden bg-[#001030]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff10_1px,transparent_1px)] bg-[size:32px_32px] opacity-25" />
      <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 shadow-sm backdrop-blur">
              <BarChart3 className="h-4 w-4 text-white" />
              <span className="text-sm font-bold uppercase tracking-wide text-white/85">Main entry product</span>
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              Fraud Readiness Score
            </h2>
            <p className="mt-5 max-w-xl leading-8 text-white/75">
              A self health-check for organisations that want a clear starting point. It gives a free score snapshot immediately, then creates the option to request a detailed MK report or a broader Fraud Health Check.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/fraud-readiness-score" className="w-full sm:w-auto">
                <Button className="w-full rounded-xl bg-white px-8 py-6 text-base font-bold text-[#001030] shadow-lg transition hover:bg-white/90">
                  Start the Readiness Assessment
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#health-check" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full rounded-xl border-2 border-white/20 bg-transparent px-8 py-6 text-base font-bold text-white hover:bg-white/5">
                  See Health Check pathway
                </Button>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="grid gap-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-3xl border border-white/12 bg-white/5 p-6 shadow-xl backdrop-blur">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#001030]">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-bold text-white">{feature.title}</p>
                        <p className="mt-2 text-sm leading-6 text-white/70">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-2xl border border-white/12 bg-white/6 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-white" />
                <p className="text-sm leading-6 text-white/75">
                  This becomes the default first step instead of pushing every visitor straight to a booking call.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
