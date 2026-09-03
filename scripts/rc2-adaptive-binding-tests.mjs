import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  assertAdaptiveActivationForDb,
  assertAdaptiveAssessmentBinding,
  assertAdaptiveRuntimeEnvironment,
  configuredAdaptiveDeploymentSha,
  configuredSupabaseProjectRef,
  loadConfiguredAdaptiveGraph
} from '../src/lib/adaptive/server.ts';

const migrationPath = 'supabase/migrations/20260827090000_rc2_adaptive_environment_binding.sql';
const migration = await fs.readFile(migrationPath, 'utf8');
const server = await fs.readFile('src/lib/adaptive/server.ts', 'utf8');
const v11Graph = JSON.parse(await fs.readFile('docs/adaptive-assessment/adaptive-graph-v1-draft.json', 'utf8'));
const v12Graph = JSON.parse(await fs.readFile('docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json', 'utf8'));

const PROMOTION_TARGET_PROJECT = 'iszihmmbgsfefawqmnwo';
const OTHER_PROJECT = 'abcdefghijklmnopqrst';
const OTHER_RUNTIME_PROJECT = 'zyxwvutsrqponmlkjihg';
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const V11 = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
const V11_FP = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';
const V12 = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
const V12_FP = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';
const V12_METHODOLOGY = 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION';

