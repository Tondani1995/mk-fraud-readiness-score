import type { FreeSnapshot, FreeSnapshotDomain } from '@/lib/snapshot/free-snapshot';

export const COMMERCIAL_OPTION_CODES = {
  fullReport: 'full_report_5000',
  personalisedReport: 'personalised_report_50000'
} as const;

export type CommercialOptionCode = typeof COMMERCIAL_OPTION_CODES[keyof typeof COMMERCIAL_OPTION_CODES];
export type CommercialScoreBand = 'Reactive' | 'Developing' | 'Structured' | 'Strategic';

export type CommercialDomainInsight = {
  domainCode: string;
  domainName: string;
  readinessStatus: string;
  finding: string;
  implication: string;
  coveragePct: number;
  criticalGapCount: number;
  focusArea?: string;
};

export type CommercialSnapshotInsights = {
  scoreBand: CommercialScoreBand;
  currentPosition: string;
  riskImplication: string;
  leadershipPriority: string;
  conciseInterpretation: string;
  criticalGapIndicator: boolean;
  coverageMessage: string | null;
  priorityAreas: CommercialDomainInsight[];
  strengths: CommercialDomainInsight[];
  strengthContext: string;
  freeSnapshotValue: string[];
  paidReportValue: string[];
};

type DomainContent = {
  name: string;
  focusArea?: string;
  findings: {
    critical: string;
    immediate: string;
    developing: string;
    structured: string;
    stronger: string;
  };
  implications: {
    critical: string;
    immediate: string;
    developing: string;
    structured: string;
    stronger: string;
  };
};

const CURRENT_POSITION_BY_BAND: Record<CommercialScoreBand, string> = {
  Reactive: 'Your responses indicate that fraud controls are presently fragmented, largely reactive or dependent on individual intervention. The organisation has limited assurance that fraud risks are being identified and controlled consistently across the operating environment.',
  Developing: 'Your responses indicate that the organisation has established some important fraud-control foundations, but these controls are not yet consistently embedded across the operating environment.',
  Structured: 'The organisation has established a comparatively structured fraud-control environment across several areas. The principal opportunity is now to improve consistency, integration and evidence that these controls operate effectively across the organisation.',
  Strategic: 'The organisation demonstrates comparatively mature fraud-control practices across several areas. Continued assurance will depend on maintaining effective oversight, responding to emerging fraud exposures and preventing stronger controls from creating false comfort around weaker areas.'
};

const RISK_IMPLICATION_BY_EXPOSURE: Record<string, string> = {
  Low: 'The current exposure profile is comparatively contained, but control weaknesses should still be addressed before changes in operating scale, channels or third-party reliance increase the opportunity for fraud.',
  Moderate: 'The organisation’s operating environment creates meaningful fraud exposure. Inconsistent ownership, monitoring or exception handling may therefore allow weaknesses to remain undetected between functions or systems.',
  High: 'The organisation operates with substantial fraud exposure. Existing controls may perform adequately in routine circumstances but become less dependable when fraud activity crosses departments, systems, channels or third parties.',
  Severe: 'The organisation’s exposure profile creates a heightened need for coordinated and demonstrable fraud controls. Fragmented control ownership or delayed detection could allow an incident to escalate before management has a complete view of the activity.'
};

