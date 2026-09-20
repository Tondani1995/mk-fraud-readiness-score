/**
 * MK Fraud Insights capability model.
 *
 * One source for the four points of entry used on the homepage, the Services page, the navigation
 * and the footer. Assess, Build, Enable and Monitor are entry points, not a sequence: an
 * organisation can start with any one of them.
 *
 * The existing service lines live underneath the four capabilities. Their legacy anchor ids
 * (`health-check`, `programme-design`, `controls`, `awareness`, `threat-intelligence`) are kept
 * on the Services page because they are linked from indexed pages, insights and older material.
 */

export type CapabilityId = 'assess' | 'build' | 'enable' | 'monitor';

export type CapabilityService = {
  /** Legacy anchor on /services. Kept stable for inbound links. */
  anchor?: string;
  name: string;
  summary: string;
  /** Optional dedicated route for the service. */
  href?: string;
};

export type Capability = {
  id: CapabilityId;
  name: string;
  question: string;
  summary: string;
  situations: readonly string[];
  services: readonly CapabilityService[];
  outputs: readonly string[];
  scopeNote?: string;
  nextStep: { label: string; href: string };
  /** Contextual further reading. Keeps depth off the homepage without hiding it. */
  relatedLinks?: readonly { label: string; href: string }[];
};

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'assess',
    name: 'Assess',
    question: 'Where are we exposed, and how would we know?',
    summary:
      'We establish where fraud exposure sits across the organisation, including exposure to AI-enabled and other emerging fraud methods, test whether existing controls genuinely cover it and set out what deserves attention first.',
    situations: [
      'Leadership cannot describe the organisation’s fraud exposure with confidence',
      'Controls exist, yet incidents are still discovered late or by accident',
      'A board, audit committee or regulator has asked for a clearer view of fraud risk',
      'Nobody has tested whether the controls still hold now that impersonation and documents can be generated'
    ],
    services: [
      {
        name: 'Fraud Readiness Assessment',
        summary:
          'A structured self-assessment that produces a private readiness Snapshot, with the option of fuller analysis and formal reporting.',
        href: '/fraud-readiness'
      },
      {
        anchor: 'health-check',
        name: 'Fraud Health Check',
        summary:
          'A practitioner-led diagnostic of where fraud risk exists, how it manifests in real workflows and why existing controls are being missed, bypassed or outgrown.'
      }
    ],
    outputs: [
      'Prioritised fraud risk register',
      'Control gap analysis across people, process and systems',
      'A read on exposure to AI-enabled fraud methods, including impersonation, synthetic identity and document risk',
      '30/60/90-day action plan',
      'Practical recommendations tailored to the operating environment'
    ],
    scopeNote: 'A diagnostic, not a forensic investigation or a regulatory audit.',
    nextStep: { label: 'Start with the Fraud Readiness Assessment', href: '/score/start' },
    relatedLinks: [{ label: 'AI Fraud Readiness: what AI changes about fraud', href: '/ai-fraud-readiness' }]
  },
  {
    id: 'build',
    name: 'Build',
    question: 'What should the fraud programme and its accountabilities look like?',
    summary:
      'We design the fraud strategy, operating model, ownership and controls that allow prevention, detection and response to work as one programme, including control design for identity, impersonation and synthetic-content risks where they apply.',
    situations: [
      'Fraud ownership is fragmented across finance, operations, risk and digital teams',
      'Supplier, procurement or payment exposure is growing faster than the controls around it',
      'Escalation depends on who happens to notice rather than on a defined route',
      'Approval and verification steps still assume that a familiar voice, face or document can be trusted'
    ],
    services: [
      {
        anchor: 'programme-design',
        name: 'Fraud Programme Design',
        summary:
          'Fraud strategy, operating model, roles and decision rights, governance forums and escalation pathways that people can follow.'
      },
      {
        anchor: 'controls',
        name: 'Internal Fraud & Procurement Controls',
        summary:
          'Preventive and detective controls, monitoring and escalation logic designed around existing systems and workflows, including third-party and vendor risk.'
      }
    ],
    outputs: [
      'Fraud programme strategy, on one page and in detail',
      'Operating model with roles, decisions and accountability',
      'Governance cadence, reporting and control ownership',
      'Escalation playbook and control design documentation',
      'Verification and authorisation design that does not depend on recognising a person or a document'
    ],
    nextStep: { label: 'Discuss a programme or controls engagement', href: '/contact' }
  },
  {
    id: 'enable',
    name: 'Enable',
    question: 'How do operational decision-makers recognise and act on fraud risk?',
    summary:
      'We equip frontline staff, managers and executives to recognise fraud at the points where decisions are made, including a working understanding that a familiar voice, a realistic video, a professional email or a convincing document may itself be synthetic.',
    situations: [
      'Detection depends on a few experienced individuals',
      'Staff are unsure what to escalate, when, or to whom',
      'Awareness has been delivered as a once-off event rather than a routine',
      'Staff have no practical way to confirm an instruction that looks and sounds genuine'
    ],
    services: [
      {
        anchor: 'awareness',
        name: 'Awareness & Resilience',
        summary:
          'Role-specific enablement for frontline staff, managers and executives, built on real fraud scenarios and reinforced over time.'
      }
    ],
    outputs: [
      'Role-based enablement materials',
      'Scenario examples drawn from relevant fraud patterns, including impersonation and synthetic content',
      'Escalation guidance for each audience',
      'Ongoing reinforcement plan'
    ],
    nextStep: { label: 'Discuss an enablement programme', href: '/contact' }
  },
  {
    id: 'monitor',
    name: 'Monitor',
    question: 'What tells us when our exposure has changed?',
    summary:
      'We track the external threats that drive fraud in your environment, interpret developments in AI-enabled fraud, and set out what they mean for your controls, systems, people and customers.',
    situations: [
      'A new digital service or channel has introduced risk that has not been assessed',
      'Impersonation, pretexting or social engineering attempts are becoming more frequent',
      'Controls were designed some time ago and have not been reviewed against current threats',
      'AI-enabled fraud methods are moving faster than the organisation reviews its controls'
    ],
    services: [
      {
        anchor: 'threat-intelligence',
        name: 'Threat Intelligence for Fraud',
        summary:
          'Ongoing monitoring of fraud-enabling threats relevant to your sector, turned into operational actions rather than a generic intelligence feed.'
      }
    ],
    outputs: [
      'Threat-to-fraud map for key workflows',
      'Monthly fraud threat brief, covering AI-enabled methods relevant to your environment',
      'Verification and escalation updates',
      'Pretext and scenario library for training and playbooks'
    ],
    nextStep: { label: 'Discuss ongoing monitoring', href: '/contact' },
    relatedLinks: [{ label: 'How MK reads AI-enabled fraud developments', href: '/ai-fraud-readiness' }]
  }
] as const;

/** Trigger conditions that indicate it is time to involve MK. */
export const ENGAGEMENT_TRIGGERS: readonly string[] = [
  'Leadership cannot confidently describe where the organisation’s fraud exposure sits.',
  'Fraud ownership is split across finance, operations, risk and digital, with nobody holding the whole picture.',
  'Controls are in place, yet incidents continue or are discovered by accident.',
  'Supplier, procurement or payment exposure is increasing.',
  'A new digital service or channel has introduced risk that has not been assessed.',
  'Detection capability is weak or depends on a few individuals.',
  'AI has changed the fraud threat, but the organisation has not tested whether its existing controls still hold.'
];
