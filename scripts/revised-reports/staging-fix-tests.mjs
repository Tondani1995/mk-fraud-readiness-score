// Fixes from the staging certification of 14 November 2026: the position panel uses the shared scenario account; the
// executive section must cite it by its slot (blocking, repairable line by line); the operator event names the writer
// and repair models separately. Exact bound fixtures and a deterministic manuscript; no model call.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/staging-fix-tests.mjs
import fs from 'node:fs';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';
import { composeRevisedReportHtml } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { validateManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';
import { scenarioAccount } from '../../src/lib/reports/revised/position.ts';
import { applyLineRepair } from '../../src/lib/reports/revised/live/produce.ts';
import { revisedGenerationNote } from '../../src/lib/reports/revised/live/manual-generation.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/[‘’]/g, "'").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const panelText = (html) => plain(html.slice(html.indexOf('PROVISIONAL') >= 0 ? html.indexOf('Provisional management interpretation') : 0)).slice(0, 1200);

const K = loadFixture('kestrel');
const M = loadFixture('marula');

await T('SF-01', 'Kestrel position panel carries the shared account, including the 4 scenarios whose applicability is outstanding', async () => {
  const { fp, plan } = fixturePack(K, 'essential');
  const html = composeRevisedReportHtml({ md: deterministicManuscript(fp, plan), fp, plan, dateLabel: '14 November 2026', prototype: true }).html;
  const panel = plain(html.slice(html.indexOf('class="cell'), html.indexOf('class="cell pending')));
  const account = scenarioAccount(K.report).sentence.replace(/'/g, "'");
  const ok = panel.includes(account.slice(0, 120)) && /Whether 4 further scenarios apply depends on answers that are outstanding/.test(panel) && !/cannot yet be read/.test(panel);
  return [ok, panel.slice(panel.indexOf('Of the'), panel.indexOf('Of the') + 330)];
});
await T('SF-02', 'Marula position panel carries the qualified account: 4 questioned, 86 with no conflict under the reviewed rules, which does not establish operation', async () => {
  const { fp, plan } = fixturePack(M, 'comprehensive');
  const html = composeRevisedReportHtml({ md: deterministicManuscript(fp, plan), fp, plan, dateLabel: '14 November 2026', prototype: true }).html;
  const panel = plain(html.slice(html.indexOf('class="cell'), html.indexOf('class="cell pending')));
  return [/for the other 86 the answers compared under the reviewed rules show no conflict, though 15 of them have a related practice reported weaker, which does not establish that the controls operate/.test(panel), panel.slice(panel.indexOf('Of the'), panel.indexOf('Of the') + 200)];
});
await T('SF-03', 'An executive section without the account slot is blocked (ACCOUNT-MISSING at its first paragraph); with it, the manuscript passes', async () => {
  const { fp, plan } = fixturePack(K, 'essential');
  const md = deterministicManuscript(fp, plan);
  const pass = validateManuscript(md, fp, plan);
  const without = md.replace(/\[\[T-SCENARIO-ACCOUNT\]\]\n<!-- refs: T-SCENARIO-ACCOUNT -->\n/, '');
  const v = validateManuscript(without, fp, plan);
  const issue = v.issues.find((i) => i.code === 'ACCOUNT-MISSING');
  const line = without.split('\n')[issue.line - 1] ?? '';
  return [pass.pass && !pass.issues.some((i) => i.code === 'ACCOUNT-MISSING') && issue?.blocking && /EXEC$/.test(issue.section) && !line.startsWith('#') && !line.startsWith('<!--'),
    `with slot: pass ${pass.pass}; without: ${issue?.code} at line ${issue?.line} (${line.slice(0, 50)}…)`];
});
await T('SF-04', 'The line repair can fix it: rewriting the flagged paragraph to include the slot makes the manuscript pass', async () => {
  const { fp, plan } = fixturePack(K, 'essential');
  const without = deterministicManuscript(fp, plan).replace(/\[\[T-SCENARIO-ACCOUNT\]\]\n<!-- refs: T-SCENARIO-ACCOUNT -->\n/, '');
  const issue = validateManuscript(without, fp, plan).issues.find((i) => i.code === 'ACCOUNT-MISSING');
  const row = without.split('\n')[issue.line - 1];
  const reply = JSON.stringify([{ line: issue.line, text: `[[T-SCENARIO-ACCOUNT]] ${row}` }]);
  const fixed = applyLineRepair(without, [issue.line], reply);
  const v = validateManuscript(fixed, fp, plan);
  return [v.pass, `${v.issues.filter((i) => i.blocking).map((i) => i.code).join(',') || 'no blocking issues'}`];
});
await T('SF-05', 'Older Fact Packs without the account (12 November prototypes) are unaffected: no ACCOUNT-MISSING, panel keeps its earlier sentence', async () => {
  const d = 'docs/readiness-review/report-excellence/P3';
  const fp = JSON.parse(fs.readFileSync(`${d}/comprehensive-fact-pack.json`, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(`${d}/comprehensive-story-plan.json`, 'utf8'));
  const md = fs.readFileSync(`${d}/comprehensive-manuscript.md`, 'utf8');
  const v = validateManuscript(md, fp, plan);
  const html = composeRevisedReportHtml({ md, fp, plan, dateLabel: '14 November 2026', prototype: true }).html;
  return [!v.issues.some((i) => i.code === 'ACCOUNT-MISSING') && /reports the core control in place for/.test(plain(html)), `validator pass ${v.pass}`];
});
await T('SF-06', 'The operator event names the writer and the repair model separately, and says when no AI call was made', async () => {
  const models = { writer: 'openai/gpt-5-mini', repair: 'openai/gpt-5.6-terra' };
  const order = { binding: { engineBuild: '1.6', outstandingTotal: 20 } };
  const a = revisedGenerationNote({ models, calls: 2, repairUsed: true, resumedFrom: null }, order);
  const b = revisedGenerationNote({ models, calls: 1, repairUsed: false, resumedFrom: null }, order);
  const c = revisedGenerationNote({ models, calls: 0, repairUsed: false, resumedFrom: 'compose' }, order);
  const d = revisedGenerationNote({ models, calls: 1, repairUsed: true, resumedFrom: 'repair' }, order);
  const ok = /written by openai\/gpt-5-mini and repaired by openai\/gpt-5\.6-terra \(2 AI calls\)/.test(a) && /written by openai\/gpt-5-mini \(1 AI call\)/.test(b) && !/terra/.test(b)
    && /no AI call in this attempt/.test(c) && /repaired by openai\/gpt-5\.6-terra from the draft stored by an earlier attempt \(1 AI call/.test(d) && !/deterministic/i.test(a + b + c + d);
  return [ok, a.slice(0, 140)];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/staging-fixes.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
