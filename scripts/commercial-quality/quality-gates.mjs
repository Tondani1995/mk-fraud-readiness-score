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
const output = { generatedAt: new Date().toISOString(), fixtures, group: group ?? null, rows, failCount: rows.filter((row) => row.status === 'FAIL').length };
await fs.writeFile(path.join(root, 'docs/commercial-quality/gate-output.json'), JSON.stringify(output, null, 2));
console.log(rows.map((row) => `${row.status} ${row.gate} ${row.fixture} ${row.artefact} — ${row.detail}`).join('\n'));
console.log(`Gate rows: ${rows.length}; FAIL: ${output.failCount}`);
if (output.failCount) process.exitCode = 1;