function env(overrides = {}) {
  return {
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROMOTION_TARGET_PROJECT}.supabase.co`,
    VERCEL_GIT_COMMIT_SHA: SHA,
    MK_ADAPTIVE_GRAPH_VERSION: V12,
    ...overrides
  };
}

function policy(overrides = {}) {
  return {
    policy_key: 'customer_start',
    environment: 'preview',
    supabase_project: PROMOTION_TARGET_PROJECT,
    graph_version: V12,
    graph_fingerprint: V12_FP,
    enabled: true,
    activation_sha: SHA,
    ...overrides
  };
}

function graphRow(graph = v12Graph, overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    graph_version: graph.graphVersion,
    methodology_version_id: '00000000-0000-4000-8000-000000000002',
    methodology_version: graph.methodologyVersion,
    status: 'published',
    compiled_graph_json: graph,
    graph_fingerprint: graph.graphFingerprint,
    ...overrides
  };
}

function fakeDb(policyRow, graph = null) {
  return {
    from(table) {
      const result = table === 'adaptive_activation_policies'
        ? { data: policyRow, error: null }
        : { data: graph, error: null };
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return result; }
      };
      return query;
    }
  };
}

function filteringPolicyDb(rows) {
  return {
    from(table) {
      if (table !== 'adaptive_activation_policies') return fakeDb(null).from(table);
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        async maybeSingle() {
          const matches = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
          if (matches.length === 1) return { data: matches[0], error: null };
          if (matches.length === 0) return { data: null, error: null };
          return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        }
      };
      return query;
    }
  };
}

async function pass(label, fn) {
  await fn();
  console.log(`ok - ${label}`);
}

async function fail(label, fn, code) {
  await assert.rejects(fn, (error) => error instanceof Error && error.message === code, `${label} must fail with ${code}`);
  console.log(`ok - ${label} -> ${code}`);
}

assert.match(server, /VERCEL_ENV/);
assert.match(server, /NEXT_PUBLIC_SUPABASE_URL/);
assert.match(server, /VERCEL_GIT_COMMIT_SHA/);
assert.match(server, /adaptive_activation_environment_mismatch/);
assert.match(server, /adaptive_activation_sha_mismatch/);
assert.match(server, /assertAdaptiveAssessmentBinding/);
assert.doesNotMatch(server, /iszihmmbgsfefawqmnwo|penhenkzfrtmcxklodtu/);
assert.match(migration, /environment in \('preview', 'production'\)/);
assert.match(migration, /supabase_project ~ '\^\[a-z0-9\]\{20\}\$'/);
assert.match(migration, /set_adaptive_activation/);
assert.match(migration, /set_adaptive_staging_activation/);
assert.match(migration, /revoke all on public\.adaptive_activation_policies from public, anon, authenticated/);
assert.match(migration, /grant select on public\.adaptive_activation_policies to service_role/);
assert.match(migration, /revoke all on function public\.set_adaptive_activation\(text, text, boolean, text, text\)/);
assert.match(migration, /grant execute on function public\.set_adaptive_activation\(text, text, boolean, text, text\)\s+to service_role/);
assert.doesNotMatch(migration, /adaptive_production_project_staging_forbidden|adaptive_preview_project_required/);
assert.doesNotMatch(migration, /adaptive_activation_policy_binding_mismatch/);

assert.equal(configuredSupabaseProjectRef(env()), PROMOTION_TARGET_PROJECT);
assert.equal(configuredAdaptiveDeploymentSha(env()), SHA);
assert.deepEqual(assertAdaptiveRuntimeEnvironment(env()), {
  environment: 'preview', projectRef: PROMOTION_TARGET_PROJECT, deploymentSha: SHA
});

await pass('Preview + promotion-target project + exact SHA', async () => {
  await assertAdaptiveActivationForDb(fakeDb(policy()), env());
});
await pass('Preview selects its policy row when Production shares the policy key', async () => {
  await assertAdaptiveActivationForDb(
    filteringPolicyDb([policy(), policy({ environment: 'production', activation_sha: OTHER_SHA })]),
    env()
  );
});
await fail('Production + promotion-target project while policy remains Preview', () => assertAdaptiveActivationForDb(
  fakeDb(policy()), env({ VERCEL_ENV: 'production' })
), 'adaptive_activation_environment_mismatch');
await pass('Production + promotion-target project after deliberate policy promotion + exact SHA', async () => {
  await assertAdaptiveActivationForDb(fakeDb(policy({ environment: 'production' })), env({ VERCEL_ENV: 'production' }));
});
await fail('Preview + promotion-target project after deliberate policy promotion', () => assertAdaptiveActivationForDb(
  fakeDb(policy({ environment: 'production' })), env()
), 'adaptive_activation_environment_mismatch');
await fail('Project mismatch', () => assertAdaptiveActivationForDb(
  fakeDb(policy()),
  env({ NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER_RUNTIME_PROJECT}.supabase.co` })
), 'adaptive_activation_project_mismatch');
await fail('Missing project identity', () => assertAdaptiveActivationForDb(
  fakeDb(policy()), env({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.com' })
), 'adaptive_runtime_project_unresolved');
await fail('Preview + missing SHA', () => assertAdaptiveActivationForDb(
  fakeDb(policy({ activation_sha: null })),
  env({ VERCEL_GIT_COMMIT_SHA: undefined })
), 'adaptive_deployment_sha_invalid');
await fail('Preview + SHA mismatch', () => assertAdaptiveActivationForDb(
  fakeDb(policy({ activation_sha: OTHER_SHA })), env()
), 'adaptive_activation_sha_mismatch');

await pass('Production + another valid project + matching policy + exact SHA', async () => {
  const productionEnv = env({
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER_PROJECT}.supabase.co`
  });
  await assertAdaptiveActivationForDb(fakeDb(policy({
    environment: 'production', supabase_project: OTHER_PROJECT
  })), productionEnv);
});
await fail('Production + SHA mismatch', () => assertAdaptiveActivationForDb(
  fakeDb(policy({ environment: 'production', supabase_project: PROMOTION_TARGET_PROJECT, activation_sha: OTHER_SHA })),
  env({ VERCEL_ENV: 'production' })
), 'adaptive_activation_sha_mismatch');
await fail('Unknown environment', () => assertAdaptiveActivationForDb(
  fakeDb(policy()), env({ VERCEL_ENV: 'preview-canary' })
), 'adaptive_runtime_environment_invalid');
await fail('Disabled policy', () => assertAdaptiveActivationForDb(
  fakeDb(policy({ enabled: false })), env()
), 'adaptive_activation_disabled');

await pass('V1.1 Preview behavior remains accepted with the exact existing binding', async () => {
  const v11Env = env({ MK_ADAPTIVE_GRAPH_VERSION: V11 });
  await assertAdaptiveActivationForDb(fakeDb(policy({ graph_version: V11, graph_fingerprint: V11_FP }), v11Graph), v11Env);
});

const validV12Policy = policy();
await pass('published V1.2 graph identity is accepted', async () => {
  const loaded = await loadConfiguredAdaptiveGraph(fakeDb(validV12Policy, graphRow()), env());
  assert.equal(loaded.graph.graphVersion, V12);
  assert.equal(loaded.graph.methodologyVersion, V12_METHODOLOGY);
  assert.equal(loaded.graph.graphFingerprint, V12_FP);
});
await fail('graph fingerprint mismatch', () => loadConfiguredAdaptiveGraph(
  fakeDb(validV12Policy, graphRow(v12Graph, { graph_fingerprint: 'c'.repeat(64) })), env()
), 'adaptive_graph_fingerprint_mismatch');
await fail('graph version mismatch', () => loadConfiguredAdaptiveGraph(
  fakeDb(validV12Policy, graphRow(v12Graph, {
    graph_version: V11,
    compiled_graph_json: { ...v12Graph, graphVersion: V11 }
  })), env()
), 'adaptive_activation_graph_mismatch');

const assessment = {
  methodology_version_id: '00000000-0000-4000-8000-000000000002',
  graph_version_snapshot: V12,
  graph_fingerprint_snapshot: V12_FP
};
const boundGraph = {
  status: 'published', graph_version: V12, graph_fingerprint: V12_FP,
  methodology_version_id: assessment.methodology_version_id
};
const boundActivation = { graph_version: V12, graph_fingerprint: V12_FP };
assert.doesNotThrow(() => assertAdaptiveAssessmentBinding(assessment, boundGraph, boundActivation));
assert.throws(
  () => assertAdaptiveAssessmentBinding(assessment, boundGraph, { ...boundActivation, graph_fingerprint: 'd'.repeat(64) }),
  (error) => error instanceof Error && error.message === 'adaptive_graph_binding_invalid'
);
assert.throws(
  () => assertAdaptiveAssessmentBinding(assessment, boundGraph, { ...boundActivation, graph_version: V11 }),
  (error) => error instanceof Error && error.message === 'adaptive_graph_binding_invalid'
);
assert.throws(
  () => assertAdaptiveAssessmentBinding(assessment, { ...boundGraph, methodology_version_id: '00000000-0000-4000-8000-000000000003' }, boundActivation),
  (error) => error instanceof Error && error.message === 'adaptive_graph_binding_invalid'
);
console.log('ok - changing active policy cannot silently rebind a locked assessment');

console.log(JSON.stringify({
  ok: true,
  suite: 'rc2-adaptive-binding',
  cases: 16,
  promotionTargetProject: PROMOTION_TARGET_PROJECT,
  productionProjectPolicy: 'owner-selected-policy-tuple',
  productionActivationDefault: 'disabled-at-replay',
  lockedAssessmentBindingAssertions: 4
}));
