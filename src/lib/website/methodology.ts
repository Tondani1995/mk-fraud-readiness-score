/**
 * Public methodology statements for Fraud Readiness.
 *
 * Verification notes remain internal to the implementation. The public page explains the control
 * boundary without exposing module paths, schemas, fact-pack rules or validation error names.
 *
 * VERIFIED, September 2026:
 * - The scoring engine computes the result from recorded answers and the methodology version with
 *   defined question/domain weights and no model call, randomisation or time dependency.
 * - Maturity classification is derived from defined thresholds with explicit critical-control caps.
 * - Gaps and the next-step recommendation are rule-based outputs derived from persisted assessment
 *   fields.
 * - Generative AI is used only downstream to draft plain-language interpretation of results already
 *   determined by the assessment logic, and that output is validated before presentation.
 */

export type MethodologyPoint = {
  title: string;
  description: string;
};

export const METHODOLOGY_HEADLINE = 'Expert-designed. Deterministic at the core.';

export const METHODOLOGY_SUMMARY =
  'Your readiness result is not decided by generative AI. Fraud Readiness uses an expert-designed deterministic assessment engine: your responses are evaluated against defined fraud-risk logic, scoring rules, maturity thresholds and control criteria. Under the same methodology version, the same responses produce the same underlying result.';

export const METHODOLOGY_POINTS: readonly MethodologyPoint[] = [
  {
    title: 'Deterministic scoring',
    description:
      'Your responses are evaluated through fixed scoring rules and defined weights. The same responses under the same methodology version produce the same underlying score.'
  },
  {
    title: 'Defined maturity logic',
    description:
      'Your maturity classification is produced from defined thresholds and control rules. It is not assigned by a language model or by subjective interpretation.'
  },
  {
    title: 'Findings traceable to recorded responses',
    description:
      'The gaps and recommended next step are derived from the responses recorded in the assessment. The result can therefore be traced back to what was submitted.'
  },
  {
    title: 'Generative AI cannot alter your result',
    description:
      'The score, maturity classification, gaps and recommended next step are all produced by the assessment logic. No language model can change any of them.'
  }
];

export const METHODOLOGY_AI_DISCLOSURE =
  'Where generative AI is used, it is limited to drafting the plain-language interpretation of results already determined by the validated assessment logic, and its output is validated before presentation.';
