/**
 * AI-enabled fraud content for the public website.
 *
 * Two rules govern this file:
 *
 * 1. Every figure carries a citation to a named public source. Nothing is estimated, rounded for
 *    effect, or attributed to MK. If a source cannot be cited, the claim does not appear.
 * 2. Nothing here describes what the live Fraud Readiness instrument measures. The instrument's
 *    current coverage is stated once, in `FRAUD_READINESS_AI_COVERAGE`, and must be updated in the
 *    same change that expands the assessment.
 */

export type EvidenceSource = {
  id: string;
  publisher: string;
  title: string;
  published: string;
  href: string;
};

export const AI_FRAUD_SOURCES: readonly EvidenceSource[] = [
  {
    id: 'interpol-gffta-2026',
    publisher: 'INTERPOL',
    title: 'Global Financial Fraud Threat Assessment, second edition',
    published: 'March 2026',
    href: 'https://www.interpol.int/en/News-and-Events/News/2026/INTERPOL-report-warns-of-increasingly-sophisticated-global-financial-fraud-threat'
  },
  {
    id: 'interpol-africa-2026',
    publisher: 'INTERPOL',
    title: 'African Cyberthreat Assessment Report 2026',
    published: 'August 2026',
    href: 'https://www.interpol.int/en/News-and-Events/News/2026/INTERPOL-report-finds-AI-linked-to-more-than-half-of-cybercrime-in-Africa'
  },
  {
    id: 'acfe-sas-2026',
    publisher: 'ACFE and SAS',
    title: 'Anti-Fraud Technology Benchmarking Report 2026, based on 713 anti-fraud professionals',
    published: 'March 2026',
    href: 'https://www.acfe.com/about-the-acfe/newsroom-for-media/press-releases/press-release-detail?s=2026-anti-fraud-technology-benchmarking-report-pr'
  },
  {
    id: 'sabric-2025-stats',
    publisher: 'SABRIC',
    title: 'Annual Crime Statistics 2025',
    published: 'August 2026',
    href: 'https://www.sabric.co.za/wp-content/uploads/2026/08/SABRIC-Annual-Crime-Statistics-Report-2025.pdf'
  },
  {
    id: 'sabric-ai-scams',
    publisher: 'SABRIC',
    title: 'AI scammers are fooling South Africans',
    published: 'July 2025',
    href: 'https://www.sabric.co.za/ai-scammers-are-fooling-south-africans-heres-how-to-stay-safe/'
  }
];

