import { ShieldCheck } from 'lucide-react';
import { METHODOLOGY_HEADLINE, METHODOLOGY_POINTS, METHODOLOGY_SUMMARY } from '@/lib/website/methodology';

/**
 * "How your result is produced": the public methodology statement for Fraud Readiness.
 *
 * Every claim rendered here is verified against the implementation in `src/lib/website/methodology.ts`.
 * The component shows how a result is produced and where AI sits; it deliberately shows no weights,
 * thresholds or formulas.
 */
export default function MethodologyTrust({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';

  return (
    <section
      id="how-your-result-is-produced"
      aria-labelledby="methodology-heading"
      className={`scroll-mt-16 md:scroll-mt-20 ${dark ? 'bg-[#0b2631] text-white' : 'border-t border-[#dfd8cb] bg-white text-[#001030]'}`}
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${dark ? 'text-[#a9d4ce]' : 'text-[#1d3658]'}`}>
              How your result is produced
            </p>
            <h2 id="methodology-heading" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl">
              {METHODOLOGY_HEADLINE}
            </h2>
            <p className={`mt-4 text-base leading-7 ${dark ? 'text-white/78' : 'text-[#4f5d66]'}`}>{METHODOLOGY_SUMMARY}</p>
            <p
              className={`mt-6 inline-flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${dark ? 'border-white/15 bg-white/[0.04] text-white/75' : 'border-[#dfd8cb] bg-[#f8fafc] text-[#4f5d66]'}`}
            >
              <ShieldCheck aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${dark ? 'text-[#a9d4ce]' : 'text-[#1d3658]'}`} />
              <span>AI does not determine your assessment result. Where it is used, it operates downstream of the validated assessment logic.</span>
            </p>
          </div>

          <dl className={`divide-y ${dark ? 'divide-white/10 border-y border-white/10' : 'divide-slate-200 border-y border-slate-200'}`}>
            {METHODOLOGY_POINTS.map((point) => (
              <div key={point.title} className="py-4 sm:py-5">
                <dt className="text-base font-semibold">{point.title}</dt>
                <dd className={`mt-1.5 text-[15px] leading-7 ${dark ? 'text-white/70' : 'text-slate-600'}`}>{point.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
