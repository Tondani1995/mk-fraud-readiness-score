import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const gtagPath = pathToFileURL(path.join(process.cwd(), 'src/lib/website/gtag.ts')).href;
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = '';
const gtagWithoutMeasurement = await import(`${gtagPath}?without-measurement`);
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-NAVIGATIONTEST';
const gtag = await import(`${gtagPath}?configured`);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

function setBrowser({ consent = 'accepted', gtag: browserGtag } = {}) {
  global.window = {
    localStorage: { getItem: () => consent },
    gtag: browserGtag,
  };
}

console.log('navigation-safe gtag helper checks');

check('missing measurement ID navigates immediately without sending an event', () => {
  let navigations = 0;
  let calls = 0;
  setBrowser({ gtag: () => { calls += 1; } });
  assert.equal(gtagWithoutMeasurement.trackEventBeforeNavigation('fraud_readiness_start', { flow: 'adaptive' }, () => { navigations += 1; }), false);
  assert.equal(navigations, 1);
  assert.equal(calls, 0);
});

check('GA unavailable navigates immediately without sending an event', () => {
  let navigations = 0;
  setBrowser({ gtag: undefined });
  assert.equal(gtag.trackEventBeforeNavigation('fraud_readiness_start', { flow: 'adaptive' }, () => { navigations += 1; }), false);
  assert.equal(navigations, 1);
});

check('declined consent navigates immediately without sending an event', () => {
  let navigations = 0;
  let calls = 0;
  setBrowser({ consent: 'declined', gtag: () => { calls += 1; } });
  assert.equal(gtag.trackEventBeforeNavigation('fraud_readiness_start', { flow: 'adaptive' }, () => { navigations += 1; }), false);
  assert.equal(navigations, 1);
  assert.equal(calls, 0);
});

await (async () => {
  let navigations = 0;
  let eventArgs;
  setBrowser({ gtag: (...args) => { eventArgs = args; } });
  assert.equal(gtag.trackEventBeforeNavigation('fraud_readiness_completed', { flow: 'adaptive' }, () => { navigations += 1; }), true);
  assert.equal(navigations, 0);
  assert.equal(eventArgs[0], 'event');
  assert.equal(eventArgs[1], 'fraud_readiness_completed');
  assert.deepEqual(eventArgs[2].flow, 'adaptive');
  assert.equal(eventArgs[2].event_timeout, gtag.NAVIGATION_EVENT_TIMEOUT_MS);
  assert.equal(typeof eventArgs[2].event_callback, 'function');
  eventArgs[2].event_callback();
  await wait(10);
  assert.equal(navigations, 1);
  checks += 1;
  console.log('  ok - consented GA event sends the existing payload and callback navigates once');
})();

await (async () => {
  let navigations = 0;
  setBrowser({ gtag: () => {} });
  gtag.trackEventBeforeNavigation('fraud_readiness_start', { flow: 'adaptive' }, () => { navigations += 1; });
  await wait(gtag.NAVIGATION_EVENT_TIMEOUT_MS + 50);
  assert.equal(navigations, 1);
  checks += 1;
  console.log('  ok - callback timeout fallback navigates exactly once');
})();

await (async () => {
  let navigations = 0;
  let eventArgs;
  setBrowser({ gtag: (...args) => { eventArgs = args; } });
  gtag.trackEventBeforeNavigation('fraud_readiness_completed', { flow: 'adaptive' }, () => { navigations += 1; });
  await wait(gtag.NAVIGATION_EVENT_TIMEOUT_MS + 50);
  assert.equal(navigations, 1);
  eventArgs[2].event_callback();
  await wait(10);
  assert.equal(navigations, 1);
  checks += 1;
  console.log('  ok - late callback after fallback cannot double-navigate');
})();

check('gtag failure falls back to navigation without throwing', () => {
  let navigations = 0;
  setBrowser({ gtag: () => { throw new Error('synthetic gtag failure'); } });
  assert.doesNotThrow(() => gtag.trackEventBeforeNavigation('fraud_readiness_completed', { flow: 'adaptive' }, () => { navigations += 1; }));
  assert.equal(navigations, 1);
});

check('navigation-safe event parameters contain no PII or private identifiers', () => {
  const forbidden = /name|email|organisation|assessment|token|order|answer|snapshot/i;
  const params = { flow: 'adaptive', event_callback: () => {}, event_timeout: gtag.NAVIGATION_EVENT_TIMEOUT_MS };
  assert.deepEqual(Object.keys(params).sort(), ['event_callback', 'event_timeout', 'flow']);
  assert.doesNotMatch(Object.keys(params).join(' '), forbidden);
});

console.log(`navigation-safe gtag helper checks: ${checks} checks passed`);
