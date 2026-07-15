import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../next.config.mjs', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8');
const scoreLanding = await readFile(new URL('../src/app/(website)/fraud-readiness-score/page.tsx', import.meta.url), 'utf8');
const scoreFrame = await readFile(new URL('../src/components/website/assessment/AutoHeightAssessmentFrame.tsx', import.meta.url), 'utf8');
const heightReporter = await readFile(new URL('../src/components/assessment/EmbeddedHeightReporter.tsx', import.meta.url), 'utf8');
const runtimeCheck = await readFile(new URL('../src/app/score/api/readiness-runtime-check/route.ts', import.meta.url), 'utf8');
const uatStartCheck = await readFile(new URL('../src/app/score/api/internal/uat-start-check/route.ts', import.meta.url), 'utf8');
const navbar = await readFile(new URL('../src/components/website/Navbar.tsx', import.meta.url), 'utf8');
const contact = await readFile(new URL('../src/app/(website)/contact/page.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(config, /basePath\s*:/, 'The consolidated app must not use a global basePath.');
assert.doesNotMatch(config, /https?:\/\//, 'Next rewrites must not proxy to another deployment.');
assert.match(config, /source:\s*['"]\/score\/\.well-known\/workflow\/:path\*['"]/);
assert.match(config, /destination:\s*['"]\/\.well-known\/workflow\/:path\*['"]/);
assert.match(scoreLanding, /AutoHeightAssessmentFrame/);
assert.match(scoreLanding, /id=["']start-score["']/);
assert.match(scoreLanding, /scroll-mt-24/);
assert.match(scoreLanding, /md:scroll-mt-28/);
assert.doesNotMatch(scoreLanding, /1900px|h-\[1900px\]/);
assert.match(scoreFrame, /src="\/score\/start\?embed=1"/);
assert.match(scoreFrame, /loading="eager"/);
assert.match(scoreFrame, /event\.origin !== window\.location\.origin/);
assert.match(scoreFrame, /event\.source !== iframeRef\.current\?\.contentWindow/);
assert.match(scoreFrame, /style=\{\{ height \}\}/);
assert.match(heightReporter, /ResizeObserver/);
assert.match(heightReporter, /window\.parent\.postMessage/);
assert.match(runtimeCheck, /dynamic = ['"]force-dynamic['"]/, 'Runtime check must never execute during build.');
assert.match(uatStartCheck, /dynamic = ['"]force-dynamic['"]/, 'UAT start check must never execute during build.');
assert.equal((navbar.match(/\/fraud-readiness-score#start-score/g) ?? []).length, 2, 'Desktop and mobile navigation CTAs must share the score anchor.');
assert.match(contact, /https:\/\/api\.web3forms\.com\/submit/);
assert.match(contact, /const cleanName = formData\.name\.trim\(\)/);
assert.match(contact, /const cleanEmail = formData\.email\.trim\(\)/);
assert.match(contact, /const cleanMessage = formData\.message\.trim\(\)/);
assert.match(contact, /if \(!cleanName \|\| !cleanEmail \|\| !cleanMessage \|\| !cleanService\)/);
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
  assert.match(landing, /src=["']\/score\/start\?embed=1["']/);
}

console.log(`Consolidation route checks passed${baseUrl ? ` against ${baseUrl}` : ' (static mode)'}.`);
