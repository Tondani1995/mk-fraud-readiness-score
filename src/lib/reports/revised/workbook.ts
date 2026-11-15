import crypto from 'node:crypto';
import { KIND_LABEL, PURPOSE_LABEL, type RevisedReport } from './evidence-model';
import { CONTENT_GAP_TEXT, bankQuestion } from './answer-text';
import { RELATION_REVIEW } from './relationships';
import { CONTROL_CONTENT_VERSION, CONTROL_CONTENT_STATUS } from './control-content/index';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The supporting workbook for the revised Comprehensive (R-3): every register in
 * full, with the method references (question, scenario and answer) that the PDF leaves out of its prose, and a
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
      { field: 'Calculated test result', value: `${s(meta.figure)}. ${meta.figureLabel} Not a score, a band or a readiness level.` },
      { field: 'Approved readiness conclusion', value: `None issued. ${r.position.conclusion}` },
      { field: 'Ratings', value: 'No likelihood, impact, materiality, priority, difficulty or deadline is assigned, and no list order is a ranking. MK has not approved a method for them.' },
      { field: 'Relationship review', value: `Answer relationships come from ${RELATION_REVIEW.version} (prototype, for MK review). Pairs not reviewed are "not established" and support no conclusion.` },
      { field: 'Control content', value: `${CONTROL_CONTENT_VERSION}. ${CONTROL_CONTENT_STATUS}` },
      { field: 'Information sufficiency', value: `${r.sufficiency.rule} (candidate rules, not approved, not connected to fulfilment). Essential: ${r.sufficiency.release.essential.meets ? 'conditions met' : `conditions not met (${r.sufficiency.release.essential.failing.join(', ')})`}. Comprehensive: ${r.sufficiency.release.comprehensive.meets ? 'conditions met' : `conditions not met (${r.sufficiency.release.comprehensive.failing.join(', ')})`}.` },
      { field: 'Planning windows', value: 'Proposed planning windows for starting each stage. Not deadlines, contractual dates or estimates.' }
    ] },
    { name: 'Scenarios', columns: [['ref', 'Ref'], ['name', 'Scenario'], ['area', 'Area'], ['tier', 'Method tier'], ['kind', 'Classification'], ['answered', 'Controls answered'], ['inPlace', 'In place'], ['outstanding', 'Outstanding'], ['answeredBy', 'Answered by'], ['id', 'Method scenario (technical)']],
      rows: r.schemes.map((x) => ({ ref: x.ref, name: x.name, area: x.areaName, tier: x.tier, kind: KIND_LABEL[x.kind], answered: x.answered, inPlace: x.inPlace, outstanding: x.outstanding.length, answeredBy: x.answeredBy, id: x.id })) },
    { name: 'Findings', columns: [['ref', 'Ref'], ['schemeRef', 'Scenario'], ['title', 'Title'], ['kind', 'Classification'], ['position', 'What the answers show'], ['questions', 'Question to clarify'], ['mechanism', 'How it happens (method)'], ['why', 'Why it matters (method)'], ['fPosition', 'Factor: control position'], ['fShared', 'Factor: other scenarios the control serves'], ['fOutstanding', 'Factor: answers outstanding'], ['fRelated', 'Factor: related practices weaker'], ['riskRef', 'Risk'], ['controlRefs', 'Controls']],
      rows: r.findings.map((f) => ({ ...f, kind: KIND_LABEL[f.kind], why: f.whyItMatters, fPosition: f.factors.controlPosition, fShared: f.factors.controlsShared, fOutstanding: f.factors.outstandingAnswers, fRelated: f.factors.relatedWeaker })) },
    { name: 'Risks', columns: [['ref', 'Ref'], ['findingRef', 'Finding'], ['statement', 'Risk'], ['consequence', 'Consequence (method)'], ['currentPosition', 'Current position'], ['treatment', 'Treatment'], ['ownerRole', 'Owner'], ['rating', 'Rating']], rows: r.risks },
    { name: 'Controls', columns: [['ref', 'Ref'], ['key', 'Control'], ['purpose', 'Purpose'], ['schemeRefs', 'Scenarios'], ['reported', 'Reported today'], ['answerLabel', 'Answer given'], ['answeredBy', 'Answered by'], ['target', 'Target operating practice (library)'], ['ownerRole', 'Responsible function'], ['activities', 'Implementation activities (library)'], ['recordText', 'Records to keep (library)'], ['successMeasure', 'Success measure (library)'], ['operatingCycle', 'Operating cycle'], ['onFailure', 'If it fails (library)'], ['archetype', 'Library pattern'], ['contentStatus', 'Library status'], ['contentSources', 'Library sources'], ['standard', 'Target standard (method wording)'], ['improving', 'Improving level (method)'], ['records', 'Records (method wording)'], ['methodOwner', 'Owner (method wording)'], ['prerequisiteRefs', 'Needs'], ['dependentRefs', 'Supplies an input to'], ['gaps', 'Method content gaps'], ['id', 'Method question (technical)'], ['questionText', 'Question asked']],
      rows: r.controls.map((c) => ({ ...c, purpose: PURPOSE_LABEL[c.purpose], gaps: c.contentGaps.map((g) => CONTENT_GAP_TEXT[g]) })) },
    { name: 'Records', columns: [['ref', 'Ref'], ['name', 'Record'], ['text', 'Record management should maintain'], ['controlRefs', 'Controls'], ['ownerRoles', 'Kept by']], rows: r.records },
    { name: 'Actions', columns: [['ref', 'Ref'], ['phase', 'Stage'], ['phaseTitle', 'Stage title'], ['window', 'Proposed planning window'], ['action', 'Action'], ['ownerRole', 'Owner'], ['deliverable', 'Deliverable'], ['completionTest', 'Complete when'], ['dependsOn', 'After'], ['controlRefs', 'Controls'], ['schemeRefs', 'Scenarios']], rows: r.actions },
    { name: 'Measures', columns: [['ref', 'Ref'], ['measure', 'Measure'], ['cycle', 'Cycle'], ['controlRefs', 'Control'], ['ownerRole', 'Owner']], rows: r.measures },
    { name: 'Decisions', columns: [['ref', 'Ref'], ['decision', 'Decision'], ['why', 'Why'], ['recommendedDirection', 'Recommended direction'], ['ownerRole', 'Owner'], ['when', 'When'], ['consequenceOfDelay', 'If delayed'], ['schemeRefs', 'Scenarios']], rows: r.decisions },
    { name: 'Relationships', columns: [['schemeRef', 'Scenario'], ['confirmationName', 'Control reported in place'], ['confirmationReported', 'Its answer'], ['practiceName', 'Related practice'], ['practiceReported', 'Its answer'], ['label', 'Relationship'], ['type', 'Type (technical)'], ['basis', 'Basis'], ['statement', 'What it means'], ['question', 'Question to clarify'], ['rationale', 'Rationale'], ['confirmation', 'Control (technical)'], ['practice', 'Practice (technical)']], rows: r.relations },
    { name: 'Outstanding', columns: [['ref', 'Ref'], ['key', 'Control'], ['reasonText', 'Status'], ['fn', 'Function'], ['declineReason', 'Reason given'], ['schemeRef', 'Scenario'], ['question', 'Question'], ['id', 'Method question (technical)']], rows: r.outstanding },
    { name: 'Sufficiency', columns: [['product', 'Product'], ['deliverable', 'Deliverable'], ['promise', 'Promise'], ['id', 'Condition'], ['kind', 'Kind'], ['text', 'Condition text'], ['met', 'Met'], ['detail', 'Detail']],
      rows: r.sufficiency.deliverables.flatMap((d) => d.conditions.map((c) => ({ product: d.product, deliverable: d.id, promise: d.promise, ...c, met: c.met ? 'Yes' : 'No' }))) },
    { name: 'Roles', columns: [['role', 'Role in report'], ['methodLabels', 'Method wording']], rows: r.roles },
    { name: 'Content gaps', columns: [['ref', 'Control'], ['key', 'Name'], ['gaps', 'Where the method is not specific enough'], ['id', 'Method question (technical)']],
      rows: r.contentGaps.map((g) => ({ ...g, gaps: g.gaps.map((x) => CONTENT_GAP_TEXT[x]) })) },
    { name: 'Traceability', columns: [['controlRef', 'Control'], ['id', 'Method question'], ['format', 'Response format'], ['question', 'Question asked'], ['answer', 'Answer given'], ['by', 'Answered by']],
      rows: r.controls.map((c) => ({ controlRef: c.ref, id: c.id, format: bankQuestion(c.id)?.format ?? '', question: c.questionText, answer: c.answerLabel, by: c.answeredBy })) }
  ];
  const counts: Record<string, number> = { Scenarios: r.schemes.length, Findings: r.findings.length, Risks: r.risks.length, Controls: r.controls.length, Records: r.records.length, Actions: r.actions.length, Measures: r.measures.length, Decisions: r.decisions.length, Relationships: r.relations.length, Outstanding: r.outstanding.length, Roles: r.roles.length };
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
