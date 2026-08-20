import crypto from 'node:crypto';
import type { ComprehensiveDeliveryModel } from './types';
import { buildComprehensiveRegisterSheets } from './register';

const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const COMPREHENSIVE_SUMMARY_SHEET = 'Summary';
export const COMPREHENSIVE_READ_ME_SHEET = 'Read me';

function cell(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function humanDate(value: unknown): string { const raw = String(value ?? '').trim(); if (!raw) return ''; const date = new Date(raw); return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function friendlyHeader(column: string): string { return column.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(?:id|technical id)$/i, 'Technical ID').replace(/^question code$/i, 'Question code (technical)').replace(/^source refs$/i, 'Source references (technical)').replace(/^proof ref$/i, 'Proof reference (technical)').replace(/^linked (finding|risk|control) ids?$/i, 'Linked $1 IDs (technical)').replace(/^./, (letter) => letter.toUpperCase()); }
function technicalColumn(column: string): boolean { return /(^id$|technicalId|questionCode|sourceRefs|proofRef|linked(?:Finding|Risk|Control)Ids?)/i.test(column); }
function orderedColumns(columns: string[]): string[] { return [...columns].sort((a, b) => Number(technicalColumn(a)) - Number(technicalColumn(b))); }

function summaryRows(model: ComprehensiveDeliveryModel): Array<Record<string, string>> {
  return [
    { field: 'Organisation', value: cell(model.analytical.organisationName), note: '' },
    { field: 'Assessment reference', value: cell(model.analytical.assessmentReference), note: 'Technical reference retained for traceability.' },
    { field: 'Assessment basis', value: "Management's recorded Fraud Readiness assessment responses", note: 'The automated Comprehensive product does not require customer evidence upload or human approval records.' },
    { field: 'Deterministic readiness', value: cell(model.analytical.score.overallScore), note: 'Recorded score; narrative does not change it.' },
    { field: 'Final maturity', value: cell(model.analytical.score.finalMaturity), note: '' },
    { field: 'Exposure position', value: `${cell(model.analytical.score.exposureScore)} · ${cell(model.analytical.score.exposureBand)}`, note: '' },
    { field: 'Material findings', value: cell(model.findings.length), note: 'Diagnosis.' },
    { field: 'Target control blueprints', value: cell(model.controlImprovements.length), note: 'Design.' },
    { field: 'Leadership decisions', value: cell(model.leadershipDecisions.length), note: 'Design.' },
    { field: 'Proof requirements', value: cell(model.proofRequirements.length), note: 'Implementation requirements, not assurance states.' },
    { field: 'Methodology version', value: cell(model.analytical.score.methodologyVersionId), note: 'Technical traceability.' },
    { field: 'Generated', value: humanDate(model.analytical.generatedAt), note: 'DD MMM YYYY.' }
  ];
}

function readMeRows(model: ComprehensiveDeliveryModel): Array<Record<string, string>> {
  return [
    { field: 'Workbook purpose', value: 'Comprehensive Fraud Readiness Strategy and Control Blueprint', note: 'Use the workbook to understand, decide, build and monitor.' },
    { field: 'Customer basis', value: "This report provides strategic fraud-risk analysis and control design based on management's recorded Fraud Readiness assessment responses.", note: 'It does not independently verify operating effectiveness.' },
    { field: 'Analytical boundary', value: 'The deterministic engine decides; bounded narrative explains the recorded result.', note: 'No identity or sign-off record is required for generation.' },
    { field: 'How to read', value: 'Start with Summary, then Findings and Risks, then Control Blueprints, Decisions and the Implementation Blueprint.', note: 'Technical IDs and question codes support traceability.' },
    { field: 'Implementation blueprint', value: 'The Implementation Blueprint combines sequenced roadmap work with the proof management should retain while building and monitoring controls.', note: 'It is an implementation register, not an upload workflow.' },
    { field: 'Control completeness', value: 'What; Who; Population; Frequency; Proof retained; Independent check; Escalation trigger / recipient; SLA; Effectiveness measure; Failure response.', note: 'Use these fields to close design gaps.' }
  ];
}

export interface ComprehensiveRegisterWorkbook { bytes: Buffer; checksumSha256: string; mimeType: string; sheetNames: string[]; rowCounts: Record<string, number>; }

export async function buildComprehensiveRegisterWorkbook(model: ComprehensiveDeliveryModel): Promise<ComprehensiveRegisterWorkbook> {
  const registerSheets = buildComprehensiveRegisterSheets(model);
  const sheets = [
    { name: COMPREHENSIVE_READ_ME_SHEET, rows: readMeRows(model), columns: ['field', 'value', 'note'] },
    { name: COMPREHENSIVE_SUMMARY_SHEET, rows: summaryRows(model), columns: ['field', 'value', 'note'] },
    ...registerSheets
  ];
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/node');
  const workbook = await (writeXlsxFile as any)(sheets.map((sheet) => ({
    sheet: sheet.name,
    data: (getSheetData as any)(sheet.rows, orderedColumns(sheet.columns).map((column) => ({ header: friendlyHeader(column), cell: (row: Record<string, unknown>) => cell(row[column]) })))
  })));
  const bytes = Buffer.from(await workbook.toBuffer());
  const rowCounts: Record<string, number> = {};
  for (const sheet of sheets) rowCounts[sheet.name] = sheet.rows.length;
  return { bytes, checksumSha256: crypto.createHash('sha256').update(bytes).digest('hex'), mimeType: MIME_TYPE, sheetNames: sheets.map((sheet) => sheet.name), rowCounts };
}

export async function buildComprehensiveRegisterWorkbookBytes(model: ComprehensiveDeliveryModel): Promise<Buffer> { return (await buildComprehensiveRegisterWorkbook(model)).bytes; }
