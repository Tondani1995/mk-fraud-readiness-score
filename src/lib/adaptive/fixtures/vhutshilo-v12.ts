/**
 * The frozen Vhutshilo V1.2 regression fixture.
 *
 * This is the owner-approved commercial truth set. Every increment on this branch is
 * certified against it, so it exists to be asserted rather than adjusted: if a change
 * moves these numbers, the change is wrong until the owner says otherwise.
 *
 * Two rules govern this file.
 *
 * Gateway answers are stored as the literal option values compiled into the V1.2 graph,
 * never as prose. The owner supplied semantic labels ("Manufacturing / production"); each
 * was resolved against `adaptive-graph-v1-2-candidate.json` and frozen as the option the
 * graph actually carries, with the label retained alongside it purely so a human reading a
 * failure can see what the value means. A prose label that stops matching an option is a
 * defect; a value that stops matching is a broken fixture.
 *
 * The historical V1.1 result is recorded here for one reason only: to keep the parity
 * evidence attached to the fixture it explains. V1.1 is not a target. Nothing in the
 * product may be optimised, certified or released against it.
 */

export const VHUTSHILO_V12_GRAPH_VERSION = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
export const VHUTSHILO_V12_GRAPH_FINGERPRINT =
  '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';
export const VHUTSHILO_V12_METHODOLOGY_VERSION = 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION';

/** How a frozen answer came to be, so a reader never has to guess what is evidence. */
export type FixtureProvenance =
  /** The owner stated this semantic value and it resolved to exactly one graph option. */
  | 'OWNER_APPROVED_RESOLVED_UNIQUELY';

export interface FrozenGatewayAnswer {
  gatewayCode: string;
  /** The graph's own identifier for the gateway. Equal to `gatewayCode` under V1.2. */
  questionId: string;
  /**
   * The literal option value compiled into the graph. This is the fixture. The V1.2 graph
   * carries no opaque option identifier separate from `value`, so this field is the ID.
   */
  optionValue: string;
  /** The option's compiled label, for human-readable failures only. Never matched on. */
  optionLabel: string;
  /** The prompt the respondent answered, so a reader can judge what the value can support. */
  prompt: string;
  provenance: FixtureProvenance;
}

export const VHUTSHILO_V12_GATEWAY_ANSWERS: readonly FrozenGatewayAnswer[] = [
  { gatewayCode: 'G01', questionId: 'G01', optionValue: 'manufacturing_production', optionLabel: 'Manufacturing or production', prompt: 'What best describes your organisation’s main operating environment?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G02', questionId: 'G02', optionValue: 'employees_50_249', optionLabel: '50–249 people', prompt: 'How many people work for the organisation, including regular employees?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G03', questionId: 'G03', optionValue: 'yes', optionLabel: 'Yes', prompt: 'Does the organisation use external suppliers, contractors or service providers?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G04', questionId: 'G04', optionValue: 'external_provider', optionLabel: 'An external service provider', prompt: 'Who is primarily responsible for supplier onboarding and ongoing supplier management?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G05', questionId: 'G05', optionValue: 'dedicated_internal', optionLabel: 'Dedicated internal procurement or sourcing function', prompt: 'Who is primarily responsible for procurement and sourcing?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G06', questionId: 'G06', optionValue: 'yes', optionLabel: 'Yes', prompt: 'Does the organisation handle physical cash as part of normal operations?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G07', questionId: 'G07', optionValue: 'yes', optionLabel: 'Yes', prompt: 'Does the organisation hold or manage stock, inventory or valuable physical assets?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G08', questionId: 'G08', optionValue: 'organisation', optionLabel: 'Our organisation', prompt: 'Who is primarily responsible for delivering payroll?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G09', questionId: 'G09', optionValue: 'none', optionLabel: 'We do not operate customer or user digital channels', prompt: 'Which statement best describes the organisation’s customer or user digital channels?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G10', questionId: 'G10', optionValue: 'no', optionLabel: 'No', prompt: 'Does the organisation accept customer or user payments through card, online, app, portal or other digital channels?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G11', questionId: 'G11', optionValue: 'no', optionLabel: 'No', prompt: 'Does the organisation handle personal or identity information about customers, users, employees or suppliers?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G12', questionId: 'G12', optionValue: 'no', optionLabel: 'No', prompt: 'Can people make manual financial, stock or similar record adjustments?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G13', questionId: 'G13', optionValue: 'yes', optionLabel: 'Yes', prompt: 'Does the organisation operate from more than one site, store or project location?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G14', questionId: 'G14', optionValue: 'yes', optionLabel: 'Yes', prompt: 'Does the organisation use temporary, seasonal or subcontracted workers?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G15', questionId: 'G15', optionValue: 'no', optionLabel: 'No', prompt: 'Can people access systems or organisation data remotely?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G16', questionId: 'G16', optionValue: 'two_or_more', optionLabel: 'Two or more people within the organisation', prompt: 'Which approval arrangement normally applies to higher-risk payments or significant spending?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' },
  { gatewayCode: 'G17', questionId: 'G17', optionValue: 'unknown', optionLabel: "I don't know / cannot confirm", prompt: 'Does the organisation use agents, brokers, distributors or other intermediaries?', provenance: 'OWNER_APPROVED_RESOLVED_UNIQUELY' }
] as const;

