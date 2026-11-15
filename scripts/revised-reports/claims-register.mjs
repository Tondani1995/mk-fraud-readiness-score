// Register of substantive claims changed, retained or withheld between the first prototype (commit 5fb4dc2, kept in
// docs/readiness-review/report-comparison) and the corrected prototype (docs/readiness-review/report-correction),
// with the measures used to compare them. Reads the generated artefacts only; nothing is recalculated here.
//   node scripts/revised-reports/claims-register.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const PREV = 'docs/readiness-review/report-comparison';
const NOW = 'docs/readiness-review/report-correction';
const ORGS = ['P3', 'P4', 'P5', 'P6b'];
const textOf = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const count = (t, re) => (t.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) ?? []).length;
const RAW_ID = /\b(?:D\d{1,2}-[A-Z]{1,2}-\d{2}|FS-D\d{1,2}-\d{2}|OBJ-[A-Z0-9-]+|PR-\d{2})\b/;
const pdfPages = (file) => { try { return Number(execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/)[1]); } catch { return null; } };
/** The page on which the first appendix starts; everything before it is the management report. */
const firstAppendixPage = (file) => {
  const n = pdfPages(file);
  for (let p = 3; p <= (n ?? 0); p++) { const t = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), file, '-']).toString(); if (/^\s*(APPENDIX A|Appendix A)\s*$/m.test(t) && /Finding register/.test(t)) return p; }
  return null;
};
const KIND_TEXT = {
  gap: 'A control that stops the scheme is reported as a gap', 'false-comfort': 'The control reported in place is not supported by its practices',
  contradiction: 'The answers about the scheme cannot both be right', dependency: 'The control reported in place relies on a practice reported weaker',
  qualified: 'The control is reported in place; a further defence is weaker', confirmed: 'The controls are reported in place', outstanding: 'Answers outstanding', none: 'Not yet reached'
};

const claims = [];
const add = (org, category, claim, before, after, status, reason) => claims.push({ org, category, claim, before, after, status, reason });
const measures = {};

