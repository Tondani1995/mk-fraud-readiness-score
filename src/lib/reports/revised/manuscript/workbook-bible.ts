import crypto from 'node:crypto';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import type { RevisedReport, ControlBlueprint } from '../evidence-model';
import type { RevisedFactPack, Product } from './fact-pack';
import { accountableFor, cycleText, escalationOf, independentCheckOf, populationOf, slaOf } from './fact-pack';
import { MK_PUB } from '../../design/mk-publication';
import { controlContent } from '../control-content/index';

/**
 * The supporting workbooks in the sheet structure the Reporting Bible v1.1 locks (section 20): eight sheets for
 * Essential and eight blueprint-oriented sheets for Comprehensive. The workbook is the authoritative home for every
 * register and every control specification (Bible 15); the PDF discusses a selection and points here.
 *
 * FICTIONAL PROTOTYPE. Business-facing columns first and technical references to the right, the header row frozen,
 * filters on every register, wrapped text and widths set per column, human-readable states, and formula-injection
 * protection on every text cell (Bible 20.3). Rows are built from the same revised report model and Fact Pack as the
 * PDF, so counts reconcile; the Read me sheet records the reconciliation.
 */
export const BIBLE_WORKBOOK_VERSION = 'bible-workbook-0.1';

export const ESSENTIAL_SHEETS = ['Read me', 'Findings', 'Risks', 'Control Actions', 'Proof of Progress', 'Roadmap', 'Question Trace', 'Control Improvements'] as const;
export const COMPREHENSIVE_SHEETS = ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Blueprints', 'Implementation Blueprint', 'Management Decisions', 'Question Traceability'] as const;

type Col = { key: string; header: string; width: number; technical?: boolean };
type Sheet = { name: string; columns: Col[]; rows: Record<string, unknown>[] };

