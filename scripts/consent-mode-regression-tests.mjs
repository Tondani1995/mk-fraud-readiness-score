import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const gtag = read("src/lib/website/gtag.ts");
const analytics = read("src/components/website/GoogleAnalytics.tsx");
const banner = read("src/components/website/CookieConsent.tsx");
const metaConsent = read("src/lib/website/meta/consent.ts");

assert.match(gtag, /ANALYTICS_CONSENT_STORAGE_KEY = "mk_fraud_cookie_consent"/);
assert.match(metaConsent, /MARKETING_CONSENT_STORAGE_KEY = "mk_fraud_marketing_consent"/);
assert.match(gtag, /analytics_storage: analyticsGranted \? "granted" : "denied"/);
assert.match(gtag, /ad_storage: marketingGranted \? "granted" : "denied"/);
assert.match(gtag, /ad_user_data: marketingGranted \? "granted" : "denied"/);
assert.match(gtag, /ad_personalization: marketingGranted \? "granted" : "denied"/);
assert.match(gtag, /A blocked or unavailable localStorage must fail closed/);

assert.match(analytics, /analytics_storage: 'denied'/);
assert.match(analytics, /ad_storage: 'denied'/);
assert.match(analytics, /ad_user_data: 'denied'/);
assert.match(analytics, /ad_personalization: 'denied'/);
assert.match(analytics, /getItem\('mk_fraud_cookie_consent'\)/);
assert.match(analytics, /getItem\('mk_fraud_marketing_consent'\)/);
assert.match(analytics, /send_page_view: false/);
assert.match(analytics, /if \(!GA_MEASUREMENT_ID\) return null/);

assert.match(banner, /Also allow advertising measurement/);
assert.match(banner, /setMarketingConsent\(marketingAccepted\)/);
assert.match(banner, /record\(false, false\)/);
assert.match(banner, /GA_CONSENT_EVENT/);
assert.match(metaConsent, /hasMarketingConsent/);

console.log("Consent Mode v2 regression checks passed (default deny, separate analytics/marketing consent, and Advanced bootstrap loading).");
