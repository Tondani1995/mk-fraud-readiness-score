// Writes the fictional examples of the report engine for MK review: the executive brief, the full management report
// (all four layers), the separate Advisory record, the end-to-end trace and, given the Phase 1 draft document, the
// before-and-after comparison. Called by scripts/readiness-review-report-engine-tests.mjs with MK_REPORT_EXAMPLES_DIR.
// Every sentence is copied from a validated document; nothing here writes wording of its own about the organisation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const EXEC_TITLES = {
  status: 'Status and basis of this report',
  indicated: 'What the responses indicate',
  coverage: 'What the assessment covered, and how',
  actions: 'Recommended actions',
  withheld: 'Judgements withheld',
  decisions: 'Decisions requested of management'
};
const CATEGORY_TITLE = {
  reported: 'Practices reported on', reused: 'Established by a wider answer', fact: 'Recorded facts', waiting: 'Waiting for an accountable function',
  unconfirmed: 'Not reached before the interview ended', 'scope-unconfirmed': 'Applicability not yet known', prerequisite: 'Depends on a question not yet answered',
  excluded: 'Excluded by a recorded scope decision', assumed: 'Assumed not to apply, pending confirmation', retired: 'Retired questions'
};
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|');

function context(d) {
  const byId = new Map(d.doc.statements.map((s) => [s.id, s]));
  const small = (s) => `<sub>${s.kind}; rests on ${s.basis}; rule ${s.rule}; template \`${s.template}\`; ${s.claims.length} claim${s.claims.length === 1 ? '' : 's'}</sub>`;
  const line = (id, withSmall = true) => `- ${byId.get(id).text}${withSmall ? `  \n  ${small(byId.get(id))}` : ''}`;
  return { byId, small, line };
}

function header(d, title, what, canonicalDigest) {
  const { doc, input } = d;
  return [
    `# ${title}`,
    '',
    `**${doc.status.release.marking}** ${what} Built by the standard report engine ${doc.lineage.engine.version} with draft copy ${doc.draft.copyVersion}, which MK has not approved (B7), from the fictional session "${input.organisation.label}" (stored log of ${doc.lineage.actionCount} actions). It is not a customer report. Every sentence is a template filled only from cited claims; the small print gives its kind, what it rests on, its rule and template, and how many claims it cites.`,
    '',
    `Document digest \`${canonicalDigest(doc)}\`; report input ${doc.lineage.inputVersion} digest \`${doc.lineage.inputDigest}\`; standard claims ledger digest \`${doc.lineage.ledgerDigest}\`; log digest \`${doc.lineage.logDigest}\`.`,
    ''
  ];
}

function executive(d) {
  const { line } = context(d);
  const e = d.doc.layers.executive;
  return Object.entries(EXEC_TITLES).flatMap(([section, title]) => (e[section].length ? [`### ${title}`, '', ...e[section].map((id) => line(id)), ''] : []));
}

function releaseTable(d) {
  return ['| Release criterion | Met | Reference | Note |', '|---|---|---|---|', ...d.doc.status.release.criteria.map((c) => `| ${c.id} | ${c.met ? 'yes' : 'no'} | ${c.ref} | ${esc(c.note)} |`), '', 'None of these criteria depends on evidence review, reviewer records or reviewer identity: those belong to the separately scoped Advisory package.', ''];
}

function validation(d) {
  return d.validation.results.map((r) => `- ${r.id} ${r.name}: ${r.passed ? 'passed' : `failed (${r.failures.join('; ')})`}`);
}

function writeBrief(dir, d, canonicalDigest) {
  const lines = [
    ...header(d, 'Draft executive decision brief (fictional, for MK review)', 'Layer 1 of the standard, self-reported report.', canonicalDigest),
    ...executive(d),
    '## Release',
    '',
    ...releaseTable(d),
    '## Validation',
    '',
    ...validation(d),
    ''
  ];
  writeFileSync(path.join(dir, 'fictional-executive-brief.md'), lines.join('\n'));
}

