'use strict';
/*
 * MK readiness review engine, build 1.6 (staged completion). Fictional harness only; not approved by MK.
 *
 * Build 1.6 composes the independently rechecked build 1.5 without changing it (its file and hash are untouched):
 *   - no respondent screen ceiling; completion is staged: core (every applicable tier 1 confirmation), breadth (every
 *     applicable confirmation in all tiers) and accountable-function packages;
 *   - gap follow-ups are not put to the respondent; they are candidates for the functions' packages;
 *   - a deterministic, applicability-aware consistency check: after a tier 1 or 2 confirmation is reported fully in
 *     place, one applicable follow-up is asked straight away, at most one per area and ten in all;
 *   - depth selection by relevance and expected information gain, with explicit selection by the organisation;
 *   - areas delegated by the respondent are served to the function that owns them;
 *   - stage, package, outstanding-information, consistency and workload summaries in the report.
 * It produces no score, no maturity band and no adjustment for contradictions: consistency outcomes are recorded and
 * described, never applied. Every rule here is a proposal for MK.
 */
const BASE = require('./review-engine-build-1.5.cjs');

const REVIEW16 = (() => {
  const BUILD = '1.6';
  const LEVEL = { 0: 'absent', 1: 'partial', 2: 'partial', 3: 'partial', 4: 'full', 5: 'full' };
  const OPEN = ['unconfirmed', 'scope-unconfirmed', 'prerequisite', 'waiting-scope', 'assumed'];
  const EXCLUDED = ['outofscope', 'proportion', 'precluded', 'retired'];
  const ACTIVE = ['assigned', 'accepted', 'overdue'];
  const OUTCOME_LABEL = {
    consistent: 'Consistent: the supporting practice is reported in place',
    'narrower-scope': 'Narrower scope: the supporting practice is reported only in some areas, cases or periods',
    'partial-operation': 'Partial operation: the supporting practice is reported at an intermediate level',
    'not-yet-operating': 'Not yet operating: the supporting practice is reported as set out but not working',
    conflicting: 'Conflicting answer: the supporting practice is reported not in place',
    'no-case-yet': 'No case yet: the organisation reports that no case has arisen, so the practice has not been used',
    'missing-information': 'Missing information: the answer was "I don\'t know"',
    pending: 'Not yet answered',
    'not-applicable': 'No longer applicable after a later answer',
    superseded: 'Superseded: the confirmation is no longer reported in place'
  };
  const ANSWERED_OUTCOMES = ['consistent', 'narrower-scope', 'partial-operation', 'not-yet-operating', 'conflicting', 'no-case-yet'];

  function create(BANK, COV, opts) {
    opts = Object.assign({ now: () => new Date().toISOString() }, opts || {});
    const consistencyOpts = Object.assign({ tiers: [1, 2], perDomain: 1, max: 10 }, opts.consistency || {});
    const depthOpts = Object.assign({ perFunction: 15, perScenario: 4, coveragePerObjective: 2, minGain: 3 }, opts.depth || {});
    const e = BASE.create(BANK, COV, { ceiling: Number.MAX_SAFE_INTEGER, followups: 0, now: opts.now });
    const { S, QI, MOD, DOM, scope, cond, rowFor, functionOf, FUNCTIONS } = e;
    const SC = COV.scenarios, ROLE = COV.questionRole || {};
    const SCN = Object.fromEntries(SC.map((s) => [s.id, s]));
    const ORDER = Object.fromEntries(SC.map((s, i) => [s.id, i]));
    const CONFIRMATIONS = Object.keys(ROLE).filter((id) => ROLE[id].role === 'confirm' && QI[id] && QI[id].type === 'practice' && !QI[id].retired);
    const confirmObjectives = new Set(CONFIRMATIONS.flatMap((id) => ROLE[id].objectives || []));
    // Practices whose objectives no confirmation covers: the only source of a finding on those objectives.
    const COVERAGE_Q = new Set(Object.keys(ROLE).filter((id) => QI[id] && QI[id].type === 'practice' && !QI[id].retired && ROLE[id].role !== 'confirm' && (ROLE[id].objectives || []).length && !(ROLE[id].objectives || []).some((o) => confirmObjectives.has(o))));
    const leaves = (w) => (!w ? [] : w.all ? w.all.flatMap(leaves) : w.any ? w.any.flatMap(leaves) : w.not ? leaves(w.not) : [w]);
    const CHILDREN = {};
    Object.values(QI).forEach((q) => leaves(q.askWhen).forEach((l) => { if (QI[l.q] && QI[l.q].type === 'practice') CHILDREN[l.q] = (CHILDREN[l.q] || 0) + 1; }));
    S.v16 = { consistency: [], sends: [] };

    const answered = (id) => !!S.ans[id] && !S.ans[id].stale;
    const clsNow = (id) => { const a = S.ans[id]; if (!a || a.stale) return null; if (a.v === 'unknown') return 'unknown'; const q = QI[id]; return q && q.format === 'anchored' && /^[0-5]$/.test(String(a.v)) ? LEVEL[a.v] : a.cls; };
    const tierOf = (id) => (SCN[(ROLE[id] || {}).scenario] || {}).tier || 9;
    const activeAssignment = (id) => !!S.assign[id] && ACTIVE.includes(S.assign[id].status);

    // ---------------------------------------------------------------------------------------------- consistency
    function answer(q, v, kind, extra) {
      e.answer(q, v, kind, extra);
      if (!q || kind === 'correction' || kind === 'owner-followup' || q.id === '__assumptions__') return;
      const role = ROLE[q.id];
      if (!role || role.role !== 'confirm') return;
      const s = SCN[role.scenario];
      if (!s || !consistencyOpts.tiers.includes(s.tier) || clsNow(q.id) !== 'full') return;
      if (S.v16.consistency.length >= consistencyOpts.max) return;
      if (S.v16.consistency.filter((c) => c.domain === s.domain).length >= consistencyOpts.perDomain) return;
      const f = (s.followups || []).find((id) => QI[id] && !S.ans[id] && !S.queue.some((x) => x.q === id) && scope(QI[id]).st === 'applicable');
      if (!f) return;
      S.queue.unshift({ q: f, s: s.id, name: s.name, consistency: true });
      S.v16.consistency.push({ domain: s.domain, scenario: s.id, scenarioName: s.name, tier: s.tier, confirmation: q.id, confirmationVer: S.ans[q.id].ver, followup: f, at: opts.now() });
    }
    function next(o) {
      const step = e.next(o);
      if (step && step.kind === 'followup' && S.v16.consistency.some((c) => c.followup === step.q.id)) {
        const c = S.v16.consistency.find((x) => x.followup === step.q.id);
        step.kind = 'consistency';
        step.reason = `A consistency question about “${c.scenarioName}”, which you reported in place. Your answer is recorded as you give it; nothing is verified.`;
      }
      return step;
    }
    function consistencyOutcome(c) {
      if (clsNow(c.confirmation) !== 'full') return 'superseded';
      const a = S.ans[c.followup];
      if (!a || a.stale) return EXCLUDED.includes(scope(QI[c.followup]).st) ? 'not-applicable' : 'pending';
      if (a.v === 'unknown') return 'missing-information';
      const k = clsNow(c.followup);
      if (k === 'full') return 'consistent';
      if (k === 'noinstance' || k === 'na') return 'no-case-yet';
      if (k === 'designed') return 'not-yet-operating';
      if (k === 'partial') return QI[c.followup].format === 'anchored' ? 'partial-operation' : 'narrower-scope';
      if (k === 'absent') return 'conflicting';
      return 'pending';
    }
    function consistencySummary() {
      // Population: tier 1 and 2 confirmations currently reported fully in place that have a follow-up in scope.
      const eligible = CONFIRMATIONS.filter((id) => consistencyOpts.tiers.includes(tierOf(id)) && clsNow(id) === 'full' && (SCN[ROLE[id].scenario].followups || []).some((f) => QI[f] && (answered(f) || !EXCLUDED.includes(scope(QI[f]).st))));
      const checks = S.v16.consistency.map((c) => Object.assign({}, c, { outcome: consistencyOutcome(c), outcomeLabel: OUTCOME_LABEL[consistencyOutcome(c)], followupAnswer: S.ans[c.followup] && !S.ans[c.followup].stale ? e.labelOf(QI[c.followup], S.ans[c.followup].v) : null }));
      const counts = {};
      checks.forEach((c) => { counts[c.outcome] = (counts[c.outcome] || 0) + 1; });
      const tested = checks.filter((c) => ANSWERED_OUTCOMES.includes(c.outcome)).length;
      return {
        rule: `One follow-up after a tier ${consistencyOpts.tiers.join(' or ')} confirmation reported fully in place, at most ${consistencyOpts.perDomain} per area and ${consistencyOpts.max} in all, chosen in the order the confirmations were answered.`,
        // `untested` is kept for contract 1.4.0 readers; it means "not cross-checked", never "not tested in operation".
        eligible: eligible.length, selected: checks.length, answered: tested, untested: eligible.length - checks.filter((c) => c.outcome !== 'superseded').length,
        notCrossChecked: eligible.length - checks.filter((c) => c.outcome !== 'superseded').length,
        counts, checks,
        limitation: 'Each cross-check is one further self-reported answer from the organisation about a practice that supports a confirmation it reported in place. It is not a test of operation and it is not evidence. Confirmations that were not selected were not cross-checked, and nothing is concluded about them or extrapolated to them. No score or band is adjusted for any outcome.'
      };
    }

    // ---------------------------------------------------------------------------------------------- stages
    // Stage counts follow the engine's own scenario picture: the confirmations of every scenario that applies or may
    // apply, through the routes that are open; a scenario whose applicability or route is not yet settled counts once.
    function stages(rep) {
      rep = rep || e.report();
      const rows = [];
      const seen = new Set();
      rep.scenarios.forEach((s) => {
        if (s.status === 'outofscope') return;
        // A row in an area the respondent handed to its function is with that function, whether or not it has been reached.
        const handedArea = !!S.domainAssign[(SCN[s.id] && SCN[s.id].domain) || ''];
        if (!s.confirmations.length) { rows.push({ id: s.id, tier: s.tier, state: s.status === 'waiting' ? 'waiting' : 'scope-unconfirmed', handedArea }); return; }
        s.confirmations.forEach((c) => { if (seen.has(c.id)) return; seen.add(c.id); rows.push({ id: c.id, tier: s.tier, state: c.state, handedArea: !!S.domainAssign[DOM[c.id]] }); });
      });
      const sum = (list) => {
        const applicable = list.filter((r) => !EXCLUDED.includes(r.state));
        const answeredRows = applicable.filter((r) => ['reported', 'reused', 'na'].includes(r.state));
        // A declined question is outstanding information: nobody is asked it again automatically, and it is reported with
        // the function's reason. It does not hold the stage open; what happens next is an MK fulfilment decision.
        // Likewise a question the function itself answered "I don't know": nobody holds it any more.
        const statusOf = (r) => (S.assign[r.id] ? S.assign[r.id].status : null);
        const declined = applicable.filter((r) => r.state === 'waiting' && statusOf(r) === 'declined');
        const ownerUnknown = applicable.filter((r) => r.state === 'waiting' && statusOf(r) === 'owner-unknown');
        const notReached = (r) => !['reported', 'reused', 'na', 'waiting'].includes(r.state);
        const handed = applicable.filter((r) => (r.state === 'waiting' && !['declined', 'owner-unknown'].includes(statusOf(r))) || (notReached(r) && r.handedArea));
        const open = applicable.filter((r) => notReached(r) && !r.handedArea);
        return { applicableSoFar: applicable.length, answered: answeredRows.length, withFunctions: handed.length, declined: declined.length, unknownToFunction: ownerUnknown.length, open: open.length, complete: open.length === 0 };
      };
      const core = sum(rows.filter((r) => r.tier === 1));
      const consistencyPending = S.v16.consistency.some((c) => !answered(c.followup) && S.queue.some((x) => x.q === c.followup));
      core.complete = core.complete && !!S.assumptionsAsked && !consistencyPending;
      const breadth = sum(rows);
      breadth.complete = breadth.complete && core.complete;
      const pk = packages();
      const packagesOpen = pk.reduce((a, p) => a + p.open, 0);
      const current = !core.complete ? 'core' : !breadth.complete ? 'breadth' : packagesOpen ? 'packages' : 'complete';
      return { current, core, breadth, packages: { open: packagesOpen, sent: S.v16.sends.length, functions: pk }, note: 'Counts are "so far": a later answer can bring further questions into scope or take them out.' };
    }
    function packages() {
      return FUNCTIONS.map((fn) => {
        const items = Object.values(S.assign).filter((a) => a.fn === fn);
        const stillNeeded = (a) => !answered(a.qid) || (S.ans[a.qid] && S.ans[a.qid].v === 'unknown');
        const open = items.filter((a) => ACTIVE.includes(a.status) && stillNeeded(a) && !EXCLUDED.includes(scope(QI[a.qid]).st));
        const areas = Object.entries(S.domainAssign).filter(([, a]) => functionOf(a.owner) === fn).map(([d]) => d);
        const areaOpen = CONFIRMATIONS.filter((id) => areas.includes(DOM[id]) && !answered(id) && !S.assign[id] && !EXCLUDED.includes(rowFor(QI[id]).state)).length;
        return {
          fn, open: open.length + areaOpen, areas, areaOpen,
          byOrigin: open.reduce((m, a) => { const k = a.origin === 'depth' ? a.kind : /did not know/.test(a.why || '') ? 'unknown' : 'other'; m[k] = (m[k] || 0) + 1; return m; }, {}),
          answered: items.filter((a) => a.status === 'returned').length,
          declined: items.filter((a) => a.status === 'declined').map((a) => ({ id: a.qid, reason: a.declineReason || '' })),
          unknownByOwner: items.filter((a) => a.status === 'owner-unknown').length
        };
      });
    }
    function workload() {
      const by = { respondent: 0 };
      S.log.forEach((x) => {
        if (['assign-domain', 'plan-follow-up', 'correction'].includes(x.kind) || x.via === 'reviewer') return;
        if (x.via === 'owner') { const fn = x.by && FUNCTIONS.includes(x.by) ? x.by : functionOf(x.by || 'Owner'); by[fn] = (by[fn] || 0) + 1; } else if (QI[x.q] || x.q === '__assumptions__') by.respondent += 1;
      });
      return by;
    }

    // ---------------------------------------------------------------------------------------------- depth selection
    // Candidates are scored by relevance and expected information gain, without reference to any ranking of findings:
    //   kind     coverage 3 (only source on its objective), diagnostic 2 (says which part of a partial gap exists),
    //            follow-up 2 under a partial gap or 1 under a gap reported not in place (what else is in place);
    //   +1 tier 1 scenario, +0.5 tier 2; +1 if other practices depend on it (its answer decides what is asked next);
    //   +1 if its objective has no known answer yet; -1 for a detail practice whose objective already has two.
    // A candidate that cannot yet be asked because a fact or another practice decides whether it applies (a module gate
    // such as "Has the organisation dealt with a suspected fraud in the last three years?") is replaced by that gate,
    // valued at the best candidate it would open less 0.5, so dependencies are followed rather than left unreachable.
    // Selection takes candidates at or above minGain, highest first, within per-function, per-scenario and per-objective
    // limits. It is recomputed on every send, so answers already returned change what is selected next.
    function gateFor(id, depth) {
      const q = QI[id];
      if (!q || q.retired || answered(id) || activeAssignment(id) || (depth || 0) > 4) return null;
      if (S.assign[id] && ['declined', 'owner-unknown'].includes(S.assign[id].status)) return null;
      const sc = scope(q);
      if (sc.st === 'applicable') return id;
      if ((sc.st === 'unconfirmed' || sc.st === 'prerequisite') && sc.by && sc.by !== id) return gateFor(sc.by, (depth || 0) + 1);
      return null;
    }
    function depthCandidates() {
      const rep = e.report();
      const objKnown = {};
      Object.keys(S.ans).forEach((id) => { if (QI[id] && QI[id].type === 'practice' && answered(id) && S.ans[id].v !== 'unknown') (ROLE[id] && ROLE[id].objectives || []).forEach((o) => { objKnown[o] = (objKnown[o] || 0) + 1; }); });
      const out = [];
      const gates = {};
      const consider = (id, kind, scenario, worst) => {
        const q = QI[id];
        if (!q || q.retired || answered(id) || activeAssignment(id)) return;
        if (S.assign[id] && ['declined', 'owner-unknown'].includes(S.assign[id].status)) return;
        if (out.some((c) => c.id === id)) return;
        const tier = (SCN[scenario] || {}).tier || 9;
        const objs = (ROLE[id] && ROLE[id].objectives) || [];
        const known = Math.max(0, ...objs.map((o) => objKnown[o] || 0));
        let gain = kind === 'coverage' ? 3 : kind === 'diagnostic' ? 2 : worst === 'absent' ? 1 : 2;
        gain += tier === 1 ? 1 : tier === 2 ? 0.5 : 0;
        if (CHILDREN[id]) gain += 1;
        if (known === 0) gain += 1; else if (known >= 2 && q.stage === 'detail') gain -= 1;
        const sc = scope(q);
        if (sc.st !== 'applicable') {
          if (!['unconfirmed', 'prerequisite'].includes(sc.st)) return;
          const g = gateFor(sc.by);
          if (!g || g === id) return;
          const cur = gates[g];
          if (!cur || gain > cur.best) gates[g] = { best: gain, scenario, tier, opens: (cur ? cur.opens : 0) + 1 };
          else cur.opens += 1;
          return;
        }
        out.push({ id, kind, scenario, tier, gain, objective: objs[0] || null, fn: functionOf((MOD[id] || {}).owner || 'Senior manager'), owner: (MOD[id] || {}).owner || 'Senior manager' });
      };
      const sev = { absent: 0, designed: 1, partial: 2 };
      // A scenario whose confirmations are reported in place is still investigated when an answer already given on one
      // of its supporting practices reports a gap (a consistency check, a function's answer): the answers so far, not a
      // ranking chosen before them, decide where further questions are most likely to change a conclusion.
      const contested = (sc) => [...(sc.followups || []), ...(sc.related || [])].some((id) => ['absent', 'partial', 'designed'].includes(clsNow(id)));
      rep.scenarios.filter((s) => s.status !== 'outofscope').forEach((s) => {
        const sc = SCN[s.id];
        let worst = s.confirmations.map((c) => clsNow(c.id)).filter((k) => k in sev).sort((a, b) => sev[a] - sev[b])[0];
        if (!worst) { if (!s.confirmations.some((c) => clsNow(c.id) === 'full') || !contested(sc)) return; worst = 'contested'; }
        (sc.followups || []).forEach((f) => consider(f, 'follow-up', s.id, worst));
        if (worst !== 'absent') (sc.related || []).filter((id) => ROLE[id] && ROLE[id].role === 'related' && !COVERAGE_Q.has(id)).forEach((id) => consider(id, 'diagnostic', s.id, worst));
      });
      [...COVERAGE_Q].forEach((id) => { const sid = ROLE[id].scenario; const st = (rep.scenarios.find((x) => x.id === sid) || {}).status; if (st && st !== 'outofscope') consider(id, 'coverage', sid, null); });
      Object.entries(gates).forEach(([g, x]) => {
        if (out.some((c) => c.id === g)) return;
        const owner = (MOD[g] || {}).owner || 'Senior manager';
        out.push({ id: g, kind: 'gate', scenario: x.scenario, tier: x.tier, gain: x.best - 0.5, objective: null, opens: x.opens, fn: functionOf(owner), owner });
      });
      return out.sort((a, b) => b.gain - a.gain || a.tier - b.tier || ORDER[a.scenario] - ORDER[b.scenario] || (a.id < b.id ? -1 : 1));
    }
    function selectDepth() {
      const perFn = {}, perScen = {}, perObj = {};
      Object.values(S.assign).filter((a) => a.origin === 'depth').forEach((a) => { perFn[a.fn] = (perFn[a.fn] || 0) + 1; if (a.kind === 'diagnostic') perScen[a.scenario] = (perScen[a.scenario] || 0) + 1; if (a.kind === 'coverage' && a.objective) perObj[a.objective] = (perObj[a.objective] || 0) + 1; });
      const chosen = [];
      for (const c of depthCandidates()) {
        if (c.gain < depthOpts.minGain) continue;
        if ((perFn[c.fn] || 0) >= depthOpts.perFunction) continue;
        if (c.kind === 'diagnostic' && (perScen[c.scenario] || 0) >= depthOpts.perScenario) continue;
        if (c.kind === 'coverage' && c.objective && (perObj[c.objective] || 0) >= depthOpts.coveragePerObjective) continue;
        chosen.push(c);
        perFn[c.fn] = (perFn[c.fn] || 0) + 1;
        if (c.kind === 'diagnostic') perScen[c.scenario] = (perScen[c.scenario] || 0) + 1;
        if (c.kind === 'coverage' && c.objective) perObj[c.objective] = (perObj[c.objective] || 0) + 1;
      }
      return chosen;
    }
    // Sends packages to the accountable functions: the recommended depth selection, none, or an explicit list of
    // candidate ids chosen by the organisation. Repeatable; a question already with a function is never assigned twice.
    function planFollowUp(meta) {
      meta = meta || {};
      const candidates = depthCandidates();
      const selected = meta.depth === 'none' ? [] : Array.isArray(meta.depth) ? candidates.filter((c) => meta.depth.includes(c.id)) : selectDepth();
      const made = [];
      selected.forEach((c) => {
        if (activeAssignment(c.id) || answered(c.id)) return;
        const what = c.kind === 'coverage' ? 'the only question on an objective no confirmation covers' : c.kind === 'diagnostic' ? 'which parts of a partly reported control are in place' : c.kind === 'gate' ? 'a fact that decides whether further questions apply' : 'what else is in place where a gap was reported';
        const a = e.assign(c.id, c.owner, `Package for ${c.fn}: ${what} (“${(SCN[c.scenario] || {}).name || c.scenario}”).`);
        Object.assign(a, { origin: 'depth', kind: c.kind, scenario: c.scenario, objective: c.objective, gain: c.gain });
        made.push(c.id);
      });
      S.v16.sends.push({ at: opts.now(), by: meta.by || null, mode: meta.depth === 'none' ? 'none' : Array.isArray(meta.depth) ? 'selected' : 'recommended', assigned: made });
      S.log.push({ q: '__packages__', v: made.length, kind: 'plan-follow-up', at: opts.now(), via: 'organisation', by: meta.by || null });
      if (S.ended && S.stopReason === 'plan') { /* packages never reopen the respondent's interview */ }
      return made;
    }

    // ---------------------------------------------------------------------------------------------- owners
    // A question already assigned to a function, or declined, is never served again through a delegated area: one
    // question is one task, and a declined question is not re-served or reassigned without a decision.
    function askable(id, depth) {
      const q = QI[id];
      if (!q || q.retired || answered(id) || (depth || 0) > 6) return null;
      if (S.assign[id] && (ACTIVE.includes(S.assign[id].status) || S.assign[id].status === 'declined')) return null;
      const sc = scope(q);
      if (sc.st === 'applicable') return q;
      if ((sc.st === 'unconfirmed' || sc.st === 'prerequisite') && sc.by && QI[sc.by] && sc.by !== id) return askable(sc.by, (depth || 0) + 1);
      return null;
    }
    // Questions in an area the respondent delegated go to the function that owns it, after that function's package items.
    function nextOwner(who, again) {
      const step = e.nextOwner(who, again);
      if (step) {
        // The base build explains a package item as a follow-up or an "I don't know"; a depth question says why it was sent.
        const a = S.assign[step.q.id];
        if (a && a.origin === 'depth') step.reason = `${a.why} Suggested person: ${a.owner}.`;
        return step;
      }
      const fn = functionOf(who);
      for (const [dom, a] of Object.entries(S.domainAssign)) {
        if (functionOf(a.owner) !== fn) continue;
        const list = SC.filter((s) => s.domain === dom).sort((x, y) => x.tier - y.tier || ORDER[x.id] - ORDER[y.id]);
        for (const s of list) {
          const es = cond(s.expWhen);
          const mk = (q, why) => ({ q, kind: 'owner-package', domain: DOM[q.id] || dom, domainName: e.DNAME[DOM[q.id] || dom] || 'Profile', owner: fn, suggested: a.owner, scenario: s.id, reason: `${why} The area was delegated to ${a.owner}.` });
          if (es.st === 'unanswered' && es.l) { const q = askable(es.l.q); if (q) return mk(q, `Establishes whether “${s.name}” applies.`); continue; }
          if (es.st !== true) continue;
          for (const r of s.routes) {
            const rs = cond(r.when);
            if (rs.st === 'unanswered' && rs.l) { const q = askable(rs.l.q); if (q) return mk(q, `Decides which control confirms “${s.name}”.`); continue; }
            if (rs.st !== true) continue;
            for (const id of r.questions) { const q = askable(id); if (q) return mk(q, q.id === id ? `Confirms “${s.name}”.` : `Needed before the confirmation for “${s.name}”.`); }
          }
        }
      }
      return null;
    }
    // Declining: a question assigned to the function, or the delegated-area question on its screen. It stays outstanding
    // with the reason and is not served to anyone again automatically.
    function ownerDecline(qid, fn, reason) {
      if (!activeAssignment(qid)) {
        const area = DOM[qid] && S.domainAssign[DOM[qid]];
        if (!area || functionOf(area.owner) !== functionOf(fn)) return null;
        const a = e.assign(qid, area.owner, `Delegated area served to ${functionOf(fn)}.`);
        a.origin = 'area';
      }
      // Recorded on the assignment (status, reason, history) and in the session's action log, not in the answer log:
      // a decline is not an answer and is not a screen of the respondent's.
      e.ownerDecline(qid, fn, reason);
      return S.assign[qid];
    }
    function ownerReturn(qid, v, extra) {
      const fn = extra && extra.by;
      const fromArea = !activeAssignment(qid) && DOM[qid] && S.domainAssign[DOM[qid]] && functionOf(S.domainAssign[DOM[qid]].owner) === functionOf(fn || '');
      e.ownerReturn(qid, v, extra);
      if (fromArea && S.assign[qid]) S.assign[qid].origin = 'area';
    }

    // ---------------------------------------------------------------------------------------------- report
    function report() {
      const r = e.report();
      r.engineBuild = BUILD;
      r.status.respondentScreenLimit = null;
      r.status.followUpSent = S.v16.sends.length ? S.v16.sends[S.v16.sends.length - 1] : null;
      r.staged = { build: BUILD, stages: stages(r), consistency: consistencySummary(), workload: workload(), sends: S.v16.sends.slice(), depthPending: depthCandidates().length, approval: 'Not approved by MK: stages, consistency checks and depth selection are proposals; no score is produced.' };
      return r;
    }

    return Object.assign({}, e, { build: BUILD, answer, next, nextOwner, ownerReturn, ownerDecline, planFollowUp, report, stages, consistencySummary, depthCandidates, selectDepth, OUTCOME_LABEL });
  }
  return { create, CLASSES: BASE.CLASSES, ISSUE: BASE.ISSUE, BUILD: '1.6', COMPOSES: '1.5' };
})();
if (typeof module !== 'undefined') module.exports = REVIEW16;
