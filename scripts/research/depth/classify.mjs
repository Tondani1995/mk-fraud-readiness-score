// HYPOTHETICAL RESEARCH ONLY. Static classification of the follow-up and related practices of bank 1.3: when each one
// can be asked, what its answer could change, and whether it nearly repeats a confirmation. Nothing here is a rule.
import { COVERAGE, QI, QUESTIONS, SCENARIOS } from '../scoring-simulation/lib.mjs';

const ROLE = COVERAGE.questionRole;
const leaves = (w) => (!w ? [] : w.all ? w.all.flatMap(leaves) : w.any ? w.any.flatMap(leaves) : w.not ? leaves(w.not) : [w]);
const LEVEL_CLASS = { 0: 'absent', 1: 'partial', 2: 'partial', 3: 'partial', 4: 'full', 5: 'full' };
const clsOf = (p, v) => (p.format === 'anchored' ? LEVEL_CLASS[v] ?? v : p.format === 'choicePractice' ? (p.practiceMap || {})[v] ?? v : v);
const STOP = new Set('the and for are any has have with that this from not but its their they them who what when which does does how all can into been out was were will would there these those each other than then also only more most such per our your yes partly either within without where whether been being about after before over under between'.split(' '));
const tokens = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''));
const live = QUESTIONS.filter((q) => !q.retired);
const df = new Map();
for (const q of live) for (const w of new Set(tokens(q.text))) df.set(w, (df.get(w) || 0) + 1);
const vec = (q) => { const tf = new Map(); for (const w of tokens(q.text)) tf.set(w, (tf.get(w) || 0) + 1); const v = new Map(); let n = 0; for (const [w, c] of tf) { const x = c * Math.log(live.length / (df.get(w) || 1)); v.set(w, x); n += x * x; } return { v, n: Math.sqrt(n) }; };
const cos = (a, b) => { let s = 0; for (const [w, x] of a.v) if (b.v.has(w)) s += x * b.v.get(w); return a.n && b.n ? s / (a.n * b.n) : 0; };
export const DUPLICATE_THRESHOLD = 0.5;

export function classifyDepth() {
  const confirmObjectives = new Set(live.filter((q) => ROLE[q.id]?.role === 'confirm').flatMap((q) => ROLE[q.id].objectives || []));
  const rows = [];
  for (const q of live.filter((x) => x.type === 'practice' && ['related', 'followup'].includes(ROLE[x.id]?.role))) {
    const r = ROLE[q.id];
    const s = SCENARIOS.get(r.scenario);
    const confs = s.routes.flatMap((rt) => rt.questions);
    const siblings = [...confs, ...(s.followups || [])].filter((id) => id !== q.id);
    const vq = vec(q);
    let best = { id: null, sim: 0 };
    for (const id of siblings) { const sim = cos(vq, vec(QI.get(id))); if (sim > best.sim) best = { id, sim }; }
    const prac = leaves(q.askWhen).filter((l) => QI.get(l.q)?.type === 'practice' && !l.q.startsWith('PR-'));
    const parent = prac[0] ? QI.get(prac[0].q) : null;
    const parentClasses = parent ? [...new Set([].concat(prac[0].in).map((v) => clsOf(parent, v)))] : null;
    const ownObjective = !(r.objectives || []).some((o) => confirmObjectives.has(o));
    // What the answer could change, by the state of the scenario's confirmation.
    const value = ownObjective ? 'coverage' : best.sim >= DUPLICATE_THRESHOLD ? 'near-duplicate' : r.role === 'followup' ? 'follow-up' : parent && ROLE[parent.id]?.role === 'related' ? 'detail of a detail' : 'diagnostic';
    rows.push({ id: q.id, role: r.role, domain: q.domain, scenario: s.id, tier: s.tier, stage: q.stage, format: q.format, owner: q.owner, objectives: r.objectives || [], parent: parent ? parent.id : null, parentRole: parent ? ROLE[parent.id]?.role ?? null : null, parentClasses, askedOnlyWhenParentInPlace: parentClasses ? !parentClasses.includes('absent') : false, ownObjective, nearest: best.id, similarity: Math.round(best.sim * 100) / 100, value, key: q.key });
  }
  return rows;
}

if (process.argv[1] && process.argv[1].endsWith('classify.mjs')) {
  const rows = classifyDepth();
  const by = (f, list = rows) => list.reduce((a, r) => { const k = f(r); a[k] = (a[k] || 0) + 1; return a; }, {});
  console.log('by role and value', by((r) => `${r.role}/${r.value}`));
  console.log('similarity bands', by((r) => (r.similarity >= 0.6 ? '>=0.6' : r.similarity >= 0.5 ? '0.5-0.6' : r.similarity >= 0.4 ? '0.4-0.5' : r.similarity >= 0.3 ? '0.3-0.4' : '<0.3')));
  for (const r of rows.filter((x) => x.similarity >= 0.5).slice(0, 8)) console.log(r.similarity, r.id, '|', QI.get(r.id).text.slice(0, 90), '||', r.nearest, '|', QI.get(r.nearest).text.slice(0, 90));
  for (const r of rows.filter((x) => x.similarity >= 0.4 && x.similarity < 0.5).slice(0, 4)) console.log(r.similarity, r.id, '|', QI.get(r.id).text.slice(0, 90), '||', r.nearest, '|', QI.get(r.nearest).text.slice(0, 90));
  console.log('related per scenario, by tier', by((r) => `t${r.tier}`, rows.filter((x) => x.role === 'related')));
  console.log('parent gating of related', by((r) => (r.parent ? `${r.parentRole} in ${r.parentClasses.join('+')}` : 'none'), rows.filter((x) => x.role === 'related')));
}