function writeReport(dir, d, canonicalDigest) {
  const { doc } = d;
  const { byId, line } = context(d);
  const reg = doc.layers.register;
  const lines = [
    ...header(d, 'Draft management report (fictional, for MK review)', 'All four layers of the standard, self-reported report.', canonicalDigest),
    '## Layer 1: executive decision brief',
    '',
    ...executive(d),
    '## Layer 2: detailed management analysis',
    '',
    '### By area',
    '',
    ...doc.layers.analysis.areas.flatMap((a) => [`#### ${a.name}`, '', ...a.statements.map((id) => line(id, false)), '']),
    '### By fraud scenario',
    '',
    'In the method\'s own order within each area. The method\'s tiers are shown only in the annex, with their meaning, because they set the order of information gathering and are not a ranking of risk.',
    '',
    ...doc.layers.analysis.scenarios.flatMap((a) => [`#### ${a.name}`, '', ...a.statements.map((id) => line(id, false)), '']),
    '## Layer 3: action and accountability register',
    '',
    `### A Information gathering (${reg.informationGathering.items.length} items)`,
    '',
    byId.get(reg.informationGathering.sequenceStatement).text,
    '',
    ...reg.informationGathering.items.map((i) => `${i.sequence}. ${byId.get(i.statement).text}`),
    '',
    `### B Reported issues for management consideration (${reg.reportedIssues.items.length})`,
    '',
    byId.get(reg.reportedIssues.statement).text,
    '',
    ...reg.reportedIssues.items.map((i) => `- **${i.id}** ${byId.get(i.statement).text}`),
    '',
    `### C Recommended actions (${reg.recommendedActions.items.length})`,
    '',
    byId.get(reg.recommendedActions.statement).text,
    '',
    ...reg.recommendedActions.items.map((a) => `- **${a.id}** (for ${a.issue}) ${byId.get(a.statement).text}`),
    '',
    `### D Management decisions (${reg.decisions.items.length})`,
    '',
    ...reg.decisions.items.map((x) => `- ${byId.get(x.statement).text}`),
    '',
    '## Layer 4: technical annex',
    '',
    'The full annex (every control, every answer version with its provenance, every scenario) is in the document itself; below are its summary tables. It holds no evidence or reviewer records: those are in the separate Advisory record.',
    '',
    '### Coverage',
    '',
    '| Category | Engine states | Controls |',
    '|---|---|---|',
    ...doc.layers.analysis.coverage.rows.map((r) => `| ${CATEGORY_TITLE[r.category]} | ${r.states.join(', ')} | ${r.controls.length} |`),
    `| **All controls** | | **${doc.layers.annex.controls.length}** |`,
    '',
    `### Control register: the ${doc.layers.annex.controls.filter((r) => r.state === 'reported').length} practices reported on`,
    '',
    '| Control | Practice | As reported | Answer version | How it was given | Respondent said a record could be shown |',
    '|---|---|---|---|---|---|',
    ...doc.layers.annex.controls.filter((r) => r.state === 'reported').map((r) => `| ${r.id} | ${esc(r.key)} | ${esc(r.stateLabel)} | ${r.currentVersion ?? ''} | ${esc(r.sourceLabel)} | ${r.recordsSaid ?? ''} |`),
    '',
    `### Answer history`,
    '',
    `${doc.layers.annex.answerHistory.length} answer versions for ${new Set(doc.layers.annex.answerHistory.map((r) => r.control)).size} controls; ${doc.layers.annex.answerHistory.filter((r) => !r.current).length} earlier versions kept as earlier; ${doc.layers.annex.answerHistory.filter((r) => r.source === 'respondent-correction').length} corrections; ${doc.layers.annex.answerHistory.filter((r) => r.source === null).length} with no recorded provenance.`,
    '',
    '### Scenario register',
    '',
    `Tier: ${doc.layers.annex.scenarios[0]?.tierMeaning ?? ''}`,
    '',
    '| Scenario | Area | Name | Tier | Status |',
    '|---|---|---|---|---|',
    ...doc.layers.annex.scenarios.map((s) => `| ${s.id} | ${s.area} | ${esc(s.name)} | ${s.tier} | ${esc(s.statusLabel)} |`),
    '',
    '### Lineage and method',
    '',
    `- ${byId.get(doc.layers.annex.lineageStatement).text}`,
    `- ${byId.get(doc.layers.annex.methodStatement).text}`,
    '',
    '## Release',
    '',
    ...releaseTable(d),
    '## Validation',
    '',
    ...validation(d),
    ''
  ];
  writeFileSync(path.join(dir, 'fictional-management-report.md'), lines.join('\n'));
}

