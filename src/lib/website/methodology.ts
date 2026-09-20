/**
 * Public methodology statements for Fraud Readiness.
 *
 * Every line below was verified against the production implementation before publication. The
 * verification notes name the modules, so a future change to the engine makes the affected
 * public claim easy to find and correct.
 *
 * VERIFIED, September 2026:
 *
 * - `src/lib/scoring/scoring-engine.ts` computes the result as a pure function of the recorded
 *   answers and the methodology version: each answer normalises to a 0..100 value, questions
 *   combine into a domain score by question weight, and domains combine into the overall score by
 *   domain weight. There is no model call, no randomisation and no time dependency.
 * - `src/lib/scoring/maturity-band.ts` holds one authoritative set of maturity thresholds. The
 *   band is read from the score; defined critical-control rules in the engine can cap the band
 *   below what the score alone would give.
 * - Gaps are rule-based classifications recorded per question and per domain by the same engine,
 *   and `src/lib/snapshot/gap-inventory.ts` reads persisted fields only, estimating nothing.
 * - `src/lib/snapshot/next-step-recommendation.ts` is a pure function of persisted score-run
 *   fields: rules are evaluated in order, exactly one matches, and the reason is always rendered.
 * - Language models are used for written interpretation only. `src/lib/snapshot/narrative.ts`
 *   passes a deliberately small brief that excludes numerical diagnostics, constrains output to
 *   five prose fields through a schema, and falls back to deterministic text when the model is
 *   unavailable or its output fails validation.
 * - `src/lib/reports/narrative/validation.ts` rejects any number in report prose that is not
 *   present in the deterministic fact pack (`unsupported_numeric_claim`).
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
      'Each response carries a defined value and a defined weight. Question scores combine into domain scores, and domain scores combine into the overall readiness score, through fixed rules rather than a model’s judgement. Questions marked not applicable are excluded from scoring rather than scored as zero.'
  },
  {
    title: 'Defined maturity logic',
    description:
      'Maturity bands sit on defined thresholds applied to the score, and specific critical-control failures can cap the band below the score alone, so a strong average cannot conceal a weakness the methodology treats as decisive.'
  },
  {
    title: 'Findings traceable to your responses',
    description:
      'Every gap, area of attention and next-step recommendation is derived from your recorded answers by rule. The recommendation always shows its reason, and any figure in that reason also appears elsewhere in your result, so you can check it.'
  },
  {
    title: 'No black-box generative scoring',
    description:
      'Language models play no part in calculating the score, the maturity band, the identified gaps or the recommendation. Where they are used, they work downstream of the completed assessment logic.'
  },
  {
    title: 'Where AI is used, and how it is bounded',
    description:
      'A language model writes the interpretation you read: the plain-language explanation of a result that has already been determined. It receives a deliberately small set of facts that excludes the numerical diagnostics, its output is validated before you see it, any figure not present in the underlying analysis is rejected, and the platform falls back to prepared deterministic wording if that check fails.'
  },
  {
    title: 'Self-reported, and honest about it',
    description:
      'Fraud Readiness analyses what your organisation reports. It does not independently test evidence and it does not provide an assurance opinion. Where your answers leave visibility too thin to support a confident reading, the result says so instead of presenting a number as settled.'
  }
];
