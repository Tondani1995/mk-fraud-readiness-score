import crypto from 'node:crypto';
import type { AssembledReportData } from './types';
import type { AdvisoryEvidenceModel } from './evidence-model';
import { buildControlActionRecords, type EssentialProjection } from './essential-projection';

/**
 * L3 supporting register workbook.
 *
 * Generated from the complete authoritative L1 evidence model only -- never from the bounded L2
 * projection -- so the workbook always carries the entire analytical universe, not merely the
 * items L2 omitted. The bounded report links to it, which is what makes invariant I3 honest.
 *
 * Generation uses write-excel-file (node entry point, single transitive dependency `fflate`).
 * OOXML is not hand-written: the repository has no XLSX reader either, so a hand-rolled writer
 * could not have been validated against two independent parsers without adding two dependencies.
 *
 * Byte-identical reproduction across independent generations is deliberately NOT claimed --
 * the format embeds no timestamps we control end to end. What is guaranteed, and what the
 * integrity contract actually requires, is that SHA-256 is computed over the exact bytes that
 * are uploaded, re-verified after upload, persisted on report_artifacts.checksum_sha256, and
 * re-verified again on every customer download.
 */

export const SUPPORTING_REGISTER_ARTEFACT_TYPE = 'supporting_register';
export const SUPPORTING_REGISTER_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const SUPPORTING_REGISTER_SHEETS = [
  'Findings',
  'Risks',
  'Control Actions',
  'Evidence Checklist',
  'Roadmap',
  'Functional Agenda',
  'Question Trace'
] as const;

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('; ');
  return String(value)
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validate');
}

/** v4 Column contract: { header, cell } -- NOT the v3 { column, value } shape. */
type Column<T> = { header: string; cell: (row: T) => string | number | null };

function stringColumn<T>(header: string, read: (row: T) => unknown): Column<T> {
  return { header, cell: (row) => text(read(row)) };
}

/** Technical identifiers are retained verbatim in dedicated traceability columns. */
function technicalStringColumn<T>(header: string, read: (row: T) => unknown): Column<T> {
  return { header, cell: (row) => {
    const value = read(row);
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('; ');
    return String(value);
  } };
}

