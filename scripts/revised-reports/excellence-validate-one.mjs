import fs from 'node:fs';
import { validateManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';
const [k, product] = process.argv.slice(2);
const dir = `docs/readiness-review/report-excellence/${k}`;
const fp = JSON.parse(fs.readFileSync(`${dir}/${product}-fact-pack.json`, 'utf8'));
const plan = JSON.parse(fs.readFileSync(`${dir}/${product}-story-plan.json`, 'utf8'));
const v = validateManuscript(fs.readFileSync(`${dir}/${product}-manuscript.md`, 'utf8'), fp, plan);
console.log(JSON.stringify({ pass: v.pass, stats: { ...v.stats, mechanical: undefined } }));
for (const i of v.issues) console.log(i.blocking ? 'BLOCK' : 'warn ', i.code, i.section, i.line, i.detail);
