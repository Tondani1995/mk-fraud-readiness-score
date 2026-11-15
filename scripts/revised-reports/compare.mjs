#!/usr/bin/env node
// Objective measures for the report comparison, computed from the built reports and their models (build-comparison.mjs
// must run first). Every measure is defined in REPORT-COMPARISON.md section 3; none is a judgement of quality on its own.
//   node scripts/revised-reports/compare.mjs [dir]
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'docs/readiness-review/report-comparison');
const orgs = fs.readdirSync(DIR).filter((d) => fs.existsSync(path.join(DIR, d, 'artefacts.json')));
const textOf = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<div style="position:fixed[\s\S]*?<\/div>/, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const words = (t) => (t.match(/\S+/g) ?? []).length;
const norm = (s, org) => s.split(org).join('ORG').replace(/\d+(?:\.\d+)?/g, '#').trim();
const sentences = (t) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => words(s) >= 6);

const data = Object.fromEntries(orgs.map((k) => {
  const a = JSON.parse(fs.readFileSync(path.join(DIR, k, 'artefacts.json'), 'utf8'));
  const html = (n) => textOf(fs.readFileSync(path.join(DIR, k, `${n}.html`), 'utf8'));
  return [k, { a, text: { be: html('before-essential'), ae: html('after-essential'), bc: html('before-comprehensive'), ac: html('after-comprehensive') } }];
}));

// P5 is P3 with a third of its answers unknown, so the two are near-copies by construction; neither is compared with the
// other, or the measure would count their shared answers as template text.
const TWINS = { P3: 'P5', P5: 'P3' };
/** Share of a report's sentences that appear, identically apart from the organisation's name and numbers, in the same report type for at least one other organisation with different answers. */
function templateShare(key, field) {
  const org = data[key].a.organisation;
  // Fixed captions and the report basis appear in every report of a type by design; they are excluded, so the measure
  // counts analytical sentences that are the same for organisations whose answers differ.
  const setOf = (o) => new Set(sentences(data[o].text[field]).map((s) => norm(s, data[o].a.organisation)));
  const everywhere = [...setOf(orgs[0])].filter((s) => orgs.every((o) => setOf(o).has(s)));
  const mine = [...setOf(key)].filter((s) => !everywhere.includes(s));
  const others = new Set(orgs.filter((o) => o !== key && o !== TWINS[key]).flatMap((o) => [...setOf(o)]));
  return mine.length ? Math.round((mine.filter((s) => others.has(s)).length / mine.length) * 100) : null;
}

