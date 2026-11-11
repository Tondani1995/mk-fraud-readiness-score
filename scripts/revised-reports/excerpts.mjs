#!/usr/bin/env node
// Side-by-side excerpts from the built reports, taken from their models so nothing is retyped. Fictional only.
//   node scripts/revised-reports/excerpts.mjs [dir]
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'docs/readiness-review/report-comparison');
const load = (k) => JSON.parse(fs.readFileSync(path.join(DIR, k, 'artefacts.json'), 'utf8'));
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').replace(/\.\./g, '.').trim() || '(none)';
const out = ['# Report excerpts: before and after', '', 'Taken verbatim from the built reports\' models (`build-comparison.mjs`). Fictional organisations; no AI manuscript stage on either side. "Before" is the MFRS V1.2 assessment through the existing engines; "after" is the staged review through the revised evidence model and the same engines.', ''];
const pair = (title, before, after) => { out.push(`### ${title}`, '', '| Before (MFRS V1.2, existing engines) | After (staged review, revised evidence) |', '|---|---|', `| ${cell(before)} | ${cell(after)} |`, ''); };

for (const k of ['P3', 'P6b', 'P5', 'P4']) {
  const a = load(k);
  const be = a.before.essentialModel, ae = a.after.essentialModel;
  const bc = a.before.comprehensive.model, ac = a.after.comprehensive.model;
  out.push(`## ${a.organisation} (${k})`, '');
  pair('Essential: cover judgement', be.cover.centralJudgement, ae.cover.centralJudgement);
  const bx = be.exposures?.rows?.[0], ax = ae.exposures?.rows?.[0];
  pair('Essential: first priority exposure', bx ? `${bx.exposure}. Basis: ${bx.assessmentBasis.map((b) => `${b.title} ${b.score}`).join('; ')}. Interruption: ${bx.interruptionPoint}` : 'No exposure page.', ax ? `${ax.exposure}. Basis: ${ax.assessmentBasis.map((b) => `${b.title}: ${b.score}`).join('; ')}. Interruption: ${ax.interruptionPoint}` : 'No exposure page.');
  const bp = be.priorities.rows[0], ap = ae.priorities.rows[0];
  pair('Essential: first management outcome', `${bp?.outcome}. Why now: ${bp?.whyNow}. Accountable: ${bp?.accountableRole}. What good looks like: ${bp?.betterLooksLike}`, `${ap?.outcome}. Why now: ${ap?.whyNow}. Accountable: ${ap?.accountableRole}. What good looks like: ${ap?.betterLooksLike}`);
  const ba = be.roadmap.stages[0]?.actions?.[0], aa = ae.roadmap.stages[0]?.actions?.[1] ?? ae.roadmap.stages[0]?.actions?.[0];
  pair('Essential: a 30-day roadmap action', ba ? `${ba.action} Owner: ${ba.owner}. Deliverable: ${ba.deliverable}. Complete when: ${ba.completionTest}` : '(none)', aa ? `${aa.action} Owner: ${aa.owner}. Deliverable: ${aa.deliverable}. Complete when: ${aa.completionTest}` : '(none)');
  pair('Essential: what drives the position (first row)', `${be.diagnosis.rows[0]?.pattern}: ${be.diagnosis.rows[0]?.signals.map((s) => `${s.title} ${s.score}`).join('; ')}. ${be.diagnosis.rows[0]?.whyItMatters}`, `${ae.diagnosis.rows[0]?.pattern}: ${ae.diagnosis.rows[0]?.signals.map((s) => `${s.title}: ${s.score}`).join('; ')}. ${ae.diagnosis.rows[0]?.whyItMatters}`);
  pair('Essential: self-reported cross-checks', be.diagnosis.interpretation ?? '(not reported)', ae.diagnosis.interpretation);
  const firstFinding = (m) => m.registers.findings[0];
  const ctlFor = (m) => { const f = firstFinding(m); return m.registers.controls.find((c) => c.linkedFindingId === f?.findingId) ?? m.registers.controls[0]; };
  const bctl = ctlFor(bc), actl = ctlFor(ac);
  pair('Comprehensive: control design for the first finding', bctl ? `Current: ${bctl.currentState} Design: ${bctl.controlDesign} Owner: ${bctl.processOwnerRole}. Cycle: ${bctl.operatingFrequency}` : '(none)', actl ? `Current: ${actl.currentState} Design: ${actl.controlDesign} Owner: ${actl.processOwnerRole}. Cycle: ${actl.operatingFrequency}` : '(none)');
  const brec = bc.registers.evidence?.[0], arec = ac.registers.evidence?.[0];
  pair('Comprehensive: records management should maintain (first group)', JSON.stringify(brec?.items?.map((i) => i.artefact) ?? brec ?? null), JSON.stringify(arec?.items?.map((i) => i.artefact) ?? arec ?? null));
  const bd = bc.core.decisionAgenda[0], ad = ac.core.decisionAgenda[0];
  pair('Comprehensive: first leadership decision', bd ? `${bd.decision ?? bd.decisionRequired ?? bd.title}. ${bd.recommendedDirection ?? bd.recommendedDecision ?? ''}` : '(none)', ad ? `${ad.decision ?? ad.decisionRequired ?? ad.title}. ${ad.recommendedDirection ?? ad.recommendedDecision ?? ''}` : '(none)');
  const bs = bc.registers.scenarios?.[0], as = ac.registers.scenarios?.[0];
  pair('Comprehensive: first scheme in the portfolio', bs ? `${bs.title}. Begins: ${bs.entryPoint} Progresses: ${bs.mechanism} Interrupted by: ${bs.interruptionPoint}` : 'No scenario portfolio.', as ? `${as.title}. Begins: ${as.entryPoint} Progresses: ${as.mechanism} Interrupted by: ${as.interruptionPoint}` : 'No scenario portfolio.');
}
fs.writeFileSync(path.join(DIR, 'report-excerpts.md'), `${out.join('\n')}\n`);
console.log(`${out.length} lines`);
