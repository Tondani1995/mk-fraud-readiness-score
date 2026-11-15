// Outstanding-information and scenario-category reconciliation on the exact persisted B5 records (independent review of
// 13 November 2026, finding R-1). Two fictional organisations, replayed from the action logs bound on the isolated test
// database; role link tokens are redacted in the fixtures and play no part in replay.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/b5-fixture-reconciliation-tests.mjs
import fs from 'node:fs';
import { replay } from '../../src/lib/readiness-review/session.ts';
import { buildStagedReportInput } from '../../src/lib/readiness-review/report-input.ts';
import { canonicalDigest } from '../../src/lib/readiness-review/canonical.ts';
import { buildRevisedReport } from '../../src/lib/reports/revised/evidence-model.ts';
import { positionStatements, scenarioAccount } from '../../src/lib/reports/revised/position.ts';
import { buildRevisedFactPack } from '../../src/lib/reports/revised/manuscript/fact-pack.ts';
import { buildBibleWorkbook } from '../../src/lib/reports/revised/manuscript/workbook-bible.ts';
import { unzipSync, strFromU8 } from 'fflate';

const results = [];
const T = async (id, name, fn) => {
  try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (error) { results.push({ id, ok: false, name, detail: error.stack.split('\n').slice(0, 3).join(' ') }); }
};
const load = (name) => {
  const f = JSON.parse(fs.readFileSync(`scripts/revised-reports/fixtures/b5-${name}-bound.json`, 'utf8'));
  const live = replay(f.record);
  const input = buildStagedReportInput(live);
  const report = buildRevisedReport(input);
  return { f, live, input, report, account: scenarioAccount(report) };
};
const K = load('kestrel');
const M = load('marula');
const factPackArgs = (x, product, report = x.report) => ({
  report, product, organisationName: x.f.record.organisationLabel, assessmentReference: x.f.assessmentReference, generatedAt: '2026-11-13T00:00:00.000Z',
  profile: x.input.profile.map((p) => ({ id: p.id, label: p.label, value: p.value })), position: positionStatements(report, { score: null }),
  figure: { overall: null, areas: [], label: 'No score issued' }
});
const fp = (x, product) => buildRevisedFactPack(factPackArgs(x, product));
const ids = (xs) => xs.map((x) => x.id ?? x).sort().join(',');

await T('RC-01', 'Both fixtures replay to the bound report input: the input and log digests equal the values stored in the commercial binding', async () => {
  const d = [K, M].map((x) => ({ ref: x.f.assessmentReference, input: canonicalDigest(x.input) === x.f.inputDigest, log: x.input.lineage.logDigest === x.f.logDigest, actions: x.f.record.actions.length === x.f.boundActionCount }));
  return [d.every((x) => x.input && x.log && x.actions), JSON.stringify(d)];
});

await T('RC-02', 'Kestrel: the assessment\'s 20 outstanding are 16 questions asked and not answered (13 control, 3 applicability) plus 3 confirmations and 1 scenario those answers hold back; the recomputation matches the engine unit by unit', async () => {
  const L = K.report.ledger; const R = L.reconciliation;
  const byType = L.questions.reduce((m, q) => ({ ...m, [q.itemType]: (m[q.itemType] ?? 0) + 1 }), {});
  const conf = R.consequentialRows.filter((r) => r.kind === 'confirmation'); const scen = R.consequentialRows.filter((r) => r.kind === 'scenario');
  const ok = R.matches && R.assessment.total === 20 && L.questions.length === 16 && byType.control === 13 && byType.applicability === 3
    && ids(conf) === 'D5-B-02,D7-C-02,D8-T-01' && ids(scen) === 'FS-D10-01'
    && conf.every((r) => r.heldBy.length === 1 && L.questions.some((q) => q.id === r.heldBy[0] && q.holdsBack.includes(r.id)))
    && scen[0].heldBy.join() === 'D10-S-03'
    && L.questions.length + R.consequentialRows.length - R.notInAssessmentCount.length === R.assessment.total;
  return [ok, `${JSON.stringify(R.assessment)}; questions ${JSON.stringify(byType)}; held back ${ids(R.consequentialRows)}`];
});

