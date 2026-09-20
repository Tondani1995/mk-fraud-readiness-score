import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { SnapshotPreview } from '@/components/website/SnapshotPreview';
import { CtaLink } from '@/components/website/primitives/CtaLink';

const journey = [
  { title: 'Structured assessment', body: 'Leadership answers a tailored set of questions about how fraud risk is governed, prevented, detected and handled.' },
  { title: 'Private readiness Snapshot', body: 'An immediate, confidential view of where readiness appears stronger and where gaps may deserve attention.' },
  { title: 'Fuller analysis and formal reporting', body: 'Where the Snapshot raises questions, a detailed report sets out the position in a form management can act on.' },
  { title: 'Prioritisation and remediation', body: 'MK can help decide what to fix first and support the work through an advisory engagement.' }
];

export default function FraudReadinessSection() {
  return (
    <section id="fraud-readiness" className="scroll-mt-20 bg-[#0b2631] text-white" aria-labelledby="home-fraud-readiness-heading">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:gap-10 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start lg:gap-16 lg:px-8 lg:py-28">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">Flagship assessment</p>
          <h2
            id="home-fraud-readiness-heading"
            className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl lg:text-[2.6rem]"
          >
            Fraud Readiness
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/78">
            Fraud Readiness is MK&apos;s structured way of making organisational fraud exposure visible, measurable and
            discussable at management level. It starts with a free assessment, and the organisation decides how far to
            take it.
          </p>

          <ol className="mt-7 space-y-0 sm:mt-8">
            {journey.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 pb-4 last:pb-0 sm:pb-6">
                {index < journey.length - 1 ? (
                  <span aria-hidden="true" className="absolute left-[0.9rem] top-8 h-[calc(100%-2rem)] w-px bg-white/15" />
                ) : null}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#a9d4ce]/50 text-xs font-semibold text-[#a9d4ce]">
                  {index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <p className="mt-1 hidden text-sm leading-6 text-white/65 sm:block">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:items-center sm:gap-6">
            <CtaLink href="/score/start" variant="primaryOnDark" arrow ctaName="start_fraud_readiness_assessment" placement="home_fraud_readiness">
              Start the Fraud Readiness Assessment
            </CtaLink>
            <Link href="/fraud-readiness" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#d6eeea] underline-offset-4 hover:text-white hover:underline">
              Reports and options <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="min-w-0 lg:pt-14">
          <SnapshotPreview compact />
          <p className="mt-3 text-xs leading-5 text-white/50">
            Illustrative example. Your Snapshot reflects your own responses and is visible only through your private link.
          </p>
        </div>
      </div>
    </section>
  );
}
