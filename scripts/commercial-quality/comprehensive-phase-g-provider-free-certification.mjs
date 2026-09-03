#!/usr/bin/env node
/**
 * Provider-free Phase G certification. This is deliberately an offline
 * harness: it runs the deterministic regressions, current-path composition
 * gates, build and typecheck before a live writer can be dispatched.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const outputDir = path.resolve(process.env.PHASE_G_PROVIDER_FREE_OUTPUT_DIR ?? path.join(repo, 'outputs', 'comprehensive-phase-g-remediated-2026-09-01'));
const currentPathDir = path.join(outputDir, 'provider-free-current-path');
fs.mkdirSync(currentPathDir, { recursive: true });

const commands = [
  ['assurance-boundary-regressions', ['npm', 'run', 'v11:comprehensive-assurance-boundary-regressions']],
  ['local-numeric-provenance', ['npm', 'run', 'v11:comprehensive-local-numeric-provenance']],
  ['historical-manuscript-regressions', ['npm', 'run', 'v11:comprehensive-historical-manuscript']],
  ['prompt-context-regressions', ['npm', 'run', 'v11:comprehensive-prompt-context']],
  ['narrative-assurance', ['npm', 'run', 'v11:narrative-assurance']],
  ['narrative-provenance', ['npm', 'run', 'v11:narrative-provenance']],
  ['whole-manuscript-recovery', ['npm', 'run', 'v11:whole-manuscript-recovery']],
  ['comprehensive-recovery-behaviour', ['npm', 'run', 'v11:comprehensive-recovery-behaviour']],
  ['narrative-contract', ['npm', 'run', 'v11:narrative-contract']],
  ['narrative-section-identity', ['npm', 'run', 'v11:narrative-section-identity']],
  ['ai-model-policy', ['npm', 'run', 'v11:ai-model-policy']],
  ['narrative-call-accounting', ['npm', 'run', 'v11:narrative-call-accounting']],
  ['whole-manuscript-truncation', ['npm', 'run', 'v11:whole-manuscript-truncation']],
  ['comprehensive-current-architecture', ['npm', 'run', 'v11:comprehensive-current-architecture']],
  ['comprehensive-current-path', ['npm', 'run', 'v11:comprehensive-current-path']],
  ['comprehensive-customer-copy-leakage', ['npm', 'run', 'v11:comprehensive-customer-copy-leakage']],
  ['comprehensive-brand-regression', ['npm', 'run', 'v11:comprehensive-brand-regression']],
  ['stage1-tests', ['npm', 'test']],
  ['build', ['npm', 'run', 'build']],
  ['typecheck', ['npm', 'run', 'typecheck']]
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function run(id, command, extraEnv = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repo,
    env: { ...process.env, CURRENT_COMPREHENSIVE_OUTPUT_DIR: currentPathDir, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  const providerCallValues = [...combined.matchAll(/"providerCalls"\s*:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.ok(providerCallValues.every((value) => value === 0), `${id} reported provider calls: ${providerCallValues.join(', ')}`);
  const record = {
    id,
    command: command.join(' '),
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    providerCalls: 0,
    outputSha256: sha256(combined),
    stdoutTail: stdout.slice(-4000),
    stderrTail: stderr.slice(-4000)
  };
  assert.equal(record.exitCode, 0, `${id} failed with exit ${record.exitCode}\n${stderr.slice(-4000)}\n${stdout.slice(-4000)}`);
  return record;
}

const results = [];
for (const [id, command] of commands) results.push(run(id, command));

const summary = {
  status: 'PASS',
  gate: 'comprehensive-phase-g-provider-free-certification',
  providerCalls: 0,
  databaseWrites: 0,
  phaseG: 'not dispatched before this record',
  currentPathOutputDir: currentPathDir,
  checks: results,
  freezeReady: true
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'comprehensive-phase-g-provider-free-certification.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
