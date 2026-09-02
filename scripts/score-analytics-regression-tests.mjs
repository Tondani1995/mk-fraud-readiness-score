import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const scoreLayout = read('src/app/score/layout.tsx');
const scoreRuntime = read('src/app/score/ScoreAnalyticsRuntime.tsx');
const websiteLayout = read('src/app/(website)/layout.tsx');
const analytics = read('src/components/website/GoogleAnalytics.tsx');
const consent = read('src/components/website/CookieConsent.tsx');
const gtag = read('src/lib/website/gtag.ts');
const startForm = read('src/components/adaptive/AdaptiveStartForm.tsx');
const assessmentExperience = read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const adaptiveServer = read('src/lib/adaptive/server.ts');

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

console.log('score analytics regression checks');

check('score layout mounts the existing consent-aware analytics runtime', () => {
  assert.match(scoreLayout, /ScoreAnalyticsRuntime/);
  assert.match(scoreLayout, /<ScoreAnalyticsRuntime\s*\/>/);
  assert.match(scoreRuntime, /@\/components\/website\/GoogleAnalytics/);
  assert.match(scoreRuntime, /@\/components\/website\/CookieConsent/);
  assert.match(scoreRuntime, /<GoogleAnalytics\s*\/>/);
  assert.match(scoreRuntime, /<CookieConsent\s*\/>/);
  assert.match(scoreRuntime, /<Suspense fallback=\{null\}>/);
});

check('private admin and visual-review score routes stay outside public analytics', () => {
  assert.match(scoreRuntime, /\/score\/admin/);
  assert.match(scoreRuntime, /\/score\/visual-review/);
  assert.match(scoreRuntime, /if \(isPrivateScorePath\(pathname\)\) return null/);
});

check('start event follows a successful start response', () => {
  const responseGuard = startForm.indexOf('if (!response.ok || !body.ok)');
  const startEvent = startForm.indexOf("trackEvent('fraud_readiness_start'");
  assert.ok(responseGuard >= 0, 'start response guard is present');
  assert.ok(startEvent > responseGuard, 'start event must follow the response guard');
  assert.match(startForm, /trackEvent\('fraud_readiness_start', \{ flow: 'adaptive' \}\)/);
});

check('completion event follows a successful response with a valid Snapshot URL', () => {
  const responseGuard = assessmentExperience.indexOf('if (!response.ok || !body.ok)');
  const snapshotGuard = assessmentExperience.indexOf("if (typeof body.snapshotUrl !== 'string' || !body.snapshotUrl)");
  const completionEvent = assessmentExperience.indexOf("trackEvent('fraud_readiness_completed'");
  assert.ok(responseGuard >= 0, 'completion response guard is present');
  assert.ok(snapshotGuard > responseGuard, 'Snapshot URL guard follows the response guard');
  assert.ok(completionEvent > snapshotGuard, 'completion event must follow the valid Snapshot URL guard');
  assert.match(assessmentExperience, /trackEvent\('fraud_readiness_completed', \{ flow: 'adaptive' \}\)/);
});

check('failed completion paths cannot emit the completion event', () => {
  const completionEvent = assessmentExperience.indexOf("trackEvent('fraud_readiness_completed'");
  const failedResponse = assessmentExperience.indexOf('if (!response.ok || !body.ok)');
  const missingSnapshot = assessmentExperience.indexOf("if (typeof body.snapshotUrl !== 'string' || !body.snapshotUrl)");
  assert.ok(failedResponse < completionEvent && missingSnapshot < completionEvent);
  assert.match(assessmentExperience.slice(failedResponse, completionEvent), /setSubmissionState\('error'\)/);
  assert.match(assessmentExperience.slice(missingSnapshot, completionEvent), /setSubmissionState\('error'\)/);
});

check('duplicate or locked submissions do not create a second completion event', () => {
  assert.match(assessmentExperience, /savingRef\.current \|\| submissionState === 'processing'/);
  assert.match(adaptiveServer, /status: 409/);
  assert.match(adaptiveServer, /adaptive_assessment_locked/);
  assert.equal((assessmentExperience.match(/trackEvent\('fraud_readiness_completed'/g) ?? []).length, 1);
});

check('score routes use no score-specific measurement ID or second GA implementation', () => {
  assert.doesNotMatch(scoreLayout, /GA_MEASUREMENT_ID|NEXT_PUBLIC_GA_MEASUREMENT_ID|gtag\/js|window\.gtag|dataLayer/);
  assert.doesNotMatch(scoreRuntime, /GA_MEASUREMENT_ID|NEXT_PUBLIC_GA_MEASUREMENT_ID|gtag\/js|window\.gtag|dataLayer/);
});

check('the existing website analytics and consent contract remains the shared implementation', () => {
  assert.match(websiteLayout, /@\/components\/website\/GoogleAnalytics/);
  assert.match(websiteLayout, /@\/components\/website\/CookieConsent/);
  assert.match(websiteLayout, /<GoogleAnalytics\s*\/>/);
  assert.match(websiteLayout, /<CookieConsent\s*\/>/);
  assert.match(analytics, /hasAnalyticsConsent\(\)/);
  assert.match(consent, /ANALYTICS_CONSENT_STORAGE_KEY/);
  assert.match(gtag, /mk_fraud_cookie_consent/);
  assert.match(gtag, /window\.gtag\("event", action, params\)/);
});

check('direct score start remains consent-gated with no analytics bypass', () => {
  assert.doesNotMatch(startForm, /NEXT_PUBLIC_GA_MEASUREMENT_ID|GA_MEASUREMENT_ID|window\.gtag|dataLayer/);
  assert.match(scoreRuntime, /<CookieConsent\s*\/>/);
  assert.match(analytics, /if \(!GA_MEASUREMENT_ID \|\| !analyticsEnabled\) return null/);
});

console.log(`score analytics regression checks: ${checks} checks passed`);
