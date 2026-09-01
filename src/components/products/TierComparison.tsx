import type { ReactNode } from 'react';
import { ProductTierCard, type ProductTier } from '@/components/products/ProductTierCard';

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

const TIER_BY_ID: Record<string, ProductTier> = {
  essential: 'essential',
  comprehensive: 'comprehensive',
  advisory: 'advisory'
};

const PHASE_BY_TIER: Record<ProductTier, string> = {
  essential: 'Diagnose',
  comprehensive: 'Design',
  advisory: 'Implement'
};

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
  const renderProduct = (product: TierComparisonProduct) => {
    const tier = TIER_BY_ID[product.id] ?? 'essential';
    return (
    <ProductTierCard
      key={product.id}
      tier={tier}
      label={product.label}
      phase={PHASE_BY_TIER[tier]}
      tagline={product.tagline}
      priceLabel={product.priceLabel}
      description={product.description}
      features={product.features}
      compact
      action={product.action}
    />
    );
  };

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
