#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runGateSuite, writeApplicability } from './gates/index.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const args = process.argv.slice(2);
const fixtureArg = args.indexOf('--fixture');
const groupArg = args.indexOf('--group');
const fixtures = fixtureArg >= 0 ? [args[fixtureArg + 1]] : ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
const group = groupArg >= 0 ? args[groupArg + 1] : undefined;
const rows = await runGateSuite({ fixtureIds: fixtures, group });
await fs.mkdir(path.join(root, 'docs/commercial-quality'), { recursive: true });
await writeApplicability(root);
const byGate = Object.fromEntries([...new Set(rows.map((row) => row.gate))].sort().map((gate) => [gate, rows.filter((row) => row.gate === gate).length]));
const byFixture = Object.fromEntries([...new Set(rows.map((row) => row.fixture))].sort().map((fixture) => [fixture, rows.filter((row) => row.fixture === fixture).length]));
const byArtefact = Object.fromEntries([...new Set(rows.map((row) => row.artefact))].sort().map((artefact) => [artefact, rows.filter((row) => row.artefact === artefact).length]));
const output = { generatedAt: new Date().toISOString(), fixtures, group: group ?? null, rows, rowBreakdown: { byGate, byFixture, byArtefact }, failCount: rows.filter((row) => row.status === 'FAIL').length, coverage: rows.find((row) => row.gate === 'M1') ?? null };
await fs.writeFile(path.join(root, 'docs/commercial-quality/gate-output.json'), JSON.stringify(output, null, 2));
const breakdown = (title, values) => [`### ${title}`, '', '| Key | Rows |', '|---|---:|', ...Object.entries(values).map(([key, value]) => `| ${key} | ${value} |`), ''];
await fs.writeFile(path.join(root, 'docs/commercial-quality/gate-output.md'), ['# Binary gate output', '', `Fixtures: ${fixtures.join(', ')}`, `Group: ${group ?? 'A–E full suite'}`, '', `Rows: ${rows.length}`, `FAIL: ${output.failCount}`, `Coverage: ${output.coverage?.status ?? 'missing'}`, '', ...breakdown('Rows by gate', byGate), ...breakdown('Rows by fixture', byFixture), ...breakdown('Rows by artefact', byArtefact), output.failCount === 0 ? '**PASS — zero FAIL rows.**' : '**FAIL — release blocked.**'].join('\n'));
console.log(rows.map((row) => `${row.status} ${row.gate} ${row.fixture} ${row.artefact} — ${row.detail}`).join('\n'));
console.log(`Gate rows: ${rows.length}; FAIL: ${output.failCount}`);
if (output.failCount) process.exitCode = 1;
