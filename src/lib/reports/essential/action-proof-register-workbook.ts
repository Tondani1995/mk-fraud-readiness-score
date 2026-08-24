import crypto from 'node:crypto';
import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel } from '../evidence-model';
import type { EssentialProjection } from '../essential-projection';
import { MK_TOKENS } from '../design/tokens';
import {
  buildEssentialActionProofRegisterProjection,
  ESSENTIAL_ACTION_REGISTER_HEADERS,
  ESSENTIAL_ACTION_REGISTER_MIME_TYPE,
  ESSENTIAL_ACTION_REGISTER_SHEET_NAME,
  ESSENTIAL_ACTION_REGISTER_STATUS_VALUES,
  ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME,
  type EssentialActionProofRegisterProjection,
  type EssentialActionProofRegisterRow
} from './action-proof-register';

export interface EssentialActionProofRegisterWorkbook {
  bytes: Buffer;
  checksumSha256: string;
  fileName: string;
  mimeType: string;
  sheetNames: string[];
  rowCounts: Record<string, number>;
}
type SummaryRow = { field: string; value: string; note: string };

const VISIBLE_ROW_KEYS = [
  'priorityId',
  'priorityTitle',
  'domain',
  'assessedCondition',
  'priorityRationale',
  'managementAction',
  'accountableRole',
  'targetPeriod',
  'requiredPopulation',
  'evidenceToRetain',
  'completionEffectivenessTest',
  'escalationTrigger',
  'status',
  'managementNotes'
] as const;

