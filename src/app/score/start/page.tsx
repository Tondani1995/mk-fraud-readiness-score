import { AdaptiveStartForm } from '@/components/adaptive/AdaptiveStartForm';
import { FraudReadinessTermsGate } from '@/components/adaptive/FraudReadinessTermsGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { SectionShell } from '@/components/ui/SectionShell';
import { COMMERCIAL_CATALOGUE } from '@/lib/commercial/product-catalogue';
import { parseProductIntent } from '@/lib/commercial/product-intent';
import { redirect } from 'next/navigation';

function selectedProductContext(tier: 'essential' | 'comprehensive') {
  const product = COMMERCIAL_CATALOGUE[tier];
  const priceCents = product.priceCents;
  if (priceCents === null) throw new Error('Orderable product price is required.');
  return {
    label: product.label,
    price: `${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(priceCents / 100)} incl. VAT`
  };
}
export default async function StartAssessmentPage(props: { searchParams?: Promise<{ embed?: string; product?: string }> }) {
  const searchParams = await props.searchParams;
  if (searchParams?.embed === '1') redirect('/score/start');

  const productIntent = parseProductIntent(searchParams?.product);
  const selected = productIntent ? selectedProductContext(productIntent) : null;

  return (
    <FraudReadinessTermsGate>
      <SectionShell className="w-full py-10 md:py-14">
        <div className="mb-8 grid gap-8 rounded-[2rem] border border-mk-line bg-mk-cream px-6 py-9 md:px-10 md:py-12 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-mk-brassDark">Fraud Readiness Assessment</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-mk-ink md:text-5xl">Assess your organisation&rsquo;s fraud readiness.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-mk-muted">A short organisation profile shapes the assessment path, so your Snapshot reflects the control areas that matter to your operating environment.</p>
          </div>
          <div className="rounded-2xl border border-mk-line bg-white/75 p-5 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">A private, practical journey</p>
            <p className="mt-2">No account is required. Your answers are saved after server confirmation and your private result link is created after submission.</p>
          </div>
        </div>

        {selected ? (
          <div className="mb-8 max-w-3xl border-l-2 border-mk-brass bg-mk-surface px-5 py-4">
            <p className="text-sm font-semibold text-mk-ink">You selected {selected.label}</p>
            <p className="mt-1.5 text-sm leading-6 text-mk-muted">{selected.price}. Completing the Fraud Readiness Assessment is required before your {selected.label} report can be prepared. Nothing is charged now. You confirm and pay after you have seen your Snapshot.</p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
          <Card className="bg-mk-charcoal text-white" data-assessment-start="true">
            <CardHeader className="border-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">What to expect</p>
              <CardTitle className="mt-2 text-white">Start with the free readiness Snapshot.</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-white/80">
              <div className="border-l border-white/20 pl-4"><p className="font-semibold text-white">01. Set the context</p><p className="mt-1">Provide the organisation details that shape the assessment.</p></div>
              <div className="border-l border-white/20 pl-4"><p className="font-semibold text-white">02. Follow the tailored path</p><p className="mt-1">Answer the relevant control questions without creating an account.</p></div>
              <div className="border-l border-white/20 pl-4"><p className="font-semibold text-white">03. Use the result</p><p className="mt-1">Read the private Snapshot, then choose a report or discuss Advisory support.</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tell us about your organisation</CardTitle>
              <p className="mt-2 text-sm leading-6 text-mk-muted">Use a work email and the organisation&apos;s registered or trading name. We use this context to tailor the journey.</p>
            </CardHeader>
            <CardContent>
              <AdaptiveStartForm productIntent={productIntent} />
            </CardContent>
          </Card>
        </div>
      </SectionShell>
    </FraudReadinessTermsGate>
  );
}
