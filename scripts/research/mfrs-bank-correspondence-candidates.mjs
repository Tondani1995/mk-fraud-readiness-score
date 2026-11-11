// Research aid for MK, not a mapping. Ranks, for each MFRS V1.2 control question the commercial engines score,
// the review bank 1.3 questions whose wording is most similar (TF-IDF cosine over prompt, control objective,
// key and question text). The output shows where a correspondence MAY exist; none is adopted, and no score,
// weight or classification is derived from it. Run: node scripts/research/mfrs-bank-correspondence-candidates.mjs [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const graph = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json'), 'utf8'));
const bank = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/bank-v1.3.json'), 'utf8'));
const STOP = new Set('a an and are as at be by for from has have in into is it its of on or that the their there these this to was were where which who with within whether does do any all other such how when what organisation organisations organisation’s fraud'.split(' '));
const tokens = (s) => String(s).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => t.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, ''));
const bankQs = bank.domains.flatMap((d) => d.bank.modules.flatMap((m) => m.questions.filter((q) => !q.retired && q.type === 'practice').map((q) => ({ id: q.id, domain: d.id, domainName: d.name, key: q.key, text: q.text, format: q.format, stage: q.stage, module: m.name, toks: tokens(`${q.key} ${q.key} ${q.text} ${m.name}`) }))));
const mfrs = graph.questions.map((q) => ({ id: q.questionCode, domain: q.domainCode, domainName: graph.domains.find((d) => d.domainCode === q.domainCode)?.name, prompt: q.prompt, critical: q.isCritical, hardGate: q.isHardGate, weight: q.weight, toks: tokens(`${q.prompt} ${q.controlObjective}`) }));
const docs = [...bankQs, ...mfrs];
const df = new Map();
for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) ?? 0) + 1);
const vec = (toks) => { const v = new Map(); for (const t of toks) v.set(t, (v.get(t) ?? 0) + 1); for (const [t, n] of v) v.set(t, n * Math.log(docs.length / (df.get(t) ?? 1))); return v; };
const norm = (v) => Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0));
const cos = (a, b) => { let s = 0; for (const [t, x] of a) if (b.has(t)) s += x * b.get(t); return s / ((norm(a) * norm(b)) || 1); };
for (const d of docs) d.v = vec(d.toks);
const rows = mfrs.map((q) => {
  const ranked = bankQs.map((b) => ({ id: b.id, key: b.key, format: b.format, stage: b.stage, domain: b.domain, similarity: Number(cos(q.v, b.v).toFixed(3)) })).sort((a, b) => b.similarity - a.similarity).slice(0, 3);
  return { mfrs: q.id, mfrsDomain: `${q.domain} ${q.domainName}`, prompt: q.prompt, critical: q.critical, hardGate: q.hardGate, candidates: ranked };
});
const summary = { mfrsQuestions: rows.length, bankPracticeQuestions: bankQs.length, topSimilarityAtLeast04: rows.filter((r) => r.candidates[0].similarity >= 0.4).length, topSimilarity025to04: rows.filter((r) => r.candidates[0].similarity >= 0.25 && r.candidates[0].similarity < 0.4).length, topSimilarityBelow025: rows.filter((r) => r.candidates[0].similarity < 0.25).length, topCandidateAnchored: rows.filter((r) => r.candidates[0].format === 'anchored').length, topCandidateInSameDomainCode: rows.filter((r) => r.candidates[0].domain === r.mfrs.split('-')[0]).length };
const out = { note: 'Candidates by wording similarity only. None is adopted; MK decides every correspondence.', summary, rows };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary));
for (const r of rows) console.log(`${r.mfrs}${r.critical ? '*' : ''} ${r.prompt.slice(0, 70)} → ${r.candidates.map((c) => `${c.id} [${c.format}] ${c.similarity}`).join(' | ')}`);