function writeAdvisory(dir, d, canonicalDigest) {
  const a = d.advisory;
  const lines = [
    '# Advisory record (fictional, preserved capability)',
    '',
    `${a.statusStatement}`,
    '',
    `Built by \`advisory-record.ts\` (${a.contract.name} ${a.contract.version}) with draft copy ${a.draft.copyVersion}, not approved, from the fictional session "${d.input.organisation.label}". Pathway: ${a.pathway}. Package: ${a.package}. Standard report dependency: ${a.standardReportDependency}. Record digest \`${canonicalDigest(a)}\`.`,
    '',
    'This capability was built before MK confirmed that evidence review, verification and specialist conclusions belong only to the Advisory package. It is kept, unchanged in substance, so that nothing is lost; it is not part of the standard report, is not a prerequisite for generating or releasing one, and is connected to nothing. No reviewer identity is verified (B3), so no entry is worded as an MK finding.',
    '',
    ...a.entries.map((e) => `- ${e.text}  \n  <sub>${e.record}; ${e.current ? 'current' : 'earlier'}; authority ${e.authority}; template \`${e.template}\`; claim \`${e.claim}\`</sub>`),
    '',
    '## Advisory checks',
    '',
    ...d.advisoryValidation.results.map((r) => `- ${r.id} ${r.name}: ${r.passed ? 'passed' : `failed (${r.failures.join('; ')})`}`),
    ''
  ];
  writeFileSync(path.join(dir, 'fictional-advisory-record.md'), lines.join('\n'));
}

function writeTrace(dir, d, t) {
  const pick = (c) => ({ id: c.id, type: c.type, pathway: c.pathway, pointer: c.pointer, value: c.value });
  const lines = [
    `# End-to-end trace: “${t.annexControl.key}” (${t.cid}), fictional session`,
    '',
    `Fictional session "${d.input.organisation.label}" (contract 1.2.0 record, read through the historical reader), report input ${d.input.contract.version}, input digest \`${d.gate.digest}\`. Every step below is produced and checked by \`scripts/readiness-review-report-engine-tests.mjs\` (test R-16): each claim holds against the input at its pointer, and the document passes the twenty checks.`,
    '',
    '## 1 The reported answer, in the stored answer log', '',
    '```json', JSON.stringify(t.action, null, 2), '```', '',
    '## 2 In the report input', '',
    `At \`${t.pointer}/answer\`:`, '', '```json', JSON.stringify(t.answer, null, 2), '```', '',
    `And the method's own content for the practice (added in report input 1.2.0), at \`${t.pointer}/method\`:`, '', '```json', JSON.stringify(t.claims.find((c) => c.type === 'method.content').value, null, 2), '```', '',
    '## 3 In the standard claims ledger', '',
    ...t.claims.filter((c) => c.type !== 'method.content').map((c) => ['```json', JSON.stringify(pick(c), null, 2), '```', '']).flat(),
    '## 4 In the executive brief', '',
    ...t.exec.map((s) => `- **${s.section}** (${s.kind}, rests on ${s.basis}): ${s.text}  \n  rule ${s.rule}, template \`${s.template}\`; counts \`gap:${t.cid}\` among ${s.counts[0].value} gaps out of ${s.counts[0].universe.value}; names no control`),
    '',
    '## 5 In the management analysis and the register', '',
    ...t.analysis.map((s) => `- **analysis / ${s.section}** (${s.kind}, rests on ${s.basis}): ${s.text}`),
    `- **reported issue** ${t.issue.id} (unranked, ${t.issue.status}): ${t.byId.get(t.issue.statement).text}`,
    `- **recommended action** ${t.recommended.id} (source ${t.recommended.source}, unranked): ${t.byId.get(t.recommended.statement).text}`,
    '',
    '## 6 In the technical annex', '',
    '```json', JSON.stringify({ control: t.annexControl, answerVersion: t.annexAnswer }, null, 2), '```', '',
    '## 7 The Advisory record for the same control, kept apart', '',
    ...t.advisoryEntries.map((e) => `- ${e.text}  \n  <sub>claim \`${e.claim}\` (Advisory pathway); not cited anywhere in the standard report</sub>`),
    '',
    'What this trace shows: the standard report says only that the respondent reported the practice as partly in place, quotes the response, names the fraud risk the draft method associates with it, and restates the practice as the draft method describes it in place as a recommended action for management consideration. It does not say the practice is weak, it does not rank it, and it says nothing about evidence. The evidence record for the same control belongs to the Advisory record, worded as recorded under an unverified reviewer account and not as an MK finding.',
    ''
  ];
  writeFileSync(path.join(dir, `fictional-trace-${t.cid}.md`), lines.join('\n'));
}

