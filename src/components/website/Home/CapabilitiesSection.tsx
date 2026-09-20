import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Eyebrow } from '@/components/website/primitives/Eyebrow';
import { CAPABILITIES, PUBLIC_SERVICE_PORTFOLIO } from '@/lib/website/capabilities';

export default function CapabilitiesSection() {
  return (
    <section id="how-we-help" className="scroll-mt-20 border-t border-slate-200 bg-[#f8fafc]" aria-labelledby="home-capabilities-heading">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>How organisations work with MK</Eyebrow>
          <h2
            id="home-capabilities-heading"
            className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-[2.6rem]"
          >
            Four points of entry, each starting from a management question.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Assess, Build, Enable and Monitor organise the portfolio. They are not the only things MK does, and they are not a sequence an organisation must complete.
          </p>
        </div>

        <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <li key={capability.id} className="bg-white">
              <Link
                href={`/services#${capability.id}`}
                className="group flex h-full flex-col p-5 transition-colors sm:p-6 hover:bg-[#fbfcfd] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1d3658] lg:p-7"
              >
                <h3 className="text-2xl font-semibold tracking-tight text-[#001030]">{capability.name}</h3>
                <p className="mt-2 text-[15px] font-medium leading-snug text-[#1d3658]">{capability.question}</p>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-600 sm:mt-4">{capability.summary}</p>
                <span className="mt-4 inline-flex min-h-6 items-center gap-1.5 text-sm font-semibold text-[#001030] sm:mt-6">
                  About {capability.name.toLowerCase()}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 border-t border-slate-300 pt-7 lg:mt-12 lg:pt-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Named service portfolio</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Fraud Readiness is a flagship route into MK, not the boundary of the advisory practice.
            </p>
          </div>
          <ul className="mt-5 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLIC_SERVICE_PORTFOLIO.map((service) => (
              <li key={service} className="border-t border-slate-200 py-3 text-sm font-medium leading-6 text-[#001030]">
                {service}
              </li>
            ))}
          </ul>
          <Link href="/services" className="mt-5 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#1d3658] hover:text-[#001030]">
            View the full service portfolio <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
