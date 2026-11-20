/**
 * Public copy used only when the review track is selected (NEXT_PUBLIC_MK_READINESS_TRACK=review). Every sentence
 * describing the scored MFRS assessment stays where it was and is unchanged; these replacements describe the revised
 * review truthfully under the approved MK Fraud Readiness method: one person answers (no hand-offs since the
 * 15 November rebuild), a private Snapshot with the MK Fraud Readiness score, and paid reports written from the same answers. Kept in one file so MK
 * can review the wording in one place.
 */

export const REVIEW_JOURNEY: readonly (readonly [string, string])[] = [
  [
    'Assessment interview',
    'One person answers for the organisation in about twenty minutes. Each answer is saved as it is chosen and the next question follows straight away. Answering “I don’t know” is accepted: the question stays open and is not counted in the score.'
  ],
  [
    'Private Snapshot',
    'A confidential result with the MK Fraud Readiness score on the answers given, the gaps the organisation reported, where its exposure sits and which material scenarios are still open.'
  ],
  [
    'Essential or Comprehensive report',
    'Written from the same answers and ordered from the Snapshot, with no questions asked again. Payment is by EFT against the order reference, and MK releases each report.'
  ],
  [
    'Advisory and remediation',
    'Where evidence needs examining or controls need building, MK scopes an Advisory engagement and supports the remediation that follows.'
  ]
];

export const REVIEW_PREVIEW_CAPTION =
  'A private Snapshot carries the MK Fraud Readiness score and shows what the organisation reported, where its exposure sits and which material scenarios are still open. The figures shown come from a fictional example.';

export const REVIEW_STOREFRONT = {
  heroBody:
    'Complete the free MK Fraud Readiness review interview and receive a private Snapshot with your MK Fraud Readiness score, what your organisation reported, what is still unknown and which material questions remain open.',
  steps: [
    ['Assessment interview', 'One person answers for the organisation in about twenty minutes. Each answer is saved as it is chosen, and “I don’t know” is accepted.'],
    ['Private Snapshot', 'The Snapshot shows your MK Fraud Readiness score, the gaps you reported and where your exposure sits as soon as the interview ends.'],
    ['Report or Advisory', 'Essential and Comprehensive are ordered from the Snapshot and written from the same answers. Evidence work and remediation are scoped with MK as Advisory.']
  ] as const,
  productsIntro:
    'Your Snapshot suggests the report that fits your answers, and every option remains your choice. Essential and Comprehensive are written from the answers you have already given, and can be ordered from your Snapshot once complete answers cover at least half of the fraud scenarios that apply.'
} as const;

export const REVIEW_METHODOLOGY = {
  summary:
    'Your Snapshot is not decided by generative AI. One versioned ruleset decides which questions apply, what each answer means, what remains open and the MK Fraud Readiness score. Under the same version, the same answers produce the same Snapshot and the same score.',
  points: [
    {
      title: 'One defined ruleset',
      description: 'Questions, scope and every state in your Snapshot come from one versioned ruleset. A session recorded under one version is never silently reinterpreted under another.'
    },
    {
      title: 'A score that states its basis',
      description: 'The MK Fraud Readiness score counts only scenarios whose core answers are known and carries no band, level or pass mark. Nothing is estimated about controls that were not asked; those stay open until someone who knows answers.'
    },
    {
      title: 'Every entry traceable',
      description: 'Each answer is kept with when it was given and which earlier answer it replaced, so the Snapshot and any report can be traced to the answers behind them.'
    },
    {
      title: 'Professional judgement recorded separately',
      description: 'Your answers remain your own statements, and nothing in the Snapshot has been tested. Where MK examines evidence in an Advisory engagement, its conclusions are recorded beside your answers and never replace them.'
    }
  ],
  aiDisclosure: 'Generative AI is not used to produce, interpret or change the review or its Snapshot. Essential and Comprehensive reports are drafted with generative AI from the same facts: every figure in them is inserted from the facts rather than written by the AI, and each report is checked against MK’s report rules and released by MK.'
} as const;
