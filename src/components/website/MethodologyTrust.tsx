import { ShieldCheck } from 'lucide-react';
import { METHODOLOGY_AI_DISCLOSURE, METHODOLOGY_HEADLINE, METHODOLOGY_POINTS as LEGACY_POINTS, METHODOLOGY_SUMMARY as LEGACY_SUMMARY } from '@/lib/website/methodology';
import { readinessTrack } from '@/lib/website/readiness-track';
import { REVIEW_METHODOLOGY } from '@/lib/website/review-track-copy';

const REVIEW = readinessTrack() === 'review';
const METHODOLOGY_SUMMARY = REVIEW ? REVIEW_METHODOLOGY.summary : LEGACY_SUMMARY;
const METHODOLOGY_POINTS = REVIEW ? REVIEW_METHODOLOGY.points : LEGACY_POINTS;

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
      className={`scroll-mt-16 md:scroll-mt-20 ${dark ? 'bg-mk-navy text-white' : 'border-t border-mk-line bg-white text-mk-navy'}`}
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${dark ? 'text-mk-paper' : 'text-mk-accent'}`}>
              How your result is produced
            </p>
            <h2 id="methodology-heading" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-normal sm:text-4xl">
              {METHODOLOGY_HEADLINE}
            </h2>
            <p className={`mt-4 text-base leading-7 ${dark ? 'text-white/78' : 'text-mk-accent'}`}>{METHODOLOGY_SUMMARY}</p>
            <p
              className={`mt-6 inline-flex items-start gap-3 rounded-brand border px-4 py-3 text-sm leading-6 ${dark ? 'border-white/15 bg-white/[0.04] text-white/75' : 'border-mk-line bg-mk-paper text-mk-accent'}`}
            >
              <ShieldCheck aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${dark ? 'text-mk-paper' : 'text-mk-accent'}`} />
              <span>AI does not determine your assessment result. Where it is used, it operates downstream of the validated assessment logic.</span>
            </p>
          </div>

          <div>
            <dl className={`divide-y ${dark ? 'divide-white/10 border-y border-white/10' : 'divide-slate-200 border-y border-slate-200'}`}>
              {METHODOLOGY_POINTS.map((point) => (
                <div key={point.title} className="py-4 sm:py-5">
                  <dt className="text-base font-semibold">{point.title}</dt>
                  <dd className={`mt-1.5 text-[15px] leading-7 ${dark ? 'text-white/70' : 'text-slate-600'}`}>{point.description}</dd>
                </div>
              ))}
            </dl>
            <p className={`mt-5 text-sm leading-6 ${dark ? 'text-white/60' : 'text-slate-500'}`}>{REVIEW ? REVIEW_METHODOLOGY.aiDisclosure : METHODOLOGY_AI_DISCLOSURE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