for (const k of ORGS) {
  const prev = JSON.parse(fs.readFileSync(`${PREV}/${k}/artefacts.json`, 'utf8')).after;
  const now = JSON.parse(fs.readFileSync(`${NOW}/${k}/model.json`, 'utf8'));
  const r = now.report;
  const kindNow = new Map(r.schemes.map((s) => [s.id, s]));
  const prevE = textOf(fs.readFileSync(`${PREV}/${k}/after-essential.html`, 'utf8'));
  const prevC = textOf(fs.readFileSync(`${PREV}/${k}/after-comprehensive.html`, 'utf8'));
  const nowE = textOf(fs.readFileSync(`${NOW}/${k}/corrected-essential.html`, 'utf8'));
  const nowC = textOf(fs.readFileSync(`${NOW}/${k}/corrected-comprehensive.html`, 'utf8'));

  // ---- 1. Scheme classifications.
  for (const s of prev.analysis.scenarios.filter((x) => ['gap', 'false-comfort'].includes(x.kind))) {
    const n = kindNow.get(s.id);
    const after = n ? n.kind : 'not applicable';
    const status = s.kind === after ? 'retained' : s.kind === 'false-comfort' && ['contradiction', 'dependency'].includes(after) ? 'changed (narrowed)' : s.kind === 'false-comfort' && after === 'qualified' ? 'withdrawn' : 'changed';
    const reason = status === 'retained' ? 'Same answers, same classification.'
      : after === 'contradiction' ? 'Reviewed: the two answers describe the same fact and cannot both be true.'
        : after === 'dependency' ? 'Reviewed: the method establishes that the reported control uses the weaker practice.'
          : after === 'qualified' ? 'Reviewed: the weaker practice is a separate defence; the method establishes no dependency, so the confirmation is not disproved.' : 'Reclassified.';
    add(k, 'Scheme classification', `${s.name}`, KIND_TEXT[s.kind], KIND_TEXT[after] ?? after, status, reason);
  }
  // ---- 2. Ratings, periods, difficulty and deadlines derived from tier or answer class.
  const risks = prev.evidence.riskRegister;
  const tally = (xs, f) => Object.entries(xs.reduce((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {})).map(([v, n]) => `${n} ${v}`).join(', ');
  if (risks.length) {
    add(k, 'Risk rating', `Priority of ${risks.length} fraud risks`, tally(risks, (x) => x.priority), 'Not rated', 'withheld', 'Derived from the scheme tier; MK has approved no rating method (prioritisation proposal).');
    add(k, 'Risk rating', `Likelihood of ${risks.length} fraud risks`, tally(risks, (x) => x.likelihood), 'Not rated', 'withheld', 'Derived from the answer class; no approved method.');
    add(k, 'Risk rating', `Impact of ${risks.length} fraud risks`, tally(risks, (x) => x.impact), 'Not rated', 'withheld', 'Derived from the scheme tier; no approved method.');
  }
  const mf = prev.evidence.materialFindings;
  if (mf.length) {
    add(k, 'Timing', `Target period for ${mf.length} findings`, tally(mf, (x) => x.targetPeriod), 'No date; phases ordered by what must be known and decided first', 'withheld', 'Derived from tier and answer class.');
    add(k, 'Difficulty', `Implementation difficulty for ${mf.length} findings`, tally(mf, (x) => x.implementationDifficulty), 'Not assessed', 'withheld', 'Derived from the number of gaps; no approved method.');
    const imp = new Set(mf.map((x) => x.likelyFinancialImpact));
    add(k, 'Impact wording', `${imp.size} generic impact statements from the prototype's own table`, `${mf.length} findings`, 'The method\'s own description of why the scheme matters, or its linked risks', 'withdrawn', 'Not method content.');
    const cyc = new Set(mf.map((x) => x.operatingFrequency));
    add(k, 'Operating cycle', `${cyc.size} operating frequencies from the prototype's own table`, `${mf.length} findings`, 'Stated where the method states one; otherwise "Not stated by the method"', 'withdrawn', 'Not method content; declared as a content gap.');
  }
  const decs = prev.evidence.leadershipDecisions;
  if (decs.length) add(k, 'Timing', `Deadlines on ${decs.length} leadership decisions`, tally(decs, (x) => x.deadline), 'What each decision must come before; no date', 'withheld', 'No approved basis for deadlines.');
  // ---- 3. Cover, labels and the figure.
  add(k, 'Cover judgement', 'Central judgement', prev.essentialModel.cover.centralJudgement, now.essentialModel.cover.centralJudgement, 'changed', 'Reworded from the corrected classification, without tier-based priority.');
  const fp = count(prevE + prevC, /first-priority/i);
  if (fp) add(k, 'Labels', '"First-priority" scheme label', `${fp} uses`, 'Tier 1, explained as the stage at which the method confirms a scheme', 'withdrawn', 'The tier is an information-gathering stage, not a risk priority.');
  add(k, 'Calculated figure', 'Overall figure and band', `${prev.fixture.overall} ${prev.fixture.maturity}, printed as the readiness score`, `${now.fixture.overall} ${now.fixture.maturity}, labelled a calculated test fixture${r.r1.substantial ? '; not on the cover headline (R-1)' : ''}`, 'retained', r.r1.substantial ? 'Same figure; R-1 removes it from the cover headline while answers are unresolved.' : 'Same figure; relabelled.');
  // ---- 4. Cross-checks.
  for (const c of (now.staged.consistency.checks ?? []).filter((x) => x.outcome === 'conflicting')) {
    const rel = r.relations.find((x) => x.confirmation === c.confirmation && x.practice === c.followup);
    add(k, 'Cross-check', `Cross-check on ${rel?.confirmationName ?? c.confirmation}`, 'Conflicting answer', rel ? rel.label : 'Not classified', rel?.type === 'direct-contradiction' ? 'retained' : 'changed', rel ? (rel.type === 'direct-contradiction' ? 'Reviewed: the answers cannot both be true.' : 'Reviewed: the further practice is a separate defence.') : '');
  }
  // ---- 5. Answer wording.
  const answerIsYes = count(prevE + prevC, /the answer to "[^"]+" is yes/i);
  const testColon = count(prevE + prevC, /passes this test:/i);
  if (answerIsYes) add(k, 'Answer wording', 'Standards written as \'the answer to "<question>" is yes\'', `${answerIsYes} occurrences`, `${count(nowE + nowC, /the answer to "[^"]+" is yes/i)} occurrences; standards in each format's own terms`, 'changed', 'Wrong for choice questions and mechanical for practice questions.');
  if (testColon) add(k, 'Answer wording', 'Measures written as "every case passes this test: <question>"', `${testColon} occurrences`, `${count(nowE + nowC, /passes this test:/i)} occurrences`, 'changed', 'Questionnaire prompt concatenated into a measure.');
  add(k, 'Outstanding information', 'Answers outstanding', `${prev.analysis.outstanding.length}`, `${r.outstanding.length}`, prev.analysis.outstanding.length === r.outstanding.length ? 'retained' : 'changed', 'Same rule as the interface (SS-09).');

  // ---- Measures.
  const prevPages = { e: pdfPages(`${PREV}/${k}/after-essential.pdf`), c: pdfPages(`${PREV}/${k}/after-comprehensive.pdf`) };
  const nowPages = { e: pdfPages(`${NOW}/${k}/corrected-essential.pdf`), c: pdfPages(`${NOW}/${k}/corrected-comprehensive.pdf`) };
  const prevMain = firstAppendixPage(`${PREV}/${k}/after-comprehensive.pdf`);
  const nowMain = firstAppendixPage(`${NOW}/${k}/corrected-comprehensive.pdf`);
  const prevRoles = new Set([...prev.evidence.riskRegister.map((x) => x.processOwner), ...prev.evidence.roadmapActions.map((x) => x.processOwner), ...prev.evidence.materialFindings.map((x) => x.accountableOwner)]);
  measures[k] = {
    organisation: now.organisation,
    schemesFlaggedUnsupportedOrUnresolved: { before: prev.analysis.scenarios.filter((s) => s.kind === 'false-comfort').length, after: r.r1.unresolved },
    complementaryWeaknessesReported: { before: 0, after: r.summary.byKind.qualified },
    tierDerivedRatings: { before: risks.length * 3 + mf.length * 2 + decs.length, after: 0 },
    answerIsYesWording: { before: answerIsYes, after: count(nowE + nowC, /the answer to "[^"]+" is yes/i) },
    promptConcatenations: { before: testColon, after: count(nowE + nowC, /passes this test:/i) },
    rawMethodIdsInComprehensive: { before: count(prevC, RAW_ID), after: count(nowC, RAW_ID) },
    distinctOwnerLabels: { before: prevRoles.size, after: r.roles.length },
    controlRowsComprehensive: { before: prev.evidence.controlImprovements.length, after: r.controls.length, note: 'After: one row per control, deduplicated across schemes; before: one per finding' },
    essentialPages: { before: prevPages.e, after: nowPages.e },
    essentialWords: { before: prev.essentialValidation.customerWordCount, after: now.essentialValidation.customerWordCount },
    essentialValidator: { before: prev.essentialValidation.ok, after: now.essentialValidation.ok },
    comprehensivePages: { before: prevPages.c, after: nowPages.c },
    comprehensiveManagementPages: { before: prevMain ? prevMain - 1 : null, after: nowMain ? nowMain - 1 : null },
    registersReconciled: { before: 'not checked', after: now.workbook.sheets.find((s) => s.name === 'Reconciliation') ? 'yes' : 'no' }
  };
}

const summary = {};
for (const c of claims) { const key = `${c.org}|${c.category}|${c.status}`; summary[key] = (summary[key] ?? 0) + 1; }
fs.writeFileSync(`${NOW}/claims-register.json`, JSON.stringify({ generated: 'from report-comparison (prototype 1, 5fb4dc2) and report-correction', claims, measures }, null, 1) + '\n');

const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
const statusCount = (org, s) => claims.filter((c) => c.org === org && c.status.startsWith(s)).length;
let md = '# Register of substantive claims: first prototype against corrected prototype\n\nGenerated by `scripts/revised-reports/claims-register.mjs` from the first prototype\'s artefacts (commit 5fb4dc2, `report-comparison/`) and the corrected prototype (`report-correction/`). Fictional organisations only. A claim is "withheld" when the corrected report no longer makes it because MK has approved no rule for it, "withdrawn" when the correction found it unsupported, "changed" when it is still made in different terms, and "retained" when it stands.\n\n';
md += '| Organisation | Claims | Retained | Changed | Withdrawn | Withheld |\n|---|---|---|---|---|---|\n';
for (const k of ORGS) md += `| ${measures[k].organisation} | ${claims.filter((c) => c.org === k).length} | ${statusCount(k, 'retained')} | ${statusCount(k, 'changed')} | ${statusCount(k, 'withdrawn')} | ${statusCount(k, 'withheld')} |\n`;
md += '\n## Measures\n\n| Measure | ' + ORGS.map((k) => `${k} before | ${k} after`).join(' | ') + ' |\n|---|' + ORGS.map(() => '---|---|').join('') + '\n';
for (const m of Object.keys(measures.P3)) {
  if (m === 'organisation') continue;
  md += `| ${m.replace(/([A-Z])/g, ' $1').toLowerCase()} | ${ORGS.map((k) => `${esc(measures[k][m].before)} | ${esc(measures[k][m].after)}`).join(' | ')} |\n`;
}
for (const k of ORGS) {
  md += `\n## ${measures[k].organisation}\n\n| Category | Claim | First prototype | Corrected | Status | Reason |\n|---|---|---|---|---|---|\n`;
  for (const c of claims.filter((x) => x.org === k)) md += `| ${esc(c.category)} | ${esc(c.claim)} | ${esc(c.before)} | ${esc(c.after)} | ${esc(c.status)} | ${esc(c.reason)} |\n`;
}
fs.writeFileSync(`${NOW}/CLAIMS-REGISTER.md`, md);
for (const k of ORGS) console.log(k, `claims ${claims.filter((c) => c.org === k).length}: retained ${statusCount(k, 'retained')}, changed ${statusCount(k, 'changed')}, withdrawn ${statusCount(k, 'withdrawn')}, withheld ${statusCount(k, 'withheld')}`, JSON.stringify(measures[k].comprehensiveManagementPages), JSON.stringify(measures[k].comprehensivePages));
