import { Eyebrow } from '@/components/website/primitives/Eyebrow';

const functions = [
  { name: 'Finance', controls: 'Payment approvals, reconciliations' },
  { name: 'Operations', controls: 'Process checks, exception handling' },
  { name: 'Digital channels', controls: 'Onboarding, authentication' },
  { name: 'Risk and compliance', controls: 'Policies, audit findings' },
  { name: 'Third parties', controls: 'Vendor onboarding, contract terms' }
];

export default function ProblemSection() {
  return (
    <section className="bg-white" aria-labelledby="home-problem-heading">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:gap-10 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20 lg:px-8 lg:py-28">
        <div className="min-w-0">
          <Eyebrow>The problem</Eyebrow>
          <h2
            id="home-problem-heading"
            className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-[#001030] sm:text-4xl lg:text-[2.6rem]"
          >
            Controls are not the same as readiness.
          </h2>
          <div className="mt-5 max-w-xl space-y-3 text-base leading-7 text-slate-600 sm:space-y-4">
            <p>
              Most organisations already have fraud-relevant controls spread across finance, operations, digital
              channels, risk and their third parties. Each one was designed for a local purpose, owned by a different
              team and reported in a different place.
            </p>
            <p>
              What is usually missing is the assembled view. Without it, leadership can say that controls exist but
              cannot say whether the organisation is ready.
            </p>
          </div>
        </div>

        <figure className="min-w-0" aria-label="Controls held separately across functions, assembled into one management view of fraud risk">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_3rem_minmax(0,0.9fr)] lg:items-center lg:gap-0">
            <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-1">
              {functions.map((fn, index) => (
                <li
                  key={fn.name}
                  className={`rounded-xl border border-slate-200 bg-[#f8fafc] px-3.5 py-3 lg:px-4 ${index === functions.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}
                >
                  <p className="text-sm font-semibold text-[#001030]">{fn.name}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{fn.controls}</p>
                </li>
              ))}
            </ul>

            <div aria-hidden="true" className="flex justify-center lg:h-full">
              <svg className="h-6 w-6 text-[#1d3658] lg:hidden" viewBox="0 0 24 32" fill="none">
                <path d="M12 2v24m0 0-7-7m7 7 7-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg className="hidden h-full w-12 text-slate-300 lg:block" viewBox="0 0 48 100" preserveAspectRatio="none" fill="none">
                {[10, 30, 50, 70, 90].map((y) => (
                  <path key={y} d={`M0 ${y} C 28 ${y}, 20 50, 48 50`} stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
            </div>

            <div className="rounded-2xl bg-[#001030] p-5 text-white sm:p-6 lg:p-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a9d4ce]">One management view</p>
              <p className="mt-3 text-xl font-semibold leading-snug">Fraud risk, assembled across the organisation</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-white/78 sm:mt-5 sm:space-y-2.5">
                {['Where exposure sits', 'Which controls address it', 'Where the gaps are', 'Who owns what happens next'].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#a9d4ce]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
