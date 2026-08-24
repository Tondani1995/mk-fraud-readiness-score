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
 * The owner-stated deterministic result.
 *
 * NOT YET REPRODUCIBLE. A score needs the 60 in-scope control responses, and those are not
 * derivable from the V1.1 assessment: the V1.1 to V1.2 crosswalk merges several controls
 * into one target (D6-Q02 receives three V1.1 sources; D2-Q03, D2-Q06, D9-Q03 and D10-Q03
 * each receive two) and no response-combination rule exists in the graph, the crosswalk or
 * the engine. `mergedQuestionIds` in the compiled graph is traceability metadata, not a
 * scoring rule. Inventing a rule here would manufacture the very truth this fixture exists
 * to protect, so the regression asserts scope now and reports the score as UNPROVEN until
 * the 60 V1.2 control responses are supplied.
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
