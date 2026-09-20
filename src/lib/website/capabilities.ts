/**
 * MK Fraud Insights capability model.
 *
 * Assess, Build, Enable and Monitor are organising entry points, not the limit of the service
 * portfolio and not a sequence an organisation must complete. Named commercial services sit
 * underneath them so a client can start with the specific problem it needs solved.
 *
 * The legacy anchor ids (`health-check`, `programme-design`, `controls`, `awareness`,
 * `threat-intelligence`) are kept because indexed pages, insights and older material link to them.
 */

export type CapabilityId = 'assess' | 'build' | 'enable' | 'monitor';

export type CapabilityService = {
  /** Legacy or stable anchor on /services. */
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
  relatedLinks?: readonly { label: string; href: string }[];
};

/**
 * Public service inventory. Keep this aligned with the corporate profile.
 * Removing a named service from public presentation requires an explicit commercial decision;
 * a visual or information-architecture simplification is not authority to narrow the portfolio.
 */
export const PUBLIC_SERVICE_PORTFOLIO: readonly string[] = [
  'Fraud Readiness & Fraud Risk Assessments',
  'Fraud Strategy & Programme Design',
  'Fraud Awareness & Resilience Training',
  'Internal & Employee Fraud Controls',
  'Procurement, Supplier & Third-Party Fraud Risk',
  'Digital, Identity & Cyber-Enabled Fraud Risk',
  'AI-Enabled Fraud Readiness',
  'Fraud Detection, Monitoring & Threat Intelligence',
  'Role-Based Fraud Training, Playbooks & Operational Guidance',
  'Investigation Support through Specialist Partners'
] as const;

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'assess',
    name: 'Assess',
    question: 'Where are we exposed, and how would we know?',
    summary:
      'We establish where fraud exposure genuinely sits, how the current control environment performs against it and where the organisation’s view of itself diverges from operating reality.',
    situations: [
      'Leadership cannot describe the organisation’s fraud exposure with confidence',
      'Controls exist, yet incidents are still discovered late or by accident',
      'Supplier, procurement, employee or third-party risk has not been examined as one fraud picture',
      'A new digital service, identity journey or AI-enabled fraud method has changed the exposure',
      'A board, audit committee or regulator has asked for a clearer view of fraud risk'
    ],
    services: [
      {
        name: 'Fraud Readiness Assessment',
        summary:
          'A structured self-assessment that produces a private readiness Snapshot, with the option of fuller analysis, formal reporting, prioritisation and advisory support.',
        href: '/fraud-readiness'
      },
      {
        anchor: 'health-check',
        name: 'Fraud Health Check',
        summary:
          'A practitioner-led diagnostic of where fraud risk exists, how it manifests in real workflows and why existing controls are being missed, bypassed or outgrown.'
      },
      {
        anchor: 'internal-employee-risk-review',
        name: 'Internal & Employee Fraud Risk Review',
        summary:
          'A focused review of delegated authority, privileged access, manual overrides, conflicts, collusion exposure and the controls intended to prevent or detect employee-enabled fraud.'
      },
      {
        anchor: 'supplier-third-party-risk-review',
        name: 'Procurement, Supplier & Third-Party Fraud Risk Review',
        summary:
          'A fraud-focused review of supplier onboarding, due diligence, procurement, bank-detail changes, invoice manipulation, conflicts of interest, intermediaries and outsourced processes.'
      },
      {
        anchor: 'digital-cyber-fraud-review',
        name: 'Digital, Identity & Cyber-Enabled Fraud Risk Review',
        summary:
          'A fraud-focused review of digital journeys, identity proofing, account takeover, phishing, social engineering, impersonation and technology-enabled deception. This is not a penetration test or general cybersecurity assessment.'
      },
      {
        anchor: 'ai-enabled-fraud-readiness',
        name: 'AI-Enabled Fraud Readiness',
        summary:
          'Specialist advisory on how deepfakes, voice cloning, synthetic identities, generated documents, AI-assisted social engineering and emerging agentic fraud change existing control assumptions.',
        href: '/ai-fraud-readiness'
      }
    ],
    outputs: [
      'Prioritised view of fraud exposure',
      'Control gap analysis across people, process and systems',
      'Risk-specific findings for internal, supplier, digital, identity or AI-enabled fraud where in scope',
      '30/60/90-day action plan',
      'Practical recommendations tailored to the operating environment'
    ],
    scopeNote: 'A diagnostic and advisory capability, not a forensic investigation or regulatory audit opinion.',
    nextStep: { label: 'Discuss an assessment or review', href: '/contact' },
    relatedLinks: [
      { label: 'Explore the Fraud Readiness Assessment', href: '/fraud-readiness' },
      { label: 'AI Fraud Readiness: what AI changes about fraud', href: '/ai-fraud-readiness' }
    ]
  },
  {
    id: 'build',
    name: 'Build',
    question: 'What should the fraud programme and its accountabilities look like?',
    summary:
      'We design the fraud strategy, operating model, ownership, controls and governance needed to prevent, detect and respond to fraud coherently across the organisation.',
    situations: [
      'Fraud ownership is fragmented across finance, operations, risk, security and digital teams',
      'Supplier, procurement or payment exposure is growing faster than the controls around it',
      'Internal fraud controls rely on policy rather than on the way authority and access actually operate',
      'Escalation depends on who happens to notice rather than on a defined route',
      'Digital or AI-enabled fraud has weakened existing verification and authorisation assumptions'
    ],
    services: [
      {
        anchor: 'programme-design',
        name: 'Fraud Strategy & Programme Design',
        summary:
          'Fraud strategy, programme scope, priorities and operating logic designed around the organisation’s actual risk profile and operating model.'
      },
      {
        anchor: 'governance-operating-model',
        name: 'Fraud Governance & Operating Model Design',
        summary:
          'Roles, decision rights, ownership, governance forums, reporting cadence and escalation pathways that make fraud risk governable across functional boundaries.'
      },
      {
        anchor: 'controls',
        name: 'Internal & Employee Fraud Controls',
        summary:
          'Preventive and detective controls around delegated authority, privileged access, overrides, sensitive transactions, conflicts, collusion and employee-enabled fraud.'
      },
      {
        anchor: 'procurement-third-party-controls',
        name: 'Procurement, Supplier & Third-Party Fraud Controls',
        summary:
          'Control design for supplier onboarding, due diligence, procurement, payment changes, invoice validation, conflicts, intermediaries and outsourced processes.'
      },
      {
        anchor: 'digital-cyber-controls',
        name: 'Digital & Cyber-Enabled Fraud Control Design',
        summary:
          'Fraud control design for identity, authentication, account takeover, impersonation, social engineering and digital decision journeys, without presenting MK as a general cybersecurity provider.'
      }
    ],
    outputs: [
      'Fraud programme strategy, on one page and in detail',
      'Operating model with roles, decisions and accountability',
      'Governance cadence, reporting and control ownership',
      'Control design and remediation documentation',
      'Verification, authorisation and escalation design matched to the exposure'
    ],
    nextStep: { label: 'Discuss a programme or controls engagement', href: '/contact' }
  },
  {
    id: 'enable',
    name: 'Enable',
    question: 'How do operational decision-makers recognise and act on fraud risk?',
    summary:
      'We equip frontline staff, managers and executives with the judgement, awareness and practical guidance required to recognise fraud and act correctly at the point where decisions are made.',
    situations: [
      'Awareness is inconsistent across operational roles that actually carry fraud risk',
      'Staff are unsure what to escalate, when, or to whom',
      'Training has been delivered as a once-off compliance event rather than practical fraud resilience',
      'Managers and frontline teams need role-specific scenarios rather than generic fraud theory',
      'Staff have no practical way to challenge or verify an instruction that looks and sounds genuine'
    ],
    services: [
      {
        anchor: 'awareness',
        name: 'Fraud Awareness & Resilience Training',
        summary:
          'Role-specific fraud training built around real operating decisions, relevant fraud scenarios and the behaviours that prevent weak controls from becoming incidents.'
      },
      {
        anchor: 'role-based-training-playbooks',
        name: 'Role-Based Fraud Training & Playbooks',
        summary:
          'Practical guidance for buyers, finance teams, branch or field managers, contact-centre teams, onboarding staff and other roles that make fraud-relevant decisions.'
      },
      {
        anchor: 'executive-board-sessions',
        name: 'Executive & Board Fraud Sessions',
        summary:
          'Focused sessions that help leadership understand the organisation’s exposure, governance responsibilities, emerging fraud methods and the management decisions required.'
      },
      {
        anchor: 'ai-fraud-awareness',
        name: 'AI-Enabled Fraud Awareness & Response Guidance',
        summary:
          'Practical preparation for synthetic voice, video, correspondence, documents and other AI-enabled deception, with verification and escalation guidance for high-consequence decisions.'
      }
    ],
    outputs: [
      'Role-based training and awareness materials',
      'Scenario libraries drawn from relevant fraud patterns',
      'Operational playbooks and decision guidance',
      'Escalation guidance for each audience',
      'Reinforcement and resilience plans rather than once-off awareness'
    ],
    nextStep: { label: 'Discuss fraud awareness or training', href: '/contact' }
  },
  {
    id: 'monitor',
    name: 'Monitor',
    question: 'What tells us when our exposure has changed?',
    summary:
      'We help organisations keep fraud visible between incidents by strengthening detection, management information and the interpretation of changing external fraud threats.',
    situations: [
      'Detection capability is weak, untested or dependent on a few individuals',
      'Management receives incident information but not a usable view of fraud exposure and control performance',
      'A new digital service or channel has introduced risk that has not been monitored effectively',
      'Impersonation, pretexting, social engineering or AI-enabled attempts are becoming more frequent',
      'Controls were designed some time ago and have not been reviewed against current threats'
    ],
    services: [
      {
        anchor: 'detection-monitoring',
        name: 'Fraud Detection & Monitoring Design',
        summary:
          'Indicators, thresholds, monitoring logic and escalation routes designed around the fraud risks that matter in the operating environment.'
      },
      {
        anchor: 'threat-intelligence',
        name: 'Fraud Threat Intelligence',
        summary:
          'Ongoing interpretation of fraud-enabling threats relevant to the organisation, translated into operational implications rather than delivered as a generic intelligence feed.'
      },
      {
        anchor: 'fraud-management-information',
        name: 'Fraud Management Information & Indicators',
        summary:
          'Management and board information designed to show exposure, control performance, incidents, emerging pressure and where intervention is required.'
      },
      {
        anchor: 'digital-ai-monitoring',
        name: 'Digital, Identity & AI-Enabled Fraud Monitoring',
        summary:
          'Monitoring and advisory support focused on changes in digital fraud, identity misuse, account takeover, impersonation, synthetic content and other emerging methods.'
      }
    ],
    outputs: [
      'Fraud indicators and intervention thresholds',
      'Detection and escalation design',
      'Management and board reporting',
      'Threat-to-fraud mapping for key workflows',
      'Periodic fraud threat briefs and control implications'
    ],
    nextStep: { label: 'Discuss detection, monitoring or threat intelligence', href: '/contact' },
    relatedLinks: [{ label: 'How MK reads AI-enabled fraud developments', href: '/ai-fraud-readiness' }]
  }
] as const;

/** Trigger conditions that indicate it is time to involve MK. */
export const ENGAGEMENT_TRIGGERS: readonly string[] = [
  'Leadership cannot confidently describe where the organisation’s fraud exposure sits.',
  'Fraud ownership is split across finance, operations, risk, security and digital, with nobody holding the whole picture.',
  'Controls are in place, yet incidents continue or are discovered by accident.',
  'Supplier, procurement, payment, employee or third-party exposure is increasing.',
  'Awareness and training are not keeping pace with the fraud decisions operational teams now face.',
  'A new digital service, identity journey or cyber-enabled fraud pattern has introduced exposure that has not been assessed.',
  'Detection capability is weak or depends on a few individuals.',
  'AI has changed the fraud threat, but the organisation has not tested whether its existing controls still hold.'
];
