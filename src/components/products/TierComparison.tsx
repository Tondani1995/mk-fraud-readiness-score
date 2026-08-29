import type { ReactNode } from 'react';

export interface TierComparisonProduct {
  id: string;
  label: string;
  tagline: string;
  priceLabel?: string;
  description?: string;
  features: string[];
  action?: ReactNode;
}

export interface TierComparisonProps {
  essential: TierComparisonProduct;
  comprehensive: TierComparisonProduct;
  advisory: TierComparisonProduct;
  heading?: string;
  intro?: string;
}

/**
 * Presentation-only comparison. Product codes and prices are intentionally supplied by props so
 * this component cannot become a second authoritative catalogue or entitlement contract.
 *
 * Two contracts this component must not break:
 *
 *  - It carries NO `featured` flag. An unconditional "Recommended" state on Comprehensive told
 *    every customer at every score the same thing with no reason attached, which is arbitrary
 *    selling. Recommendation is deterministic and lives in next-step-recommendation.ts; the
 *    prop is removed here so it cannot be reintroduced.
 *  - It uses MK tokens only. The previous version used raw slate-* and amber-* Tailwind classes
 *    and was the only source of gold on the customer journey -- a colour that exists in neither
 *    the MK logo nor the approved website.
 */
export function TierComparison({
  essential,
  comprehensive,
  advisory,
  heading = 'How far do you want to take this?',
  intro = 'Essential diagnoses the position. Comprehensive adds the control, governance, evidence and implementation depth to act on it. Advisory is scoped directly with MK. Neither product includes independent validation.'
}: TierComparisonProps) {
  const renderProduct = (product: TierComparisonProduct) => (
    <article
      key={product.id}
      aria-labelledby={`${product.id}-title`}
      className="rounded-2xl border border-mk-line bg-mk-paper p-6 text-mk-navy"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mk-muted">{product.label}</p>
      <h3 id={`${product.id}-title`} className="mt-2 text-2xl font-semibold tracking-tight">{product.tagline}</h3>
      {product.priceLabel ? <p className="mt-5 text-sm font-medium tabular-nums text-mk-slate">{product.priceLabel}</p> : null}
      {product.description ? <p className="mt-4 text-sm leading-6 text-mk-slate">{product.description}</p> : null}
      <ul className="mt-6 space-y-3" aria-label={`${product.label} includes`}>
        {product.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm leading-6 text-mk-slate">
            <span aria-hidden="true" className="mt-3 h-px w-2 shrink-0 bg-mk-accent" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {product.action ? <div className="mt-7">{product.action}</div> : null}
    </article>
  );

  return (
    <section aria-labelledby="tier-comparison-heading" className="mx-auto max-w-[1120px]">
      <div className="max-w-3xl">
        <h2 id="tier-comparison-heading" className="text-3xl font-semibold tracking-tight text-mk-navy sm:text-4xl">{heading}</h2>
        <p className="mt-4 text-base leading-7 text-mk-slate">{intro}</p>
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-3" role="list" aria-label="Product tier comparison">
        {renderProduct(essential)}
        {renderProduct(comprehensive)}
        {renderProduct(advisory)}
      </div>
    </section>
  );
}
