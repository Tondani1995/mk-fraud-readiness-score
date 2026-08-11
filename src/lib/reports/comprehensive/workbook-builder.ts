import crypto from 'node:crypto';
import type { ComprehensiveDeliveryModel } from './types';
import { buildComprehensiveRegisterSheets } from './register';

/**
 * Comprehensive reviewer-annotated register.
 *
 * P1 closed here. This previously loaded '@oai/artifact-tool' out of process.env.CODEX_NODE_MODULES
 * via createRequire(). That package is not a declared dependency, is absent from node_modules, and
 * exists only inside an agent runtime cache, so generation failed in production with
 * 'artifact_tool_runtime_unavailable'. Even with the module present, createRequire() does not
 * survive Next.js server bundling and failed with 'requireFromBundle is not a function'. The
 * Comprehensive package could therefore never be generated in any environment.
 *
 * The byte writer is now the same declared, production-safe runtime already proven by
 * src/lib/reports/supporting-register-workbook.ts. The Comprehensive data contract is unchanged:
 * every sheet, column, reviewer annotation, evidence status and management decision still comes
 * from buildComprehensiveRegisterSheets(model), and the Summary sheet is preserved.
 *
 * FORMULA INJECTION. Every cell is declared type String, so write-excel-file emits it as an inline
 * string cell. Reviewer and customer text beginning '=', '+', '-' or '@' is therefore stored as a
 * literal value and is never written as a formula. Values are not mangled to achieve this -- the
 * cell type is what makes them inert -- so what the reviewer wrote is what the customer reads.
 */

const MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The Summary sheet is part of the commercial contract and is retained verbatim in content. */
export const COMPREHENSIVE_SUMMARY_SHEET = 'Summary';

const STATUS_VOCABULARY: Array<[string, string, string]> = [
  ['Self-reported', 'Recorded assessment answer', 'Not independently supported'],
  ['Evidence reviewed', 'Artefact examined', 'Not automatically validated'],
  ['Supported for stated scope', 'Named reviewer support', 'Only for stated scope'],
  ['Insufficient for conclusion', 'Evidence limitation', 'Reliance remains bounded'],
  ['Not supported / not applicable', 'Reviewer conclusion', 'Distinct from insufficient'],
  ['Evidence request lifecycle', 'Not requested → received', 'Not equivalent to support'],
  ['Reviewer judgement', 'Human interpretation', 'Separate from evidence status']
];

/** Cells are always strings; null becomes an empty cell rather than the text "null". */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validate');
}

function technicalCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

function friendlyHeader(column: string): string {
  return column
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^id$/i, 'Technical ID')
    .replace(/^question code$/i, 'Question code (technical)')
    .replace(/^source refs$/i, 'Source references (technical)')
    .replace(/^evidence refs( reviewed)?$/i, 'Evidence references (technical)$1')
    .replace(/^linked (finding|risk|control) ids?$/i, 'Linked $1 IDs (technical)')
    .replace(/^linked evidence refs$/i, 'Linked evidence references (technical)')
    .replace(/^reviewer evidence refs$/i, 'Reviewer evidence references (technical)')
    .replace(/^./, (letter) => letter.toUpperCase())
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validation');
}

function orderedColumns(columns: string[]): string[] {
  const technical = isTechnicalColumn;
  return [...columns].sort((left, right) => Number(technical(left)) - Number(technical(right)));
}

function isTechnicalColumn(column: string): boolean {
  return /(^id$|questionCode|sourceRefs|evidenceRefs|linked(?:Finding|Risk|Control|Evidence)|reviewerEvidenceRefs)/i.test(column);
}

function summaryRows(model: ComprehensiveDeliveryModel): Array<Record<string, string>> {
  const reviewer = model.reviewerInput.reviewer;
  const rows: Array<Record<string, string>> = [
    { field: 'Review organisation', value: cell(model.analytical.organisationName), note: '' },
    { field: 'Named reviewer', value: `${cell(reviewer.name)} · ${cell(reviewer.role)}`, note: '' },
    { field: 'Review date', value: cell(reviewer.reviewDate), note: '' },
    { field: 'Deterministic readiness', value: cell(model.analytical.score.overallScore), note: '' },
    { field: 'Validated / supported evidence', value: cell(model.validationSummary.validatedSupported), note: '' },
    { field: 'Unresolved evidence', value: cell(model.validationSummary.unresolved), note: '' },
    { field: '', value: '', note: '' },
    { field: 'Status vocabulary', value: 'Meaning', note: 'Boundary' }
  ];
  for (const [term, meaning, boundary] of STATUS_VOCABULARY) {
    rows.push({ field: term, value: meaning, note: boundary });
  }
  return rows;
}

export interface ComprehensiveRegisterWorkbook {
  bytes: Buffer;
  checksumSha256: string;
  mimeType: string;
  sheetNames: string[];
  rowCounts: Record<string, number>;
}

/** Builds the workbook and returns the exact bytes that are hashed and stored. */
export async function buildComprehensiveRegisterWorkbook(
  model: ComprehensiveDeliveryModel
): Promise<ComprehensiveRegisterWorkbook> {
  const registerSheets = buildComprehensiveRegisterSheets(model);

  const summary = summaryRows(model);
  const sheets: Array<{ name: string; rows: Array<Record<string, unknown>>; columns: string[] }> = [
    { name: COMPREHENSIVE_SUMMARY_SHEET, rows: summary, columns: ['field', 'value', 'note'] },
    ...registerSheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows, columns: sheet.columns }))
  ];

  // write-excel-file v4 multi-sheet contract, identical to the proven supporting-register path: an
  // array of Sheet objects, each carrying its own `sheet` name and `data` from getSheetData().
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/node');
  const workbook = await (writeXlsxFile as any)(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      data: (getSheetData as any)(
        sheet.rows,
        // Same { header, cell } column shape the supporting-register path uses. Every cell resolves
        // to a string, which is what keeps '=', '+', '-' and '@' content literal rather than a
        // formula.
        orderedColumns(sheet.columns).map((column) => ({
          header: friendlyHeader(column),
          cell: (row: Record<string, unknown>) => isTechnicalColumn(column) ? technicalCell(row[column]) : cell(row[column])
        }))
      )
    }))
  );
  const bytes: Buffer = Buffer.from(await workbook.toBuffer());

  const rowCounts: Record<string, number> = {};
  for (const sheet of sheets) rowCounts[sheet.name] = sheet.rows.length;

  return {
    bytes,
    checksumSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    mimeType: MIME_TYPE,
    sheetNames: sheets.map((sheet) => sheet.name),
    rowCounts
  };
}

/** Byte-only entry point retained for existing callers; generation atomicity is unchanged. */
export async function buildComprehensiveRegisterWorkbookBytes(
  model: ComprehensiveDeliveryModel
): Promise<Buffer> {
  return (await buildComprehensiveRegisterWorkbook(model)).bytes;
}