/** Row builders. Each sheet is a flat projection of one complete L1 collection. */
export function supportingRegisterSheetData(
  data: AssembledReportData,
  model: AdvisoryEvidenceModel
) {
  const controlActionRecords = buildControlActionRecords(model);

  const findings = model.materialFindings;
  const findingsSchema: Column<(typeof findings)[number]>[] = [
    technicalStringColumn('Finding ID', (row) => row.id),
    technicalStringColumn('Question code', (row) => row.questionCode),
    technicalStringColumn('Domain code', (row) => row.domainCode),
    stringColumn('Domain', (row) => row.domainName),
    stringColumn('Control statement', (row) => row.questionPrompt),
    stringColumn('Recorded response', (row) => row.responseMeaning),
    stringColumn('Materiality class', (row) => row.materialityClass),
    { header: 'Materiality score', cell: (row) => row.materialityScore },
    stringColumn('Critical control', (row) => row.isCriticalControl),
    stringColumn('Hard gate', (row) => row.isHardGate),
    stringColumn('Gap classification', (row) => row.gapClassification),
    stringColumn('Selection reasons', (row) => row.selectionReasons),
    stringColumn('Diagnosis', (row) => row.diagnosis),
    stringColumn('Why it matters', (row) => row.whyItMatters),
    stringColumn('Expected control standard', (row) => row.expectedControlStandard),
    stringColumn('Recommended control', (row) => row.recommendedControl),
    stringColumn('Accountable owner', (row) => row.accountableOwner),
    stringColumn('Target period', (row) => row.targetPeriod)
  ];

  const risks = model.riskRegister;
  const risksSchema: Column<(typeof risks)[number]>[] = [
    technicalStringColumn('Risk ID', (row) => row.id),
    stringColumn('Title', (row) => row.title),
    stringColumn('Priority', (row) => row.priority),
    stringColumn('Likelihood', (row) => row.likelihood),
    stringColumn('Impact', (row) => row.impact),
    stringColumn('Cause', (row) => row.cause),
    stringColumn('Risk event', (row) => row.riskEvent),
    stringColumn('Current control position', (row) => row.currentControlPosition),
    stringColumn('Required treatment', (row) => row.requiredTreatment),
    technicalStringColumn('Linked findings', (row) => row.linkedFindingIds),
    technicalStringColumn('Linked question codes', (row) => row.linkedQuestionCodes),
    technicalStringColumn('Affected domains', (row) => row.affectedDomains),
    stringColumn('Accountable executive', (row) => row.accountableExecutive)
  ];

  const carsSchema: Column<(typeof controlActionRecords)[number]>[] = [
    technicalStringColumn('Control action ID', (row) => row.id),
    technicalStringColumn('Primary question code', (row) => row.primaryQuestionCode),
    technicalStringColumn('Contributing question codes', (row) => row.contributingQuestionCodes),
    stringColumn('Domain', (row) => row.domainName),
    stringColumn('Current state', (row) => row.currentState),
    stringColumn('Expected standard', (row) => row.expectedStandard),
    stringColumn('Control objective', (row) => row.controlObjective),
    stringColumn('Control design', (row) => row.controlDesign),
    stringColumn('Accountable owner', (row) => row.accountableOwner),
    stringColumn('Process owner', (row) => row.processOwner),
    stringColumn('Oversight function', (row) => row.oversightFunction),
    stringColumn('Target period', (row) => row.targetPeriod),
    stringColumn('Escalation threshold', (row) => row.escalationThreshold),
    technicalStringColumn('Linked findings', (row) => row.linkedFindingIds),
    technicalStringColumn('Linked risks', (row) => row.linkedRiskIds),
    technicalStringColumn('Linked roadmap actions', (row) => row.linkedRoadmapActionIds),
    stringColumn('Aggregated', (row) => row.aggregated)
  ];

  const controls = model.controlImprovements;
  const controlsSchema: Column<(typeof controls)[number]>[] = [
    technicalStringColumn('Control improvement ID', (row) => row.id),
    technicalStringColumn('Linked finding', (row) => row.linkedFindingId),
    technicalStringColumn('Linked question code', (row) => row.linkedQuestionCode),
    stringColumn('Control objective', (row) => row.controlObjective),
    stringColumn('Current state', (row) => row.currentState),
    stringColumn('Target state', (row) => row.targetState),
    stringColumn('Control design', (row) => row.controlDesign),
    stringColumn('Accountable executive', (row) => row.accountableExecutive),
    technicalStringColumn('Linked risks', (row) => row.linkedRiskIds)
  ];

  const evidence = model.evidenceChecklist;
  const evidenceSchema: Column<(typeof evidence)[number]>[] = [
    technicalStringColumn('Evidence ID', (row) => row.id),
    stringColumn('Artefact', (row) => row.artefact),
    stringColumn('What it proves', (row) => row.provesWhat),
    stringColumn('Likely owner', (row) => row.likelyOwner),
    stringColumn('Expected recency', (row) => row.expectedRecency),
    stringColumn('Minimum acceptable characteristics', (row) => row.minimumAcceptableCharacteristics),
    technicalStringColumn('Linked findings', (row) => row.linkedFindingIds),
    technicalStringColumn('Linked risks', (row) => row.linkedRiskIds),
    technicalStringColumn('Linked question codes', (row) => row.linkedQuestionCodes)
  ];

  const roadmap = model.roadmapActions;
  const roadmapSchema: Column<(typeof roadmap)[number]>[] = [
    technicalStringColumn('Action ID', (row) => row.id),
    stringColumn('Period', (row) => row.period),
    stringColumn('Domain', (row) => row.domainName),
    stringColumn('Deliverable', (row) => row.deliverable),
    stringColumn('Accountable executive', (row) => row.accountableExecutive),
    stringColumn('Process owner', (row) => row.processOwner),
    stringColumn('Oversight function', (row) => row.oversightFunction),
    technicalStringColumn('Dependencies', (row) => row.dependencyIds),
    technicalStringColumn('Linked findings', (row) => row.linkedFindingIds),
    technicalStringColumn('Linked risks', (row) => row.linkedRiskIds),
    stringColumn('Success measure', (row) => row.successMeasure),
    stringColumn('Evidence of completion', (row) => row.evidenceOfCompletion)
  ];

  const agenda = model.functionalAgenda;
  const agendaSchema: Column<(typeof agenda)[number]>[] = [
    technicalStringColumn('Agenda ID', (row) => row.id),
    stringColumn('Function', (row) => row.function),
    stringColumn('Question for the review', (row) => row.question),
    technicalStringColumn('Linked finding', (row) => row.linkedFindingId)
  ];

  const traces = data.questionTraces;
  const tracesSchema: Column<(typeof traces)[number]>[] = [
    technicalStringColumn('Question code', (row) => row.questionCode),
    technicalStringColumn('Domain code', (row) => row.domainCode),
    stringColumn('Domain', (row) => row.domainName),
    stringColumn('Control statement', (row) => row.prompt),
    { header: 'Recorded response', cell: (row) => row.responseValue },
    { header: 'Normalised score', cell: (row) => row.normalisedScore },
    stringColumn('Applicable', (row) => row.applicable),
    stringColumn('Critical control', (row) => row.isCritical),
    stringColumn('Hard gate', (row) => row.isHardGate),
    stringColumn('Critical gap', (row) => row.isCriticalGap),
    stringColumn('Major gap', (row) => row.isMajorGap),
    stringColumn('Triggered rules', (row) => row.triggeredRules)
  ];

  return {
    sheets: [...SUPPORTING_REGISTER_SHEETS],
    data: [findings, risks, controlActionRecords, evidence, roadmap, agenda, traces],
    schemas: [findingsSchema, risksSchema, carsSchema, evidenceSchema, roadmapSchema, agendaSchema, tracesSchema],
    /** Control improvements ship as extra columns on the Control Actions sheet's source model. */
    controlImprovements: { rows: controls, schema: controlsSchema }
  };
}