export function sourceById(id: string): EvidenceSource {
  const source = AI_FRAUD_SOURCES.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown AI fraud evidence source: ${id}`);
  return source;
}

export type EvidencePoint = {
  figure: string;
  statement: string;
  sourceId: string;
};

/** Cited figures only. The wording stays close to the published source. */
export const AI_FRAUD_EVIDENCE: readonly EvidencePoint[] = [
  {
    figure: '55%',
    statement: 'of reported cybercrimes across Africa are being enabled by artificial intelligence, according to INTERPOL reporting from 36 member countries.',
    sourceId: 'interpol-africa-2026'
  },
  {
    figure: '4.5x',
    statement: 'more profitable than traditional methods, which is how INTERPOL describes AI-enhanced fraud in its global assessment.',
    sourceId: 'interpol-gffta-2026'
  },
  {
    figure: '77%',
    statement: 'of anti-fraud professionals surveyed by the ACFE and SAS reported a slight to significant increase in deepfake social engineering over the past two years.',
    sourceId: 'acfe-sas-2026'
  },
  {
    figure: '7%',
    statement: 'of those same professionals said their organisation is more than moderately prepared to detect or prevent AI-fuelled fraud.',
    sourceId: 'acfe-sas-2026'
  }
];

export type FraudVector = {
  id: string;
  name: string;
  description: string;
  whereItLands: string;
};

/**
 * How AI-enabled fraud reaches an organisation. Ordered by how often it appears in the operating
 * environments MK works in, not by how dramatic it sounds.
 */
export const AI_FRAUD_VECTORS: readonly FraudVector[] = [
  {
    id: 'impersonation',
    name: 'Deepfake and voice-cloned impersonation',
    description:
      'Video and audio of a senior executive, a client or a supplier can now be generated convincingly enough to carry an instruction. SABRIC has warned South Africans specifically about cloned voices, deepfake video and impersonated institutions.',
    whereItLands: 'Payment approvals, urgent instructions, call centres, executive assistants'
  },
  {
    id: 'synthetic-identity',
    name: 'Synthetic identities',
    description:
      'INTERPOL reports criminals combining real personal data with fabricated elements to create entirely synthetic identities that are designed to pass verification, including biometric checks, and open accounts.',
    whereItLands: 'Customer onboarding, credit and account opening, supplier registration'
  },
  {
    id: 'documents',
    name: 'AI-generated or manipulated documents',
    description:
      'Invoices, bank letters, proof of payment, identity documents and supporting evidence can be produced or altered at a quality that defeats a visual check, which weakens any control that rests on a document looking right.',
    whereItLands: 'Accounts payable, claims, procurement, onboarding evidence'
  },
  {
    id: 'phishing',
    name: 'AI-assisted phishing and social engineering',
    description:
      'INTERPOL records business email compromise becoming markedly more sophisticated where AI generates highly convincing correspondence, and the same tooling personalises messages at scale.',
    whereItLands: 'Email, messaging, customer channels, internal approvals'
  },
  {
    id: 'business-impersonation',
    name: 'Executive and business impersonation',
    description:
      'Public information about your leadership, your suppliers and your processes is now cheap to assemble into a convincing pretext, so the attacker arrives already knowing how your organisation works.',
    whereItLands: 'Finance, treasury, HR, procurement'
  },
  {
    id: 'supplier-payment',
    name: 'AI-assisted supplier and payment fraud',
    description:
      'Banking-detail changes, fake vendor onboarding and invoice manipulation become harder to challenge when the request, the documents and the follow-up call all appear legitimate.',
    whereItLands: 'Vendor master data, payment runs, procurement'
  },
  {
    id: 'scaled-campaigns',
    name: 'Automated and scaled campaigns',
    description:
      'Volume is no longer a constraint. Attacks that once required a skilled operator per target can now be run against many targets at once, with each one tailored.',
    whereItLands: 'Customer channels, digital onboarding, loyalty and rewards'
  },
  {
    id: 'agentic',
    name: 'Emerging agentic-AI patterns',
    description:
      'INTERPOL describes agentic AI systems capable of autonomously planning and executing complete fraud campaigns, from reconnaissance through to the demand. This is an emerging pattern rather than a routine one, and it deserves watching rather than alarm.',
    whereItLands: 'Every channel that can be reached without a human on the other side'
  }
];

export type ReadinessCondition = {
  title: string;
  description: string;
};

/** What an organisation that is ready for AI-enabled fraud can demonstrate. */
export const AI_READINESS_CONDITIONS: readonly ReadinessCondition[] = [
  {
    title: 'Trust no longer rests on recognition',
    description:
      'High-consequence actions are authorised through verification that does not depend on recognising a face, a voice or a writing style. Staff have a defined way to confirm an instruction that does not rely on the channel the instruction arrived in.'
  },
  {
    title: 'Identity assurance is proportionate to consequence',
    description:
      'Onboarding, account recovery, supplier registration and payment-detail changes are protected by checks that assume documents and media can be fabricated.'
  },
  {
    title: 'Evidence is tested, not admired',
    description:
      'Where a document or recording supports a financial decision, the organisation confirms it against an independent source rather than assessing how convincing it looks.'
  },
  {
    title: 'People know what synthetic content means for their job',
    description:
      'Frontline staff, managers and executives understand that a familiar voice, a realistic video or a professional-looking document may be generated, and they know exactly what to do when something feels wrong.'
  },
  {
    title: 'Escalation is safe and fast',
    description:
      'Challenging a senior instruction carries no career risk, and the route for doing so is known, quick and used.'
  },
  {
    title: 'The threat picture is reviewed deliberately',
    description:
      'Someone is accountable for interpreting developments in AI-enabled fraud and deciding what they mean for the organisation’s controls, systems, people and customers.'
  }
];

/**
 * What the live Fraud Readiness instrument covers today.
 *
 * VERIFIED against the seeded methodology (migrations 0002 and 0009): domain D8, Digital and
 * Identity Fraud Risk, assesses identity verification, monitoring for suspicious digital
 * activity, phishing and digital-impersonation training, privileged access, reporting routes,
 * periodic review of emerging digital fraud risks, and detection of identity misuse and account
 * takeover. Domain D7 assesses supplier payment verification, including vendor impersonation and
 * bank-detail change risk.
 *
 * There is NO question in the live instrument that names deepfakes, voice cloning, synthetic
 * identities or generative AI. `explicitAiQuestions` must stay false until such questions are
 * seeded, and the public wording must not imply otherwise.
 */
export const FRAUD_READINESS_AI_COVERAGE = {
  explicitAiQuestions: false,
  coveredToday: [
    'Identity verification where identity misuse could cause fraud loss or harm',
    'Detection and investigation of identity misuse, account takeover and impersonation',
    'Staff training on phishing, social engineering and digital impersonation',
    'Supplier payment verification, including vendor impersonation and bank-detail changes',
    'Periodic review of emerging digital fraud risks relevant to the organisation'
  ],
  plannedExpansion:
    'Questions that name AI-enabled methods directly, including synthetic media, voice-cloned instructions, synthetic identities and AI-generated supporting documents, are being added to the instrument.'
} as const;