const domainNames = (m) => new Set((m.domainProfile?.rows ?? []).map((r) => r.title));
function essential(model, validation, key, side) {
  const dn = domainNames(model);
  const signals = [...(model.exposures?.rows ?? []).flatMap((r) => r.assessmentBasis), ...model.diagnosis.rows.flatMap((r) => r.signals)];
  const controlLevel = signals.filter((s) => !dn.has(s.title)).length;
  const roles = new Set([...model.priorities.rows.map((r) => r.accountableRole), ...model.roadmap.stages.flatMap((s) => s.actions.map((x) => x.owner))]);
  const actions = model.roadmap.stages.flatMap((s) => s.actions);
  return {
    validatorOk: validation.ok, validatorIssues: validation.issues.map((i) => i.code), customerWords: validation.customerWordCount,
    schemesOrPathwaysDescribed: new Set([...(model.exposures?.rows ?? []).map((r) => r.exposure), ...(model.scenarios?.scenarios ?? []).map((s) => s.title)]).size,
    signalsShown: signals.length, signalsNamingAControl: controlLevel, signalsNamingOnlyADomainScore: signals.length - controlLevel,
    falseComfortStatements: model.diagnosis.rows.filter((r) => /reported in place, not supported/i.test(r.pattern)).length + (model.exposures?.rows ?? []).filter((r) => /reported in place/i.test(r.priorityBasis)).length,
    crossCheckStatedWithPopulation: /were cross-checked/.test(model.diagnosis.interpretation ?? '') && /not cross-checked/.test(model.diagnosis.interpretation ?? ''),
    managementOutcomes: model.priorities.rows.length, distinctAccountableRoles: roles.size,
    roadmapActions: actions.length, roadmapActionsRestatingTheirDeliverable: actions.filter((x) => x.action.trim() === x.deliverable.trim()).length,
    outstandingInformationStated: /outstanding answers|outstanding \(/i.test(JSON.stringify(model.priorities) + JSON.stringify(model.dashboard)),
    templateSentencePct: templateShare(key, side === 'before' ? 'be' : 'ae')
  };
}
function comprehensive(model, key, side, evidence) {
  const r = model.registers;
  const controls = r.controls ?? [];
  const designWords = controls.length ? Math.round(controls.reduce((n, c) => n + words(String(c.controlDesign ?? '')), 0) / controls.length) : 0;
  const ownersOf = new Set(controls.map((c) => c.processOwnerRole).filter(Boolean));
  const recordsPerControl = controls.length ? Math.round((controls.reduce((n, c) => n + (c.evidence?.length ?? 0), 0) / controls.length) * 10) / 10 : 0;
  const traced = (evidence.materialFindings ?? []).filter((f) => f.questionCode && f.diagnosis && /Reported by|self-assessed/.test(f.diagnosis)).length;
  return {
    findings: r.findings?.length ?? 0, risks: r.risks?.length ?? 0, controlDesigns: controls.length, averageWordsPerControlDesign: designWords,
    distinctProcessOwners: ownersOf.size, recordsToMaintain: r.evidence?.length ?? 0, decisions: model.core.decisionAgenda.length,
    scenarioPortfolio: r.scenarios?.length ?? 0, programmeActions: r.actions?.length ?? 0, sustainmentPriorities: r.assurancePriorities?.length ?? 0,
    findingsNamingWhoAnswered: (evidence.materialFindings ?? []).filter((f) => /Reported by (?!the respondent;)/.test(f.diagnosis)).length,
    findingsTracedToAnswers: traced, templateSentencePct: templateShare(key, side === 'before' ? 'bc' : 'ac'), words: words(data[key].text[side === 'before' ? 'bc' : 'ac'])
  };
}

const out = {};
for (const k of orgs) {
  const { a } = data[k];
  out[k] = {
    organisation: a.organisation,
    essential: { before: essential(a.before.essentialModel, a.before.essentialValidation, k, 'before'), after: essential(a.after.essentialModel, a.after.essentialValidation, k, 'after') },
    comprehensive: { before: comprehensive(a.before.comprehensive.model, k, 'before', a.before.evidence), after: comprehensive(a.after.comprehensive.model, k, 'after', a.after.evidence) },
    numbers: { before: { score: a.before.score, band: a.before.maturity, basis: 'MFRS V1.2 calculator on derived answers' }, after: { score: a.after.fixture.overall, band: a.after.fixture.maturity, basis: a.after.fixture.label } }
  };
}
fs.writeFileSync(path.join(DIR, 'comparison.json'), JSON.stringify({ fictional: true, measures: out }, null, 1));
const row = (label, f) => `| ${label} | ${orgs.map((k) => f(out[k])).join(' | ')} |`;
const lines = [
  `| Measure | ${orgs.map((k) => out[k].organisation.replace('Fictional ', '')).join(' | ')} |`, `|---|${orgs.map(() => '---').join('|')}|`,
  row('Essential: existing validator (before / after)', (o) => `${o.essential.before.validatorOk ? 'pass' : `fail (${[...new Set(o.essential.before.validatorIssues)].join(', ')})`} / ${o.essential.after.validatorOk ? 'pass' : 'fail'}`),
  row('Essential: schemes or pathways described', (o) => `${o.essential.before.schemesOrPathwaysDescribed} / ${o.essential.after.schemesOrPathwaysDescribed}`),
  row('Essential: signals naming a specific control (of all signals)', (o) => `${o.essential.before.signalsNamingAControl} of ${o.essential.before.signalsShown} / ${o.essential.after.signalsNamingAControl} of ${o.essential.after.signalsShown}`),
  row('Essential: false-comfort statements', (o) => `${o.essential.before.falseComfortStatements} / ${o.essential.after.falseComfortStatements}`),
  row('Essential: cross-check reported with its population', (o) => `${o.essential.before.crossCheckStatedWithPopulation ? 'yes' : 'no'} / ${o.essential.after.crossCheckStatedWithPopulation ? 'yes' : 'no'}`),
  row('Essential: distinct accountable roles', (o) => `${o.essential.before.distinctAccountableRoles} / ${o.essential.after.distinctAccountableRoles}`),
  row('Essential: roadmap actions that restate their deliverable', (o) => `${o.essential.before.roadmapActionsRestatingTheirDeliverable} of ${o.essential.before.roadmapActions} / ${o.essential.after.roadmapActionsRestatingTheirDeliverable} of ${o.essential.after.roadmapActions}`),
  row('Essential: outstanding information stated', (o) => `${o.essential.before.outstandingInformationStated ? 'yes' : 'no'} / ${o.essential.after.outstandingInformationStated ? 'yes' : 'no'}`),
  row('Essential: analytical sentences identical for an organisation with different answers', (o) => `${o.essential.before.templateSentencePct}% / ${o.essential.after.templateSentencePct}%`),
  row('Essential: customer words', (o) => `${o.essential.before.customerWords} / ${o.essential.after.customerWords}`),
  row('Comprehensive: findings / risks / control designs', (o) => `${o.comprehensive.before.findings}/${o.comprehensive.before.risks}/${o.comprehensive.before.controlDesigns} / ${o.comprehensive.after.findings}/${o.comprehensive.after.risks}/${o.comprehensive.after.controlDesigns}`),
  row('Comprehensive: average words per control design', (o) => `${o.comprehensive.before.averageWordsPerControlDesign} / ${o.comprehensive.after.averageWordsPerControlDesign}`),
  row('Comprehensive: distinct process owners', (o) => `${o.comprehensive.before.distinctProcessOwners} / ${o.comprehensive.after.distinctProcessOwners}`),
  row('Comprehensive: scheme portfolio entries', (o) => `${o.comprehensive.before.scenarioPortfolio} / ${o.comprehensive.after.scenarioPortfolio}`),
  row('Comprehensive: records management should maintain', (o) => `${o.comprehensive.before.recordsToMaintain} / ${o.comprehensive.after.recordsToMaintain}`),
  row('Comprehensive: decisions', (o) => `${o.comprehensive.before.decisions} / ${o.comprehensive.after.decisions}`),
  row('Comprehensive: findings naming an accountable function that answered', (o) => `${o.comprehensive.before.findingsNamingWhoAnswered} / ${o.comprehensive.after.findingsNamingWhoAnswered}`),
  row('Comprehensive: analytical sentences identical for an organisation with different answers', (o) => `${o.comprehensive.before.templateSentencePct}% / ${o.comprehensive.after.templateSentencePct}%`),
  row('Comprehensive: words', (o) => `${o.comprehensive.before.words} / ${o.comprehensive.after.words}`),
  row('Headline figure (before: MFRS calculator; after: test fixture)', (o) => `${o.numbers.before.score} ${o.numbers.before.band} / ${o.numbers.after.score} ${o.numbers.after.band}`)
];
fs.writeFileSync(path.join(DIR, 'comparison-table.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
