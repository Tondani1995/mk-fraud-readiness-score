import { ArrowRight, Check, LockKeyhole, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { ProductTierCard } from '@/components/products/ProductTierCard';
import { SnapshotPreview } from '@/components/website/SnapshotPreview';
import { Button } from '@/components/website/ui/button';
import { COMMERCIAL_CATALOGUE } from '@/lib/commercial/product-catalogue';

function formatPrice(priceCents: number | null) {
  if (priceCents === null) return 'Scoped with MK';
  return `${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(priceCents / 100)} incl. VAT`;
}

export function FraudReadinessStorefront() {
  const essential = COMMERCIAL_CATALOGUE.essential;
  const comprehensive = COMMERCIAL_CATALOGUE.comprehensive;
  const advisory = COMMERCIAL_CATALOGUE.advisory;
  const advisoryPrice = advisory.tier === 'advisory'
    ? `From ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(advisory.priceFromCents / 100)} per engagement`
    : 'Scoped with MK';

  return (
    <main className="w-full overflow-hidden bg-[#f7f5f0] text-[#001030]" data-storefront>
      <section className="relative overflow-hidden bg-[#001030] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,rgba(169,212,206,0.16),transparent_34%),linear-gradient(115deg,rgba(255,255,255,0.05),transparent_48%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[minmax(0,0.88fr)_minmax(440px,1.12fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
          <div className="min-w-0 max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/78">
              <Sparkles className="h-3.5 w-3.5 text-[#a9d4ce]" />
              Free organisational self-assessment
            </p>
            <h1 className="mt-6 max-w-[11ch] text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-[4.25rem]">
              How fraud-ready is your organisation?
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-white/72 sm:text-lg">
              Complete the free MK Fraud Readiness Assessment and receive a private, self-reported Snapshot of your organisation&apos;s readiness and exposure.
            </p>
            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-[#a9d4ce]">
              No evidence uploads, customer records or transaction-level data are required to take part.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-12 rounded-xl bg-white px-7 text-[#001030] shadow-xl hover:bg-white/90" data-storefront-cta="start-assessment">
                <Link href="/score/start">Start the free assessment <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-white/20 bg-transparent px-7 text-white hover:bg-white/8 hover:text-white">
                <Link href="#products">Compare support options</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/65">
              {['Private result link', 'Immediate Snapshot', 'No account required'].map((item) => (
                <span key={item} className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#a9d4ce]" />{item}</span>
              ))}
            </div>
          </div>
          <div className="min-w-0"><SnapshotPreview /></div>
        </div>
      </section>

      <section className="border-b border-[#dfd8cb] bg-[#fbfaf7]">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-12 md:grid-cols-3 lg:px-8 lg:py-16" data-assessment-journey>
          {[
            ['01', 'Diagnose', 'Start with a tailored assessment that asks only what is relevant to your organisation.'],
            ['02', 'Design', 'Use the Snapshot to understand the position, the gaps and the decisions that matter.'],
            ['03', 'Implement', 'Choose a detailed report or a scoped Advisory engagement when you are ready to move.']
          ].map(([number, title, body]) => (
            <article key={title} className="border-t-2 border-[#001030] pt-5">
              <p className="text-xs font-bold tracking-[0.2em] text-[#8a6d4b]">{number}</p>
              <h2 className="mt-3 text-xl font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#4f5d66]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="products" className="scroll-mt-24 bg-[#f7f5f0]">
        <div className="mx-auto w-full max-w-7xl px-6 py-14 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a6d4b]">Support ladder</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">One result. Three ways to use it.</h2>
            <p className="mt-4 text-base leading-7 text-[#4f5d66]">The Snapshot is the starting point. The next product is chosen by the work you need the result to do.</p>
          </div>
          <div className="mt-9 grid gap-5 lg:grid-cols-3" role="list" aria-label="Fraud readiness support options">
            <ProductTierCard
              tier="essential"
              label={essential.label}
              phase="Diagnose"
              tagline="Clarify the position"
              priceLabel={formatPrice(essential.priceCents)}
              description={essential.summary}
              features={[...essential.includes].slice(0, 4)}
              action={<Button asChild size="lg" className="w-full rounded-xl bg-[#001030] text-white hover:bg-[#12333c]"><Link href="/score/start">Start with Essential <ArrowRight className="h-4 w-4" /></Link></Button>}
            />
            <ProductTierCard
              tier="comprehensive"
              label={comprehensive.label}
              phase="Design"
              tagline="Build the response"
              priceLabel={formatPrice(comprehensive.priceCents)}
              description={comprehensive.summary}
              features={[...comprehensive.includes].slice(0, 5)}
              featuredLabel="Deeper analysis"
              action={<Button asChild size="lg" className="w-full rounded-xl bg-white text-[#001030] hover:bg-[#f4efe7]"><Link href="/score/start">Start with Comprehensive <ArrowRight className="h-4 w-4" /></Link></Button>}
            />
            <ProductTierCard
              tier="advisory"
              label={advisory.label}
              phase="Implement"
              tagline="Move with a partner"
              priceLabel={advisoryPrice}
              description={advisory.summary}
              features={[...advisory.includes, 'A direct conversation shaped by your Snapshot']}
              action={<Button asChild size="lg" className="w-full rounded-xl bg-[#001030] text-white hover:bg-[#12333c]"><Link href="/fraud-readiness/advisory">Discuss Advisory <ArrowRight className="h-4 w-4" /></Link></Button>}
            />
          </div>
          <p className="mt-5 text-sm leading-6 text-[#667085]">Prices are catalogue prices and include VAT where shown. Advisory is manually scoped and is not an online order.</p>
        </div>
      </section>

      <section id="start-score" className="border-t border-[#dfd8cb] bg-white" data-adaptive-assessment-entry="true">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:px-8 lg:py-20">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8a6d4b]">Start with the result</p>
            <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight">A tailored assessment before any report decision.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#dfd8cb] bg-[#f7f5f0] p-5">
              <LockKeyhole className="h-5 w-5 text-[#8a6d4b]" />
              <h3 className="mt-5 font-semibold">Private and practical</h3>
              <p className="mt-2 text-sm leading-6 text-[#4f5d66]">No account is required. Your result is available through a private link after submission.</p>
            </div>
            <div className="rounded-2xl border border-[#dfd8cb] bg-[#f7f5f0] p-5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#001030] text-[10px] font-bold text-white">i</span>
              <h3 className="mt-5 font-semibold">Read the scope properly</h3>
              <p className="mt-2 text-sm leading-6 text-[#4f5d66]">The assessment analyses what was reported. It does not independently test evidence or provide an assurance opinion.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#12333c] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-12 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#a9d4ce]">Ready when you are</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Start with a clearer view of the organisation.</h2>
          </div>
          <Button asChild size="lg" className="h-12 rounded-xl bg-white px-7 text-[#001030] hover:bg-white/90"><Link href="/score/start">Start the assessment <ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      </section>
    </main>
  );
}
