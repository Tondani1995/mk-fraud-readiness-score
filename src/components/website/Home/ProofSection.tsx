import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@/components/website/primitives/Eyebrow';
import type { WebsiteInsight } from '@/lib/website/insights/repository';
import {
  APPROVED_ASSOCIATIONS,
  APPROVED_CLIENT_LOGOS,
  ENGAGEMENT_EXAMPLES
} from '@/lib/website/proof';

const evidence = [
  {
    title: 'Practitioner-led',
    body:
      'Engagements are led by a fraud risk practitioner whose operational experience spans fraud risk, governance, process design and solution strategy. The Fraud Readiness Assessment is built from the same operational fraud experience and practitioner insight.'
  },
  {
    title: 'A method you can examine first',
    body:
      'The Fraud Readiness Assessment is live and free to complete, so leadership can see how MK frames fraud readiness before deciding whether to engage further.',
    link: { href: '/fraud-readiness', label: 'How the assessment works' }
  },
  {
    title: 'Published thinking',
    body:
      'MK publishes analysis of the fraud patterns affecting South African organisations, from procurement and tax refund fraud to the criminal services behind modern scams.'
  }
];

export default function ProofSection({ insights }: { insights: WebsiteInsight[] }) {
  const recent = insights.filter((insight) => insight.slug?.trim()).slice(0, 3);

  return (
    <section className="bg-white" aria-labelledby="home-proof-heading">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>Why MK</Eyebrow>
          <h2
            id="home-proof-heading"
            className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-[2.6rem]"
          >
            What stands behind MK’s advice.
          </h2>
        </div>

        {APPROVED_CLIENT_LOGOS.length > 0 ? (
          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Organisations MK has worked with</p>
            <ul className="mt-5 flex flex-wrap items-center gap-x-10 gap-y-6">
              {APPROVED_CLIENT_LOGOS.map((logo) => (
                <li key={logo.name}>
                  <Image src={logo.src} alt={logo.name} width={logo.width} height={logo.height} className="h-8 w-auto opacity-80 grayscale" />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 sm:mt-10 sm:gap-10 lg:mt-14 lg:grid-cols-3 lg:gap-12">
          {evidence.map((item) => (
            <article key={item.title} className="border-t-2 border-[#001030] pt-5">
              <h3 className="text-lg font-semibold text-[#001030]">{item.title}</h3>
              <p className="mt-2 text-[15px] leading-7 text-slate-600 sm:mt-3">{item.body}</p>
              {item.link ? (
                <Link href={item.link.href} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#1d3658] hover:text-[#001030]">
                  {item.link.label} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : null}
              {item.title === 'Published thinking' && recent.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                  {recent.map((insight) => (
                    <li key={insight.slug}>
                      <Link
                        href={`/insights/${insight.slug.trim()}`}
                        className="group flex min-h-12 items-start justify-between gap-3 py-3 text-sm font-medium leading-6 text-[#001030] hover:text-[#1d3658]"
                      >
                        <span>{insight.title.replace(/:\s*$/, '')}</span>
                        <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#1d3658]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        {ENGAGEMENT_EXAMPLES.length > 0 ? (
          <div className="mt-14">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Selected engagements</h3>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {ENGAGEMENT_EXAMPLES.map((example) => (
                <article key={`${example.client}-${example.challenge}`} className="rounded-2xl border border-slate-200 p-6">
                  <p className="text-sm font-semibold text-[#1d3658]">{example.client}</p>
                  <dl className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                    <div><dt className="font-semibold text-[#001030]">Challenge</dt><dd>{example.challenge}</dd></div>
                    <div><dt className="font-semibold text-[#001030]">What MK did</dt><dd>{example.work}</dd></div>
                    <div><dt className="font-semibold text-[#001030]">Outcome</dt><dd>{example.outcome}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {APPROVED_ASSOCIATIONS.length > 0 ? (
          <ul className="mt-12 flex flex-wrap gap-3">
            {APPROVED_ASSOCIATIONS.map((association) => (
              <li key={association.name} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600">
                <span className="font-semibold text-[#001030]">{association.name}</span> {association.description}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