function value(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function humanScore(valueToRender: number | null): string {
  return valueToRender === null || valueToRender === undefined ? 'Not scored' : Number(valueToRender).toFixed(2);
}

function summaryRows(projection: EssentialActionProofRegisterProjection): SummaryRow[] {
  const periods = (period: string) => projection.rows.filter((row) => row.targetPeriod === period).length;
  return [
    { field: 'Product', value: projection.productLabel, note: 'Focused customer action and proof companion.' },
    { field: 'Organisation', value: projection.organisationName, note: 'Sourced from the same assembled assessment as the PDF.' },
    { field: 'Assessment reference', value: projection.assessmentReference, note: 'Frozen assessment trace reference; not a customer-facing finding ID.' },
    { field: 'Report reference', value: projection.reportReference, note: 'Tier-correct Essential report version released with the PDF.' },
    { field: 'Reported readiness', value: humanScore(projection.score), note: 'Recorded score; this workbook does not recalculate it.' },
    { field: 'Final maturity', value: projection.maturity, note: 'Recorded maturity; this workbook does not change methodology.' },
    { field: 'Priority action rows', value: String(projection.rows.length), note: 'Focused 30/60/90 subset only.' },
    { field: '30-day actions', value: String(periods('30 days')), note: 'Ownership, stabilisation and first implementation foundations.' },
    { field: '60-day actions', value: String(periods('60 days')), note: 'Implementation actions and operating proof.' },
    { field: '90-day actions', value: String(periods('90 days')), note: 'Effectiveness, monitoring and sustained operation.' },
    { field: 'Package promise', value: 'Focused Action & Proof Register', note: 'The PDF and workbook use the same customer promise.' },
    { field: 'Status guidance', value: ESSENTIAL_ACTION_REGISTER_STATUS_VALUES.join(' · '), note: 'Use Status and Management notes for follow-up; status is not an assurance conclusion.' },
    { field: 'Assessment basis', value: "Management's recorded Fraud Readiness self-assessment responses", note: 'No document, interview or transaction sample was independently verified.' }
  ];
}

function columnWidth(key: string): number {
  switch (key) {
    case 'priorityId': return 12;
    case 'priorityTitle': return 34;
    case 'domain': return 30;
    case 'accountableRole': return 28;
    case 'targetPeriod': return 16;
    case 'status': return 16;
    case 'managementNotes': return 30;
    case 'assessedCondition':
    case 'priorityRationale':
    case 'managementAction':
    case 'requiredPopulation':
    case 'evidenceToRetain':
    case 'completionEffectivenessTest':
    case 'escalationTrigger': return 68;
    default: return 34;
  }
}

function rowHeight(row: Record<string, unknown>, keys: readonly string[]): number {
  const estimatedLines = keys.reduce((max, key) => {
    const text = value(row[key]);
    if (!text) return max;
    return Math.max(max, Math.ceil(text.length / Math.max(14, columnWidth(key) * 1.1)));
  }, 1);
  return Math.min(120, Math.max(24, 10 + estimatedLines * 13));
}

function excelColumnName(index: number): string {
  let number = index + 1;
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}

function xmlEscape(valueToEscape: string): string {
  return valueToEscape
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Adds workbook-level filtering and a controlled Status list without introducing formulas. */
function worksheetFeatures(
  sheets: Array<{ columns: string[]; rowCount: number; statusColumn?: string }>
): unknown {
  return {
    files: {
      transform: {
        'xl/worksheets/sheet{id}.xml': {
          transform(content: string, _options: unknown, properties: { sheetIndex: number }) {
            const sheet = sheets[properties.sheetIndex];
            if (!sheet || sheet.columns.length === 0) return content;
            const lastColumn = excelColumnName(sheet.columns.length - 1);
            const lastRow = sheet.rowCount + 1;
            const filter = `<autoFilter ref="A1:${lastColumn}${lastRow}"/>`;
            const validation = sheet.statusColumn
              ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="${xmlEscape(sheet.statusColumn)}2:${xmlEscape(sheet.statusColumn)}${lastRow}"><formula1>\"${ESSENTIAL_ACTION_REGISTER_STATUS_VALUES.join(',')}\"</formula1></dataValidation></dataValidations>`
              : '';
            return content.replace('</sheetData>', `</sheetData>${filter}${validation}`);
          }
        }
      }
    }
  };
}

function registerRows(projection: EssentialActionProofRegisterProjection): Array<Record<string, string>> {
  return projection.rows.map((row) => ({
    priorityId: row.priorityId,
    priorityTitle: row.priorityTitle,
    domain: row.domain,
    assessedCondition: row.assessedCondition,
    priorityRationale: row.priorityRationale,
    managementAction: row.managementAction,
    accountableRole: row.accountableRole,
    targetPeriod: row.targetPeriod,
    requiredPopulation: row.requiredPopulation,
    evidenceToRetain: row.evidenceToRetain,
    completionEffectivenessTest: row.completionEffectivenessTest,
    escalationTrigger: row.escalationTrigger,
    status: row.status,
    managementNotes: row.managementNotes
  }));
}

export async function buildEssentialActionProofRegisterWorkbook(
  data: AssembledReportData,
  model: AdvisoryEvidenceModel,
  projection: EssentialProjection
): Promise<EssentialActionProofRegisterWorkbook> {
  const canonical = buildEssentialActionProofRegisterProjection({ data, model, projection });
  const summary = summaryRows(canonical);
  const rows = registerRows(canonical);
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/node');

  const summaryColumns = ['field', 'value', 'note'];
  const sheetShapes = [
    { name: ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME, columns: summaryColumns, rowCount: summary.length },
    { name: ESSENTIAL_ACTION_REGISTER_SHEET_NAME, columns: [...VISIBLE_ROW_KEYS], rowCount: rows.length, statusColumn: 'M' }
  ];
  const workbook = await (writeXlsxFile as any)([
    {
      sheet: ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME,
      data: (getSheetData as any)(summary, summaryColumns.map((key) => ({
        header: {
          value: key === 'field' ? 'Field' : key === 'value' ? 'Value' : 'Note',
          fontWeight: 'bold',
          textColor: MK_TOKENS.white,
          backgroundColor: MK_TOKENS.navy900,
          wrap: true,
          alignVertical: 'center',
          height: 32
        },
        cell: (row: SummaryRow) => ({
          value: row[key as keyof SummaryRow],
          wrap: true,
          alignVertical: 'top',
          height: rowHeight(row as unknown as Record<string, unknown>, summaryColumns)
        })
      }))),
      columns: summaryColumns.map((key) => ({ width: key === 'field' ? 28 : key === 'value' ? 58 : 58 })),
      stickyRowsCount: 1,
      stickyColumnsCount: 1,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 90
    },
    {
      sheet: ESSENTIAL_ACTION_REGISTER_SHEET_NAME,
      data: (getSheetData as any)(rows, VISIBLE_ROW_KEYS.map((key, index) => ({
        header: {
          value: ESSENTIAL_ACTION_REGISTER_HEADERS[index],
          fontWeight: 'bold',
          textColor: MK_TOKENS.white,
          backgroundColor: MK_TOKENS.navy900,
          wrap: true,
          alignVertical: 'center',
          height: 40
        },
        cell: (row: EssentialActionProofRegisterRow) => ({
          value: value(row[key as keyof EssentialActionProofRegisterRow]),
          wrap: true,
          alignVertical: 'top',
          height: rowHeight(row as unknown as Record<string, unknown>, VISIBLE_ROW_KEYS)
        })
      }))),
      columns: VISIBLE_ROW_KEYS.map((key) => ({ width: columnWidth(key) })),
      stickyRowsCount: 1,
      stickyColumnsCount: 2,
      showGridLines: false,
      orientation: 'landscape',
      zoomScale: 80
    }
  ], { features: [worksheetFeatures(sheetShapes)] });

  const bytes = Buffer.from(await workbook.toBuffer());
  const rowCounts = {
    [ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME]: summary.length,
    [ESSENTIAL_ACTION_REGISTER_SHEET_NAME]: rows.length
  };
  return {
    bytes,
    checksumSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    fileName: canonical.registerFileName,
    mimeType: ESSENTIAL_ACTION_REGISTER_MIME_TYPE,
    sheetNames: sheetShapes.map((sheet) => sheet.name),
    rowCounts
  };
}
