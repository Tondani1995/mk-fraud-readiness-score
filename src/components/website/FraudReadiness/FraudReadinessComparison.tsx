import { STOREFRONT_COMPARISON } from '@/lib/commercial/storefront-presentation';

const COLUMNS = [
  { key: 'essential', label: 'Essential' },
  { key: 'comprehensive', label: 'Comprehensive' },
  { key: 'advisory', label: 'Advisory' }
] as const;

/**
 * The depth ladder.
 *
 * Two renderings of one dataset rather than one table that scrolls sideways: a table below the
 * md breakpoint would force horizontal scrolling on a phone, and a decision-maker comparing three
 * options on a phone is a real customer, not an edge case. Above md the table is the better
 * instrument; below it, each dimension becomes a short stacked list.
 */
export function FraudReadinessComparison() {
  return (
    <section aria-labelledby="fraud-readiness-comparison-heading" className="mx-auto max-w-7xl px-6 lg:px-8">
      <div className="max-w-2xl">
        <h2
          id="fraud-readiness-comparison-heading"
          className="text-2xl font-semibold tracking-tight text-[#001030] sm:text-3xl"
        >
          How the three options differ
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Essential establishes the position. Comprehensive adds the design work needed to act on
          it. Advisory is MK doing the work with you. Each step is a change in depth, not a change
          in how carefully the work is done.
        </p>
      </div>

      {/* Tablet and desktop */}
      <div className="mt-10 hidden md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Comparison of the Essential, Comprehensive and Advisory Fraud Readiness options
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[22%] border-b border-slate-300 pb-3 pr-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <span className="sr-only">Dimension</span>
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="border-b border-slate-300 pb-3 pr-6 text-base font-semibold text-[#001030] last:pr-0"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STOREFRONT_COMPARISON.map((row) => (
              <tr key={row.dimension} className="align-top">
                <th
                  scope="row"
                  className="border-b border-slate-200 py-5 pr-6 text-sm font-semibold text-[#001030]"
                >
                  {row.dimension}
                </th>
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="border-b border-slate-200 py-5 pr-6 text-sm leading-6 text-slate-700 last:pr-0"
                  >
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="mt-10 space-y-8 md:hidden">
        {STOREFRONT_COMPARISON.map((row) => (
          <div key={row.dimension} className="border-t border-slate-300 pt-5">
            <h3 className="text-sm font-semibold text-[#001030]">{row.dimension}</h3>
            <dl className="mt-3 space-y-3">
              {COLUMNS.map((column) => (
                <div key={column.key}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {column.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-slate-700">{row[column.key]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
