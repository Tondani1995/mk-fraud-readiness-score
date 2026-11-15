// MK Fraud Readiness review engine (client track), review build 1.5, 2 November 2026.
// Build 1.5 is additive to 1.4: a respondent-only channel for next(), the assumptions flag recorded when that screen is
// answered, a reviewer limitation field, and read-only exports for adapters. Default behaviour of every 1.4 call is unchanged.
// It establishes scope, asks the minimum direct confirmations for the organisation's material failure scenarios, follows up
// reported weaknesses, then widens coverage while the interview has room. It reports only what was established: reported
// practice, stated scope, owner input pending, evidence state and reviewer conclusions. A control that was not asked stays
// unconfirmed; nothing is estimated, scored or inferred, except where one answer is the same control over a wider scope.
const REVIEW = (function(){
  const CLASSES = ['full', 'partial', 'designed', 'absent', 'noinstance', 'na'];
  const ISSUE = ['absent', 'partial', 'designed'];
  const LEVEL_CLASS = {'0': 'absent', '1': 'partial', '2': 'partial', '3': 'partial', '4': 'full', '5': 'full'};
  const FIRST = ['PR-01', 'PR-12', 'PR-02', 'PR-13', 'PR-04', 'PR-03'];

  function create(BANK, COV, opts){
    opts = Object.assign({ceiling: 95, followups: 2, now: () => new Date().toISOString()}, opts || {});
    const PQS = BANK.profile.modules[0].questions;
    const QI = {}, MOD = {}, DOM = {}, ORDER = {}; let n = 0;
    PQS.forEach(q => { QI[q.id] = q; ORDER[q.id] = n++; });
    BANK.domains.forEach(d => d.bank.modules.forEach(m => m.questions.forEach(q => { QI[q.id] = q; MOD[q.id] = m; DOM[q.id] = d.id; ORDER[q.id] = n++; })));
    const DOMS = BANK.domains.map(d => d.id), DNAME = Object.fromEntries(BANK.domains.map(d => [d.id, d.name]));
    const SC = COV.scenarios, ROLE = COV.questionRole || {}, REUSE = COV.reuse || {};
    const SCOF = {}; SC.forEach(s => { s.routes.forEach(r => r.questions.forEach(q => { (SCOF[q] = SCOF[q] || []).push(s); })); });
    const S = {followUp: null, ownerQueue: [], ans: {}, log: [], assign: {}, domainAssign: {}, evidence: {}, review: {}, queue: [], fuDone: {}, assumptionsAsked: false, ended: false, stopReason: '', started: opts.now()};

    // ------------------------------------------------------------ classification of answers
    function classOf(q, v){
      if(v === undefined || v === null) return null;
      if(v === 'unknown') return 'unknown';
      if(v === 'na') return 'na';
      if(q.format === 'practice') return CLASSES.includes(v) ? v : null;
      if(q.format === 'anchored') return v === 'noevent' || v === 'noinstance' ? 'noinstance' : (q.levelClass || LEVEL_CLASS)[v] || null;
      if(q.format === 'choicePractice') return (q.practiceMap || {})[v] || null;
      // Multi-select practice: each offered check is its own purpose. All selected is in place, some is partly, none is absent.
      if(q.format === 'multi' && q.subPractices){ const a = [].concat(v); if(a.includes('none')) return 'absent';
        const subs = Object.keys(q.subPractices), hit = subs.filter(x => a.includes(x)).length;
        return !a.length ? null : hit === subs.length ? 'full' : hit ? 'partial' : 'absent'; }
      return null;
    }
    // Every entry path (interview, owner return, correction, import) passes answers through here, so "I don't know" has one
    // meaning whether it arrives as "unknown" or ["unknown"], and invalid values are rejected rather than stored.
    function validValues(q){
      const v = (q.options || []).map(o => o[0]);
      if(q.format === 'anchored'){ ['0', '1', '2', '3', '4', '5'].forEach(x => v.push(x)); if(v.includes('noevent')) v.push('noinstance'); }
      if(q.naLabel) v.push('na'); if(!v.includes('unknown')) v.push('unknown');
      return new Set(v);
    }
    function normalise(q, v){
      if(q.id === '__assumptions__'){ const a = [].concat(v); if(a.includes('none') || !a.length) return ['none']; const bad = a.filter(x => !q.facts.includes(x)); if(bad.length) throw new Error('Invalid activities: ' + bad.join(', ')); return [...new Set(a)]; }
      const valid = validValues(q);
      if(Array.isArray(v)){
        if(!v.length) throw new Error('Empty answer for ' + q.id);
        if(v.includes('unknown')) return 'unknown';
        if(q.format !== 'multi'){ if(v.length !== 1) throw new Error('Several values for single-choice ' + q.id); v = v[0]; }
        else { const u = [...new Set(v.map(String))]; const bad = u.filter(x => !valid.has(x)); if(bad.length) throw new Error(`Invalid value ${bad.join(', ')} for ${q.id}`); return u.includes('none') ? ['none'] : u; }
      }
      v = String(v);
      if(v === 'unknown') return 'unknown';
      if(!valid.has(v)) throw new Error(`Invalid value ${v} for ${q.id}`);
      return q.format === 'multi' ? [v] : v;
    }
    const absentValues = q => q.format === 'practice' ? ['absent'] : q.format === 'anchored' ? ['0'] : q.format === 'choicePractice' ? Object.keys(q.practiceMap || {}).filter(k => q.practiceMap[k] === 'absent') : q.format === 'multi' ? ['none'] : [];

    // ------------------------------------------------------------ conditions
    function leafEval(l){
      const q = QI[l.q], r = S.ans[l.q];
      if(!r || r.stale){
        if(q && q.expectWhen && cond(q.expectWhen).st === false) return {st: 'assumed', l};
        // A fact that cannot apply, such as the PFMA question for a private company, settles the condition as false.
        if(q && (leafEval.depth || 0) < 8){ leafEval.depth = (leafEval.depth || 0) + 1; const sc = scope(q, true); leafEval.depth--;
          if(['outofscope', 'proportion', 'precluded'].includes(sc.st)) return {st: false, l, unreachable: true}; }
        return {st: 'unanswered', l};
      }
      const vals = [].concat(r.v);
      if(vals.length === 1 && vals[0] === 'unknown') return {st: 'pending', l};
      if(vals.some(x => l.in.includes(x))) return {st: true, l};
      if(vals.includes('unknown')) return {st: 'pending', l};
      return {st: false, l};
    }
    // A false condition on a practice is 'precluded' only when that practice was reported absent. A fallback that is not needed,
    // a follow-up for another route, or a parent that is itself out of scope is out of scope.
    function kindOf(l){
      const q = QI[l.q]; if(!q || l.q.startsWith('PR-') || q.type !== 'practice') return 'activity';
      if(l.in.some(v => absentValues(q).includes(v))) return 'fallback';
      const a = S.ans[l.q]; if(!a || a.stale) return 'activity';
      return classOf(q, a.v) === 'absent' ? 'presence' : 'activity';
    }
    function cond(c){
      if(!c) return {st: true};
      if(c.all){
        const rs = c.all.map(cond), f = rs.filter(r => r.st === false);
        if(f.length) return f.find(r => r.l && kindOf(r.l) !== 'presence') || f[0];
        return rs.find(r => r.st === 'pending') || rs.find(r => r.st === 'unanswered') || rs.find(r => r.st === 'assumed') || {st: true};
      }
      if(c.any){
        const rs = c.any.map(cond);
        return rs.find(r => r.st === true) || rs.find(r => r.st === 'pending') || rs.find(r => r.st === 'unanswered') || rs.find(r => r.st === 'assumed') || rs.find(r => r.st === false) || {st: false};
      }
      return leafEval(c);
    }
    const isTrue = c => cond(c).st === true;
    const leaves = c => !c ? [] : c.all ? c.all.flatMap(leaves) : c.any ? c.any.flatMap(leaves) : [c];

    // ------------------------------------------------------------ scope of a question
    function scope(q, ignoreExpect){
      if(q.retired) return {st: 'retired'};
      if(q.id.startsWith('PR-')) return q.askWhen && cond(q.askWhen).st === false ? {st: 'outofscope', by: q.askWhen.q} : {st: 'applicable'};
      const m = MOD[q.id];
      for(const c of [m.relevantWhen, q.relevantWhen]){
        if(!c) continue; const r = cond(c);
        if(r.st === false) return {st: 'proportion', basis: q.proportion || {category: 'scale-dependent', reason: 'Proportionate to scale.'}};
        if(r.st !== true) return {st: 'unconfirmed', by: r.l ? r.l.q : null};
      }
      for(const c of [m.enterWhen, q.askWhen]){
        if(!c) continue; const r = cond(c);
        if(r.st === true) continue;
        if(r.st === false) return kindOf(r.l) === 'presence' ? {st: 'precluded', by: r.l.q} : {st: 'outofscope', by: r.l.q};
        if(r.st === 'assumed') return ignoreExpect ? {st: 'unconfirmed', by: r.l.q} : {st: 'assumed', by: r.l.q};
        if(r.st === 'pending') return {st: 'waiting', by: r.l.q};
        const f = QI[r.l.q];
        return f && f.type === 'practice' && !f.id.startsWith('PR-') ? {st: 'prerequisite', by: f.id} : {st: 'unconfirmed', by: r.l.q};
      }
      if(q.expectWhen && !S.ans[q.id] && cond(q.expectWhen).st === false && !ignoreExpect) return {st: 'assumed', by: q.id, self: true};
      return {st: 'applicable'};
    }
    function reused(q){
      const r = REUSE[q.id]; if(!r || (S.ans[q.id] && !S.ans[q.id].stale)) return null;
      if(scope(q).st !== 'applicable' || scope(QI[r.from]).st !== 'applicable') return null;
      const src = S.ans[r.from]; if(!src || src.stale || !r.when.includes(String(src.v))) return null;
      return {from: r.from, why: r.why, cls: classOf(QI[r.from], src.v)};
    }
    const answered = q => S.ans[q.id] && !S.ans[q.id].stale;
    const assigned = q => !!S.assign[q.id] && ['assigned', 'accepted', 'overdue'].includes(S.assign[q.id].status) || (!!S.domainAssign[DOM[q.id]] && !answered(q));

    // Find the next question needed to settle q: q itself if it is in scope, or the fact or prerequisite it waits on.
    function resolve(q, depth){
      if(!q || depth > 6) return null;
      if(answered(q) || assigned(q)) return null;
      if(!q.id.startsWith('PR-') && reused(q)) return null;
      const sc = scope(q);
      if(sc.st === 'applicable') return q;
      if(sc.st === 'unconfirmed' || sc.st === 'prerequisite'){ const f = QI[sc.by]; if(f && f !== q) return resolve(f, (depth || 0) + 1); }
      return null;
    }
    function resolveCond(c, depth){
      const r = cond(c); if(r.st !== 'unanswered') return null;
      return resolve(QI[r.l.q], depth || 0);
    }

    // ------------------------------------------------------------ the interview plan
    const tier1 = () => SC.filter(s => s.tier === 1);
    function scenarioState(s){ const r = cond(s.expWhen); return r.st; }
    function routeQs(s){ return s.routes.filter(r => isTrue(r.when)).flatMap(r => r.questions); }
    function step(q, kind, extra){ return Object.assign({q, kind, domain: DOM[q.id] || null, domainName: DNAME[DOM[q.id]] || 'Profile'}, extra || {}); }
    function inDomainAssigned(id){ return !!S.domainAssign[DOM[id]]; }

    // next({respondentOnly: true}) serves the respondent's channel only. Owner follow-ups are a separate channel; in a
    // multi-actor service they must never block or appear in the respondent's interview (build 1.5).
    function next(o){
      const respondentOnly = !!(o && o.respondentOnly);
      // Owner follow-ups are a separate channel: they are served even after the respondent's interview has ended.
      while(!respondentOnly && S.ownerQueue.length){ const o = S.ownerQueue[0]; const q = resolve(QI[o.q]); if(q) return step(q, 'owner-followup', {owner: o.owner, scenario: o.s, reason: `Opened by ${o.owner}'s answer on ${o.from}; it goes back to the same owner and does not count towards the respondent's interview.`}); S.ownerQueue.shift(); }
      if(S.ended) return null;
      for(const id of FIRST){ const q = QI[id]; if(S.ans[id] === undefined && scope(q).st === 'applicable')
        return step(q, 'profile', {reason: 'A few profile questions come first. They decide which parts of the bank apply and how questions are worded. They never establish a control.'}); }
      if(respondentScreens() >= opts.ceiling) return end('ceiling');
      // Reconfirm answers that became stale after a correction and are in scope again.
      for(const id in S.ans){ const q = QI[id]; if(S.ans[id].stale && scope(q).st === 'applicable' && !assigned(q)) return step(q, 'reconfirm', {reason: 'An earlier answer changed, so this answer is asked again before it is used.'}); }
      // 1. Follow-ups to reported weaknesses.
      // Follow-ups run only while room remains for every open minimum confirmation, so they can never crowd one out.
      // Conservative: an unsettled exposure or route counts one screen for the fact plus every confirmation it could open.
      const reserve = () => tier1().reduce((sum, s) => {
        if(S.domainAssign[s.domain]) return sum;
        // Until the activities screen has been shown, an assumed exposure may still open, so it is reserved too.
        const live = st => st === 'assumed' ? !S.assumptionsAsked : !(st === false || st === 'pending');
        const es = cond(s.expWhen).st;
        if(!live(es)) return sum;
        const open = s.routes.reduce((a, r) => { const rs = cond(r.when).st; if(!live(rs)) return a;
          const qs = r.questions.filter(id => { const q = QI[id]; if(answered(q) || assigned(q) || reused(q)) return false; const sc = scope(q).st; return !['outofscope', 'proportion', 'precluded', 'waiting'].includes(sc) && !(sc === 'assumed' && S.assumptionsAsked); });
          return a + qs.length + ((rs === 'unanswered' || rs === 'assumed') && qs.length ? 1 : 0); }, 0);
        return sum + open + ((es === 'unanswered' || es === 'assumed') && open ? 1 : 0);
      }, 0);
      while(S.queue.length && respondentScreens() + 1 + reserve() <= opts.ceiling){
        const f = S.queue[0]; const q = resolve(QI[f.q]);
        if(q){ return step(q, q.id === f.q ? 'followup' : 'scope', {scenario: f.s, reason: q.id === f.q ? `Follow-up to a reported gap in “${f.name}”. It clarifies what else is in place for this scenario.` : `Needed before a follow-up in “${f.name}”.`}); }
        S.queue.shift();
      }
      // 2. Minimum direct confirmations for tier-1 scenarios, domain by domain.
      const t1 = tier1().slice().sort((a, b) => DOMS.indexOf(a.domain) - DOMS.indexOf(b.domain));
      for(const s of t1){
        if(S.domainAssign[s.domain]) continue;
        const es = scenarioState(s);
        if(es === 'unanswered'){ const q = resolveCond(s.expWhen); if(q) return step(q, 'scope', {scenario: s.id, reason: `Establishes whether “${s.name}” applies to the organisation.`}); continue; }
        if(es !== true) continue;
        for(const r of s.routes){
          const rs = cond(r.when).st;
          if(rs === 'unanswered'){ const q = resolveCond(r.when); if(q) return step(q, 'route', {scenario: s.id, reason: `Decides which control confirms “${s.name}” for this organisation.`}); continue; }
          if(rs !== true) continue;
          for(const id of r.questions){ const q = resolve(QI[id]); if(q) return step(q, q.id === id ? 'confirm' : 'route', {scenario: s.id, tier: 1,
            reason: q.id === id ? `Minimum direct confirmation for “${s.name}”. ${s.why || s.how}` : `Needed before the confirmation for “${s.name}”.`}); }
        }
      }
      // 3. One screen to confirm less common activities that were assumed not to apply from the sector or profile.
      if(!S.assumptionsAsked){ const a = assumedFacts(); if(a.length){ S.assumptionsAsked = true; return {q: assumptionQuestion(a), kind: 'assumptions', domain: null, domainName: 'Activities to confirm', reason: 'These activities were not asked about because they are uncommon for organisations like this one. Selecting one opens the questions that go with it.'}; } S.assumptionsAsked = true; }
      while(S.queue.length){ const f = S.queue[0]; const q = resolve(QI[f.q]); if(q) return step(q, q.id === f.q ? 'followup' : 'scope', {scenario: f.s, reason: `Follow-up to a reported gap in “${f.name}”, asked once the minimum confirmations were complete.`}); S.queue.shift(); }
      // 4. Wider coverage: the primary question of tier-2, then tier-3 scenarios that apply.
      for(const [tier, known] of [[2, true], [2, false], [3, true], [3, false]]){
        // Scenarios already known to apply come before those that need another fact first, so each screen settles more.
        const list = SC.filter(s => s.tier === tier && (scenarioState(s) === true) === known).sort((a, b) => DOMS.indexOf(a.domain) - DOMS.indexOf(b.domain));
        for(const s of list){
          const es = scenarioState(s); if(es === 'unanswered'){ const q = resolveCond(s.expWhen); if(q) return step(q, 'scope', {scenario: s.id, reason: `Establishes whether “${s.name}” applies.`}); continue; }
          if(es !== true) continue;
          const qs = routeQs(s); if(!qs.length){ const rq = s.routes.map(r => resolveCond(r.when)).find(Boolean); if(rq) return step(rq, 'route', {scenario: s.id, reason: `Decides which control applies to “${s.name}”.`}); continue; }
          if(qs.some(id => answered(QI[id]) || reused(QI[id]))) continue;
          for(const id of qs){ if(inDomainAssigned(id)) continue; const q = resolve(QI[id]); if(q) return step(q, q.id === id ? 'coverage' : 'scope', {scenario: s.id, tier,
            reason: q.id === id ? `Wider coverage: the main control for “${s.name}”, a tier-${tier} scenario that applies to this organisation.` : `Needed before the main control for “${s.name}”.`}); }
        }
      }
      return end('plan');
    }
    // Screens the interview served to the respondent. Owner answers and corrections recorded from the report are counted separately.
    function respondentScreens(){ return S.log.filter(x => !['owner', 'reviewer'].includes(x.via) && !['assign-domain', 'correction', 'plan-follow-up'].includes(x.kind)).length; }
    function end(reason){ S.ended = true; S.stopReason = reason; S.endedAt = opts.now(); return null; }
    function stop(){ end('respondent'); }
    function resume(){ if(S.ended && S.stopReason !== 'ceiling'){ S.ended = false; S.stopReason = ''; } }

    // ------------------------------------------------------------ assumptions
    function assumedFacts(){
      const out = [];
      Object.values(QI).forEach(q => {
        if(q.retired || S.ans[q.id] || !q.expectWhen) return;
        if(cond(q.expectWhen).st !== false) return;
        const sc = scope(q, true); if(sc.st !== 'applicable') return;
        out.push(q);
      });
      return out.sort((a, b) => ORDER[a.id] - ORDER[b.id]);
    }
    function assumptionQuestion(facts){
      return {id: '__assumptions__', key: 'Less common activities', type: 'context', format: 'multi', text: 'Do any of these apply to the organisation? Select all that apply.',
        options: facts.map(f => [f.id, f.text]).concat([['none', 'None of these']]), facts: facts.map(f => f.id)};
    }

    // ------------------------------------------------------------ answering
    function record(q, v, extra, via){
      const prev = S.ans[q.id];
      const rec = Object.assign({v, cls: classOf(q, v), ver: prev ? (prev.ver || 1) + 1 : 1, at: opts.now(), via: via || 'respondent', by: (extra && extra.by) || 'Respondent', role: (extra && extra.role) || null, hist: []}, pick(extra, ['reach', 'note', 'tested', 'ev', 'units', 'scopeNote']));
      if(prev){ rec.hist = prev.hist.concat([Object.assign({}, prev, {hist: undefined})]); }
      return rec;
    }
    function pick(o, ks){ const r = {}; if(o) ks.forEach(k => { if(o[k] !== undefined) r[k] = o[k]; }); return r; }
    function answer(q, v, kind, extra){
      v = normalise(q, v);
      if(q.id === '__assumptions__'){
        const sel = v;
        q.facts.forEach(id => { const f = QI[id]; const yes = sel.includes(id); const val = yes ? (f.options.find(o => o[0] === 'yes') ? 'yes' : f.options[0][0]) : (f.options.find(o => o[0] === 'no') ? 'no' : (f.options.find(o => o[0] === 'none') || f.options[f.options.length - 2])[0]);
          S.ans[id] = record(f, val, {note: 'Confirmed on the activities screen'}, 'assumptions'); });
        S.log.push({q: '__assumptions__', v: sel, kind: 'assumptions', at: opts.now()});
        S.assumptionsAsked = true;
        return;
      }
      const wasAnswered = !!S.ans[q.id];
      const viaOwner = kind === 'owner-followup';
      S.ans[q.id] = record(q, v, extra, viaOwner ? 'owner' : 'respondent');
      S.log.push({q: q.id, v, kind: kind || 'item', at: opts.now(), via: viaOwner ? 'owner' : 'respondent', by: (extra && extra.by) || null});
      if(viaOwner) S.ownerQueue = S.ownerQueue.filter(o => o.q !== q.id);
      if(v === 'unknown') assign(q.id, (MOD[q.id] && MOD[q.id].owner) || (q.id.startsWith('PR-') ? 'A senior manager' : 'A senior manager'), viaOwner ? 'owner did not know' : 'respondent did not know');
      else if(S.assign[q.id] && S.assign[q.id].status !== 'returned') closeAssign(q.id, 'answered by respondent');
      // Follow-ups when a confirmation or main control reports a gap.
      const cls = S.ans[q.id].cls;
      if(ISSUE.includes(cls)){
        (SCOF[q.id] || []).forEach(s => { if(S.fuDone[s.id]) return; S.fuDone[s.id] = true;
          s.followups.slice(0, opts.followups).forEach(f => S.queue.push({q: f, s: s.id, name: s.name})); });
      }
      if(wasAnswered) markStale();
    }
    // After a correction, answers that are no longer in scope are kept in history but marked stale, so they never count again silently.
    function markStale(){
      let changed = true, guard = 0;
      while(changed && guard++ < 5){ changed = false;
        for(const id in S.ans){ const q = QI[id]; if(!q || id.startsWith('PR-') || S.ans[id].stale) continue;
          const sc = scope(q); if(!['applicable'].includes(sc.st)){ S.ans[id].stale = {reason: 'Out of scope after a correction to ' + (sc.by || 'an earlier answer'), at: opts.now()}; changed = true; } } }
      // A correction can open new questions, but only a completed plan reopens the interview; the ceiling and a respondent stop stand.
      if(S.ended && S.stopReason === 'plan'){ S.ended = false; S.stopReason = ''; }
    }
    function correct(qid, v, extra){ const q = QI[qid]; S.ans[qid] && (S.ans[qid].stale = false); answer(q, v, 'correction', extra); }

    // ------------------------------------------------------------ owners
    // Owner labels in the bank name who would typically know (93 labels). Packages go to eight accountable functions; the
    // organisation names the person for each function, and every question keeps its suggested role.
    const FN_RULES = [[/\bceo\b|company secretary|csi|sustainab|\bboard\b|accounting officer|chair|owner|managing partner|senior manager|director/, 'Executive and governance'],
      [/forensic|risk|internal audit|investigat|fraud/, 'Risk and investigations'], [/legal|compliance|ethics|regulatory/, 'Legal, compliance and ethics'],
      [/\bit\b|information|ai tools|security|systems|data/, 'IT and information'], [/procure|bid committee|supply chain|contract/, 'Procurement'], [/\bhr\b|payroll|people|human/, 'HR and payroll'],
      [/\bcfo\b|financ|creditor|debtor|billing|tax|controller|treasur|accountant|accounts|credit/, 'Finance'],
      [/operat|warehouse|stores|fleet|asset|facilit|sales|channel|commercial|bid manager|branch|plant|production|logistic|customer|marketing|programme|project|claims/, 'Operations and sales']];
    const FUNCTIONS = FN_RULES.map(r => r[1]);
    function functionOf(label){ if(FUNCTIONS.includes(label)) return label; const low = String(label || '').toLowerCase(); const first = low.split(/ or |, with |, | and /)[0];
      for(const t of [first, low]) for(const [re, f] of FN_RULES) if(re.test(t)) return f; return 'Executive and governance'; }
    function assign(qid, owner, why){
      const a = S.assign[qid] || {qid, hist: []};
      a.hist.push({status: a.status || null, at: opts.now()});
      Object.assign(a, {owner, fn: functionOf(owner), status: 'assigned', why, at: opts.now()}); S.assign[qid] = a; return a;
    }
    function assignDomain(dom, owner){ S.domainAssign[dom] = {owner, at: opts.now()}; S.log.push({q: '__domain__:' + dom, v: owner, kind: 'assign-domain', at: opts.now()}); }
    function ownerAccept(qid, by){ const a = S.assign[qid]; if(!a) return; a.hist.push({status: a.status, at: opts.now()}); a.status = 'accepted'; a.acceptedBy = by; }
    function ownerDecline(qid, by, reason){ const a = S.assign[qid]; if(!a) return; a.hist.push({status: a.status, at: opts.now()}); a.status = 'declined'; a.declinedBy = by; a.declineReason = reason; }
    function ownerOverdue(qid){ const a = S.assign[qid]; if(!a) return; a.hist.push({status: a.status, at: opts.now()}); a.status = 'overdue'; }
    // An owner answering a confirmation that their earlier answer opened.
    function ownerAnswer(qid, v, extra){ const q = QI[qid]; const o = S.ownerQueue.find(x => x.q === qid); answer(q, v, 'owner-followup', Object.assign({by: o ? o.owner : 'Owner'}, extra || {})); }
    // Replays answers from an export or another system through the same normalisation as the interview.
    function importLog(entries){ entries.forEach(x => { if(x.via === 'owner' && x.kind === 'owner') ownerReturn(x.q, x.v, x.extra || {by: x.by}); else if(x.kind === 'assign-domain') assignDomain(x.q.replace('__domain__:', ''), x.v); else answer(x.q === '__assumptions__' ? assumptionQuestion(x.facts || assumedFacts()) : QI[x.q], x.v, x.kind, x.extra); }); }
    function ownerReturn(qid, v, extra){
      const q = QI[qid]; v = normalise(q, v); const a = S.assign[qid] || assign(qid, (extra && extra.role) || 'Owner', 'returned without prior assignment');
      const wasAnswered = !!S.ans[qid];
      const openBefore = new Set(openConfirmations());
      S.ans[qid] = record(q, v, extra, 'owner'); S.log.push({q: qid, v, kind: 'owner', at: opts.now(), via: 'owner', by: extra && extra.by});
      a.hist.push({status: a.status, at: opts.now()}); a.status = v === 'unknown' ? 'owner-unknown' : 'returned'; S.ownerQueue = S.ownerQueue.filter(o => o.q !== qid); a.returnedBy = extra && extra.by; a.returnedAt = opts.now();
      if(ISSUE.includes(S.ans[qid].cls)) (SCOF[qid] || []).forEach(s => { if(!S.fuDone[s.id]){ S.fuDone[s.id] = true; s.followups.slice(0, opts.followups).forEach(f => S.queue.push({q: f, s: s.id, name: s.name})); } });
      if(wasAnswered) markStale();
      const opened = openConfirmations().filter(x => !openBefore.has(x));
      opened.forEach(id => S.ownerQueue.push({q: id, owner: a.owner, fn: functionOf(a.owner), from: qid, s: (SCOF[id] || [{}])[0].id}));
      // Only a completed plan reopens the respondent's interview; a ceiling or a respondent stop stays as it was.
      if(S.ended && S.stopReason === 'plan'){ S.ended = false; S.stopReason = ''; }
    }
    // Tier-1 confirmations that are in scope and not yet answered, including those reached through a route.
    function openConfirmations(){
      const out = [];
      tier1().forEach(s => { if(cond(s.expWhen).st !== true) return; routeQs(s).forEach(id => { const q = QI[id]; if(!answered(q) && scope(q).st === 'applicable') out.push(id); }); });
      return out;
    }
    function closeAssign(qid, why){ const a = S.assign[qid]; if(!a) return; a.hist.push({status: a.status, at: opts.now()}); a.status = 'closed'; a.closedWhy = why; }
    function returnDomain(dom){ delete S.domainAssign[dom]; if(S.ended && S.stopReason !== 'ceiling'){ S.ended = false; S.stopReason = ''; } }

    // ------------------------------------------------------------ evidence and review (kept separate from the self-report)
    const EV_STATES = ['requested', 'supplied', 'reviewed-sufficient', 'insufficient', 'contradicted', 'unavailable'];
    const CONCLUSIONS = ['confirmed', 'partly-confirmed', 'not-confirmed', 'disputed'];
    // The whole earlier record goes into history before it is replaced: answer version and value, basis, person, time and
    // follow-up. History entries never carry their own history, so nothing is duplicated recursively (V13-04).
    const snapshot = rec => { const {hist, ...rest} = rec; return JSON.parse(JSON.stringify(rest)); };
    const isCurrentFor = (rec, qid) => { const a = S.ans[qid]; return !!rec && !!a && !a.stale && rec.forVer === a.ver; };
    function setEvidence(qid, state, meta){
      if(!EV_STATES.includes(state)) throw new Error('evidence state ' + state);
      const e = S.evidence[qid] || {hist: []}; if(e.at) e.hist.push(snapshot(e));
      const a = S.ans[qid]; Object.assign(e, {state, by: meta.by, basis: meta.basis || '', at: opts.now(), forVer: a ? a.ver : null, forValue: a ? a.v : null}); S.evidence[qid] = e;
    }
    // A conclusion is optional when a follow-up is given: the record is then a reviewer task (V13-01). If a conclusion already
    // stands for the same answer version, the task is added to it and the conclusion is kept, with the earlier record in history.
    // A conclusion recorded against an earlier answer version is never carried forward.
    function setReview(qid, conclusion, meta){
      meta = meta || {}; const followUp = (meta.followUp || '').trim();
      if(conclusion && !CONCLUSIONS.includes(conclusion)) throw new Error('conclusion ' + conclusion);
      if(!conclusion && !followUp) throw new Error('a conclusion or a follow-up is required');
      const r = S.review[qid] || {hist: []}; const keep = !conclusion && isCurrentFor(r, qid) && r.conclusion ? r.conclusion : null;
      if(r.at) r.hist.push(snapshot(r));
      const a = S.ans[qid];
      Object.assign(r, {conclusion: conclusion || keep, conclusionCarried: !conclusion && !!keep, by: meta.by, basis: meta.basis || (keep ? r.basis : ''), followUp, limitation: (meta.limitation || '').trim(), at: opts.now(), forVer: a ? a.ver : null, forValue: a ? a.v : null});
      S.review[qid] = r;
    }

    // ------------------------------------------------------------ report
    function rowFor(q){
      const id = q.id, a = S.ans[id], sc = scope(q), role = ROLE[id] || {}, ev = S.evidence[id], rv = S.review[id];
      // Evidence and conclusions apply to the answer version they were based on; after a material change they need re-review.
      const cur = rec => rec ? Object.assign({}, rec, {current: !!a && !a.stale && rec.forVer === a.ver}) : null;
      const evc = cur(ev), rvc = cur(rv);
      const reReview = (evc && !evc.current && evc.forVer !== null) || (rvc && !rvc.current && rvc.forVer !== null)
        ? {reason: a && !a.stale ? `Answer changed from “${labelOf(q, (evc && !evc.current ? evc : rvc).forValue)}” to “${labelOf(q, a.v)}” after the review.` : 'The control is no longer in scope or its answer is stale', since: (evc && !evc.current ? evc : rvc).forVer} : null;
      const base = {id, key: q.key, text: q.text, type: q.type, format: q.format, scenario: role.scenario || null, role: role.role || null, objectives: role.objectives || [], evidence: evc, review: rvc, reReview};
      if(a && !a.stale){
        if(a.v === 'unknown') return Object.assign(base, {state: 'waiting', owner: S.assign[id] && S.assign[id].owner, assignment: S.assign[id] || null});
        if(q.type !== 'practice') return Object.assign(base, {state: 'fact', answer: a, label: labelOf(q, a.v)});
        if(a.cls === 'na') return Object.assign(base, {state: 'na', answer: a, label: labelOf(q, a.v)});
        const subs = q.subPractices ? Object.entries(q.subPractices).map(([opt, oid]) => ({id: oid, label: (q.options.find(o => o[0] === opt) || [])[1], cls: [].concat(a.v).includes(opt) ? 'full' : 'absent'})) : null;
        return Object.assign(base, {state: 'reported', cls: a.cls, answer: a, label: labelOf(q, a.v), subs, issue: ISSUE.includes(a.cls)});
      }
      if(['outofscope', 'proportion', 'precluded', 'retired'].includes(sc.st)) return Object.assign(base, {state: sc.st, by: sc.by || null, basis: sc.basis || null});
      const ru = reused(q); if(ru) return Object.assign(base, {state: 'reused', cls: ru.cls, from: ru.from, why: ru.why});
      const oq = S.ownerQueue.find(o => o.q === id);
      if(oq && sc.st === 'applicable') return Object.assign(base, {state: 'waiting', owner: oq.owner, ownerFollowup: {from: oq.from}});
      if(assigned(q)) return Object.assign(base, {state: 'waiting', owner: (S.assign[id] && S.assign[id].owner) || (S.domainAssign[DOM[id]] || {}).owner, assignment: S.assign[id] || null, bulk: !S.assign[id]});
      const map = {applicable: 'unconfirmed', unconfirmed: 'scope-unconfirmed', prerequisite: 'prerequisite', precluded: 'precluded', waiting: 'waiting-scope', assumed: 'assumed', outofscope: 'outofscope', proportion: 'proportion', retired: 'retired'};
      return Object.assign(base, {state: map[sc.st] || sc.st, by: sc.by || null, basis: sc.basis || null});
    }
    // Second stage: open material scenarios go to their accountable owners as packages. Each owner answers only their own
    // area, one question per screen, outside the respondent's interview. Facts that decide scope go to the same owner.
    function assignPlan(plan, dry){ const made = [];
      plan.forEach(p => { if(p.status === 'waiting' || p.status === 'precluded') return;
        const qs = p.factsNeeded.length ? p.factsNeeded : p.questions.filter(id => { const q = QI[id]; return !answered(q) && scope(q).st === 'applicable'; });
        qs.forEach(id => { if(S.assign[id] && ['assigned', 'accepted', 'overdue', 'owner-unknown'].includes(S.assign[id].status)) return; if(dry){ made.push({id, fn: p.fn}); return; } const a = assign(id, p.owner, 'second-stage follow-up for ' + p.id); a.origin = 'follow-up'; a.scenario = p.id; made.push(id); }); });
      return made; }
    function planFollowUp(meta){
      const made = assignPlan(followUpPlan(report().unresolvedMaterial));
      S.followUp = {at: opts.now(), by: (meta && meta.by) || null, assigned: made};
      S.log.push({q: '__follow-up__', v: made.length, kind: 'plan-follow-up', at: opts.now(), via: 'reviewer', by: (meta && meta.by) || null});
      return made;
    }
    // Once scenarios have been sent, an owner's own answers can settle a scope fact and open the scenario's controls.
    // Those controls join the same function's package, so the owner finishes in one sitting instead of waiting for another round.
    function extendPlan(fn){ if(!S.followUp) return 0;
      const made = assignPlan(followUpPlan(report().unresolvedMaterial).filter(p => p.fn === fn));
      if(made.length){ S.followUp.assigned = S.followUp.assigned.concat(made); S.followUp.extended = (S.followUp.extended || 0) + made.length; }
      return made.length; }
    // The next question for one owner: confirmations their own answers opened, then their package, settling scope first.
    // Accepts a function name or an owner label; questions are served by function, each with its suggested role.
    function nextOwner(who, again){
      const fn = functionOf(who);
      for(const o of S.ownerQueue){ if(functionOf(o.owner) !== fn) continue; const q = QI[o.q]; if(!answered(q) && scope(q).st === 'applicable') return step(q, 'owner-followup', {owner: fn, suggested: o.owner, reason: `Opened by the answer on ${o.from}. Suggested person: ${o.owner}.`}); }
      const mine = Object.values(S.assign).filter(a => functionOf(a.owner) === fn && ['assigned', 'accepted', 'overdue'].includes(a.status));
      for(const a of mine){ const q = QI[a.qid]; if(!q || (answered(q) && S.ans[a.qid].v !== 'unknown')) continue; const sc = scope(q).st;
        if(['applicable', 'unconfirmed', 'waiting'].includes(sc) || q.id.startsWith('PR-')) return step(q, 'owner-package', {owner: fn, suggested: a.owner, scenario: a.scenario || null, reason: (a.origin === 'follow-up' ? `Second-stage follow-up for ${a.scenario}.` : `Assigned because the respondent did not know.`) + ` Suggested person: ${a.owner}.`}); }
      if(!again && extendPlan(fn)) return nextOwner(fn, true);
      return null;
    }
    // Open owner work by accountable function.
    // After scenarios have been sent, questions that another function's answers have since opened count towards the owning function.
    function owners(open){ const m = {}; const add = l => { const f = functionOf(l); m[f] = (m[f] || 0) + 1; };
      Object.values(S.assign).forEach(a => { if(['assigned', 'accepted', 'overdue'].includes(a.status)) add(a.owner); }); S.ownerQueue.forEach(o => add(o.owner));
      if(S.followUp && open) assignPlan(followUpPlan(open), true).forEach(x => add(x.fn)); return m; }
    // Who should settle each open material scenario, and which questions that takes. No time estimate is given without pilot data.
    function followUpPlan(open){
      return open.map(s => { const sc = SC.find(x => x.id === s.id); const qs = sc.routes.flatMap(r => r.questions); const facts = [];
        const lv = c => !c ? [] : c.all ? c.all.flatMap(lv) : c.any ? c.any.flatMap(lv) : [c];
        const open = q => !S.ans[q] || S.ans[q].stale || [].concat(S.ans[q].v).includes('unknown');
        lv(sc.expWhen).concat(sc.routes.flatMap(r => lv(r.when))).forEach(l => { if(open(l.q) && !facts.includes(l.q) && leafEval(l).st !== false) facts.push(l.q); });
        const first = QI[qs[0]]; const owner = (MOD[first.id] || {}).owner || 'Senior manager'; return {id: s.id, name: s.name, tier: s.tier, status: s.status, owner, fn: functionOf(owner), questions: qs, factsNeeded: facts}; });
    }
    function labelOf(q, v){ const vals = [].concat(v); return vals.map(x => q.format === 'anchored' && /^[0-5]$/.test(x) && q.levels ? q.levels[+x] : x === 'noevent' ? 'No such case has arisen yet' : (q.options.find(o => o[0] === x) || [x, x])[1]).join('; '); }
    function report(){
      const domains = BANK.domains.map(d => {
        const rows = d.bank.modules.flatMap(m => m.questions.filter(q => !q.retired).map(rowFor));
        const c = {}; rows.forEach(r => { c[r.state] = (c[r.state] || 0) + 1; });
        return {id: d.id, name: d.name, rows, counts: c, issues: rows.filter(r => r.state === 'reported' && r.issue)};
      });
      const all = domains.flatMap(d => d.rows);
      const tierOf = id => { const s = SC.find(x => x.id === (ROLE[id] || {}).scenario); return s ? s.tier : 9; };
      const issues = all.filter(r => r.state === 'reported' && r.issue).sort((a, b) => tierOf(a.id) - tierOf(b.id) || ORDER[a.id] - ORDER[b.id]);
      // Scenario status: what was established for each material scenario that applies or may apply.
      const scen = SC.map(s => {
        const es = cond(s.expWhen).st; const qs = routeQs(s);
        const conf = qs.map(id => rowFor(QI[id]));
        let status;
        // A route whose deciding fact is "don't know" is waiting for its owner, never out of scope (found in 1.3; present in 1.2).
        // Routes that may still apply but are not decided: a deciding fact answered "don't know", not yet asked, or assumed
        // from the industry before the activities screen. A reported route never hides them (V13-03).
        const rst = s.routes.map(r => cond(r.when).st);
        const undecided = es === true ? s.routes.map((r, i) => ({r, st: rst[i]})).filter(x => x.st === 'pending' || x.st === 'unanswered' || (x.st === 'assumed' && !S.assumptionsAsked))
          .map(x => ({facts: leaves(x.r.when).filter(l => ['pending', 'unanswered', 'assumed'].includes(leafEval(l).st)).map(l => l.q).filter((q, j, arr) => arr.indexOf(q) === j), state: x.st, questions: x.r.questions})) : [];
        let established = null;
        if(es === false) status = 'outofscope';
        else if(es === 'assumed') status = 'assumed';
        else if(es === 'pending') status = 'waiting';
        else if(es === 'unanswered') status = 'scope-unconfirmed';
        else if(!qs.length){ status = rst.includes('pending') ? 'waiting' : rst.includes('unanswered') ? 'route-unconfirmed' : 'outofscope'; }
        else if(conf.every(r => ['reported', 'reused', 'na'].includes(r.state))){ established = conf.some(r => r.issue || r.cls === 'absent') ? 'gap-reported' : 'confirmed-reported'; status = undecided.length ? 'route-incomplete' : established; }
        else if(conf.some(r => r.state === 'waiting')) status = 'waiting';
        else if(conf.some(r => r.state === 'precluded')) status = 'precluded';
        else status = 'unconfirmed';
        return {id: s.id, name: s.name, tier: s.tier, domain: s.domain, status, established, undecidedRoutes: status === 'outofscope' ? [] : undecided, confirmations: conf.map(r => ({id: r.id, state: r.state, cls: r.cls}))};
      });
      const unresolvedMaterial = scen.filter(s => s.tier <= 2 && ['unconfirmed', 'waiting', 'scope-unconfirmed', 'route-unconfirmed', 'route-incomplete', 'precluded'].includes(s.status));
      const waiting = all.filter(r => r.state === 'waiting' || r.state === 'waiting-scope');
      const precluded = {}; all.filter(r => r.state === 'precluded').forEach(r => { (precluded[r.by] = precluded[r.by] || []).push(r.id); });
      const scopeUnconfirmed = scen.filter(s => s.tier <= 2 && ['scope-unconfirmed', 'route-unconfirmed', 'route-incomplete'].includes(s.status));
      // Each dimension is selected by answer version on its own (V13-02): a finding shows only current evidence and a current
      // conclusion; anything recorded against an earlier answer is carried separately as 'earlier' and never as current.
      const curOnly = x => x && x.current ? x : null, earlierOnly = x => x && !x.current ? x : null;
      const reviewerFindings = all.filter(r => (r.evidence && r.evidence.current && ['insufficient', 'contradicted', 'unavailable'].includes(r.evidence.state)) || (r.review && r.review.current && ['not-confirmed', 'disputed', 'partly-confirmed'].includes(r.review.conclusion)))
        .map(r => ({id: r.id, key: r.key, respondent: r.label || null, evidence: curOnly(r.evidence), review: curOnly(r.review), followUp: (curOnly(r.review) && r.review.followUp) || '',
          earlier: {evidence: earlierOnly(r.evidence), review: earlierOnly(r.review)}}));
      // A reviewer task is any current follow-up, whatever the conclusion; it does not allege a control failure (V13-01).
      const reviewerTasks = all.filter(r => r.review && r.review.current && r.review.followUp)
        .map(r => ({id: r.id, key: r.key, text: r.review.followUp, conclusion: r.review.conclusion, by: r.review.by, at: r.review.at, forVer: r.review.forVer}));
      const reReview = all.filter(r => r.reReview).map(r => ({id: r.id, key: r.key, reason: r.reReview.reason, evidence: r.evidence, review: r.review,
        earlierFollowUp: earlierOnly(r.review) && r.review.followUp ? {text: r.review.followUp, forVer: r.review.forVer} : null}));
      const ownerQueue = S.ownerQueue.map(o => ({id: o.q, key: (QI[o.q] || {}).key, owner: o.owner, fn: functionOf(o.owner), from: o.from}));
      const assumptions = Object.values(QI).filter(q => !q.retired && q.expectWhen && !S.ans[q.id] && cond(q.expectWhen).st === false && scope(q, true).st === 'applicable').map(q => ({id: q.id, text: q.text}));
      const asked = S.log.filter(x => !['assign-domain'].includes(x.kind));
      const k = {}; asked.forEach(x => { k[x.kind] = (k[x.kind] || 0) + 1; });
      const actions = [];
      issues.forEach(r => actions.push({type: 'address', id: r.id, text: `Address the reported gap: ${r.key}`, tier: tierOf(r.id)}));
      waiting.filter(r => !r.bulk && !r.ownerFollowup).forEach(r => actions.push({type: 'owner', id: r.id, text: `Obtain an answer from ${r.owner || 'the suggested owner'}: ${r.key}`}));
      ownerQueue.forEach(o => actions.push({type: 'owner-followup', id: o.id, text: `${o.owner} to answer ${o.key}, opened by their answer on ${o.from}`}));
      reviewerTasks.forEach(t => actions.push({type: 'reviewer', id: t.id, text: `Reviewer follow-up on ${t.key}: ${t.text}`}));
      reviewerFindings.filter(f => !reviewerTasks.some(t => t.id === f.id)).forEach(f => actions.push({type: 'reviewer', id: f.id, text: `Resolve the reviewer finding on ${f.key}`}));
      reReview.forEach(r => actions.push({type: 're-review', id: r.id, text: `Re-review ${r.key}: ${r.reason}`}));
      Object.entries(S.domainAssign).forEach(([d, a]) => { const n = waiting.filter(r => r.bulk && r.id.startsWith(d + '-')).length; if(n) actions.push({type: 'owner', id: d, text: `Obtain answers for ${DNAME[d]} from ${a.owner}: ${n} controls assigned with the area`}); });
      unresolvedMaterial.filter(s => s.status === 'unconfirmed').forEach(s => actions.push({type: 'confirm', id: s.id, text: `Confirm the controls for “${s.name}” (tier ${s.tier}); not asked before the interview ended`}));
      unresolvedMaterial.filter(s => s.status === 'scope-unconfirmed' || s.status === 'route-unconfirmed').forEach(s => actions.push({type: 'scope', id: s.id, text: `Establish whether “${s.name}” applies (tier ${s.tier}), then confirm its controls`}));
      unresolvedMaterial.filter(s => s.status === 'route-incomplete').forEach(s => actions.push({type: 'scope', id: s.id, text: `Settle whether a further control applies to “${s.name}” (tier ${s.tier}): ${s.undecidedRoutes.flatMap(u => u.facts).map(q => (QI[q] || {}).key || q).join(', ')} not yet known; ${s.established === 'gap-reported' ? 'a gap is already reported' : 'the control answered so far is reported in place'}`}));
      assumptions.forEach(a => actions.push({type: 'assumption', id: a.id, text: `Confirm whether this applies: ${a.text}`}));
      all.filter(r => r.state === 'reported' && r.answer && r.answer.ev === 'yes' && !(r.evidence && r.evidence.state)).forEach(r => actions.push({type: 'evidence', id: r.id, text: `Evidence said to be available but not yet requested or reviewed: ${r.key}`}));
      return {
        version: BANK.bankVersion || '1.2-review', generated: opts.now(),
        status: {interview: S.ended ? 'ended' : 'in progress', stopReason: S.stopReason, respondentScreens: respondentScreens(), ownerScreens: S.log.filter(x => x.via === 'owner' && x.kind !== 'plan-follow-up').length, corrections: S.log.filter(x => x.kind === 'correction').length, followUpSent: !!S.followUp, review: Object.keys(S.review).length ? 'in progress' : 'not started',
                 complete: false, completeWhy: 'An interview records reported practice. A review is complete only when an authorised reviewer has concluded on the scope, evidence and findings.'},
        profile: PQS.filter(q => S.ans[q.id]).map(q => ({id: q.id, text: q.text, label: labelOf(q, S.ans[q.id].v)})),
        asked: {total: asked.length, byKind: k}, domains, issues, scenarios: scen, unresolvedMaterial, scopeUnconfirmed, waiting, ownerQueue, reviewerFindings, reviewerTasks, reReview, followUpPlan: followUpPlan(unresolvedMaterial), ownerPackages: owners(unresolvedMaterial), followUpSent: S.followUp, precluded, assumptions,
        stale: Object.entries(S.ans).filter(([, a]) => a.stale).map(([id, a]) => ({id, reason: a.stale.reason})),
        evidence: Object.entries(S.evidence).map(([id, e]) => ({id, ...e, current: isCurrentFor(e, id)})), reviews: Object.entries(S.review).map(([id, r]) => ({id, ...r, current: isCurrentFor(r, id)})),
        actions, log: S.log.slice(), assignments: Object.values(S.assign), domainAssignments: S.domainAssign
      };
    }
    return {S, QI, MOD, DOM, DOMS, next, answer, correct, stop, resume, assign, assignDomain, returnDomain, ownerAccept, ownerDecline, ownerOverdue, ownerReturn, ownerAnswer, importLog, planFollowUp, nextOwner, normalise, functionOf, FUNCTIONS, respondentScreens,
            setEvidence, setReview, report, scope, cond, classOf, rowFor, assumedFacts, labelOf, EV_STATES, CONCLUSIONS, DNAME};
  }
  return {create, CLASSES, ISSUE};
})();
if(typeof module !== 'undefined') module.exports = REVIEW;
