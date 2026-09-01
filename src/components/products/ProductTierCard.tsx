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
    card: 'border-[#d8cbbb] bg-[#f4efe7] text-[#001030]',
    phase: 'text-[#8a6d4b]',
    title: 'text-[#001030]',
    body: 'text-[#4f5d66]',
    price: 'text-[#001030]',
    bullet: 'bg-[#8a6d4b]',
    featureBorder: 'border-[#d8cbbb]'
  },
  comprehensive: {
    card: 'border-[#31565e] bg-[#12333c] text-white shadow-[0_22px_50px_rgba(0,16,48,0.18)]',
    phase: 'text-[#a9d4ce]',
    title: 'text-white',
    body: 'text-white/72',
    price: 'text-white',
    bullet: 'bg-[#a9d4ce]',
    featureBorder: 'border-white/15',
    badge: 'bg-[#a9d4ce] text-[#12333c]'
  },
  advisory: {
    card: 'border-[#cbbd9f] bg-[#e8decc] text-[#001030]',
    phase: 'text-[#80613b]',
    title: 'text-[#001030]',
    body: 'text-[#4f5d66]',
    price: 'text-[#001030]',
    bullet: 'bg-[#80613b]',
    featureBorder: 'border-[#cbbd9f]'
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
      className={`flex h-full flex-col rounded-[1.65rem] border p-6 ${compact ? 'md:p-7' : 'md:p-8'} ${style.card}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${style.phase}`}>{phase}</p>
          <p className={`mt-2 text-xs font-semibold uppercase tracking-[0.16em] ${style.body}`}>{label}</p>
          <h3 id={headingId} className={`mt-3 text-2xl font-semibold tracking-tight ${style.title}`}>{tagline}</h3>
        </div>
        {featuredLabel ? <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${style.badge ?? 'border border-[#80613b]/25 bg-white/50 text-[#80613b]'}`}>{featuredLabel}</span> : null}
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
