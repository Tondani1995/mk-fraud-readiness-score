import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const TARGET_BRANCH = 'phase14/autonomous-premium-report-engine';
const TARGET_UAT_REF = 'nlukprffbrqmvjcmygyr';
const ROUTE_FILE = '.next/server/app/api/internal/phase14-uat/ai-runtime-retest/route.js';

function shouldRun() {
  return process.env.VERCEL === '1'
    && process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === TARGET_BRANCH
    && (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(`${TARGET_UAT_REF}.supabase.co`);
}

if (!shouldRun()) {
  console.log('Phase 14 funded AI postbuild retest skipped outside the isolated preview branch.');
  process.exit(0);
}

if (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY) {
  throw new Error('AI Gateway authentication is unavailable in the Vercel preview build environment.');
}

const routeUrl = pathToFileURL(resolve(ROUTE_FILE)).href;
const loaded = await import(routeUrl);
const candidate = loaded.routeModule
  ?? loaded.default?.routeModule
  ?? loaded.default
  ?? loaded;
const userland = candidate?.userland ?? candidate?.routeModule?.userland;
const handler = userland?.GET ?? candidate?.GET;

if (typeof handler !== 'function') {
  throw new Error(`Unable to resolve the compiled GET handler from ${ROUTE_FILE}.`);
}

const scenarios = [
  ['success', 'ai'],
  ['repair', 'ai_repair'],
  ['fallback', 'deterministic_fallback']
];

const results = [];
for (const [scenario, expectedMode] of scenarios) {
  const request = new Request(
    `https://${process.env.VERCEL_URL ?? 'preview.invalid'}/score/api/internal/phase14-uat/ai-runtime-retest?scenario=${scenario}`,
    { headers: { accept: 'application/json' } }
  );
  const startedAt = Date.now();
  const response = await handler(request);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { ok: false, reason: 'non_json_response', preview: text.slice(0, 240) };
  }

  const passed = response.status === 200
    && body?.ok === true
    && body?.scenario === scenario
    && body?.expectedMode === expectedMode
    && body?.actualMode === expectedMode
    && body?.modeMatched === true
    && body?.emailEnabled === false
    && Array.isArray(body?.runs)
    && body.runs.length >= 1;

  const summary = {
    scenario,
    passed,
    httpStatus: response.status,
    elapsedMs: Date.now() - startedAt,
    expectedMode,
    actualMode: body?.actualMode ?? null,
    reportReference: body?.reportReference ?? null,
    versionNumber: body?.versionNumber ?? null,
    readyForEmailDelivery: body?.readyForEmailDelivery ?? null,
    runModes: Array.isArray(body?.runs)
      ? body.runs.map((run) => `${run.mode}:${run.status}`)
      : [],
    tokenTotals: Array.isArray(body?.runs)
      ? body.runs.map((run) => run.totalTokens)
      : [],
    reason: passed ? null : body?.reason ?? body?.detail ?? 'scenario_failed'
  };
  results.push(summary);
  console.log(`PHASE14_AI_RETEST ${JSON.stringify(summary)}`);

  if (!passed) {
    throw new Error(`Phase 14 AI ${scenario} scenario failed: ${JSON.stringify(summary)}`);
  }
}

console.log(`PHASE14_AI_RETEST_COMPLETE ${JSON.stringify({ allPassed: true, results })}`);