/** The shape the adaptive engine consumes: gateway code to literal option value. */
export const VHUTSHILO_V12_GATEWAY_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(VHUTSHILO_V12_GATEWAY_ANSWERS.map((answer) => [answer.gatewayCode, answer.optionValue]))
);

/**
 * The applicability signature the gateway map produces.
 *
 * These four numbers are reproducible today: `resolveAdaptivePath` derives them from the
 * frozen map and the compiled graph alone, with no control responses involved. They are
 * therefore the part of the owner's truth set that the fixture can currently prove.
 */
export const VHUTSHILO_V12_EXPECTED_SCOPE = Object.freeze({
  applicable: 60,
  excluded: 8,
  redirected: 4,
  unknown: 0,
  /** Excluded by gateway routing: no digital channel, no digital payments, no personal data, no remote access, no manual adjustments. */
  excludedQuestionIds: Object.freeze(['D2-Q08', 'D3-Q05', 'D8-Q01', 'D8-Q02', 'D8-Q06', 'D8-Q07', 'D8-Q08', 'D8-Q10']),
  /** Redirected to oversight variants because supplier management sits with an external provider. */
  redirectedQuestionIds: Object.freeze(['D3-Q03', 'D7-Q01', 'D7-Q04', 'D7-Q05'])
});

/**
 * The owner-approved deterministic result, reproduced from the recovered fixture.
 *
 * These values are not asserted from the owner's message; they are recomputed from the
 * recovered response set against the frozen graph on every regression run. If the engine
 * stops producing them, the regression fails rather than the expectation moving.
 */
export const VHUTSHILO_V12_EXPECTED_RESULT = Object.freeze({
  overallScore: 43.33,
  maturity: 'Developing',
  coveragePct: 100,
  criticalGaps: 6,
  majorGaps: 3,
  domains: Object.freeze({
    D1: 42.0, D2: 39.43, D3: 40.54, D4: 40.59, D5: 43.85,
    D6: 60.83, D7: 47.06, D8: 38.18, D9: 56.67, D10: 40.95
  })
});

/** Parity evidence only. Never a target. See `docs/adaptive-assessment/v1-2-score-parity.md`. */
export const VHUTSHILO_V11_HISTORICAL = Object.freeze({
  graphVersion: 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804',
  graphFingerprint: 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab',
  assessmentReference: 'MKFRS-2026-EB1826B2CF',
  scoreRunId: '3d95ca67-b8d3-4088-ba02-44123064bac0',
  inputHash: 'ea3272e54876e6be54b9647343255b1121d94b3a67c33f1f281415b7d91bb80e',
  overallScore: 43.23,
  applicable: 61,
  excluded: 7,
  redirected: 3
});

/**
 * The recovered deterministic source values.
 *
 * Lifted verbatim from the QA comparison route at the commit that produced the accepted
 * 43.33 V1.2 proof, rather than reconstructed. Recovering the original beats reconstructing
 * an equivalent: an owner-rebuilt response vector would be a new artefact asserting the same
 * numbers, whereas this is the artefact that produced them.
 *
 * Per-domain arrays index to `<domain>-Q01..Qnn` in order, matching the original `expand`
 * helper. The three additional D3 entries are the V1.2 controls with no V1.1 ancestor and
 * carry their original explicit values.
 */
export const VHUTSHILO_V12_FIXTURE_RECOVERY = Object.freeze({
  recoveredFromSourceSha: '25261df021df21e2b5f704f5024786abcdf8774f',
  recoveredFromPath: 'src/app/score/api/qa/v12-essential-comparison/[profile]/route.ts',
  recoveredProfileKey: 'vhutshilo',
  assessmentReference: 'MKFRS-V12-COMP-VHUTSHILO',
  reportReference: 'RPT-MKFRS-V12-COMP-VHUTSHILO-V1',
  orderReference: 'MKORD-V12-COMP-VHUTSHILO',
  organisationName: 'Vhutshilo Foods Manufacturing (Pty) Ltd',
  seed: '000000000003'
});