export const DOMAIN_CONTENT_BY_CODE: Record<string, DomainContent> = {
  D1: {
    name: 'Fraud Leadership and Governance',
    focusArea: 'fraud_governance_oversight',
    findings: {
      critical: 'Governance ownership for fraud risk needs immediate management attention.',
      immediate: 'Fraud leadership and accountability are not yet sufficiently structured.',
      developing: 'Ownership exists in parts, but authority, reporting rhythm and evidence are not yet consistent.',
      structured: 'Governance structures are visible, with further work needed to evidence consistent oversight.',
      stronger: 'Leadership oversight provides a stronger foundation for fraud-readiness decisions.'
    },
    implications: {
      critical: 'A weak governance control can undermine confidence in stronger domain results elsewhere.',
      immediate: 'Decision-makers may lack a dependable view of fraud risk until an issue has already surfaced.',
      developing: 'Fraud-readiness activity may remain dependent on individuals rather than a durable leadership system.',
      structured: 'The next management focus is proving that oversight works consistently across reporting cycles.',
      stronger: 'This gives leadership a useful base for assurance, provided oversight remains active and evidenced.'
    }
  },
  D2: {
    name: 'Fraud Risk Identification',
    focusArea: 'fraud_risk_identification_assessment',
    findings: {
      critical: 'Fraud-risk identification contains a priority weakness that should be addressed before relying on the wider result.',
      immediate: 'The organisation has limited structured visibility of where fraud risk sits.',
      developing: 'Some fraud risks are known, but the full operating picture is not yet mapped consistently.',
      structured: 'Fraud risks are identified in a structured way, with attention needed as the business changes.',
      stronger: 'Risk identification appears comparatively mature and can support better prioritisation.'
    },
    implications: {
      critical: 'Material risk areas may be missed if the underlying assessment discipline is weak.',
      immediate: 'Exposure may be discovered through incidents rather than through planned risk review.',
      developing: 'Gaps in the risk map may remain hidden between functions, systems or new initiatives.',
      structured: 'The main risk is the risk map becoming stale as channels, suppliers or roles change.',
      stronger: 'This foundation helps leadership focus attention where fraud opportunity is most material.'
    }
  },
  D3: {
    name: 'Operational Fraud Controls',
    focusArea: 'operational_fraud_controls',
    findings: {
      critical: 'A priority operational-control weakness requires management focus.',
      immediate: 'Day-to-day processes do not yet show enough built-in fraud protection.',
      developing: 'Some operational controls exist, but they are not yet applied consistently.',
      structured: 'Core operational controls are present, with further work needed on consistency and evidence.',
      stronger: 'Operational controls appear comparatively well established in the assessed areas.'
    },
    implications: {
      critical: 'A weak operational control may create direct opportunity for loss even where other domains look stronger.',
      immediate: 'Protection may depend too heavily on trust, familiarity or manual intervention.',
      developing: 'Fraud protection may vary depending on which process or team handles an activity.',
      structured: 'Management should test whether controls operate reliably under pressure and across exceptions.',
      stronger: 'This provides a useful control foundation, provided it remains current and independently checked.'
    }
  },
  D4: {
    name: 'Fraud Detection Capability',
    focusArea: 'fraud_monitoring_detection',
    findings: {
      critical: 'A priority detection weakness may limit the organisation’s ability to identify fraud early.',
      immediate: 'Detection capability is not yet sufficiently structured or dependable.',
      developing: 'Monitoring exists in parts, but escalation and review are not yet consistently embedded.',
      structured: 'Detection mechanisms are present, with improvement needed in coverage, review or escalation.',
      stronger: 'Detection capability appears comparatively mature across the assessed areas.'
    },
    implications: {
      critical: 'Delayed detection can allow suspicious activity to continue before management has a complete view.',
      immediate: 'The organisation may rely too heavily on prevention working perfectly.',
      developing: 'Warning signs may not reliably reach the people with authority to act.',
      structured: 'The next focus is whether monitoring keeps pace with new fraud methods and data patterns.',
      stronger: 'This improves early-warning capability if review and escalation remain active.'
    }
  },
  D5: {
    name: 'Fraud Incident Response',
    focusArea: 'incident_response_investigations',
    findings: {
      critical: 'A priority incident-response weakness requires attention before a live incident tests the organisation.',
      immediate: 'Incident response would likely depend on improvised judgement under pressure.',
      developing: 'Response elements exist, but roles, evidence handling or escalation are not yet consistently embedded.',
      structured: 'Incident response is comparatively structured, with rehearsal and evidence discipline still important.',
      stronger: 'Incident response appears comparatively mature and provides a stronger operating base.'
    },
    implications: {
      critical: 'A weak response control can increase loss, evidence risk and management uncertainty during an incident.',
      immediate: 'The first significant incident may become the first real test of responsibilities and decision-making.',
      developing: 'Plans that are not rehearsed may behave differently when time pressure and confidentiality matter.',
      structured: 'The main opportunity is to prove that response steps work consistently during realistic scenarios.',
      stronger: 'This supports better containment and learning when incidents or near misses occur.'
    }
  },
  D6: {
    name: 'Whistleblowing and Reporting Culture',
    focusArea: 'fraud_culture_awareness',
    findings: {
      critical: 'A priority speak-up or reporting weakness requires management attention.',
      immediate: 'The organisation does not yet show a dependable route for concerns to surface safely.',
      developing: 'Reporting channels or awareness exist, but trust and consistency are not yet fully evidenced.',
      structured: 'People have clearer ways to raise concerns, with ongoing attention needed to independence and trust.',
      stronger: 'Speak-up mechanisms appear comparatively well established.'
    },
    implications: {
      critical: 'Weak reporting channels can allow concerns to remain hidden until they become harder to manage.',
      immediate: 'Silence may be misread as absence of fraud risk rather than lack of a trusted reporting route.',
      developing: 'A channel that is not trusted or understood may not generate useful early-warning signals.',
      structured: 'The next focus is maintaining confidence that reports are handled consistently and without retaliation.',
      stronger: 'This creates a stronger base for early detection through people and external stakeholders.'
    }
  },
  D7: {
    name: 'Third-Party and Supply Chain Fraud Risk',
    focusArea: 'third_party_supplier_procurement_risk',
    findings: {
      critical: 'A priority third-party or supplier-risk weakness requires management focus.',
      immediate: 'Third-party fraud risk is not yet sufficiently controlled or monitored.',
      developing: 'Some supplier and third-party checks exist, but monitoring is not yet consistent.',
      structured: 'Third-party controls are comparatively structured, with attention needed to ongoing monitoring.',
      stronger: 'Third-party risk management appears comparatively mature in the assessed areas.'
    },
    implications: {
      critical: 'A weak supplier or payment control can create direct fraud opportunity outside normal internal visibility.',
      immediate: 'Suppliers or intermediaries may be trusted by default rather than managed as a fraud-risk channel.',
      developing: 'Initial checks may not be enough once a relationship changes or becomes routine.',
      structured: 'The next focus is whether high-risk relationships are reviewed as conditions change.',
      stronger: 'This supports more confident oversight of external-party fraud exposure.'
    }
  },
  D8: {
    name: 'Digital and Identity Fraud Risk',
    focusArea: 'digital_identity_channel_fraud',
    findings: {
      critical: 'A priority digital or identity-control weakness requires attention.',
      immediate: 'Digital and identity-fraud controls are not yet sufficiently dependable.',
      developing: 'Some digital controls exist, but coverage is not yet consistent across channels or systems.',
      structured: 'Digital controls are present, with continued review needed as fraud methods change.',
      stronger: 'Digital and identity controls appear comparatively mature across the assessed areas.'
    },
    implications: {
      critical: 'Weak digital controls can allow fraud activity to move quickly across accounts, channels or identities.',
      immediate: 'Digital exposure may be growing faster than the organisation’s monitoring and verification controls.',
      developing: 'Partial control coverage may leave gaps across customer, staff or platform activity.',
      structured: 'The next focus is maintaining relevance as digital fraud methods evolve.',
      stronger: 'This supports a stronger posture against fast-moving identity and channel fraud.'
    }
  },
  D9: {
    name: 'Fraud Culture and Awareness',
    focusArea: 'fraud_culture_awareness',
    findings: {
      critical: 'A priority culture or awareness weakness requires management attention.',
      immediate: 'People may not yet be equipped to recognise fraud risk in everyday work.',
      developing: 'Awareness activity exists, but it has not yet become a consistent operating habit.',
      structured: 'Fraud awareness is comparatively structured, with further work needed to reinforce behaviour.',
      stronger: 'Fraud culture and awareness appear comparatively mature in the assessed areas.'
    },
    implications: {
      critical: 'A weak awareness foundation can reduce the effectiveness of policies, reporting channels and controls.',
      immediate: 'Fraud indicators may be missed even when they are visible to staff.',
      developing: 'Training may fade if it is not refreshed through practical scenarios and leadership reinforcement.',
      structured: 'The next focus is measuring whether awareness changes behaviour and escalation habits.',
      stronger: 'This helps staff recognise and escalate issues before they become harder to manage.'
    }
  },
  D10: {
    name: 'Continuous Improvement and Fraud Risk Monitoring',
    focusArea: 'fraud_risk_identification_assessment',
    findings: {
      critical: 'A priority monitoring or improvement weakness requires management focus.',
      immediate: 'Fraud controls are not yet reviewed consistently enough against current risks.',
      developing: 'Reviews happen in parts, but the rhythm is not yet dependable.',
      structured: 'Review and improvement activity is comparatively structured, with speed and evidence still important.',
      stronger: 'Continuous improvement appears comparatively mature in the assessed areas.'
    },
    implications: {
      critical: 'Controls can become outdated while management still assumes they remain effective.',
      immediate: 'A control environment that is not reviewed may be untested against current fraud methods.',
      developing: 'Review activity may slip during busy periods, when fraud exposure can increase.',
      structured: 'The next focus is ensuring lessons and trend monitoring translate into control improvement.',
      stronger: 'This supports an adaptive fraud-readiness posture as the organisation and threat landscape change.'
    }
  }
};

