// HYPOTHETICAL RESEARCH. Scoring-frame membership matrix for bank 1.3 and coverage map 1.3: every live question with
// its type, format, coverage role, every scenario association and every gating condition. Nothing here is a scoring
// rule; it describes the method's own structure so MK can decide one.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const BANK = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/bank-v1.3.json'), 'utf8'));
export const COVERAGE = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/coverage-map-v1.3.json'), 'utf8'));

const leaves = (w) => (!w ? [] : w.all ? w.all.flatMap(leaves) : w.any ? w.any.flatMap(leaves) : w.not ? leaves(w.not) : [w]);

export function buildMembership() {
  const questions = [];
  const moduleOf = new Map();
  for (const d of BANK.domains) for (const m of d.bank.modules) for (const q of m.questions) { questions.push({ ...q, domain: d.id, domainName: d.name, module: m.id, moduleName: m.name, owner: m.owner }); moduleOf.set(q.id, m); }
  const live = questions.filter((q) => !q.retired);
  const QI = new Map(questions.map((q) => [q.id, q]));
  const role = COVERAGE.questionRole;
  // Every way a question is associated with a scenario.
  const assoc = new Map(live.map((q) => [q.id, { routeOf: new Set(), confirmOf: new Set(), followupOf: new Set(), relatedOf: new Set() }]));
  for (const s of COVERAGE.scenarios) {
    for (const r of s.routes ?? []) for (const id of r.questions) assoc.get(id)?.routeOf.add(s.id);
    for (const c of s.confirm ?? []) { const id = Array.isArray(c) ? c[1] : c; assoc.get(id)?.confirmOf.add(s.id); }
    for (const id of s.followups ?? []) assoc.get(id)?.followupOf.add(s.id);
    for (const id of s.related ?? []) assoc.get(id)?.relatedOf.add(s.id);
  }
  const tierOf = new Map(COVERAGE.scenarios.map((s) => [s.id, s.tier]));
  const scen = new Map(COVERAGE.scenarios.map((s) => [s.id, s]));
  const crossOf = new Map();
  for (const x of COVERAGE.crossObjectives) for (const id of x.questions) crossOf.set(id, [...(crossOf.get(id) ?? []), x.id]);
  const rows = live.map((q) => {
    const a = assoc.get(q.id);
    const r = role[q.id] ?? null;
    const confirmScenarios = [...new Set([...a.routeOf, ...a.confirmOf])].sort();
    const gating = [];
    const scenarioGates = confirmScenarios.flatMap((sid) => [...leaves(scen.get(sid).expWhen).map((l) => `scenario ${sid} applies when ${l.q} in ${l.in}`), ...scen.get(sid).routes.filter((rt) => rt.questions.includes(q.id) && rt.when).flatMap((rt) => leaves(rt.when).map((l) => `route of ${sid} when ${l.q} in ${l.in}`))]);
    gating.push(...scenarioGates);
    for (const [k, w] of [['module enters when', moduleOf.get(q.id)?.enterWhen], ['asked when', q.askWhen], ['applies when', q.appliesTo], ['relevant when', q.relevantWhen], ['expected when', q.expectWhen]]) for (const l of leaves(w)) gating.push(`${k} ${l.q} in ${l.in}`);
    if (q.proportion) gating.push(`proportion: ${typeof q.proportion === 'string' ? q.proportion : JSON.stringify(q.proportion)}`);
    const gateKinds = new Set(gating.map((g) => {
      const m = g.match(/ (PR-\d+|[A-Z]\d+-[A-Z]-\d+|__\w+__) in/);
      const ref = m ? m[1] : '';
      if (g.startsWith('proportion')) return 'proportion';
      if (ref.startsWith('PR-')) return 'profile';
      const t = QI.get(ref)?.type;
      return t === 'practice' ? 'parent practice' : t === 'applicability' ? 'applicability question' : t === 'context' ? 'context fact' : t ? t : 'other';
    }));
    return {
      id: q.id, domain: q.domain, module: q.module, key: q.key, type: q.type, format: q.format ?? null, stage: q.stage,
      coverageRole: r?.role ?? null, primaryScenario: r?.scenario ?? null,
      confirmScenarios, followupOf: [...a.followupOf].sort(), relatedOf: [...a.relatedOf].sort(),
      tiers: [...new Set(confirmScenarios.map((s) => tierOf.get(s)))].sort(), objectives: r?.objectives ?? [], crossObjectives: crossOf.get(q.id) ?? [],
      anchored: q.format === 'anchored', frameCandidate: r?.role === 'confirm' && q.type === 'practice',
      gating, gateKinds: [...gateKinds].sort(), alwaysApplicable: gating.length === 0, owner: q.owner ?? null
    };
  });
  return { rows, QI };
}