await T('RC-03', 'Marula: the assessment\'s 2 outstanding are one control question (D4-P-01) and one context question (D4-O-07); both appear in the report register', async () => {
  const L = M.report.ledger;
  const ok = L.reconciliation.matches && L.reconciliation.assessment.total === 2 && ids(L.questions) === 'D4-O-07,D4-P-01'
    && L.questions.find((q) => q.id === 'D4-O-07').itemType === 'context' && ids(M.report.outstanding) === 'D4-O-07,D4-P-01';
  return [ok, `${L.reconciliation.statement}`];
});

await T('RC-04', 'Every question in the ledger is in the report\'s outstanding register with its reason, function and type, and nothing else is', async () => {
  const bad = [];
  for (const [n, x] of [['K', K], ['M', M]]) {
    if (ids(x.report.ledger.questions) !== ids(x.report.outstanding)) bad.push(`${n} ids differ`);
    for (const q of x.report.ledger.questions) {
      const o = x.report.outstanding.find((r) => r.id === q.id);
      if (!o || o.reason !== q.reason || o.itemType !== q.itemType || (q.fn && o.fn !== q.fn)) bad.push(`${n} ${q.id}`);
      if (!q.provenance.answeredBy && q.reason !== 'waiting' && q.reason !== 'declined') bad.push(`${n} ${q.id} has no provenance`);
    }
  }
  return [!bad.length, bad.join('; ') || `${K.report.outstanding.length} and ${M.report.outstanding.length} rows`];
});

await T('RC-05', 'Kestrel\'s 73 scenarios in the picture partition exactly: 55 gap, 2 reported in place, 12 with core answers outstanding, 4 whose applicability is outstanding; 69 are counted as applying', async () => {
  const a = K.account; const k = K.report.summary.byKind;
  const ok = a.balanced && a.inPicture === 73 && k.gap === 55 && k.confirmed === 2 && k.outstanding === 12 && k.none === 4 && a.applicabilityPending === 4 && a.notReached === 0 && a.applicable === 69
    && ids(K.report.ledger.scenarios) === 'FS-D10-01,FS-D5-11,FS-D7-03,FS-D8-08';
  return [ok, a.sentence];
});

await T('RC-06', 'Marula\'s 90 scenarios partition exactly: 71 confirmed and 15 qualified (86 with no conflict found under the reviewed rules), 1 contradiction and 3 to clarify; one convention states 90 reported in place with 4 questioned', async () => {
  const a = M.account; const k = M.report.summary.byKind;
  const ok = a.balanced && a.inPicture === 90 && a.applicable === 90 && k.confirmed === 71 && k.qualified === 15 && k.contradiction === 1 && k.clarify === 3
    && a.reportedInPlace === 90 && a.inPlaceWithQuestion === 4 && a.noConflictFound === 86
    && /in place for 90 \(for 4 of these .*; for the other 86 the answers compared under the reviewed rules show no conflict, though 15 of them have a related practice reported weaker, which does not establish that the controls operate\)/.test(a.sentence) && !/without question/.test(a.sentence);
  return [ok, a.sentence];
});

await T('RC-07', 'No scenario whose applicability is outstanding is read as a control in place or missing: it has no finding, no risk, no register control from it, and the answer that would settle it is listed as outstanding', async () => {
  const bad = [];
  for (const u of K.report.ledger.scenarios) {
    const s = K.report.schemes.find((x) => x.id === u.id);
    if (s.kind !== 'none') bad.push(`${u.id} kind ${s.kind}`);
    if (K.report.findings.some((f) => f.schemeId === u.id)) bad.push(`${u.id} has a finding`);
    if (K.report.risks.some((r) => r.schemeRef === s.ref)) bad.push(`${u.id} has a risk`);
    if (K.report.controls.some((c) => (c.schemeRefs ?? []).includes(s.ref))) bad.push(`${u.id} has a register control`);
    for (const d of u.dependsOn) if (!K.report.outstanding.some((o) => o.id === d)) bad.push(`${u.id} depends on ${d}, not listed`);
  }
  return [!bad.length, bad.join('; ') || 'four scenarios, none read as present or absent'];
});

