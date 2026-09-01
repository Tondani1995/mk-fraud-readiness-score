'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { SnapshotPreview } from '@/components/website/SnapshotPreview';
import { Button } from '@/components/website/ui/button';

export default function HeroSection() {
  return (
    <section className="bg-[#001030] text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">MK Fraud Insights</p>
          <h1 className="mt-5 max-w-[12ch] text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-[4.5rem]">
            Turn fraud readiness into a management decision.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/72 sm:text-lg">
            Build a clearer view of where fraud risk lives, how ready the organisation is and what deserves attention first.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="h-12 rounded-xl bg-white px-7 text-[#001030] shadow-xl hover:bg-white/90">
              <Link href="/score/start">Assess Your Organisation <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-white/25 bg-transparent px-7 text-white hover:bg-white/8 hover:text-white">
              <Link href="/fraud-readiness">Compare Fraud Readiness Options</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
            {['Fraud strategy', 'Readiness assessment', 'Control improvement'].map((item) => (
              <span key={item} className="border-l border-[#a9d4ce]/60 pl-3">{item}</span>
            ))}
          </div>
        </div>
        <div className="min-w-0"><SnapshotPreview /></div>
      </div>
    </section>
  );
}
