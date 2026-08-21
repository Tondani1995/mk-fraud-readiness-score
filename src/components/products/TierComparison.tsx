import type { ReactNode } from 'react';

export interface TierComparisonProduct {
  id: string;
  label: string;
  tagline: string;
  priceLabel?: string;
  description?: string;
  features: string[];
  featured?: boolean;
  action?: ReactNode;
}

export interface TierComparisonProps {
  essential: TierComparisonProduct;
  comprehensive: TierComparisonProduct;
  advisory?: TierComparisonProduct;
  heading?: string;
  intro?: string;
}

/**
 * Presentation-only comparison. Product codes and prices are intentionally supplied by props so
 * this component cannot become a second authoritative catalogue or entitlement contract.
 */
export function TierComparison({ essential, comprehensive, advisory, heading = 'Choose the level of depth your organisation needs', intro = 'Essential diagnoses the position. Comprehensive adds the control, governance, evidence and implementation depth to act on it. Advisory is a separately scoped human-led engagement. Neither automated product includes independent validation.' }: TierComparisonProps) {
  const renderProduct = (product: TierComparisonProduct, emphasis: 'essential' | 'comprehensive' | 'advisory') => (
    <article
      key={product.id}
      aria-labelledby={`${product.id}-title`}
      className={`rounded-2xl border p-6 shadow-sm ${emphasis === 'comprehensive' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${emphasis === 'comprehensive' ? 'text-amber-300' : 'text-slate-500'}`}>{product.label}</p>
          <h3 id={`${product.id}-title`} className="mt-2 text-2xl font-semibold tracking-tight">{product.tagline}</h3>
        </div>
        {product.featured ? <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950">Recommended</span> : null}
      </div>
      {product.priceLabel ? <p className={`mt-5 text-sm font-medium ${emphasis === 'comprehensive' ? 'text-slate-200' : 'text-slate-600'}`}>{product.priceLabel}</p> : null}
      {product.description ? <p className={`mt-4 text-sm leading-6 ${emphasis === 'comprehensive' ? 'text-slate-200' : 'text-slate-600'}`}>{product.description}</p> : null}
      <ul className="mt-6 space-y-3" aria-label={`${product.label} includes`}>
        {product.features.map((feature) => <li key={feature} className="flex gap-3 text-sm leading-6"><span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${emphasis === 'comprehensive' ? 'bg-amber-300' : 'bg-slate-900'}`} /> <span>{feature}</span></li>)}
      </ul>
      {product.action ? <div className="mt-7">{product.action}</div> : null}
    </article>
  );

  return (
    <section aria-labelledby="tier-comparison-heading" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <h2 id="tier-comparison-heading" className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{heading}</h2>
        <p className="mt-4 text-base leading-7 text-slate-600">{intro}</p>
      </div>
      <div className={`mt-8 grid gap-6 ${advisory ? 'md:grid-cols-3' : 'md:grid-cols-2'}`} role="list" aria-label="Product tier comparison">
        {renderProduct(essential, 'essential')}
        {renderProduct(comprehensive, 'comprehensive')}
        {advisory ? renderProduct(advisory, 'advisory') : null}
      </div>
    </section>
  );
}