function writeComparison(dir, d, phase1Path, canonicalDigest) {
  const p1 = JSON.parse(readFileSync(phase1Path, 'utf8'));
  const p2 = d.doc;
  const s1 = new Map(p1.statements.map((s) => [s.id, s]));
  const s2 = new Map(p2.statements.map((s) => [s.id, s]));
  const e1 = p1.layers.executive;
  const ids1 = [...e1.status, ...e1.position.reportedExposure, ...e1.position.reviewedEvidence, ...e1.position.reviewerConclusions, ...e1.position.unresolved, ...e1.position.outsideScope, ...e1.canConclude, ...e1.unestablished, ...e1.decisions];
  const ids2 = Object.keys(EXEC_TITLES).flatMap((k) => p2.layers.executive[k]);
  const dup1 = [...new Set(ids1.filter((id, i) => ids1.indexOf(id) !== i))];
  const words = (ids, map) => ids.reduce((n, id) => n + map.get(id).text.split(/\s+/).length, 0);
  const reviewerIn1 = ids1.filter((id) => s1.get(id).claims.some((c) => /^(evidence|review|earlier-)/.test(c)) || ['evidence', 'conclusion'].includes(s1.get(id).kind));
  const named1 = new Set(ids1.flatMap((id) => s1.get(id).subjects.controls)).size;
  const named2 = new Set(ids2.flatMap((id) => s2.get(id).subjects.controls)).size;
  const t = (id, m) => m.get(id)?.text ?? '';
  const rule1 = (rule) => [...new Set(ids1)].filter((id) => s1.get(id).rule === rule).map((id) => s1.get(id).text);
  const rule2 = (rule) => ids2.filter((id) => s2.get(id).rule === rule).map((id) => s2.get(id).text);
  const sameLog = p1.lineage.logDigest === p2.lineage.logDigest && p1.lineage.actionCount === p2.lineage.actionCount && p1.lineage.sessionId === p2.lineage.sessionId;
  const projected = JSON.parse(JSON.stringify(d.input));
  projected.contract.version = '1.1.0';
  for (const dm of projected.domains) for (const c of dm.controls) delete c.method;
  const sameInput = canonicalDigest(projected) === p1.lineage.inputDigest;
  const issue1 = p1.layers.register.remediation.items.slice(0, 3).map((i) => s1.get(i.statement).text);
  const issue2 = p2.layers.register.reportedIssues.items.slice(0, 3).map((i, k) => [s2.get(i.statement).text, s2.get(p2.layers.register.recommendedActions.items[k].statement).text]);
  const adv = d.advisory.entries.filter((e) => e.record === 'evidence' || e.record === 'review');
  const lines = [
    '# Before and after: Phase 1 draft brief and Phase 2 standard report (fictional)',
    '',
    `Both documents are built from the same fictional session, "${d.input.organisation.label}". Phase 1 is the draft builder at commit \`1640f95\` (${p1.lineage.engine.version}, copy ${p1.draft.copyVersion}); Phase 2 is the standard report engine (${p2.lineage.engine.version}, copy ${p2.draft.copyVersion}). Neither copy is approved by MK. Every sentence quoted below is copied from the two validated documents.`,
    '',
    '## The underlying assessment record did not change',
    '',
    '| | Phase 1 | Phase 2 | Same |',
    '|---|---|---|---|',
    `| Session | ${p1.lineage.sessionId} | ${p2.lineage.sessionId} | ${p1.lineage.sessionId === p2.lineage.sessionId ? 'yes' : 'no'} |`,
    `| Stored answer log | ${p1.lineage.actionCount} actions, digest \`${p1.lineage.logDigest.slice(0, 16)}…\` | ${p2.lineage.actionCount} actions, digest \`${p2.lineage.logDigest.slice(0, 16)}…\` | ${sameLog ? 'yes' : 'no'} |`,
    `| Report input | 1.1.0, digest \`${p1.lineage.inputDigest.slice(0, 16)}…\` | 1.2.0, digest \`${p2.lineage.inputDigest.slice(0, 16)}…\`; without the method content added in 1.2.0: \`${canonicalDigest(projected).slice(0, 16)}…\` | ${sameInput ? 'yes, byte for byte, apart from the added method content' : 'no'} |`,
    `| Practices reported on / gaps / waiting / controls | ${p1.layers.annex.controls.filter((r) => r.state === 'reported').length} / ${p1.layers.register.remediation.items.length} / ${p1.layers.register.informationGathering.items.length} / ${p1.layers.annex.controls.length} | ${p2.layers.annex.controls.filter((r) => r.state === 'reported').length} / ${p2.layers.register.reportedIssues.items.length} / ${p2.layers.register.informationGathering.items.length} / ${p2.layers.annex.controls.length} | ${p1.layers.annex.controls.length === p2.layers.annex.controls.length && p1.layers.register.remediation.items.length === p2.layers.register.reportedIssues.items.length ? 'yes' : 'no'} |`,
    '',
    'The only change to the input is additive: the method\'s own content for each practice (its in-place description and the fraud risks it names), copied from the question bank of the recorded ruleset. What changed is how the report reads the record.',
    '',
    '## The executive brief in numbers',
    '',
    '| | Phase 1 | Phase 2 |',
    '|---|---|---|',
    `| Statements in the brief | ${ids1.length} references to ${new Set(ids1).size} statements | ${ids2.length} statements |`,
    `| Statements repeated across sections | ${dup1.length} | 0 |`,
    `| Words | ${words(ids1, s1)} | ${words(ids2, s2)} |`,
    `| Individual controls named | ${named1} | ${named2} |`,
    `| Statements resting on evidence or reviewer records | ${new Set(reviewerIn1).size} | 0 |`,
    `| Explicitly withheld judgements | 0 | ${p2.layers.executive.withheld.length} |`,
    '',
    words(ids2, s2) > words(ids1, s1)
      ? 'Phase 2 is a little longer in words because it adds the basis of the report, the explanation of adaptive routing, the scenario picture and the withheld judgements. It repeats nothing and names no individual control.'
      : 'Phase 2 is shorter, repeats nothing and names no individual control, while adding the basis of the report, the explanation of adaptive routing, the scenario picture and the withheld judgements.',
    '',
    '## 1 Reviewer authority (finding 1) and the Advisory boundary (12:05 correction)',
    '',
    `**Phase 1** built ${new Set(reviewerIn1).size} statements of its brief on evidence and reviewer records, including evidence reviews and a reviewer conclusion worded as MK's own finding, and repeated in what management "can reasonably conclude", although no reviewer identity is verified:`,
    '',
    ...[...new Set(reviewerIn1)].map((id) => `> ${t(id, s1)}`),
    '',
    '**Phase 2** keeps evidence review out of the standard report altogether, because it is not part of this assessment. The brief states the basis instead:',
    '',
    ...rule2('R-STATUS-BASIS').map((x) => `> ${x}`),
    '',
    'The same records are kept, unchanged in substance, in the separate Advisory record, and worded as what they are:',
    '',
    ...adv.map((e) => `> ${e.text}`),
    '',
    'Checks V16 (pathway boundary) and A02 (no authority without a verified identity) refuse the Phase 1 wording whatever disclaimer stands beside it; mutations M49 to M54 and N01 to N03 prove it.',
    '',
    '## 2 Assessment coverage (finding 2)',
    '',
    '**Phase 1** collapsed three different situations into "not asked":',
    '',
    ...rule1('R-POS-OUTSIDE').map((x) => `> ${x}`),
    '',
    '**Phase 2** keeps each category apart, with its own meaning, and explains adaptive routing without treating an unasked control as a weakness:',
    '',
    ...p2.layers.executive.coverage.map((id) => `> ${t(id, s2)}`),
    '',
    '## 3 Remediation integrity (finding 3)',
    '',
    `**Phase 1** gave every reported gap the same generic action (${p1.layers.register.remediation.items.length} items), for example:`,
    '',
    ...issue1.map((x) => `> ${x}`),
    '',
    'and asked management to decide on evidence for every practice reported on:',
    '',
    ...rule1('R-DECISION-EVIDENCE').map((x) => `> ${x}`),
    '',
    `**Phase 2** lists each gap as a reported issue for management consideration, and gives it one recommended action that restates the practice as the draft method describes it in place (or says plainly that a specific action is withheld). There is no evidence request. For example:`,
    '',
    ...issue2.flatMap(([a, b]) => [`> ${a}`, '>', `> ${b}`, '']),
    'The register states the qualification once:',
    '',
    `> ${t(p2.layers.register.recommendedActions.statement, s2)}`,
    '',
    '## 4 Executive reporting quality (finding 4)',
    '',
    `Phase 1 repeated ${dup1.length} statements across its sections (the unresolved questions, the undecided scenarios and the out-of-scope count appeared both in the position and in what remains unestablished), restated the reported gaps in "can conclude", and named ${named1} individual controls. Phase 2 places each statement in one section only, names no individual control, keeps the per-control record in the annex, and adds what Phase 1 lacked: the basis of the report, the adaptive routing, the scenario picture and the judgements MK has not recorded.`,
    '',
    '### Phase 1 executive brief, as built',
    '',
    ...ids1.map((id) => `- ${t(id, s1)}`),
    '',
    '### Phase 2 executive brief, as built',
    '',
    ...Object.entries(EXEC_TITLES).flatMap(([k, title]) => (p2.layers.executive[k].length ? [`**${title}**`, '', ...p2.layers.executive[k].map((id) => `- ${t(id, s2)}`), ''] : [])),
    '## What is still for MK',
    '',
    'Every Phase 2 template is draft copy (B7); the method content quoted in the recommended actions is the draft method (B4); the presentation limits are placeholders (D2). See `../REPORT-ENGINE-MK-DECISIONS.md`.',
    ''
  ];
  writeFileSync(path.join(dir, 'before-and-after-comparison.md'), lines.join('\n'));
}

export function writeExamples(dir, { built, results, canonicalDigest }) {
  mkdirSync(dir, { recursive: true });
  const d = built.supplied;
  writeBrief(dir, d, canonicalDigest);
  writeReport(dir, d, canonicalDigest);
  writeAdvisory(dir, built.advisory, canonicalDigest);
  if (results.trace) writeTrace(dir, d, results.trace);
  if (process.env.MK_REPORT_DOCUMENT_JSON) writeFileSync(process.env.MK_REPORT_DOCUMENT_JSON, JSON.stringify(d.doc, null, 1));
  if (process.env.MK_PHASE1_DOCUMENT) writeComparison(dir, d, process.env.MK_PHASE1_DOCUMENT, canonicalDigest);
}
