import crypto from 'node:crypto';
import type { ComprehensiveDeliveryModel } from './types';
import { buildComprehensiveRegisterSheets } from './register';

const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const COMPREHENSIVE_REGISTER_WORKBOOK_MIME_TYPE = MIME_TYPE;
export const COMPREHENSIVE_SUMMARY_SHEET = 'Summary';
export const COMPREHENSIVE_READ_ME_SHEET = 'Read me';

export interface ComprehensiveWorkbookBinding {
  orderReference?: string;
  reportReference?: string;
  versionNumber?: number;
}

function cell(value: unknown): string { return value === null || value === undefined ? '' : String(value); }
function humanDate(value: unknown): string { const raw = String(value ?? '').trim(); if (!raw) return ''; const date = new Date(raw); return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function friendlyHeader(column: string): string { return column.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(?:id|technical id)$/i, 'Technical ID').replace(/^question code$/i, 'Question code (technical)').replace(/^source refs$/i, 'Source references (technical)').replace(/^proof ref$/i, 'Proof reference (technical)').replace(/^linked (finding|risk|control) ids?$/i, 'Linked $1 IDs (technical)').replace(/^./, (letter) => letter.toUpperCase()); }
function technicalColumn(column: string): boolean { return /(^id$|technicalId|questionCode|sourceRefs|proofRef|linked(?:Finding|Risk|Control)Ids?)/i.test(column); }
function orderedColumns(columns: string[]): string[] { return [...columns].sort((a, b) => Number(technicalColumn(a)) - Number(technicalColumn(b))); }

function columnWidth(column: string): number {
  if (/^(id|technicalId|questionCode|proofRef|sourceRefs|linked.*Ids?|evidenceRef)$/i.test(column)) return 22;
  if (/^(field|recordType|period|priority|likelihood|impact|materiality|status|applicable|normalisedScore|score|points|count|targetPeriod)$/i.test(column)) return 16;
  if (/^(title|domain|scenarioType|pattern|factor|selectedValue|owner|accountable|processOwner|oversightFunction)$/i.test(column)) return 30;
  if (/^(prompt|recordedResponse|diagnosis|statement|riskStatement|cause|riskEvent|controlDesign|controlObjective|targetState|currentState|operationalMeaning|falseComfortRisk|leadershipVerification|requirement|deliverable|proofOrCompletion|acceptableExamples|optionAnalysis|whyItMatters|fraudMechanism|interruptionControl|progression|concealment|recordedPosition|keyStrengthOrWeakness|dependencyOrContradiction|operatingContext|managementAttention|selectionReason)$/i.test(column)) return 58;
  return 34;
}

function rowHeight(row: Record<string, unknown>, columns: string[]): number {
  const lines = columns.reduce((max, column) => {
    const value = cell(row[column]);
    if (!value) return max;
    const width = columnWidth(column);
    return Math.max(max, Math.ceil(value.length / Math.max(12, width * 1.15)));
  }, 1);
  return Math.min(120, Math.max(22, 8 + lines * 13));
}

function excelColumnName(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function autoFilterFeature(sheets: Array<{ rows: Array<Record<string, unknown>>; columns: string[] }>): unknown {
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          transform(content: string, _options: unknown, properties: { sheetIndex: number }) {
            const sheet = sheets[properties.sheetIndex];
            if (!sheet || content.includes('<autoFilter ') || sheet.columns.length === 0) return content;
            const ref = `A1:${excelColumnName(sheet.columns.length - 1)}${sheet.rows.length + 1}`;
            return content.replace('</sheetData>', `</sheetData><autoFilter ref="${ref}"/>`);
          }
        }
      }
    }
  };
}

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

