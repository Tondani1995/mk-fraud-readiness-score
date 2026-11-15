/**
 * Public copy used only when the review track is selected (NEXT_PUBLIC_MK_READINESS_TRACK=review). Every sentence
 * describing the scored MFRS assessment stays where it was and is unchanged; these replacements describe the revised
 * review truthfully under the approved MK Fraud Readiness method (15 November 2026): a staged interview, a private
 * Snapshot with the MK Fraud Readiness score, and paid reports written from the same answers. Kept in one file so MK
 * can review the wording in one place.
 */

export const REVIEW_JOURNEY: readonly (readonly [string, string])[] = [
  [
    'Triage interview',
    'One person answers for the organisation in an interview that runs in stages and can be paused and resumed. Questions that person cannot answer go to the function that would know, and nothing is assumed in the meantime.'
  ],
  [
    'Private Snapshot',
    'A confidential record with the MK Fraud Readiness score on the answers given, the gaps the organisation reported, the questions waiting for an owner and the material scenarios still open.'
  ],
  [
    'Owner follow-up',
    'Accountable functions such as Finance or HR and payroll answer their own questions, so that open scenarios can be settled by the people who know.'
  ],
  [
    'Evidence review and remediation',
    'Where professional judgement is needed, an MK reviewer examines evidence and records conclusions in a scoped Advisory engagement, and MK can support the remediation that follows.'
  ]
];

export const REVIEW_PREVIEW_CAPTION =
  'A private Snapshot carries the MK Fraud Readiness score and lists what the organisation reported, what is waiting for the people who would know and which material scenarios are still open. The figures shown come from a fictional example.';

export const REVIEW_STOREFRONT = {
  heroBody:
    'Complete the free MK Fraud Readiness review interview and receive a private Snapshot with your MK Fraud Readiness score, what your organisation reported, what is still unknown and which material questions remain open.',
  steps: [
    ['Triage interview', 'Asks only what applies and can be paused. “I don’t know” sends a question to the function that would know.'],
    ['Owner follow-up', 'Accountable functions answer their own questions, at no charge.'],
    ['Evidence and review', 'An MK reviewer examines evidence and records conclusions. This is professional work, scoped with MK as Advisory.']
  ] as const,
  productsIntro:
    'The Snapshot is the starting point and does not recommend a paid engagement. Essential and Comprehensive are written from the answers you have already given, and can be requested from your Snapshot once complete answers cover at least half of the fraud scenarios that apply.'
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
      description: 'Each answer is kept with who gave it, when, and which earlier answer it replaced. Evidence and reviewer conclusions are tied to the exact answer they examined.'
    },
    {
      title: 'Professional judgement recorded separately',
      description: 'Your answers remain your own statements. An MK reviewer’s record sits beside your answer and never replaces it, and it says what the evidence showed.'
    }
  ],
  aiDisclosure: 'Generative AI is not used to produce, interpret or change the review or its Snapshot. Essential and Comprehensive reports are drafted with generative AI from the same facts: every figure in them is inserted from the facts rather than written by the AI, and each report is checked against MK’s report rules and released by MK.'
} as const;