await T('RC-08', 'The position statement, the Fact Pack and the workbook summary carry the same account; the Fact Pack fails closed if the account does not balance', async () => {
  const bad = [];
  for (const [n, x] of [['K', K], ['M', M]]) {
    const interp = positionStatements(x.report, { score: null }).find((p) => p.key === 'interpretation').text;
    if (!interp.startsWith(x.account.sentence)) bad.push(`${n} position`);
    for (const product of ['essential', 'comprehensive']) {
      const p = fp(x, product);
      const v = (ref) => p.facts[ref]?.value;
      if (v('N-APPLY') !== x.account.applicable || v('N-APPLY-PENDING') !== x.account.applicabilityPending || v('T-SCENARIO-ACCOUNT') !== x.account.sentence) bad.push(`${n} ${product} scenario facts`);
      if (v('N-OUTSTANDING') !== x.report.ledger.questions.length || v('N-ASSESSMENT-OUTSTANDING') !== x.report.ledger.reconciliation.assessment.total) bad.push(`${n} ${product} outstanding facts`);
    }
  }
  for (const [n, x] of [['K', K], ['M', M]]) {
    const wb = await buildBibleWorkbook('comprehensive', x.report, fp(x, 'comprehensive'));
    const files = unzipSync(new Uint8Array(wb.bytes ?? wb.buffer ?? wb));
    const xml = Object.entries(files).filter(([k]) => /sharedStrings|sheet\d*\.xml/.test(k)).map(([, v]) => strFromU8(v)).join(' ').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    if (!xml.includes(x.account.sentence.slice(0, 60))) bad.push(`${n} workbook summary`);
  }
  const broken = { ...K.report, summary: { ...K.report.summary, inPicture: 74 } };
  let threw = false; try { buildRevisedFactPack(factPackArgs(K, 'essential', broken)); } catch (e) { threw = /scenario_account_unbalanced/.test(String(e)); }
  if (!threw) bad.push('unbalanced account did not fail closed');
  return [!bad.length, bad.join('; ') || 'one account everywhere'];
});

await T('RC-09', 'The area profile keeps pending scenarios outside the count, and no area with one reads as stable', async () => {
  const p = fp(K, 'essential');
  const pend = Object.fromEntries(p.areas.filter((a) => a.pending).map((a) => [a.code, a.pending]));
  const ok = JSON.stringify(pend) === JSON.stringify({ D5: 1, D7: 1, D8: 1, D10: 1 }) && p.areas.every((a) => !(a.pending && a.pattern === 'held'))
    && p.areas.reduce((m, a) => m + a.apply, 0) === 69;
  return [ok, JSON.stringify(pend)];
});

await T('RC-10', 'Live state stays distinct from the bound prefix: an action appended after binding changes the log digest, and the bound prefix still reproduces the stored digests', async () => {
  const extra = { ...K.f.record, actions: [...K.f.record.actions, { ...K.f.record.actions.at(-1), id: 'appended', seq: K.f.record.actions.length, at: '2026-11-14T00:00:00.000Z' }] };
  let changed = false;
  try { const after = buildStagedReportInput(replay(extra)); changed = after.lineage.logDigest !== K.f.logDigest; } catch { changed = true; }
  const prefix = buildStagedReportInput(replay({ ...extra, actions: extra.actions.slice(0, K.f.boundActionCount) }));
  return [changed && canonicalDigest(prefix) === K.f.inputDigest, `appended action ${changed ? 'changes' : 'does not change'} the live log; prefix digest ${canonicalDigest(prefix).slice(0, 12)}`];
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/b5-fixture-reconciliation.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