function round(value: number) {
  return Math.round(value);
}

export function commercialScoreBand(score: number): CommercialScoreBand {
  if (score < 40) return 'Reactive';
  if (score < 60) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Strategic';
}

export function readinessLabelForScore(score: number | null) {
  if (score === null) return 'Not scored';
  if (score < 40) return 'Immediate attention';
  if (score < 60) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Stronger foundation';
}

function conditionFor(domain: FreeSnapshotDomain): keyof DomainContent['findings'] {
  const score = domain.rawScore ?? 0;
  if (domain.criticalGapCount > 0) return 'critical';
  if (score < 40) return 'immediate';
  if (score < 60) return 'developing';
  if (score < 80) return 'structured';
  return 'stronger';
}

function defensiveDomainContent(domain: FreeSnapshotDomain): DomainContent {
  return {
    name: domain.domainName || 'Readiness area',
    findings: {
      critical: 'This area contains a priority weakness requiring management attention.',
      immediate: 'This area requires immediate management attention.',
      developing: 'This area is developing but not yet consistently embedded.',
      structured: 'This area appears structured, with further evidence and consistency required.',
      stronger: 'This area provides a stronger foundation in the submitted responses.'
    },
    implications: {
      critical: 'A priority weakness in this area can limit confidence in the broader readiness result.',
      immediate: 'Weaknesses in this area may leave the organisation exposed until controls are formalised.',
      developing: 'Inconsistent practice may reduce the reliability of the broader control environment.',
      structured: 'Management should test whether controls operate reliably across relevant conditions.',
      stronger: 'This area can support broader fraud-readiness improvement if maintained and evidenced.'
    }
  };
}

