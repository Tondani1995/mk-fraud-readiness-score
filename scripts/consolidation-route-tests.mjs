import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../next.config.mjs', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8');
const scoreLanding = await readFile(new URL('../src/app/(website)/fraud-readiness-score/page.tsx', import.meta.url), 'utf8');
const scoreStart = await readFile(new URL('../src/app/score/start/page.tsx', import.meta.url), 'utf8');
const assessmentEngine = await readFile(new URL('../src/components/assessment/AssessmentEngine.tsx', import.meta.url), 'utf8');
const runtimeCheck = await readFile(new URL('../src/app/score/api/readiness-runtime-check/route.ts', import.meta.url), 'utf8');
const uatStartCheck = await readFile(new URL('../src/app/score/api/internal/uat-start-check/route.ts', import.meta.url), 'utf8');
const navbar = await readFile(new URL('../src/components/website/Navbar.tsx', import.meta.url), 'utf8');
const contact = await readFile(new URL('../src/app/(website)/contact/page.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(config, /basePath\s*:/, 'The consolidated app must not use a global basePath.');
assert.doesNotMatch(config, /https?:\/\//, 'Next rewrites must not proxy to another deployment.');
assert.match(config, /source:\s*['"]\/score\/\.well-known\/workflow\/:path\*['"]/);
assert.match(config, /destination:\s*['"]\/\.well-known\/workflow\/:path\*['"]/);
assert.doesNotMatch(scoreLanding, /StartAssessmentForm/);
assert.doesNotMatch(scoreLanding, /data-native-assessment-start/);
assert.match(scoreLanding, /id=["']start-score["']/);
assert.match(scoreLanding, /href=["']\/score\/start["']/);
assert.match(scoreLanding, /data-adaptive-assessment-entry/);
assert.match(scoreLanding, /scroll-mt-24/);
assert.match(scoreLanding, /md:scroll-mt-28/);
assert.doesNotMatch(scoreLanding, /1900px|h-\[1900px\]/);
assert.match(scoreStart, /redirect\('\/score\/start'\)/);
assert.match(assessmentEngine, /data-assessment-native="true"/);
assert.doesNotMatch(scoreLanding + scoreStart + assessmentEngine, /<iframe|postMessage|ResizeObserver/);
assert.match(runtimeCheck, /dynamic = ['"]force-dynamic['"]/, 'Runtime check must never execute during build.');
assert.match(uatStartCheck, /dynamic = ['"]force-dynamic['"]/, 'UAT start check must never execute during build.');
assert.equal((navbar.match(/\/score\/start/g) ?? []).length, 2, 'Desktop and mobile navigation CTAs must use the adaptive start route.');
assert.doesNotMatch(contact, /https:\/\/api\.web3forms\.com\/submit/);
assert.match(contact, /fetch\(["']\/score\/api\/enquiries\/contact["']/);
assert.match(contact, /new FormData\(e\.currentTarget\)/);
assert.match(contact, /botcheck/);
assert.match(contact, /name: formData\.name/);
assert.match(contact, /email: formData\.email/);
assert.match(contact, /message: formData\.message/);
assert.match(contact, /service: formData\.service/);
assert.ok((contact.match(/\brequired\b/g) ?? []).length >= 4, 'Contact form must retain required browser validation.');
assert.match(middleware, /\/score\/api\/readiness-runtime-check/);
assert.match(middleware, /\/score\/api\/internal\/uat-start-check/);

const baseUrl = process.env.CONSOLIDATION_BASE_URL?.replace(/\/$/, '');
if (baseUrl) {
  const checks = [
    ['/', 200],
    ['/about', 200],
    ['/services', 200],
    ['/industries', 200],
    ['/insights', 200],
    ['/contact', 200],
    ['/privacy-policy', 200],
    ['/terms-of-use', 200],
    ['/fraud-readiness-score', 200],
    ['/robots.txt', 200],
    ['/sitemap.xml', 200],
    ['/insights/fraud-as-a-service-faas-the-underground-industry-powering-modern-scams', 200],
    ['/insights/if-i-had-60-minutes-to-audit-your-fraud-strategy', 200],
    ['/score', 307],
    ['/score/start', 200],
    ['/score/api/health', 200],
    ['/score/api/readiness-runtime-check', 404],
    ['/score/api/internal/uat-start-check', 404]
  ];

  for (const [path, expected] of checks) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    assert.equal(response.status, expected, `${path} returned ${response.status}, expected ${expected}`);
    assert.equal(new URL(response.url).origin, new URL(baseUrl).origin, `${path} left the consolidated origin`);
    const location = response.headers.get('location');
    if (location) assert.equal(new URL(location, baseUrl).origin, new URL(baseUrl).origin, `${path} redirects off-origin`);
  }

  const landing = await (await fetch(`${baseUrl}/fraud-readiness-score`)).text();
  assert.doesNotMatch(landing, /<iframe/i);
  assert.doesNotMatch(landing, /data-native-assessment-start="true"/);
  assert.match(landing, /href="\/score\/start"/);
  const legacyEmbed = await fetch(`${baseUrl}/score/start?embed=1`, { redirect: 'manual' });
  assert.ok([307, 308].includes(legacyEmbed.status));
  assert.equal(new URL(legacyEmbed.headers.get('location'), baseUrl).pathname, '/score/start');
}

console.log(`Consolidation route checks passed${baseUrl ? ` against ${baseUrl}` : ' (static mode)'}.`);