const text = (v: unknown): string => (v === null || v === undefined ? '' : Array.isArray(v) ? v.filter(Boolean).join('; ') : String(v));
/** Formula-injection safe: a cell that a spreadsheet would read as a formula is written as text with a leading apostrophe. */
export const safe = (v: unknown): string => { const s = text(v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };

function controlSpec(c: ControlBlueprint) {
  return {
    control: c.key, target: c.target ?? c.standard, reported: c.stateShort, function: c.ownerRole, accountable: accountableFor(c.ownerRole),
    population: (() => { const p = controlContent(c.id).population; return p ? p.charAt(0).toUpperCase() + p.slice(1) : populationOf(c); })(), frequency: cycleText(c.operatingCycle), activities: (c.activities ?? []).map((a, i) => `${i + 1}. ${a}`).join('\n'),
    record: c.recordText, measure: c.successMeasure, independent: independentCheckOf(c), escalation: escalationOf(c), sla: slaOf(c), onFailure: c.onFailure,
    scenarios: c.schemeNames, purpose: c.purpose === 'put-in-place' ? 'Put in place' : 'Strengthen', pattern: c.archetype, sources: c.contentSources,
    connected: c.prerequisiteRefs.concat(c.dependentRefs), ref: c.ref, id: c.id
  };
}

function questionTrace(r: RevisedReport) {
  const rows: Record<string, unknown>[] = [];
  for (const s of r.schemes) {
    for (const q of s.confirmations as any[]) rows.push({ scenario: s.name, area: s.areaName, role: 'Core control', question: q.questionText, answer: q.answerLabel ?? (q.outstanding ? 'Outstanding' : ''), state: q.stateShort, answeredBy: q.answeredBy, owner: q.ownerRole, scenarioId: s.id, questionId: q.id });
    for (const q of (s.supportingGaps ?? []) as any[]) rows.push({ scenario: s.name, area: s.areaName, role: 'Related practice', question: q.questionText, answer: q.answerLabel ?? '', state: q.stateShort, answeredBy: q.answeredBy, owner: q.ownerRole, scenarioId: s.id, questionId: q.id });
  }
  return rows;
}

export function bibleWorkbookSheets(product: Product, r: RevisedReport, fp: RevisedFactPack): Sheet[] {
  const discussed = new Set(fp.findings.map((f) => f.findingRef));
  const prioritised = new Set(fp.priorities.map((p: any) => p.controlRef).filter(Boolean));
  const blueprinted = new Set(fp.blueprints.map((b) => b.controlRef));
  const pos = fp.position;
  const findings = r.findings.map((f) => ({
    title: f.title, area: f.areaName, position: f.position, mechanism: f.mechanism, questions: f.questions, further: f.furtherWeaknesses,
    answeredBy: f.answeredBy, discussed: discussed.has(f.ref) ? 'Discussed in the report' : 'Register only', controls: f.controlRefs.map((c) => r.controls.find((x) => x.ref === c)?.key).filter(Boolean),
    kind: ({ contradiction: 'Answers cannot both be right', dependency: 'Control lacks an input it needs', clarify: 'Question to clarify', gap: 'Core control reported as a gap', qualified: 'In place; related practice weaker', outstanding: 'Answers outstanding' } as Record<string, string>)[f.kind] ?? f.kind,
    ref: f.ref, scheme: f.schemeId
  }));
  const risks = r.risks.map((k) => ({ title: k.title, statement: k.statement, position: k.currentPosition, treatment: k.treatment.replace(/^C\d+\s+/, ''), owner: k.ownerRole, rating: 'Not rated', ref: k.ref, finding: k.findingRef }));
  const actions = r.actions.map((a) => ({ action: a.action, owner: a.ownerRole, stage: a.phaseTitle, window: a.window, deliverable: a.deliverable, test: a.completionTest, controls: a.controlRefs.map((c) => r.controls.find((x) => x.ref === c)?.key).filter(Boolean), ref: a.ref, depends: a.dependsOn }));
  const records = r.records.map((e) => ({ record: e.text, owners: e.ownerRoles, controls: e.controlRefs.map((c) => r.controls.find((x) => x.ref === c)?.key).filter(Boolean), status: 'Record management should maintain; not examined by MK', ref: e.ref }));
  const specs = r.controls.map(controlSpec);
  const trace = questionTrace(r);
  const readMe = (sheets: readonly string[], counts: Record<string, number>) => [
    { field: 'Purpose', value: product === 'essential' ? 'Supporting workbook for the Essential Fraud Readiness Report: every finding, risk, action, record and control specification behind the report.' : 'Supporting workbook for the Fraud Readiness Strategy and Control Blueprint: the complete registers, every control blueprint and the implementation record.' },
    { field: 'Organisation', value: fp.organisation.name }, { field: 'Assessment reference', value: fp.organisation.reference },
    { field: 'Basis', value: 'The organisation\'s own answers to the MK Fraud Readiness assessment. MK has not examined documents, interviewed staff or tested controls; the records listed are records management should maintain, not evidence MK has reviewed. Independent examination belongs to MK Advisory.' },
    { field: 'How to read', value: product === 'essential' ? 'Start with Findings, then Control Improvements for the operating detail of each control, Control Actions and Roadmap for the plan, and Proof of Progress for the records that will show the controls working.' : 'Start with Summary, then Material Findings and Risk Register, then Control Blueprints, Management Decisions and the Implementation Blueprint.' },
    ...pos.map((p) => ({ field: p.label, value: p.value.replace(/,\s*test fixture$/i, ' (test fixture)') })),
    { field: 'Prototype notice', value: 'Fictional organisation. The calculated result is a labelled test fixture; no readiness level or band is issued (MK decision D-1). The order of work follows explicit candidate factors (D-3). Control specifications, scenario structures and decision options are draft MK advisory content (D-5). Service levels are proposals for management to set.' },
    { field: 'Sheets', value: sheets.join(', ') },
    ...Object.entries(counts).map(([k, v]) => ({ field: `Rows: ${k}`, value: String(v) })),
    { field: 'Versions', value: `${BIBLE_WORKBOOK_VERSION}; ${fp.version}; ${Object.values(fp.contentVersions).join('; ')}` }
  ];
  const fCols: Col[] = [
    { key: 'title', header: 'Fraud scenario', width: 38 }, { key: 'area', header: 'Area', width: 22 }, { key: 'kind', header: 'What the answers show', width: 24 },
    { key: 'position', header: 'Reported position', width: 58 }, { key: 'mechanism', header: 'How the fraud works', width: 44 }, { key: 'questions', header: 'Questions to settle', width: 44 },
    { key: 'further', header: 'Related practices reported weaker', width: 50 }, { key: 'controls', header: 'Controls to act on', width: 32 }, { key: 'answeredBy', header: 'Answered by', width: 24 },
    { key: 'discussed', header: 'In the report', width: 20 }, { key: 'ref', header: 'Finding ref (technical)', width: 12, technical: true }, { key: 'scheme', header: 'Scenario ID (technical)', width: 14, technical: true }
  ];
  const rCols: Col[] = [
    { key: 'title', header: 'Risk', width: 38 }, { key: 'statement', header: 'Risk statement', width: 60 }, { key: 'position', header: 'Current position', width: 50 },
    { key: 'treatment', header: 'Treatment', width: 30 }, { key: 'owner', header: 'Owner', width: 22 }, { key: 'rating', header: 'Rating', width: 12 },
    { key: 'ref', header: 'Risk ref (technical)', width: 12, technical: true }, { key: 'finding', header: 'Finding ref (technical)', width: 12, technical: true }
  ];
  const aCols: Col[] = [
    { key: 'action', header: 'Action', width: 60 }, { key: 'owner', header: 'Owner', width: 22 }, { key: 'stage', header: 'Stage', width: 20 }, { key: 'window', header: 'Proposed window', width: 24 },
    { key: 'deliverable', header: 'Deliverable', width: 44 }, { key: 'test', header: 'Completion test', width: 44 }, { key: 'controls', header: 'Controls', width: 30 },
    { key: 'ref', header: 'Action ref (technical)', width: 12, technical: true }, { key: 'depends', header: 'Depends on (technical)', width: 14, technical: true }
  ];
  const eCols: Col[] = [
    { key: 'record', header: 'Record management should keep', width: 70 }, { key: 'controls', header: 'Shows the operation of', width: 36 }, { key: 'owners', header: 'Kept by', width: 24 },
    { key: 'status', header: 'Status', width: 30 }, { key: 'ref', header: 'Record ref (technical)', width: 12, technical: true }
  ];
  const sCols: Col[] = [
    { key: 'control', header: 'Control', width: 30 }, { key: 'purpose', header: 'Purpose', width: 13 }, { key: 'reported', header: 'Reported state', width: 16 }, { key: 'target', header: 'Target operating practice', width: 58 },
    { key: 'accountable', header: 'Accountable executive', width: 20 }, { key: 'function', header: 'Process owner', width: 20 }, { key: 'population', header: 'Population', width: 30 }, { key: 'frequency', header: 'Frequency', width: 20 },
    { key: 'activities', header: 'Implementation activities', width: 64 }, { key: 'record', header: 'Record kept', width: 50 }, { key: 'independent', header: 'Independent check', width: 40 },
    { key: 'escalation', header: 'Escalation trigger and recipient', width: 44 }, { key: 'sla', header: 'Service level (proposed)', width: 36 }, { key: 'measure', header: 'Effectiveness measure', width: 54 },
    { key: 'onFailure', header: 'Failure response', width: 50 }, { key: 'scenarios', header: 'Fraud scenarios addressed', width: 40 }, { key: 'pattern', header: 'Control pattern', width: 28 },
    { key: 'sources', header: 'Content sources (technical)', width: 18, technical: true }, { key: 'connected', header: 'Connected controls (technical)', width: 14, technical: true }, { key: 'ref', header: 'Control ref (technical)', width: 12, technical: true }, { key: 'id', header: 'Question ID (technical)', width: 14, technical: true }
  ];
  const tCols: Col[] = [
    { key: 'scenario', header: 'Fraud scenario', width: 38 }, { key: 'area', header: 'Area', width: 22 }, { key: 'role', header: 'Role', width: 16 }, { key: 'question', header: 'Question', width: 60 },
    { key: 'answer', header: 'Answer given', width: 50 }, { key: 'state', header: 'State', width: 16 }, { key: 'answeredBy', header: 'Answered by', width: 20 }, { key: 'owner', header: 'Owner', width: 20 },
    { key: 'scenarioId', header: 'Scenario ID (technical)', width: 14, technical: true }, { key: 'questionId', header: 'Question ID (technical)', width: 14, technical: true }
  ];
  const kv: Col[] = [{ key: 'field', header: 'Field', width: 30 }, { key: 'value', header: 'Value', width: 110 }];

  if (product === 'essential') {
    const roadmap = fp.roadmap.flatMap((s: any) => s.items.map((it: any) => ({ stage: s.label, window: s.window, purpose: s.purpose, action: it.text, owner: it.owner, deliverable: it.deliverable })));
    const improvements = specs.map((x) => ({ ...x, priority: prioritised.has(x.ref) ? 'First response in the report' : 'Register' }));
    const counts = { Findings: findings.length, Risks: risks.length, 'Control Actions': actions.length, 'Proof of Progress': records.length, Roadmap: roadmap.length, 'Question Trace': trace.length, 'Control Improvements': improvements.length };
    return [
      { name: 'Read me', columns: kv, rows: readMe(ESSENTIAL_SHEETS, counts) },
      { name: 'Findings', columns: fCols, rows: findings },
      { name: 'Risks', columns: rCols, rows: risks },
      { name: 'Control Actions', columns: aCols, rows: actions },
      { name: 'Proof of Progress', columns: eCols, rows: records },
      { name: 'Roadmap', columns: [{ key: 'stage', header: 'Stage', width: 20 }, { key: 'window', header: 'Proposed window', width: 24 }, { key: 'purpose', header: 'Purpose of the stage', width: 44 }, { key: 'action', header: 'Action', width: 60 }, { key: 'owner', header: 'Owner', width: 22 }, { key: 'deliverable', header: 'Deliverable', width: 44 }], rows: roadmap },
      { name: 'Question Trace', columns: tCols, rows: trace },
      { name: 'Control Improvements', columns: [{ key: 'priority', header: 'In the report', width: 22 }, ...sCols], rows: improvements }
    ];
  }
  const summary = [
    ...pos.map((p) => ({ field: p.label, value: `${p.value.replace(/,\s*test fixture$/i, ' (test fixture)')}. ${p.text}` })),
    { field: 'Fraud scenarios that apply', value: String(r.schemes.length) },
    { field: 'Material findings discussed in the report', value: `${fp.findings.length} of ${r.findings.length}` },
    { field: 'Control blueprints in the report', value: `${fp.blueprints.length}; every control has a full specification in Control Blueprints (${specs.length})` },
    { field: 'Leadership decisions', value: String(fp.decisions.length) },
    { field: 'Implementation stages', value: fp.roadmap.map((s: any) => `${s.label} (${s.window})`).join('; ') },
    { field: 'Information sufficiency (candidate rules, not connected to release)', value: `Essential ${r.sufficiency.release.essential.meets ? 'meets' : 'does not meet'}; Comprehensive ${r.sufficiency.release.comprehensive.meets ? 'meets' : `does not meet (${r.sufficiency.release.comprehensive.failing.join(', ')})`}` }
  ];
  const decisions = fp.decisions.flatMap((d) => (d.options?.options ?? [{ label: '', description: '', effort: '', benefit: '', tradeOff: '' }]).map((o, i) => ({
    decision: d.question, why: d.why, option: o.label, involves: o.description, effort: o.effort, benefit: o.benefit, tradeOff: o.tradeOff,
    recommended: i === 0 ? (d.options?.recommended ?? '') : '', rationale: i === 0 ? (d.options?.rationale ?? '') : '', owner: d.owner, when: d.when, delay: d.delay, ref: d.ref
  })));
  const implementation = fp.roadmap.flatMap((s: any) => s.items.map((it: any) => {
    const a = r.actions.find((x) => x.action === it.text);
    return { stage: s.label, window: s.window, outcome: s.purpose, action: it.text, owner: it.owner, deliverable: it.deliverable, test: a?.completionTest ?? '', proof: a ? a.controlRefs.map((c) => r.controls.find((x) => x.ref === c)?.recordText).filter(Boolean) : [], ref: a?.ref ?? '' };
  }));
  const blueprints = specs.map((x) => ({ ...x, inReport: blueprinted.has(x.ref) ? 'Blueprint in the report' : 'Register' }));
  const counts = { 'Material Findings': findings.length, 'Risk Register': risks.length, 'Control Blueprints': blueprints.length, 'Implementation Blueprint': implementation.length, 'Management Decisions': decisions.length, 'Question Traceability': trace.length };
  return [
    { name: 'Read me', columns: kv, rows: readMe(COMPREHENSIVE_SHEETS, counts) },
    { name: 'Summary', columns: kv, rows: summary },
    { name: 'Material Findings', columns: fCols, rows: findings },
    { name: 'Risk Register', columns: rCols, rows: risks },
    { name: 'Control Blueprints', columns: [{ key: 'inReport', header: 'In the report', width: 22 }, ...sCols], rows: blueprints },
    { name: 'Implementation Blueprint', columns: [{ key: 'stage', header: 'Stage', width: 20 }, { key: 'window', header: 'Proposed window', width: 24 }, { key: 'outcome', header: 'Stage outcome', width: 44 }, { key: 'action', header: 'Action', width: 60 }, { key: 'owner', header: 'Owner', width: 22 }, { key: 'deliverable', header: 'Deliverable', width: 44 }, { key: 'test', header: 'Completion test', width: 44 }, { key: 'proof', header: 'Record that will show progress', width: 56 }, { key: 'ref', header: 'Action ref (technical)', width: 12, technical: true }], rows: implementation },
    { name: 'Management Decisions', columns: [{ key: 'decision', header: 'Decision', width: 40 }, { key: 'why', header: 'Why it matters', width: 44 }, { key: 'option', header: 'Option', width: 28 }, { key: 'involves', header: 'What it involves', width: 50 }, { key: 'effort', header: 'Effort', width: 22 }, { key: 'benefit', header: 'Benefit', width: 36 }, { key: 'tradeOff', header: 'Trade-off', width: 36 }, { key: 'recommended', header: 'MK recommended route', width: 44 }, { key: 'rationale', header: 'Rationale', width: 44 }, { key: 'owner', header: 'Decision owner', width: 20 }, { key: 'when', header: 'When', width: 24 }, { key: 'delay', header: 'If delayed', width: 40 }, { key: 'ref', header: 'Decision ref (technical)', width: 12, technical: true }], rows: decisions },
    { name: 'Question Traceability', columns: tCols, rows: trace }
  ];
}

const colLetter = (n: number) => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function buildBibleWorkbook(product: Product, r: RevisedReport, fp: RevisedFactPack) {
  const sheets = bibleWorkbookSheets(product, r, fp);
  const { default: writeXlsxFile } = await import('write-excel-file/node');
  const header = (c: Col) => ({ value: c.header, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: c.technical ? MK_PUB.slate : MK_PUB.navy, wrap: true, alignVertical: 'center', height: 30 });
  const book = await (writeXlsxFile as any)(sheets.map((sh) => ({
    sheet: sh.name,
    data: [sh.columns.map(header), ...sh.rows.map((row) => sh.columns.map((c) => ({ value: safe(row[c.key]), wrap: true, alignVertical: 'top', color: c.technical ? MK_PUB.slate : MK_PUB.ink })))],
    columns: sh.columns.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
    stickyColumnsCount: /Control (Improvements|Blueprints)/.test(sh.name) ? 2 : sh.columns.length > 4 && sh.name !== 'Read me' && sh.name !== 'Summary' ? 1 : 0
  })), { fontFamily: 'Calibri', fontSize: 10 });
  // Filters on every register (Bible 20.3): an autoFilter over the header and data range of each worksheet.
  const raw = unzipSync(new Uint8Array(await book.toBuffer()));
  sheets.forEach((sh, i) => {
    const name = `xl/worksheets/sheet${i + 1}.xml`;
    if (!raw[name] || sh.name === 'Read me' || sh.name === 'Summary') return;
    const ref = `A1:${colLetter(sh.columns.length - 1)}${sh.rows.length + 1}`;
    raw[name] = strToU8(strFromU8(raw[name]).replace('</sheetData>', `</sheetData><autoFilter ref="${ref}"/>`));
  });
  const bytes = Buffer.from(zipSync(raw, { level: 6 }));
  return { bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sheets: sheets.map((x) => ({ name: x.name, rows: x.rows.length, columns: x.columns.length })) };
}
