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
      {description && description !== tagline && (
        <p className="mt-5 text-base leading-relaxed text-mk-muted">
          {description}
        </p>
      )}
      {features[0] && <p className="mt-4 text-sm leading-relaxed text-mk-muted">{features[0]}</p>}
      <details className="mt-4 border-y border-mk-line py-2 text-mk-muted">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          Included in {label}
        </summary>
        <ul
          className="space-y-3 py-3 text-base leading-relaxed text-mk-muted"
          aria-label={`${label} includes`}
        >
          {features.slice(1, 4).map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </details>
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
