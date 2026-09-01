import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const readMany = async (relativePaths) => (await Promise.all(relativePaths.map(read))).join('\n');

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

const storefront = await read('src/components/website/FraudReadiness/FraudReadinessStorefront.tsx');
const scoreLanding = await read('src/app/(website)/fraud-readiness-score/page.tsx');
const publicLanding = await read('src/app/(website)/fraud-readiness/page.tsx');
const homeHero = await read('src/components/website/Home/HeroSection.tsx');
const snapshotPreview = await read('src/components/website/SnapshotPreview.tsx');
const startPage = await read('src/app/score/start/page.tsx');
const adaptivePage = await read('src/app/score/adaptive/[assessmentRef]/page.tsx');
const adaptiveExperience = await read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const button = await read('src/components/ui/Button.tsx');
const assessmentEngine = await read('src/components/assessment/AssessmentEngine.tsx');
const scoreGauge = await read('src/components/assessment/ScoreGauge.tsx');
const tierCard = await read('src/components/products/ProductTierCard.tsx');
const productChoice = await read('src/components/products/ProductChoice.tsx');
const snapshotResult = await read('src/components/assessment/SnapshotResult.tsx');
const orderJourney = await read('src/components/commercial/OrderJourney.tsx');
const privateAdvisory = await read('src/app/score/advisory/[assessmentRef]/page.tsx');
const publicAdvisory = await read('src/app/(website)/fraud-readiness/advisory/page.tsx');
const publicAdvisoryForm = await read('src/components/website/FraudReadiness/PublicAdvisoryEnquiryForm.tsx');
const wrapper = await read('src/components/website/Wrapper.tsx');
const globalCss = await read('src/app/globals.css');
const ownerBrief = await read('docs/product/v12-premium-experience-recovery-owner-brief.md');
const routeMap = await read('docs/product/v12-premium-experience-recovery-route-map.md');
const visualReviewRoute = await read('src/app/score/visual-review/[[...scenario]]/page.tsx');
const visualReviewFixtures = await read('src/lib/visual-review/fixtures.ts');
const termsGate = await read('src/components/adaptive/FraudReadinessTermsGate.tsx');

check('both public Fraud Readiness routes use one shared premium storefront', () => {
  assert.match(scoreLanding, /FraudReadinessStorefront/);
  assert.match(publicLanding, /FraudReadinessStorefront/);
  assert.equal((storefront.match(/<ProductTierCard/g) ?? []).length, 3);
  assert.match(storefront, /data-storefront/);
  assert.match(storefront, /SnapshotPreview/);
  assert.match(snapshotPreview, /data-snapshot-preview/);
});

check('the storefront presents a three-step journey and distinct product variants', () => {
  for (const phrase of ['Diagnose', 'Design', 'Implement', 'Clarify the position', 'Build the response', 'Move with a partner']) {
    assert.match(storefront, new RegExp(phrase));
  }
  for (const tier of ['essential', 'comprehensive', 'advisory']) {
    assert.match(tierCard, new RegExp(`tier === ['"]${tier}['"]|${tier}:`));
    assert.match(tierCard, new RegExp(`data-product-tier={tier}`));
  }
});

check('public assessment CTAs stay on the canonical adaptive start route', () => {
  assert.match(homeHero, /href="\/score\/start"/);
  assert.match(homeHero, /Assess Your Organisation/);
  assert.match(homeHero, /href="\/fraud-readiness"/);
  assert.match(homeHero, /Compare Fraud Readiness Options/);
  assert.match(storefront, /href="\/score\/start"/);
  assert.match(storefront, /id="start-score"/);
  assert.match(storefront, /data-adaptive-assessment-entry="true"/);
  assert.match(scoreLanding, /id="start-score"/);
  assert.match(scoreLanding, /href="\/score\/start"/);
  assert.match(scoreLanding, /data-adaptive-assessment-entry/);
});

