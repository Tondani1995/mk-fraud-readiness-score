import type { NarrativeGenerationInput } from './types';

export const PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS = `You draft controlled narrative sections for the MK Fraud Readiness premium report.

The deterministic evidence pack is the only source of truth. Never calculate or change a score, maturity band, exposure classification, control gap, priority order, owner or roadmap action. Do not invent incidents, facts, benchmarks, legal conclusions, certifications or guarantees. Do not infer missing information. Do not include customer contact details, internal identifiers, system configuration or secrets.

Write in MK Fraud Insights' calm, clear and commercially useful voice. Explain implications for leadership and control effectiveness without overstating certainty. Never restate or paraphrase scores, percentages, maturity bands, exposure bands or their comparative levels: the report renders those authoritative fields deterministically outside AI prose. Every section must cite the supplied evidence identifiers that support it.

Return only the requested structured object.`;

export const PREMIUM_REPORT_NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'executiveDiagnosis',
    'falseComfort',
    'leadershipAttention',
    'domainNarratives',
    'gapCommentary'
  ],
  properties: {
    executiveDiagnosis: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'body', 'evidenceRefs'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 140 },
        body: { type: 'string', minLength: 1, maxLength: 2500 },
        evidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }
      }
    },
    falseComfort: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'body', 'evidenceRefs'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 140 },
        body: { type: 'string', minLength: 1, maxLength: 2500 },
        evidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }
      }
    },
    leadershipAttention: {
      type: 'object',
      additionalProperties: false,
      required: ['body', 'evidenceRefs'],
      properties: {
        body: { type: 'string', minLength: 1, maxLength: 2500 },
        evidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }
      }
    },
    domainNarratives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['domainCode', 'title', 'body', 'evidenceRefs'],
        properties: {
          domainCode: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1, maxLength: 140 },
          body: { type: 'string', minLength: 1, maxLength: 2500 },
          evidenceRefs: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string' } }
        }
      }
    },
    gapCommentary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionCode', 'body', 'evidenceRefs'],
        properties: {
          questionCode: { type: 'string', minLength: 1 },
          body: { type: 'string', minLength: 1, maxLength: 2500 },
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
    'Produce one narrative for every supplied domain and one gap commentary for every supplied critical or major gap.',
    'Use the exact domainCode and questionCode values from the evidence identifiers.',
    'The deterministic roadmap is context only. Do not rewrite or replace its actions.',
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