const DOMAIN_SOURCE_VALUES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  D1: [3, 1, 2, 3, 1, 2],
  D2: [3, 1, 2, 3, 1, 2, 2, 2],
  D3: [3, 1, 2, 2, 2, 3, 1],
  D4: [3, 1, 2, 3, 1, 2, 2],
  D5: [3, 1, 2, 3, 1, 2, 2],
  D6: [4, 2, 3, 4, 2, 3],
  D7: [3, 3, 1, 3, 2, 3, 1],
  D8: [2, 2, 3, 1, 2, 2, 2, 2],
  D9: [4, 2, 3, 4, 2, 3],
  D10: [3, 1, 2, 3, 1, 2]
});

/** V1.2 D3 controls with no V1.1 ancestor; explicit in the original fixture. */
const D3_NEW_CONTROL_VALUES: Readonly<Record<string, number>> = Object.freeze({
  'D3-Q09': 2, 'D3-Q10': 2, 'D3-Q11': 2
});

/** Oversight variants substituted where supplier management sits with an external provider. */
export const VHUTSHILO_V12_OVERSIGHT_VALUES: Readonly<Record<string, number>> = Object.freeze({
  'OV-D3-Q03': 2, 'OV-D7-Q01': 3, 'OV-D7-Q04': 3
});

/** Split children inherit their V1.1 parent's recorded response. Not a merge rule. */
export const VHUTSHILO_V12_SPLIT_SOURCE: Readonly<Record<string, string>> = Object.freeze({
  'D1-Q07': 'D1-Q04',
  'D3-Q08': 'D3-Q04',
  'D4-Q08': 'D4-Q05',
  'D8-Q09': 'D8-Q04',
  'D8-Q10': 'D8-Q08'
});

/** The flat question-code to response-value map, expanded exactly as the original did. */
export const VHUTSHILO_V12_SOURCE_VALUES: Readonly<Record<string, number>> = Object.freeze({
  ...Object.fromEntries(
    Object.entries(DOMAIN_SOURCE_VALUES).flatMap(([domain, values]) =>
      values.map((value, index) => [`${domain}-Q${String(index + 1).padStart(2, '0')}`, value])
    )
  ),
  ...D3_NEW_CONTROL_VALUES
});

/**
 * The original fixture's value resolution, reproduced exactly.
 *
 * Order matters and is load-bearing: oversight value, then the explicit value for the
 * canonical node, then split inheritance, then the fixture's default. Reordering these
 * changes the score, so this function is a transcription and not a redesign.
 */
export function vhutshiloV12ResponseValue(
  nodeId: string,
  replacementFor: string | null,
  domainCode: string | null
): number {
  const oversight = VHUTSHILO_V12_OVERSIGHT_VALUES[nodeId];
  if (Number.isInteger(oversight)) return oversight;
  const canonical = replacementFor ?? nodeId;
  const explicit = VHUTSHILO_V12_SOURCE_VALUES[canonical];
  if (Number.isInteger(explicit)) return explicit;
  const source = VHUTSHILO_V12_SPLIT_SOURCE[canonical];
  if (source && Number.isInteger(VHUTSHILO_V12_SOURCE_VALUES[source])) return VHUTSHILO_V12_SOURCE_VALUES[source];
  return domainCode === 'D3' ? 2 : 2;
}

/** The methodology projection the scorer expects, as the original fixture built it. */
export function vhutshiloV12Methodology(graph: any) {
  return {
    domains: graph.domains.map((domain: any, domainIndex: number) => ({
      id: `00000000-0000-4000-8000-${String(domainIndex + 1).padStart(12, '0')}`,
      domainCode: domain.domainCode,
      name: domain.name,
      weightPct: domain.weightPct,
      domainType: 'control',
      isCore: Boolean(domain.isCore),
      sortOrder: domain.sortOrder ?? domainIndex + 1,
      questions: graph.questions
        .filter((question: any) => question.domainCode === domain.domainCode)
        .map((question: any, questionIndex: number) => ({
          id: `10000000-0000-4000-8000-${String(graph.questions.indexOf(question) + 1).padStart(12, '0')}`,
          questionCode: question.questionCode,
          domainCode: question.domainCode,
          domainName: domain.name,
          prompt: question.prompt,
          helpText: null,
          weight: question.weight,
          isCritical: Boolean(question.isCritical),
          isHardGate: Boolean(question.isHardGate),
          nAAllowed: false,
          nARuleKey: null,
          triggerKey: null,
          sortOrder: questionIndex
        }))
    })),
    responseScale: [],
    exposureFactors: []
  };
}
