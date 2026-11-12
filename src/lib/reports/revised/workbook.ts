import crypto from 'node:crypto';
import { KIND_LABEL, PURPOSE_LABEL, type RevisedReport } from './evidence-model';
import { CONTENT_GAP_TEXT, bankQuestion } from './answer-text';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The supporting workbook for the revised Comprehensive (R-3): every register in
 * full, with the method references (question, scheme and answer) that the PDF leaves out of its prose, and a
 * reconciliation of row counts. Written with the same library as the existing Comprehensive workbook.
 */
type Sheet = { name: string; rows: Record<string, unknown>[]; columns: [string, string][] };
const s = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v));

export function revisedWorkbookSheets(r: RevisedReport, meta: { organisationName: string; assessmentReference: string; figureLabel: string; figure: number | null }): Sheet[] {
  const sheets: Sheet[] = [
    { name: 'Read me', columns: [['field', 'Field'], ['value', 'Value']], rows: [
      { field: 'Purpose', value: 'Supporting registers for the Comprehensive Fraud Readiness report (fictional prototype). Every row in the report appendices is here, with the method references that trace it.' },
      { field: 'Organisation', value: meta.organisationName }, { field: 'Assessment reference', value: meta.assessmentReference },
      { field: 'Basis', value: 'The organisation\'s own answers, read against the draft review method (bank 1.3, not approved by MK). Nothing has been tested or verified. Records listed are records management should maintain; MK evidence review is a separate Advisory service.' },
      { field: 'Calculated figure', value: `${s(meta.figure)}. ${meta.figureLabel}` },
      { field: 'Ratings', value: 'No likelihood, impact, priority, difficulty or deadline is assigned. MK has not approved a method for them.' },
      { field: 'Relationship review', value: 'Answer relationships come from relationship-review-0.1 (prototype, for MK review).' }
    ] },
    { name: 'Schemes', columns: [['ref', 'Ref'], ['name', 'Scheme'], ['area', 'Area'], ['tier', 'Method tier'], ['kind', 'Classification'], ['answered', 'Controls answered'], ['inPlace', 'In place'], ['outstanding', 'Outstanding'], ['answeredBy', 'Answered by'], ['id', 'Method scheme (technical)']],
      rows: r.schemes.map((x) => ({ ref: x.ref, name: x.name, area: x.areaName, tier: x.tier, kind: KIND_LABEL[x.kind], answered: x.answered, inPlace: x.inPlace, outstanding: x.outstanding.length, answeredBy: x.answeredBy, id: x.id })) },
    { name: 'Findings', columns: [['ref', 'Ref'], ['schemeRef', 'Scheme'], ['title', 'Title'], ['kind', 'Classification'], ['position', 'What the answers show'], ['mechanism', 'How it happens (method)'], ['why', 'Why it matters (method)'], ['riskRef', 'Risk'], ['controlRefs', 'Controls']],
      rows: r.findings.map((f) => ({ ...f, kind: KIND_LABEL[f.kind], why: f.whyItMatters })) },
    { name: 'Risks', columns: [['ref', 'Ref'], ['findingRef', 'Finding'], ['statement', 'Risk'], ['consequence', 'Consequence (method)'], ['currentPosition', 'Current position'], ['treatment', 'Treatment'], ['ownerRole', 'Owner'], ['rating', 'Rating']], rows: r.risks },
    { name: 'Controls', columns: [['ref', 'Ref'], ['key', 'Control'], ['purpose', 'Purpose'], ['schemeRefs', 'Schemes'], ['reported', 'Reported today'], ['answerLabel', 'Answer given'], ['answeredBy', 'Answered by'], ['standard', 'Target standard (method)'], ['improving', 'Improving level (method)'], ['records', 'Records (method)'], ['ownerRole', 'Owner'], ['methodOwner', 'Owner (method wording)'], ['prerequisiteRefs', 'Relies on'], ['dependentRefs', 'Relied on by'], ['operatingCycle', 'Operating cycle'], ['activities', 'Activities'], ['successMeasure', 'Success measure'], ['gaps', 'Method content gaps'], ['id', 'Method question (technical)'], ['questionText', 'Question asked']],
      rows: r.controls.map((c) => ({ ...c, purpose: PURPOSE_LABEL[c.purpose], gaps: c.contentGaps.map((g) => CONTENT_GAP_TEXT[g]) })) },
    { name: 'Records', columns: [['ref', 'Ref'], ['text', 'Record management should maintain'], ['controlRefs', 'Controls'], ['ownerRoles', 'Kept by']], rows: r.records },
    { name: 'Actions', columns: [['ref', 'Ref'], ['phase', 'Phase'], ['phaseTitle', 'Phase title'], ['action', 'Action'], ['ownerRole', 'Owner'], ['deliverable', 'Deliverable'], ['completionTest', 'Complete when'], ['dependsOn', 'After'], ['controlRefs', 'Controls'], ['schemeRefs', 'Schemes']], rows: r.actions },
    { name: 'Measures', columns: [['ref', 'Ref'], ['measure', 'Measure'], ['controlRefs', 'Control'], ['ownerRole', 'Owner']], rows: r.measures },
    { name: 'Decisions', columns: [['ref', 'Ref'], ['decision', 'Decision'], ['why', 'Why'], ['recommendedDirection', 'Recommended direction'], ['ownerRole', 'Owner'], ['when', 'When'], ['consequenceOfDelay', 'If delayed'], ['schemeRefs', 'Schemes']], rows: r.decisions },
    { name: 'Relationships', columns: [['schemeRef', 'Scheme'], ['confirmationName', 'Control reported in place'], ['confirmationReported', 'Its answer'], ['practiceName', 'Practice'], ['practiceReported', 'Its answer'], ['label', 'Relationship'], ['basis', 'Basis'], ['statement', 'What it means'], ['rationale', 'Rationale'], ['confirmation', 'Control (technical)'], ['practice', 'Practice (technical)']], rows: r.relations },
    { name: 'Outstanding', columns: [['ref', 'Ref'], ['key', 'Control'], ['reasonText', 'Status'], ['fn', 'Function'], ['declineReason', 'Reason given'], ['schemeRef', 'Scheme'], ['question', 'Question'], ['id', 'Method question (technical)']], rows: r.outstanding },
    { name: 'Roles', columns: [['role', 'Role in report'], ['methodLabels', 'Method wording']], rows: r.roles },
    { name: 'Content gaps', columns: [['ref', 'Control'], ['key', 'Name'], ['gaps', 'Where the method is not specific enough'], ['id', 'Method question (technical)']],
      rows: r.contentGaps.map((g) => ({ ...g, gaps: g.gaps.map((x) => CONTENT_GAP_TEXT[x]) })) },
    { name: 'Traceability', columns: [['controlRef', 'Control'], ['id', 'Method question'], ['format', 'Response format'], ['question', 'Question asked'], ['answer', 'Answer given'], ['by', 'Answered by']],
      rows: r.controls.map((c) => ({ controlRef: c.ref, id: c.id, format: bankQuestion(c.id)?.format ?? '', question: c.questionText, answer: c.answerLabel, by: c.answeredBy })) }
  ];
  const counts: Record<string, number> = { Schemes: r.schemes.length, Findings: r.findings.length, Risks: r.risks.length, Controls: r.controls.length, Records: r.records.length, Actions: r.actions.length, Measures: r.measures.length, Decisions: r.decisions.length, Relationships: r.relations.length, Outstanding: r.outstanding.length, Roles: r.roles.length };
  sheets.push({ name: 'Reconciliation', columns: [['sheet', 'Register'], ['model', 'Rows in report model'], ['workbook', 'Rows in this workbook']],
    rows: Object.entries(counts).map(([name, n]) => ({ sheet: name, model: n, workbook: sheets.find((x) => x.name === name)?.rows.length ?? 0 })) });
  return sheets;
}

export async function buildRevisedWorkbook(r: RevisedReport, meta: { organisationName: string; assessmentReference: string; figureLabel: string; figure: number | null }) {
  const sheets = revisedWorkbookSheets(r, meta);
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/node');
  const workbook = await (writeXlsxFile as any)(sheets.map((sh) => ({
    sheet: sh.name,
    data: (getSheetData as any)(sh.rows, sh.columns.map(([key, header]) => ({ header, cell: (row: Record<string, unknown>) => s(row[key]) })))
  })));
  const bytes = Buffer.from(await workbook.toBuffer());
  return { bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sheets: sheets.map((x) => ({ name: x.name, rows: x.rows.length })) };
}
