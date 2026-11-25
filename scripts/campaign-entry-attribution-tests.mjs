import assert from 'node:assert/strict';
import { reviewCampaignEntry, consentedReviewCampaignContent } from '../src/lib/website/assessment-entry-campaign.ts';

const tags={utm_source:'x',utm_medium:'organic_social',utm_campaign:'fraud_readiness_100d',utm_content:'fr0001'};
let checked=0;
for(let id=1;id<=2400;id++){
  const content=`fr${String(id).padStart(4,'0')}`;
  const redirected=new URL(reviewCampaignEntry({...tags,utm_content:content}),'https://www.mkfraud.co.za');
  assert.equal(redirected.pathname,'/review');
  assert.deepEqual(Object.fromEntries(redirected.searchParams),{...tags,utm_content:content});
  checked++;
}
for(const search of [undefined,{}, {...tags,utm_content:'fr0000'}, {...tags,utm_content:'fr2401'}, {...tags,utm_content:['fr0001','fr0002']}, {...tags,utm_source:['x']}, {...tags,utm_medium:'other'}, {...tags,utm_content:'name@example.com'}, {...tags,utm_content:'fr0001<script>'}]){
  assert.equal(reviewCampaignEntry(search),'/review'); checked++;
}
const hostile={...tags,token:'private-role-credential',email:'person@example.com',fullName:'Private Person',ref:'MKFRS-private',gclid:'private-click-id',redirect:'https://elsewhere.invalid'};
assert.deepEqual(Object.fromEntries(new URL(reviewCampaignEntry(hostile),'https://www.mkfraud.co.za').searchParams),tags);checked++;
assert.equal(reviewCampaignEntry({...tags,utm_source:'https://elsewhere.invalid'}),'/review');checked++;
console.log(`PASS: ${checked} campaign redirect cases; all 2,400 identities preserved; private and unknown fields excluded.`);
console.log('Scope: URL transport only. Consent, private review analytics exclusion, scoring and customer records are unchanged. Completion attribution is not established by this fix.');

const now=Date.now();
const memory=new Map([['mk_fraud_cookie_consent','accepted']]);
const storage={getItem:key=>memory.get(key)??null};
const query='?'+new URLSearchParams(tags).toString();
assert.equal(consentedReviewCampaignContent(query,storage,now),'fr0001');
memory.set('mk_fraud_cookie_consent','declined');
assert.equal(consentedReviewCampaignContent(query,storage,now),null);
memory.set('mk_fraud_cookie_consent','accepted');
assert.equal(consentedReviewCampaignContent(query+'&utm_content=fr0002',storage,now),null);
memory.set('mk_fraud_acquisition_context',JSON.stringify({...tags,expires_at:new Date(now+1000).toISOString()}));
assert.equal(consentedReviewCampaignContent('',storage,now),'fr0001');
assert.equal(consentedReviewCampaignContent('',storage,now+1001),null);
assert.equal(consentedReviewCampaignContent('?utm_source=unrecognised',storage,now),null);
console.log('PASS: consent and expiry gate first-party campaign measurement; duplicate and unrecognised tags rejected.');
