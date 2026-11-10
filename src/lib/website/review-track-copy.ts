/**
 * Public copy used only when the review track is selected (NEXT_PUBLIC_MK_READINESS_TRACK=review). Every sentence
 * describing the scored assessment stays where it was and is unchanged; these replacements describe the unscored
 * two-stage review truthfully. Kept in one file so MK can review the wording in one place. Not yet approved by MK.
 */

export const REVIEW_JOURNEY: readonly (readonly [string, string])[] = [
  [
    'Triage interview',
    'One person answers for the organisation in an interview of at most 95 screens. Questions that person cannot answer go to the function that would know, and nothing is assumed in the meantime.'
  ],
  [
    'Private Snapshot',
    'A confidential record of the gaps the organisation reported, the questions waiting for an owner, the material scenarios still open and the evidence MK would need to see. It carries no score.'
  ],
  [
    'Owner follow-up',
    'Accountable functions such as Finance or HR and payroll answer their own questions outside the 95-screen limit, so that open scenarios can be settled by the people who know.'
  ],
  [
    'Evidence review and remediation',
    'Where professional judgement is needed, an MK reviewer examines evidence and records conclusions in a scoped Advisory engagement, and MK can support the remediation that follows.'
  ]
];

export const REVIEW_PREVIEW_CAPTION =
  'A private Snapshot lists what the organisation reported, what is waiting for the people who would know, which material scenarios are still open and what evidence MK would need to see. The figures shown come from a fictional example.';

export const REVIEW_STOREFRONT = {
  heroBody:
    'Complete the free MK Fraud Readiness review interview and receive a private Snapshot of what your organisation reported, what is still unknown and which material questions remain open. It carries no score.',
  steps: [
    ['Triage interview', 'Up to 95 screens, asking only what applies. “I don’t know” sends a question to the function that would know.'],
    ['Owner follow-up', 'Accountable functions answer their own questions outside the interview limit, at no charge.'],
    ['Evidence and review', 'An MK reviewer examines evidence and records conclusions. This is professional work, scoped with MK as Advisory.']
  ] as const,
  productsIntro:
    'The Snapshot is the starting point and does not recommend a paid engagement. Essential and Comprehensive are currently produced from MK’s scored assessment, so this review does not yet lead to them; how they should change is an open decision for MK.',
  paidUnavailable: 'Produced from the scored assessment. Not yet available from a review Snapshot while that decision is open.'
} as const;

export const REVIEW_METHODOLOGY = {
  summary:
    'Your Snapshot is not decided by generative AI and is not a score. One versioned ruleset decides which questions apply, what each answer means and what remains open. Under the same version, the same answers produce the same Snapshot.',
  points: [
    {
      title: 'One defined ruleset',
      description: 'Questions, scope and every state in your Snapshot come from one versioned ruleset. A session recorded under one version is never silently reinterpreted under another.'
    },
    {
      title: 'Nothing scored or predicted',
      description: 'The review calculates no score, maturity level or rating, and it does not estimate controls it did not ask about. Those stay open until someone who knows answers.'
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
  aiDisclosure: 'Generative AI is not used to produce, interpret or change any part of the review.'
} as const;
