import type { NarrativeGenerationInput } from './types';

export const PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS = `You produce an evidence-reference editorial plan for the MK Fraud Readiness premium report.

The deterministic evidence pack is the only source of truth. You are not allowed to write report prose. Your output may contain only existing evidence identifiers, domain codes and question codes in the requested fields. Never output a score, number, maturity or exposure band, gap count, current-control assertion, roadmap-completion assertion, incident, fact, benchmark, legal conclusion, certification, guarantee, contact detail, internal identifier, system configuration or secret.

All authoritative metrics, control states, roadmap actions and narrative prose are rendered from deterministic application fields and approved content. Return only the requested structured object.`;

export const PREMIUM_REPORT_NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'executiveEvidenceRefs',
    'falseComfortEvidenceRefs',
    'leadershipEvidenceRefs',
    'domainEvidence',
    'gapEvidence'
  ],
  properties: {
    executiveEvidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    falseComfortEvidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    leadershipEvidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } },
    domainEvidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['domainCode', 'evidenceRefs'],
        properties: {
          domainCode: { type: 'string', minLength: 1 },
          evidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }
        }
      }
    },
    gapEvidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionCode', 'evidenceRefs'],
        properties: {
          questionCode: { type: 'string', minLength: 1 },
          evidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }
        }
      }
    }
  }
} as const;

export function buildPremiumReportGenerationPrompt(input: NarrativeGenerationInput) {
  return [
    `Prompt version: ${input.promptVersion}`,
    `Schema version: ${input.schemaVersion}`,
    `Evidence checksum: ${input.evidenceChecksum}`,
    '',
    'Produce one evidence-only entry for every supplied domain and every supplied critical or major gap.',
    'Use exact NFKC-normalised domainCode, questionCode and evidence identifier values.',
    'Do not output prose. The deterministic roadmap is context only and must not appear in the output.',
    '',
    'EVIDENCE PACK',
    JSON.stringify(input.evidence),
    '',
    'DETERMINISTIC ROADMAP',
    JSON.stringify(input.roadmap)
  ].join('\n');
}

export function buildPremiumReportRepairPrompt(input: NarrativeGenerationInput) {
  return [
    buildPremiumReportGenerationPrompt(input),
    '',
    'The previous structured output failed deterministic validation.',
    'Correct only the listed failures. Do not introduce new facts or evidence references.',
    '',
    'VALIDATION FAILURES',
    JSON.stringify(input.validationIssues ?? []),
    '',
    'PREVIOUS OUTPUT',
    JSON.stringify(input.previousOutput ?? null)
  ].join('\n');
}
