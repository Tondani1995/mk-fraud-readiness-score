import { ArrowRight, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { ProductTierCard } from '@/components/products/ProductTierCard';
import MethodologyTrust from '@/components/website/MethodologyTrust';
import { SnapshotPreview } from '@/components/website/SnapshotPreview';
import { Button } from '@/components/website/ui/button';
import { COMMERCIAL_CATALOGUE } from '@/lib/commercial/product-catalogue';
import { readinessTrack } from '@/lib/website/readiness-track';
import { REVIEW_STOREFRONT } from '@/lib/website/review-track-copy';

function formatPrice(priceCents: number | null) {
  if (priceCents === null) return 'Scoped with MK';
  return `${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(priceCents / 100)} incl. VAT`;
}

export function FraudReadinessStorefront() {
  // The review track changes only what is true of it: the hero description, the journey and the paid-tier notice.
  const review = readinessTrack() === 'review';
  const essential = COMMERCIAL_CATALOGUE.essential;
  const comprehensive = COMMERCIAL_CATALOGUE.comprehensive;
  const advisory = COMMERCIAL_CATALOGUE.advisory;
  const advisoryPrice =
    advisory.tier === 'advisory'
      ? `From ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(advisory.priceFromCents / 100)} per engagement`
      : 'Scoped with MK';

  return (
    <main className="clarity-storefront w-full overflow-hidden bg-mk-surface text-mk-navy" data-storefront>
      <section className="relative overflow-hidden bg-mk-navy text-white">
        <div className="absolute inset-0 " />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 pb-12 pt-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,0.88fr)_minmax(440px,1.12fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-paper">
              MK&apos;s flagship assessment
            </p>
            <h1 className="mt-4 max-w-xl text-[2.15rem] font-semibold leading-[1.08] tracking-normal sm:text-5xl lg:text-[4rem]">
              How fraud-ready is your organisation?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
              {review
                ? REVIEW_STOREFRONT.heroBody
                : 'Complete the free MK Fraud Readiness Assessment and receive a private, self-reported Snapshot of your organisation\'s readiness and areas requiring management attention.'}
            </p>
            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-mk-paper">
              No evidence uploads, customer records or transaction-level data are required to take part.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Button
                asChild
                size="lg"
                className="h-auto min-h-12 rounded-brand bg-white px-7 text-mk-navy shadow-soft hover:bg-white/90"
                data-storefront-cta="start-assessment"
              >
                <Link href="/score/start">
                  Start the free assessment <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-auto min-h-12 rounded-brand border-white/30 bg-transparent px-7 text-white hover:bg-white/8 hover:text-white"
              >
                <Link href="#products">Compare support options</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
              {['Private result link', 'Immediate Snapshot', 'No account required'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <SnapshotPreview />
          </div>
        </div>
      </section>

      <section className="border-b border-mk-line bg-mk-paper">
        <div
          className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-10 sm:px-6 sm:py-12 md:grid-cols-3 lg:px-8 lg:py-16"
          data-assessment-journey
        >
          {(review ? REVIEW_STOREFRONT.steps : [
            [
              'Diagnose',
              'Start with a tailored assessment that asks only what is relevant to your organisation.'
            ],
            [
              'Design',
              'Use the Snapshot to understand the position, the gaps and the decisions that matter.'
            ],
            [
              'Implement',
              'Choose a detailed report or a scoped Advisory engagement when you are ready to move.'
            ]
          ]).map(([title, body]) => (
            <article key={title} className="border-t-2 border-mk-accent pt-5">
              <h2 className="mt-3 text-xl font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-mk-accent">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="products" className="scroll-mt-24 bg-mk-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-accent">After your Snapshot</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
              What your organisation can do with its result
            </h2>
            <p className="mt-4 text-base leading-7 text-mk-accent" data-storefront-products-intro>
              {review
                ? REVIEW_STOREFRONT.productsIntro
                : 'The Snapshot is the starting point. The next product is chosen by the work you need the result to do.'}
            </p>
          </div>
          <div
            className="mt-9 grid gap-5 lg:grid-cols-3"
            role="group"
            aria-label="Fraud readiness support options"
          >
            <ProductTierCard
              tier="essential"
              label={essential.label}
              phase="Diagnose"
              tagline="Know where you stand."
              priceLabel={formatPrice(essential.priceCents)}
              description={essential.summary}
              features={[...essential.includes].slice(0, 4)}
              action={
                review ? (
                  <p className="text-sm leading-6 text-mk-muted" data-paid-unavailable>{REVIEW_STOREFRONT.paidUnavailable}</p>
                ) : (<Button
                  asChild
                  size="lg"
                  className="w-full rounded-brand bg-mk-navy text-white hover:bg-mk-navy"
                >
                  <Link href="/score/start">
                    Start with Essential <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>)
              }
            />
            <ProductTierCard
              tier="comprehensive"
              label={comprehensive.label}
              phase="Design"
              tagline="Design what needs to change."
              priceLabel={formatPrice(comprehensive.priceCents)}
              description={comprehensive.summary}
              features={[...comprehensive.includes].slice(0, 5)}
              
              action={
                review ? (
                  <p className="text-sm leading-6 text-mk-muted" data-paid-unavailable>{REVIEW_STOREFRONT.paidUnavailable}</p>
                ) : (<Button
                  asChild
                  size="lg"
                  className="w-full rounded-brand bg-white text-mk-navy hover:bg-mk-surface"
                >
                  <Link href="/score/start">
                    Start with Comprehensive <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>)
              }
            />
            <ProductTierCard
              tier="advisory"
              label={advisory.label}
              phase="Implement"
              tagline="Work with MK to implement it."
              priceLabel={advisoryPrice}
              description={advisory.summary}
              features={[...advisory.includes, 'A direct conversation shaped by your Snapshot']}
              action={
                <Button
                  asChild
                  size="lg"
                  className="w-full rounded-brand bg-mk-navy text-white hover:bg-mk-navy"
                >
                  <Link href="/fraud-readiness/advisory">
                    Discuss Advisory <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              }
            />
          </div>
          <p className="mt-5 text-sm leading-6 text-mk-muted">
            Prices are catalogue prices and include VAT where shown. Advisory is manually scoped and is not an
            online order.
          </p>
        </div>
      </section>

      <MethodologyTrust />

      <section
        id="start-score"
        className="border-t border-mk-line bg-white"
        data-adaptive-assessment-entry="true"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:px-6 sm:py-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:px-8 lg:py-20">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-accent">
              Start with the result
            </p>
            <h2 className="mt-3 max-w-md text-[1.75rem] font-semibold leading-tight tracking-normal sm:text-3xl">
              A tailored assessment before any report decision.
            </h2>
            <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
              <Button
                asChild
                size="lg"
                className="h-auto min-h-12 rounded-brand bg-mk-navy px-7 text-white hover:bg-mk-navy"
              >
                <Link href="/score/start">
                  Start the assessment <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-auto min-h-12 rounded-brand border-mk-accent/20 px-7 text-mk-navy"
              >
                <Link href="/contact">Speak to MK</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-brand border border-mk-line bg-mk-surface p-5">
              <LockKeyhole className="h-5 w-5 text-mk-accent" />
              <h3 className="mt-5 font-semibold">Private and practical</h3>
              <p className="mt-2 text-sm leading-6 text-mk-accent">
                No account is required. Your result is available through a private link after submission.
              </p>
            </div>
            <div className="rounded-brand border border-mk-line bg-mk-surface p-5">
              <span className="flex h-5 w-5 items-center justify-center rounded-brand bg-mk-navy text-[12px] font-semibold text-white">
                i
              </span>
              <h3 className="mt-5 font-semibold">Read the scope properly</h3>
              <p className="mt-2 text-sm leading-6 text-mk-accent">
                The assessment analyses what was reported. It does not independently test evidence or provide
                an assurance opinion.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
