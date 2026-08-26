import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260805140000_pre_g30_adaptive_launch_authority.sql', 'utf8');
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
assert.match(server, /adaptive_activation_policies/);
assert.match(server, /adaptive_activation_disabled/);
assert.match(server, /data\.status !== 'published'/);
assert.match(server, /configuredSupabaseProjectRef/);
assert.doesNotMatch(server, /PREVIEW_STAGING_PROJECT_REF/);
assert.match(startPage, /AdaptiveStartForm/);
assert.doesNotMatch(checker, /previewOnly = files\.filter/);
assert.equal(manifest.stagingOnly.length, 20);
assert.ok(manifest.stagingOnly.every((entry) => /synthetic|preview|resend|staging|orphan_remediation|certification_(closure|enablement)/.test(entry.migration)));
assert.ok(manifest.requiredProductionGroups.some((group) => group.group === 'adaptive_foundation'));

console.log(JSON.stringify({ ok: true, assertions: 16, suite: 'pre-g30-adaptive-launch' }));