function contentFor(domain: FreeSnapshotDomain) {
  return DOMAIN_CONTENT_BY_CODE[domain.domainCode] ?? defensiveDomainContent(domain);
}

function toInsight(domain: FreeSnapshotDomain): CommercialDomainInsight {
  const content = contentFor(domain);
  const condition = conditionFor(domain);
  return {
    domainCode: domain.domainCode,
    domainName: content.name,
    readinessStatus: readinessLabelForScore(domain.rawScore),
    finding: content.findings[condition],
    implication: content.implications[condition],
    coveragePct: round(domain.coveragePct),
    criticalGapCount: domain.criticalGapCount,
    focusArea: content.focusArea
  };
}

function scoredDomains(snapshot: FreeSnapshot) {
  return snapshot.domains
    .map((domain, index) => ({ domain, index }))
    .filter(({ domain }) => domain.rawScore !== null && domain.coveragePct > 0);
}

function leadershipPriority(snapshot: FreeSnapshot, band: CommercialScoreBand) {
  if (snapshot.capApplied) return 'Leadership should address the control weakness that triggered the readiness cap before relying on the broader score as evidence of a dependable fraud-control environment.';
  if (snapshot.criticalGapCount > 0) return 'Leadership attention should prioritise the identified critical-control weaknesses and establish clear ownership, remediation dates and evidence of sustained operation.';
  if (band === 'Reactive' || band === 'Developing') return 'Leadership attention should move from individual control activities to a coordinated fraud-readiness programme with clear ownership, measurable oversight and prioritised remediation.';
  return 'Leadership should focus on control consistency, independent assurance and the areas where stronger overall maturity could conceal concentrated weaknesses.';
}