export function membershipSummary(rows) {
  const count = (f) => rows.filter(f).length;
  const by = (list, key) => list.reduce((a, r) => { const k = typeof key === 'function' ? key(r) : r[key]; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const frame = rows.filter((r) => r.frameCandidate);
  const domains = [...new Set(rows.map((r) => r.domain))];
  return {
    live: rows.length,
    byType: by(rows, 'type'),
    byRole: by(rows, (r) => r.coverageRole ?? 'none'),
    byTypeAndRole: by(rows, (r) => `${r.type}/${r.coverageRole ?? 'none'}`),
    frame: frame.length,
    frameAnchored: count((r) => r.frameCandidate && r.anchored),
    frameNonAnchored: count((r) => r.frameCandidate && !r.anchored),
    frameByFormat: by(frame, 'format'),
    frameByStage: by(frame, 'stage'),
    frameByDomain: Object.fromEntries(domains.map((d) => [d, { anchored: frame.filter((r) => r.domain === d && r.anchored).length, nonAnchored: frame.filter((r) => r.domain === d && !r.anchored).length }])),
    frameByLowestTier: by(frame, (r) => `tier ${Math.min(...r.tiers)}`),
    frameMultiScenario: frame.filter((r) => r.confirmScenarios.length > 1).map((r) => ({ id: r.id, scenarios: r.confirmScenarios })),
    frameAlsoFollowupOrRelated: frame.filter((r) => r.followupOf.length || r.relatedOf.length).map((r) => ({ id: r.id, followupOf: r.followupOf, relatedOf: r.relatedOf })),
    frameGateKinds: by(frame, (r) => r.gateKinds.join(' + ') || 'always applicable'),
    frameAlwaysApplicable: count((r) => r.frameCandidate && r.alwaysApplicable),
    frameWithParentPractice: count((r) => r.frameCandidate && r.gateKinds.includes('parent practice')),
    confirmRoleNotPractice: rows.filter((r) => r.coverageRole === 'confirm' && r.type !== 'practice').map((r) => r.id),
    scenariosWithoutConfirmation: COVERAGE.scenarios.filter((s) => !rows.some((r) => r.frameCandidate && r.confirmScenarios.includes(s.id))).map((s) => s.id),
    scenariosWithSeveralConfirmations: COVERAGE.scenarios.filter((s) => rows.filter((r) => r.frameCandidate && r.confirmScenarios.includes(s.id)).length > 1).length,
    nonFrame: { followup: count((r) => r.coverageRole === 'followup'), related: count((r) => r.coverageRole === 'related'), scope: count((r) => r.coverageRole === 'scope'), noRole: count((r) => !r.coverageRole) },
    followUpListedForSeveralScenarios: rows.filter((r) => r.followupOf.length > 1).length,
    followUpListMembership: rows.filter((r) => r.followupOf.length).length,
    relatedListedForSeveralScenarios: rows.filter((r) => r.relatedOf.length > 1).length,
    questionsWithAnyScenarioAssociation: rows.filter((r) => r.confirmScenarios.length + r.followupOf.length + r.relatedOf.length > 0).length,
    questionsWithSeveralScenarioAssociations: rows.filter((r) => new Set([...r.confirmScenarios, ...r.followupOf, ...r.relatedOf]).size > 1).length,
    roleScenarioMatchesConfirmation: frame.every((r) => r.confirmScenarios.length === 1 && r.confirmScenarios[0] === r.primaryScenario),
    frameByDomainAndTier: Object.fromEntries(domains.map((d) => [d, [1, 2, 3].map((t) => frame.filter((r) => r.domain === d && Math.min(...r.tiers) === t).length)])),
    frameTier1ByDomainAndFormat: Object.fromEntries(domains.map((d) => [d, { anchored: frame.filter((r) => r.domain === d && r.anchored && r.tiers.includes(1)).length, nonAnchored: frame.filter((r) => r.domain === d && !r.anchored && r.tiers.includes(1)).length }])),
    frameFormatByTier: [1, 2, 3].map((t) => ({ tier: t, anchored: frame.filter((r) => r.tiers.includes(t) && r.anchored).length, practice: frame.filter((r) => r.tiers.includes(t) && r.format === 'practice').length, choicePractice: frame.filter((r) => r.tiers.includes(t) && r.format === 'choicePractice').length })),
    scenariosWithFollowUps: COVERAGE.scenarios.filter((s) => (s.followups || []).length).length,
    scenarioCount: COVERAGE.scenarios.length,
    scenariosByTier: COVERAGE.scenarios.reduce((a, s) => ((a[s.tier] = (a[s.tier] || 0) + 1), a), {})
  };
}

const csvCell = (v) => { const t = Array.isArray(v) ? v.join('; ') : v === null || v === undefined ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export function membershipCsv(rows, reach = new Map()) {
  const cols = ['id', 'domain', 'module', 'key', 'type', 'format', 'stage', 'coverageRole', 'primaryScenario', 'confirmScenarios', 'followupOf', 'relatedOf', 'scenarioAssociations', 'tiers', 'objectives', 'crossObjectives', 'frameCandidate', 'anchored', 'alwaysApplicable', 'gateKinds', 'gating', 'owner', 'servedInSimulatedInterviews'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    const assoc = new Set([...r.confirmScenarios, ...r.followupOf, ...r.relatedOf]).size;
    const served = reach.get(r.id);
    lines.push(cols.map((c) => csvCell(c === 'scenarioAssociations' ? assoc : c === 'servedInSimulatedInterviews' ? (served ? [...served].sort().join('/') : 'never') : r[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('membership.mjs')) {
  const { rows } = buildMembership();
  console.log(JSON.stringify(membershipSummary(rows), null, 1));
}
