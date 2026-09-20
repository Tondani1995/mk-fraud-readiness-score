import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { CtaLink } from '@/components/website/primitives/CtaLink';
import type { Capability } from '@/lib/website/capabilities';

export default function CapabilityDetail({ capability, tone }: { capability: Capability; tone: 'white' | 'grey' }) {
  return (
    <section
      id={capability.id}
      aria-labelledby={`${capability.id}-heading`}
      className={`scroll-mt-16 border-t border-slate-200 md:scroll-mt-20 ${tone === 'grey' ? 'bg-[#f8fafc]' : 'bg-white'}`}
    >
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-10 sm:gap-8 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:px-8 lg:py-24">
        <div className="min-w-0">
          <h2 id={`${capability.id}-heading`} className="text-3xl font-semibold tracking-tight text-[#001030] sm:text-4xl">
            {capability.name}
          </h2>
          <p className="mt-3 text-lg font-medium leading-snug text-[#1d3658]">{capability.question}</p>
          <p className="mt-4 text-base leading-7 text-slate-600">{capability.summary}</p>

          <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:mt-8">Typical situations</h3>
          <ul className="mt-3 space-y-2.5">
            {capability.situations.map((situation) => (
              <li key={situation} className="flex gap-3 text-[15px] leading-6 text-[#001030]">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1d3658]" />
                <span>{situation}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 space-y-5 sm:space-y-6">
          {capability.services.length === 1 ? (
            // A single service line would only restate the capability summary, so it is named rather than
            // described. The element keeps the legacy anchor id for inbound links.
            capability.services.map((service) => (
              <p
                key={service.name}
                id={service.anchor}
                className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-6 text-slate-600 sm:px-5 md:scroll-mt-24"
              >
                Delivered as <span className="font-semibold text-[#001030]">{service.name}</span>
              </p>
            ))
          ) : (
          <div className="space-y-3">
            {capability.services.map((service) => (
              <article
                key={service.name}
                id={service.anchor}
                className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:scroll-mt-24"
              >
                <h3 className="text-lg font-semibold text-[#001030]">{service.name}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-slate-600 sm:mt-2 sm:leading-7">{service.summary}</p>
                {service.href ? (
                  <Link href={service.href} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#1d3658] hover:text-[#001030]">
                    View {service.name} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
          )}

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">What an engagement can produce</h3>
            <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {capability.outputs.map((output) => (
                <li key={output} className="flex gap-3 text-[15px] leading-6 text-slate-700">
                  <span aria-hidden="true" className="mt-[0.7rem] h-px w-3 shrink-0 bg-[#1d3658]" />
                  <span>{output}</span>
                </li>
              ))}
            </ul>
            {capability.scopeNote ? <p className="mt-4 text-sm leading-6 text-slate-500">{capability.scopeNote}</p> : null}
          </div>

          {capability.relatedLinks?.length ? (
            <ul className="space-y-1.5">
              {capability.relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#1d3658] hover:text-[#001030]">
                    {link.label} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <CtaLink
            href={capability.nextStep.href}
            variant={capability.nextStep.href === '/score/start' ? 'primary' : 'secondary'}
            arrow
            ctaName={`services_${capability.id}_next_step`}
            placement="services_capability"
            className="w-full sm:w-auto"
          >
            {capability.nextStep.label}
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
