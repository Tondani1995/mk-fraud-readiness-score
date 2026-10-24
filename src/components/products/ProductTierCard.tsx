import type { ReactNode } from 'react';

export type ProductTier = 'essential' | 'comprehensive' | 'advisory';

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

const styles: Record<ProductTier, {
  card: string;
  phase: string;
  title: string;
  body: string;
  price: string;
  bullet: string;
  featureBorder: string;
  badge?: string;
}> = {
  essential: {
    card: 'border-[#cbd5e1] bg-[#ffffff] text-[#001030]',
    phase: 'text-[#475569]',
    title: 'text-[#001030]',
    body: 'text-[#4f5d66]',
    price: 'text-[#001030]',
    bullet: 'bg-[#1d3658]',
    featureBorder: 'border-[#cbd5e1]'
  },
  comprehensive: {
    card: 'border-[#2e4666] bg-[#001030] text-white',
    phase: 'text-[#c8d9bf]',
    title: 'text-white',
    body: 'text-white/72',
    price: 'text-white',
    bullet: 'bg-[#c8d9bf]',
    featureBorder: 'border-white/15',
    badge: 'bg-[#c8d9bf] text-[#001030]'
  },
  advisory: {
    card: 'border-[#cbd5e1] bg-white text-[#001030]',
    phase: 'text-[#475569]',
    title: 'text-[#001030]',
    body: 'text-[#4f5d66]',
    price: 'text-[#001030]',
    bullet: 'bg-[#1d3658]',
    featureBorder: 'border-[#cbd5e1]'
  }
};

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
  featuredLabel,
  compact = false,
  earlierSelected = false
}: ProductTierCardProps) {
  const style = styles[tier];
  const headingId = `${tier}-product-title`;

  return (
    <article
      id={id}
      data-product-tier={tier}
      data-tier-visual={tier}
      data-earlier-selection={earlierSelected ? 'true' : undefined}
      aria-labelledby={headingId}
      className={`flex h-full flex-col rounded-[3px] border p-6 ${compact ? 'md:p-7' : 'md:p-8'} ${style.card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[12px] font-bold uppercase tracking-[0.2em] ${style.phase}`}>{phase}</p>
          <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.16em] ${style.body}`}>{label}</p>
          <h3 id={headingId} className={`mt-3 text-2xl font-semibold tracking-tight ${style.title}`}>{tagline}</h3>
        </div>
        {featuredLabel ? <span className={`rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em] ${style.badge ?? 'border border-[#475569]/25 bg-white/50 text-[#475569]'}`}>{featuredLabel}</span> : null}
      </div>
      {priceLabel ? <p className={`mt-6 text-lg font-semibold ${style.price}`}>{priceLabel}</p> : null}
      {description ? <p className={`mt-3 text-sm leading-6 ${style.body}`}>{description}</p> : null}
      <ul className={`mt-6 space-y-3 border-t pt-5 ${style.featureBorder}`} aria-label={`${label} includes`}>
        {features.map((feature) => (
          <li key={feature} className={`flex gap-3 text-sm leading-6 ${style.body}`}>
            <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${style.bullet}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {action ? <div className="mt-auto pt-7">{action}</div> : null}
    </article>
  );
}
