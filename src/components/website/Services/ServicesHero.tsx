import { ArrowDown } from 'lucide-react';
import { CAPABILITIES } from '@/lib/website/capabilities';

export default function ServicesHero() {
  return (
    <section className="bg-[#001030] text-white" aria-labelledby="services-heading">
      <div className="mx-auto w-full max-w-7xl px-5 pb-8 pt-10 sm:px-6 sm:pb-14 sm:pt-14 lg:px-8 lg:pb-20 lg:pt-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">Services</p>
        <h1 id="services-heading" className="mt-4 max-w-[20ch] text-[2.1rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
          Start from the question your organisation needs answered.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
          MK&apos;s work is organised into four capabilities, each answering a distinct management question. Use them
          on their own or together.
        </p>

        <nav id="services" aria-label="Capabilities" className="mt-8 sm:mt-10 lg:mt-14">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/12 bg-white/12 lg:grid-cols-4">
            {CAPABILITIES.map((capability) => (
              <li key={capability.id} className="bg-[#001030]">
                <a
                  href={`#${capability.id}`}
                  className="group flex h-full min-h-14 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.05] sm:items-start sm:p-5 lg:flex-col lg:p-6"
                >
                  <span>
                    <span className="block text-base font-semibold sm:text-lg">{capability.name}</span>
                    <span className="mt-1 hidden text-sm leading-6 text-white/70 sm:block">{capability.question}</span>
                  </span>
                  <ArrowDown aria-hidden="true" className="h-4 w-4 shrink-0 text-[#a9d4ce] transition-transform group-hover:translate-y-0.5 sm:mt-1" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