export interface SupportingRegisterWorkbook {
  bytes: Buffer;
  checksumSha256: string;
  fileName: string;
  mimeType: string;
  rowCounts: Record<string, number>;
}

export async function buildSupportingRegisterWorkbook(
  data: AssembledReportData,
  model: AdvisoryEvidenceModel,
  projection: EssentialProjection
): Promise<SupportingRegisterWorkbook> {
  const built = supportingRegisterSheetData(data, model);
  // Control improvements are a required L3 collection in their own right; give them a sheet so
  // the workbook reconciles against every authoritative L1 count.
  const sheets = [...built.sheets, 'Control Improvements'];
  const rows = [...built.data, built.controlImprovements.rows];
  const schemas = [...built.schemas, built.controlImprovements.schema];

  // write-excel-file v4 multi-sheet contract: an array of Sheet objects, each carrying its own
  // `sheet` name and `data` produced by getSheetData(objects, columns). The v3 shape
  // (writeXlsxFile([d1, d2], { schema, sheets })) is silently accepted by v4 and emits a single
  // 2-row sheet with no error -- which is exactly why the L3 gate parses the artefact, never the
  // generator inputs.
  const { default: writeXlsxFile, getSheetData } = await import('write-excel-file/node');
  const workbook = await (writeXlsxFile as any)(
    sheets.map((sheet, index) => ({
      sheet,
      data: (getSheetData as any)(rows[index], schemas[index])
    }))
  );
  const bytes: Buffer = Buffer.from(await workbook.toBuffer());

  const rowCounts: Record<string, number> = {};
  sheets.forEach((sheet, index) => {
    rowCounts[sheet] = rows[index].length;
  });
  // Universe counts are asserted by the caller against the authoritative model; recorded here so
  // a failure is diagnosable from the artefact itself.
  rowCounts.__universeControlActionRecords = projection.universe.controlActionRecords;

  return {
    bytes,
    checksumSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    fileName: `${data.reportReference}-supporting-register.xlsx`,
    mimeType: SUPPORTING_REGISTER_MIME_TYPE,
    rowCounts
  };
}