function riskImplication(snapshot: FreeSnapshot) {
  return RISK_IMPLICATION_BY_EXPOSURE[snapshot.exposureBand] ?? RISK_IMPLICATION_BY_EXPOSURE.Low;
}

function coverageMessage(snapshot: FreeSnapshot) {
  if (snapshot.nARatePct <= 0 && snapshot.coveragePct >= 100) return null;
  return `Coverage is ${round(snapshot.coveragePct)}%. Not-applicable responses are excluded from the score, so they do not inflate readiness; they reduce the evidence base available for interpretation.`;
}

function priorityAreas(snapshot: FreeSnapshot) {
  return scoredDomains(snapshot)
    .sort((a, b) => {
      const gapDelta = b.domain.criticalGapCount - a.domain.criticalGapCount;
      if (gapDelta) return gapDelta;
      const scoreDelta = Number(a.domain.rawScore ?? 100) - Number(b.domain.rawScore ?? 100);
      if (scoreDelta) return scoreDelta;
      const weightDelta = b.domain.weightPct - a.domain.weightPct;
      if (weightDelta) return weightDelta;
      return a.index - b.index;
    })
    .slice(0, 3)
    .map(({ domain }) => toInsight(domain));
}

function strengths(snapshot: FreeSnapshot) {
  return scoredDomains(snapshot)
    .filter(({ domain }) => Number(domain.rawScore ?? 0) >= 80 && domain.coveragePct >= 70 && domain.criticalGapCount === 0)
    .sort((a, b) => {
      const scoreDelta = Number(b.domain.rawScore ?? 0) - Number(a.domain.rawScore ?? 0);
      if (scoreDelta) return scoreDelta;
      const coverageDelta = b.domain.coveragePct - a.domain.coveragePct;
      if (coverageDelta) return coverageDelta;
      const weightDelta = b.domain.weightPct - a.domain.weightPct;
      if (weightDelta) return weightDelta;
      return a.index - b.index;
    })
    .slice(0, 2)
    .map(({ domain }) => toInsight(domain));
}

export function defaultFocusAreasForInsights(insights: CommercialSnapshotInsights) {
  const fromPriority = insights.priorityAreas.map((area) => area.focusArea).filter((area): area is string => Boolean(area));
  return fromPriority.length ? Array.from(new Set(fromPriority)).slice(0, 5) : ['fraud_governance_oversight'];
}

export function buildCommercialSnapshotInsights(snapshot: FreeSnapshot): CommercialSnapshotInsights {
  const band = commercialScoreBand(snapshot.overallScore);
  const priority = priorityAreas(snapshot);
  const positive = strengths(snapshot);

  return {
    scoreBand: band,
    currentPosition: CURRENT_POSITION_BY_BAND[band],
    riskImplication: riskImplication(snapshot),
    leadershipPriority: leadershipPriority(snapshot, band),
    conciseInterpretation: `The submitted assessment places the organisation in a ${snapshot.finalMaturity} fraud-readiness position with ${readinessLabelForScore(snapshot.overallScore).toLowerCase()} overall readiness.`,
    criticalGapIndicator: snapshot.criticalGapCount > 0 || snapshot.capApplied,
    coverageMessage: coverageMessage(snapshot),
    priorityAreas: priority,
    strengths: positive,
    strengthContext: positive.length
      ? 'These areas provide useful foundations for management attention, provided they remain evidenced, repeatable and actively reviewed.'
      : 'The assessment did not identify a sufficiently mature control area to present as a dependable organisational strength. This does not mean that no controls exist. It means that the evidence supplied does not yet support treating any area as consistently embedded.',
    freeSnapshotValue: [
      'Overall readiness score',
      'Maturity position',
      'Executive interpretation',
      'Priority-area preview',
      'Selected organisational strengths',
      'High-level next step'
    ],
    paidReportValue: [
      'Detailed analysis across all applicable domains',
      'Explanation of the controls and gaps driving the score',
      'Critical weaknesses and false-comfort risks',
      'Prioritised management actions',
      '30/60/90-day fraud-readiness roadmap',
      'Leadership agenda',
      'Expert quality review',
      'Professionally prepared PDF report'
    ]
  };
}
