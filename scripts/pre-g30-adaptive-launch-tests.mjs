import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260805140000_pre_g30_adaptive_launch_authority.sql', 'utf8');
const v12Migration = await readFile('supabase/migrations/20260821090000_adaptive_v1_2_staging_activation.sql', 'utf8');
const server = await readFile('src/lib/adaptive/server.ts', 'utf8');
const startPage = await readFile('src/app/score/start/page.tsx', 'utf8');
const checker = await readFile('scripts/pre-g30-migration-target-check.mjs', 'utf8');
const manifest = JSON.parse(await readFile('scripts/pre-g30-migration-target-manifest.json', 'utf8'));

assert.match(migration, /create table if not exists public\.adaptive_activation_policies/);
assert.match(migration, /set_adaptive_staging_activation/);
assert.match(migration, /set_pre_g30_staging_ai_authority/);
assert.match(migration, /penhenkzfrtmcxklodtu/);
assert.match(migration, /MFRS-V1\.1-ADAPTIVE-DRAFT-20260804/);
assert.match(migration, /fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab/);
assert.match(migration, /policy_approval/);
assert.match(migration, /pre_g30_service_role_control/);
assert.match(v12Migration, /register_adaptive_staging_candidate/);
assert.match(v12Migration, /MFRS-V1\.2-ADAPTIVE-CANDIDATE-20260821/);
assert.match(v12Migration, /6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7/);
assert.match(v12Migration, /adaptive_activation_policies_graph_binding_check/);
assert.match(v12Migration, /v1_2_staging_service_role_control/);
assert.match(server, /adaptive_activation_policies/);
assert.match(server, /adaptive_activation_disabled/);
assert.match(server, /data\.status !== 'published'/);
assert.match(server, /PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT/);
assert.match(startPage, /AdaptiveStartForm/);
assert.doesNotMatch(checker, /previewOnly = files\.filter/);
assert.equal(manifest.stagingOnly.length, 21);
assert.ok(manifest.stagingOnly.every((entry) => /synthetic|preview|resend|staging|orphan_remediation|certification_(closure|enablement)|adaptive_v1_2_staging_activation/.test(entry.migration)));
assert.ok(manifest.stagingOnly.some((entry) => entry.migration === '20260821090000_adaptive_v1_2_staging_activation.sql'));
assert.ok(manifest.requiredProductionGroups.some((group) => group.group === 'adaptive_foundation'));

console.log(JSON.stringify({ ok: true, assertions: 22, suite: 'pre-g30-adaptive-launch' }));
