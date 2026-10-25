import type { ReactNode } from "react";
export type ProductTier = "essential" | "comprehensive" | "advisory";
export type ProductTierCardProps = {
  id?: string;
  tier: ProductTier;
  label: string;
  phase: string;
  tagline: string;
  priceLabel?: string;
  description?: string;
  features: string[];
  action?: ReactNode;
  featuredLabel?: string;
  compact?: boolean;
  earlierSelected?: boolean;
};
/** Equal advisory-service presentations; the customer's earlier choice never becomes a recommendation. */
export function ProductTierCard({
  id,
  tier,
  label,
  phase,
  tagline,
  priceLabel,
  description,
  features,
  action,
  earlierSelected = false,
}: ProductTierCardProps) {
  return (
    <article
      id={id}
      data-product-tier={tier}
      data-tier-visual={tier}
      data-earlier-selection={earlierSelected ? "true" : undefined}
      aria-labelledby={`${tier}-product-title`}
      className="flex h-full flex-col rounded-brand border border-mk-line bg-white p-6 text-mk-navy md:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
        {phase}
      </p>
      <p className="mt-3 text-sm text-mk-muted">{label}</p>
      <h3
        id={`${tier}-product-title`}
        className="mt-3 text-2xl font-medium leading-snug"
      >
        {tagline}
      </h3>
      {description && (
        <p className="mt-5 text-base leading-relaxed text-mk-muted">
          {description}
        </p>
      )}
      <ul
        className="mt-6 space-y-4 border-t border-mk-line pt-5 text-base leading-relaxed text-mk-muted"
        aria-label={`${label} includes`}
      >
        {features.slice(0, 4).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      {priceLabel && <p className="mt-6 text-base font-normal">{priceLabel}</p>}
      {earlierSelected && (
        <p className="mt-3 text-sm text-mk-muted">
          You selected this option earlier.
        </p>
      )}
      {action && <div className="mt-auto pt-7">{action}</div>}
    </article>
  );
}
