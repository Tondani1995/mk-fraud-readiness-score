import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const route = await read('src/app/score/visual-review/[[...scenario]]/page.tsx');
const fixtures = await read('src/lib/visual-review/fixtures.ts');
const snapshotResult = await read('src/components/assessment/SnapshotResult.tsx');
const productChoice = await read('src/components/products/ProductChoice.tsx');
const adaptiveExperience = await read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const orderJourney = await read('src/components/commercial/OrderJourney.tsx');
const staticReview = await read('scripts/commercial-quality/render-snapshot-review.mjs');

const requiredRoutes = [
  '/score/visual-review/adaptive/early',
  '/score/visual-review/adaptive/mid',
  '/score/visual-review/adaptive/late',
  '/score/visual-review/adaptive/review',
  '/score/visual-review/adaptive/submitted',
  '/score/visual-review/snapshot/score-100',
  '/score/visual-review/snapshot/score-60',
  '/score/visual-review/snapshot/score-20',
  '/score/visual-review/snapshot/insufficient-visibility',
  '/score/visual-review/order/essential/confirm',
  '/score/visual-review/order/essential/billing',
  '/score/visual-review/order/essential/payment',
  '/score/visual-review/order/comprehensive/confirm',
  '/score/visual-review/order/comprehensive/billing',
  '/score/visual-review/order/comprehensive/payment'
];

assert.match(route, /export const dynamic = 'force-dynamic'/);
assert.match(route, /export const revalidate = 0/);
assert.match(route, /process\.env\.VERCEL_ENV === 'preview'/);
assert.match(route, /process\.env\.NODE_ENV !== 'production'/);
assert.match(route, /if \(!visualReviewAllowed\(\)\) notFound\(\)/);
assert.match(route, /AdaptiveAssessmentExperience/);
assert.match(route, /SnapshotResult/);
assert.match(route, /OrderJourney/);
for (const requiredRoute of requiredRoutes) assert.match(route, new RegExp(requiredRoute.replaceAll('/', '\\/')));

assert.match(fixtures, /resolveAdaptivePath/);
assert.match(fixtures, /deriveAdaptiveIntegritySignals/);
assert.match(fixtures, /adaptive-graph-v1-2-candidate\.json/);
for (const variant of ['early', 'mid', 'late', 'review', 'submitted']) assert.match(fixtures, new RegExp(`'${variant}'`));
for (const variant of ['score-100', 'score-60', 'score-20', 'insufficient-visibility']) assert.match(fixtures, new RegExp(`'${variant}'`));
assert.match(fixtures, /overallScore: 100/);
assert.match(fixtures, /overallScore: 20/);
assert.match(fixtures, /resultStatus: 'INSUFFICIENT_VISIBILITY'/);
assert.match(fixtures, /buildVisualReviewOrder/);

// The server route and fixture builders contain no persistence or request path. The real client
// components are still used, but their normal network actions are disabled only when the route
// explicitly passes the isolated visualReview flag.
assert.doesNotMatch(`${route}\n${fixtures}`, /createSupabase|validateSnapshotToken|loadFreeSnapshot|fetch\(|\.from\(/i);
assert.match(route, /visualReview\n/);
assert.match(snapshotResult, /visualReview = false/);
assert.match(snapshotResult, /<ProductChoice[\s\S]*visualReview={visualReview}/);
assert.match(productChoice, /if \(visualReview\) return;/);
assert.match(productChoice, /if \(visualReview\) \{/);
assert.match(adaptiveExperience, /visualReview = false/);
assert.match(adaptiveExperience, /No assessment data is saved/);
assert.match(adaptiveExperience, /No assessment is submitted/);
assert.match(orderJourney, /if \(visualReview\) \{/);
assert.match(orderJourney, /No order is recorded/);
assert.match(orderJourney, /order\.assessmentReference && !visualReview/);
assert.match(staticReview, /SnapshotResult/);
assert.match(staticReview, /OrderJourney/);

console.log(JSON.stringify({
  ok: true,
  requiredRoutes: requiredRoutes.length,
  adaptiveStates: 5,
  snapshotStates: 4,
  orderStates: 6,
  mutation: 'isolated visualReview mode has no Supabase query or mutation path',
  production: 'notFound'
}, null, 2));