check('start and resume surfaces preserve the private, accepted adaptive journey', () => {
  assert.match(startPage, /FraudReadinessTermsGate/);
  assert.match(startPage, /AdaptiveStartForm/);
  assert.match(startPage, /parseProductIntent/);
  assert.doesNotMatch(startPage, /StartAssessmentForm|data-native-assessment-start|\/score\/assessment\//);
  assert.doesNotMatch(adaptivePage, /FraudReadinessTermsGate|AdaptiveStartForm/);
  assert.match(adaptivePage, /getAdaptiveAssessmentState/);
  assert.match(adaptivePage, /server confirmation/);
  assert.match(adaptiveExperience, /expectedSaveSequence/);
  assert.match(adaptiveExperience, /customerExplanationForNode/);
  assert.match(adaptiveExperience, /Areas included in your review/);
  assert.match(adaptiveExperience, /assessmentProgressLabel/);
});

check('customer progress uses a percentage and current area, not a fixed question denominator', () => {
  assert.match(adaptiveExperience, /% complete/);
  assert.match(adaptiveExperience, /assessment scope is being determined/);
  assert.doesNotMatch(adaptiveExperience, /completedApplicableCount\s+of\s+activePathCount/);
  assert.doesNotMatch(adaptiveExperience, /Domain \$\{/);
  assert.doesNotMatch(assessmentEngine, /Domain \$\{domainNumber\} of/);
  assert.doesNotMatch(assessmentEngine, /\{progress\.answeredQuestions\}\/\{progress\.totalQuestions\}/);
  assert.doesNotMatch(assessmentEngine, /\{progress\.answeredExposureFactors\}\/\{progress\.totalExposureFactors\}/);
});

check('score gauges contain every terminal state inside one centred geometry', () => {
  assert.match(scoreGauge, /viewBox="0 0 240 240"/);
  assert.match(scoreGauge, /Math\.min\(100, score\)/);
  assert.match(scoreGauge, /x="120" y="116" textAnchor="middle"/);
  assert.match(scoreGauge, /x="120" y="147" textAnchor="middle"/);
  assert.match(scoreGauge, /Not issued/);
  assert.match(scoreGauge, /\/100/);
  assert.match(scoreGauge, /data-score-gauge-value/);
});

check('Snapshot conversion preserves catalogue pricing, immediate navigation and existing seams', () => {
  assert.match(productChoice, /COMMERCIAL_CATALOGUE/);
  assert.match(productChoice, /ProductTierCard/);
  assert.match(productChoice, /router\.push\(destination\)/);
  assert.match(productChoice, /void post\('report_option_selected'\)/);
  assert.match(productChoice, /keepalive: true/);
  assert.match(snapshotResult, /<ProductChoice/);
  assert.match(orderJourney, /\/paid-order/);
  assert.match(orderJourney, /invoiceRequested/);
  assert.match(privateAdvisory, /AdvisoryEnquiryForm/);
  assert.match(publicAdvisory, /PublicAdvisoryEnquiryForm/);
  assert.match(publicAdvisoryForm, /\/score\/api\/enquiries\/advisory/);
  assert.doesNotMatch(storefront, /(?:750_000|3_500_000|15_000_000|750000|3500000|15000000)/);
});

check('the narrow layout has width containment and no horizontal overflow escape', () => {
  assert.match(wrapper, /w-full overflow-x-hidden/);
  assert.match(globalCss, /overflow-x:\s*hidden/);
  assert.match(storefront, /grid gap-5 lg:grid-cols-3/);
  assert.match(storefront, /w-full max-w-7xl/);
  assert.match(tierCard, /min-w-0|flex h-full/);
});

check('customer-facing copy in the recovered path contains no em dash', async () => {
  const customerFiles = [
    'src/components/website/FraudReadiness/FraudReadinessStorefront.tsx',
    'src/components/website/Home/HeroSection.tsx',
    'src/components/products/ProductChoice.tsx',
    'src/components/products/ProductTierCard.tsx',
    'src/components/adaptive/AdaptiveAssessmentExperience.tsx',
    'src/components/adaptive/FraudReadinessTermsGate.tsx',
    'src/components/assessment/AssessmentEngine.tsx',
    'src/components/assessment/ScoreGauge.tsx',
    'src/app/score/start/page.tsx',
    'src/app/score/adaptive/[assessmentRef]/page.tsx',
    'src/app/(website)/fraud-readiness/advisory/page.tsx',
    'src/components/website/FraudReadiness/PublicAdvisoryEnquiryForm.tsx'
  ];
  const source = await readMany(customerFiles);
  assert.doesNotMatch(source, /—/);
});

check('terms summary uses bullets rather than dash-like line markers', () => {
  assert.match(termsGate, /h-1\.5 w-1\.5[^\n]*rounded-full/);
  assert.doesNotMatch(termsGate, /h-px w-3/);
});

check('the owner brief preserves enabled Production starts and approval-controlled interruption', () => {
  assert.match(ownerBrief, /Production assessment starts are currently enabled/);
  assert.match(ownerBrief, /must remain enabled/);
  assert.match(ownerBrief, /UI work must not disable/);
  assert.match(ownerBrief, /explicit owner approval/);
  assert.match(ownerBrief, /Do not deploy.*Production/);
  assert.match(routeMap, /fraud-readiness-score/);
  assert.match(routeMap, /score\/snapshot/);
  assert.match(routeMap, /score\/order\/new/);
  assert.match(routeMap, /Advisory/);
});

check('bounded owner corrections preserve accessibility and responsive commercial hierarchy', () => {
  const programmaticHeadings = adaptiveExperience.match(/<h1[^>]*tabIndex=\{-1\}[^>]*>/g) ?? [];
  assert.ok(programmaticHeadings.length >= 4, 'adaptive state headings remain programmatically focusable');
  assert.ok(programmaticHeadings.every((heading) => heading.includes('focus:outline-none')), 'programmatic heading focus has no visual rectangle');
  assert.match(adaptiveExperience, /text-xl[^\n]*md:text-2xl/, 'active question is smaller on narrow mobile and restored at md');
  assert.match(adaptiveExperience, /<Button/, 'interactive assessment actions remain real controls');
  assert.match(adaptiveExperience, /<input type="radio"/, 'interactive assessment answers remain real controls');
  assert.match(button, /focus:ring-2/, 'shared interactive controls retain visible keyboard focus styling');
  assert.match(productChoice, /recommendation\.recommendedTier === 'comprehensive'/, 'mobile order follows the deterministic recommendation');
  assert.match(productChoice, /const paidTiers/, 'paid tiers retain both options while changing mobile order');
  assert.match(productChoice, /md:order-1/);
  assert.match(productChoice, /md:order-2/);
  assert.match(orderJourney, /initialInvoiceDetails/);
  assert.match(visualReviewRoute, /billing-invoice/);
  assert.match(visualReviewFixtures, /buildVisualReviewInvoiceDetails/);
  assert.match(publicAdvisory, /scoped and contracted around the work in front of you/);
  assert.doesNotMatch(publicAdvisory, /not bought online/);
});

check('private visual review is Preview/local-only and uses deterministic real-component fixtures', () => {
  assert.match(visualReviewRoute, /notFound\(\)/);
  assert.match(visualReviewRoute, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(visualReviewRoute, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(visualReviewRoute, /AdaptiveAssessmentExperience/);
  assert.match(visualReviewRoute, /SnapshotResult/);
  assert.match(visualReviewRoute, /OrderJourney/);
  assert.match(visualReviewFixtures, /resolveAdaptivePath/);
  assert.match(visualReviewFixtures, /adaptive-graph-v1-2-candidate\.json/);
  for (const state of ['early', 'mid', 'late', 'review', 'submitted', 'score-100', 'score-60', 'score-20', 'insufficient-visibility']) {
    assert.match(visualReviewRoute, new RegExp(state.replaceAll('-', '\\-')));
  }
  assert.doesNotMatch(`${visualReviewRoute}\n${visualReviewFixtures}`, /createSupabase|validateSnapshotToken|loadFreeSnapshot|fetch\(|\.from\(/i);
  assert.match(adaptiveExperience, /visualReview = false/);
  assert.match(adaptiveExperience, /No assessment data is saved/);
  assert.match(adaptiveExperience, /No assessment is submitted/);
  assert.match(orderJourney, /if \(visualReview\) \{/);
  assert.match(productChoice, /if \(visualReview\) return;/);
});

console.log(JSON.stringify({ ok: true, checks, mutation: 'no Supabase or Production mutation' }, null, 2));
