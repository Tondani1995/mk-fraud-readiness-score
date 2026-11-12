// Acceptance test AT-AI-01: the production AI manuscript stage (Reporting Bible v1.1, stages 5 to 9) for the four
// fictional organisations. It sends each writer brief (Fact Pack, Story Plan and writer contract, already written by
// excellence-briefs.mjs) to the production narrative model through the Vercel AI Gateway, saves the returned
// manuscript beside the in-session one as <product>-manuscript.ai.md, and validates it with the same validator. A
// manuscript that passes is composed to <product>.ai.pdf by excellence-build's composer; one that fails is kept with
// its validation report and is never composed (Bible 5.2: no template fallback).
//
// Fictional organisations only. No database, order, entitlement, payment, storage or customer path is touched, and the
// production model policy (src/lib/reports/ai-model-policy.ts) decides the model. Credentials are read from the
// environment and never written anywhere; run it on a machine that holds them, for example:
//   node --env-file=.env.local --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/revised-reports/excellence-ai-run.mjs [P6b:essential]
// Without credentials it records status BLOCKED in report-excellence/ai-run-status.json and exits 2.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { selectNarrativeModel } from '../../src/lib/reports/ai-model-policy.ts';
import { validateManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';

const DIR = 'docs/readiness-review/report-excellence';
const STATUS = path.join(DIR, 'ai-run-status.json');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const jobs = [];
for (const k of ['P3', 'P4', 'P5', 'P6b']) for (const p of ['essential', 'comprehensive']) if (!only || only.includes(`${k}:${p}`) || only.includes(k)) jobs.push([k, p]);
const model = selectNarrativeModel();
const credential = ['AI_GATEWAY_API_KEY', 'VERCEL_AI_GATEWAY_API_KEY'].find((name) => (process.env[name] ?? '').trim().length > 0);
const status = { test: 'AT-AI-01 production AI manuscript run', model: model.requestedModel, fallbackModels: model.fallbackModels, at: new Date().toISOString(), jobs: {} };

if (!credential) {
  status.status = 'BLOCKED';
  status.reason = 'No AI Gateway credential is present in this environment. The production AI manuscript stage was not exercised; the reports were composed from manuscripts written in-session under the same writer contract and are not certified paid-report generations.';
  fs.writeFileSync(STATUS, JSON.stringify(status, null, 1) + '\n');
  console.log('BLOCKED:', status.reason);
  process.exit(2);
}

const { generateText } = await import('ai');
const SYSTEM = 'You are the MK Fraud Insights report writer. Follow the writer contract in the brief exactly: write only the planned sections in order, in Markdown, with a claim heading for each section and unit, every paragraph followed by its <!-- refs: ... --> comment, every figure as a [[REF]] slot from the Fact Pack, and exhibits placed by name. Use South African English, connected advisory paragraphs and no em dashes. Never invent a fact, figure, owner, priority, control condition or assurance claim.';
for (const [k, product] of jobs) {
  const dir = path.join(DIR, k);
  const brief = fs.readFileSync(path.join(dir, `${product}-writer-brief.md`), 'utf8');
  const fp = JSON.parse(fs.readFileSync(path.join(dir, `${product}-fact-pack.json`), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(dir, `${product}-story-plan.json`), 'utf8'));
  const started = Date.now();
  try {
    const result = await generateText({ model: model.requestedModel, system: SYSTEM, prompt: brief, providerOptions: { gateway: { order: [model.requestedModel, ...model.fallbackModels] } } });
    const md = result.text;
    fs.writeFileSync(path.join(dir, `${product}-manuscript.ai.md`), md);
    const validation = validateManuscript(md, fp, plan);
    fs.writeFileSync(path.join(dir, `${product}-validation.ai.json`), JSON.stringify(validation, null, 1) + '\n');
    status.jobs[`${k}/${product}`] = { pass: validation.pass, blocking: validation.issues.filter((i) => i.blocking).map((i) => i.code), words: validation.stats.words, latencyMs: Date.now() - started, usage: result.usage ?? null, manuscriptSha256: crypto.createHash('sha256').update(md).digest('hex') };
  } catch (error) {
    status.jobs[`${k}/${product}`] = { pass: false, error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown', latencyMs: Date.now() - started };
  }
  console.log(k, product, JSON.stringify(status.jobs[`${k}/${product}`]));
}
status.status = Object.values(status.jobs).every((j) => j.pass) ? 'PASS' : 'FAIL';
fs.writeFileSync(STATUS, JSON.stringify(status, null, 1) + '\n');
process.exit(status.status === 'PASS' ? 0 : 1);