function readMeRows(model: ComprehensiveDeliveryModel, binding: ComprehensiveWorkbookBinding = {}): Array<Record<string, string>> {
  return [
    { field: 'Workbook purpose', value: 'Comprehensive Fraud Readiness Strategy and Control Blueprint', note: 'Use the workbook to understand, decide, build and monitor.' },
    { field: 'Product', value: 'Comprehensive', note: 'Automated analytical product; no human review or sign-off is part of this package.' },
    { field: 'Order binding', value: cell(binding.orderReference), note: 'The order reference above provides traceability to the exact customer order.' },
    { field: 'Report binding', value: cell(binding.reportReference), note: 'The report reference and version above identify the exact report version released with the PDF.' },
    { field: 'Report version', value: binding.versionNumber === undefined ? '' : String(binding.versionNumber), note: 'Exact version released with the Comprehensive PDF.' },
    { field: 'Customer basis', value: "This report provides strategic fraud-risk analysis and control design based on management's recorded Fraud Readiness assessment responses.", note: 'It does not independently verify operating effectiveness.' },
    { field: 'Analytical boundary', value: 'The deterministic engine decides; bounded narrative explains the recorded result.', note: 'No identity or sign-off record is required for generation.' },
    { field: 'How to read', value: 'Start with Summary, then Findings and Risks, then Control Blueprints, Decisions and the Implementation Blueprint.', note: 'Technical IDs and question codes support traceability.' },
    { field: 'Implementation blueprint', value: 'The Implementation Blueprint combines sequenced roadmap work with the proof management should retain while building and monitoring controls.', note: 'It is an implementation register, not an upload workflow.' },
    { field: 'Control completeness', value: 'What; Who; Population; Frequency; Proof retained; Independent check; Escalation trigger / recipient; SLA; Effectiveness measure; Failure response.', note: 'Use these fields to close design gaps.' }
  ];
}

export interface ComprehensiveRegisterWorkbook { bytes: Buffer; checksumSha256: string; mimeType: string; fileName: string; sheetNames: string[]; rowCounts: Record<string, number>; }

export async function buildComprehensiveRegisterWorkbook(model: ComprehensiveDeliveryModel, binding: ComprehensiveWorkbookBinding = {}): Promise<ComprehensiveRegisterWorkbook> {
  const registerSheets = buildComprehensiveRegisterSheets(model);
  const sheets = [
    { name: COMPREHENSIVE_READ_ME_SHEET, rows: readMeRows(model, binding), columns: ['field', 'value', 'note'] },
    { name: COMPREHENSIVE_SUMMARY_SHEET, rows: summaryRows(model), columns: ['field', 'value', 'note'] },
    ...registerSheets
  ];
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/node');
  const sheetShapes = sheets.map((sheet) => ({ rows: sheet.rows, columns: orderedColumns(sheet.columns) }));
  const workbook = await (writeXlsxFile as any)(sheets.map((sheet, index) => {
    const columns = sheetShapes[index]!.columns;
    const rows = sheet.rows as Array<Record<string, unknown>>;
    const dataColumns = columns.map((column) => ({
      header: { value: friendlyHeader(column), fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#17324D', wrap: true, alignVertical: 'center', height: 30 },
      cell: (row: Record<string, unknown>) => ({ value: cell(row[column]), wrap: true, alignVertical: 'top', height: rowHeight(row, columns) })
    }));
    return {
      sheet: sheet.name,
      data: (getSheetData as any)(rows, dataColumns),
      columns: columns.map((column) => ({ width: columnWidth(column) })),
      stickyRowsCount: 1,
      stickyColumnsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 85
    };
  }), { features: [autoFilterFeature(sheetShapes)] });
  const bytes = Buffer.from(await workbook.toBuffer());
  const rowCounts: Record<string, number> = {};
  for (const sheet of sheets) rowCounts[sheet.name] = sheet.rows.length;
  const reference = String(binding.reportReference ?? model.analytical.assessmentReference ?? 'comprehensive')
    .replace(/[^A-Za-z0-9._-]+/g, '_');
  return {
    bytes,
    checksumSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    mimeType: MIME_TYPE,
    fileName: `${reference}-comprehensive-supporting-register.xlsx`,
    sheetNames: sheets.map((sheet) => sheet.name),
    rowCounts
  };
}

export async function buildComprehensiveRegisterWorkbookBytes(model: ComprehensiveDeliveryModel, binding?: ComprehensiveWorkbookBinding): Promise<Buffer> { return (await buildComprehensiveRegisterWorkbook(model, binding)).bytes; }
