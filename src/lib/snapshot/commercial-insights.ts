import type { FreeSnapshot, FreeSnapshotDomain } from '@/lib/snapshot/free-snapshot';

export const COMMERCIAL_OPTION_CODES = {
  fullReport: 'full_report_5000',
  personalisedReport: 'personalised_report_50000'
} as const;

export type CommercialOptionCode = typeof COMMERCIAL_OPTION_CODES[keyof typeof COMMERCIAL_OPTION_CODES];

export type CommercialDomainInsight = {
  domainName: string;
  readinessStatus: string;
  finding: string;
  implication: string;
  coveragePct: number;
  criticalGapCount: number;
};

export type CommercialSnapshotInsights = {
  scoreBand: string;
  currentPosition: string;
  riskImplication: string;
  leadershipPriority: string;
  criticalGapIndicator: boolean;
  coverageMessage: string | null;
  priorityAreas: CommercialDomainInsight[];
  strengths: CommercialDomainInsight[];
  strengthContext: string;
  freeSnapshotValue: string[];
  paidReportValue: string[];
};

function round(value: number) {
  return Math.round(value);
}

export function commercialScoreBand(score: number) {
  if (score < 40) return 'high_attention';
  if (score < 60) return 'developing';
  if (score < 80) return 'structured';
  return 'strong';
}

function statusForScore(score: number | null) {
  if (score === null) return 'Not scored';
  if (score < 40) return 'High attention required';
  if (score < 60) return 'Developing control area';
  if (score < 80) return 'Structured control area';
  return 'Relative strength';
}

function publicDomainName(domainName: string) {
  return domainName
    .replace(/^\s*D\d+\s*[-:]\s*/i, '')
    .replace(/\s*\([A-Z0-9-]+\)\s*$/i, '')
    .trim() || 'Readiness area';
}

function keyword(domain: FreeSnapshotDomain) {
  const name = domain.domainName.toLowerCase();
  if (name.includes('governance')) return 'governance';
  if (name.includes('people') || name.includes('culture')) return 'people';
  if (name.includes('process') || name.includes('control')) return 'controls';
  if (name.includes('technology') || name.includes('data')) return 'technology';
  if (name.includes('detection') || name.includes('monitor')) return 'detection';
  if (name.includes('response') || name.includes('incident')) return 'response';
  if (name.includes('third') || name.includes('supplier') || name.includes('vendor')) return 'third_party';
  return 'general';
}

function findingFor(domain: FreeSnapshotDomain) {
  const score = domain.rawScore ?? 0;
  if (domain.criticalGapCount > 0) {
    return 'One or more priority controls in this area need leadership attention before the score can be treated as reliable comfort.';
  }
  if (score < 40) return 'The current responses point to a low-control posture in this area.';
  if (score < 60) return 'The basics are present, but the area is not yet consistently controlled.';
  if (score < 80) return 'The area appears structured, with room to tighten consistency and evidence.';
  return 'The responses suggest this area is comparatively well established.';
}

function implicationFor(domain: FreeSnapshotDomain) {
  const key = keyword(domain);
  const score = domain.rawScore ?? 0;
  if (domain.criticalGapCount > 0) {
    return 'This can limit the practical value of strengths elsewhere because a weak priority control may still leave the organisation exposed.';
  }

  if (score < 60) {
    const weak: Record<string, string> = {
      governance: 'Decision-makers may not have enough clarity, accountability or evidence to steer fraud risk consistently.',
      people: 'Staff awareness and escalation habits may be uneven when fraud indicators appear.',
      controls: 'Key fraud-prevention routines may depend too heavily on informal practice rather than repeatable controls.',
      technology: 'Digital activity may be growing faster than the controls and evidence needed to monitor it.',
      detection: 'Fraud indicators may be noticed late or inconsistently across channels.',
      response: 'Response steps may be slower or less coordinated than a live incident would require.',
      third_party: 'External-party risk may not be visible enough for confident oversight.',
      general: 'The organisation may be carrying more residual exposure than the headline score alone suggests.'
    };
    return weak[key] ?? weak.general;
  }

  const positive: Record<string, string> = {
    governance: 'This gives leadership a useful base for more disciplined fraud-risk oversight.',
    people: 'This creates a useful platform for clearer accountability and escalation behaviours.',
    controls: 'This gives MK a stronger base to validate control depth in the paid report.',
    technology: 'This can support more reliable monitoring if matched with evidence and ownership.',
    detection: 'This can improve early warning if evidence and follow-through are consistent.',
    response: 'This gives the organisation a better base for coordinated incident handling.',
    third_party: 'This can support more confident supplier and external-party oversight.',
    general: 'This gives the organisation a useful base to build from.'
  };
  return positive[key] ?? positive.general;
}

function toInsight(domain: FreeSnapshotDomain): CommercialDomainInsight {
  return {
    domainName: publicDomainName(domain.domainName),
    readinessStatus: statusForScore(domain.rawScore),
    finding: findingFor(domain),
    implication: implicationFor(domain),
    coveragePct: round(domain.coveragePct),
    criticalGapCount: domain.criticalGapCount
  };
}

function scoredDomains(snapshot: FreeSnapshot) {
  return snapshot.domains
    .map((domain, index) => ({ domain, index }))
    .filter(({ domain }) => domain.rawScore !== null && domain.coveragePct > 0);
}

function currentPosition(snapshot: FreeSnapshot) {
  const score = round(snapshot.overallScore);
  const maturity = snapshot.finalMaturity;
  if (snapshot.capApplied) {
    return `${snapshot.organisationName} currently sits at ${maturity} readiness with a score of ${score}/100. The maturity interpretation has been limited by priority-control conditions, so the headline score should be read with care.`;
  }
  return `${snapshot.organisationName} currently sits at ${maturity} readiness with a score of ${score}/100. This is enough to show direction, but not enough to replace the full paid analysis.`;
}

function riskImplication(snapshot: FreeSnapshot) {
  const exposure = String(snapshot.exposureBand ?? '').toLowerCase();
  if (exposure.includes('high') || exposure.includes('severe')) {
    return `The exposure profile is ${snapshot.exposureBand}, so weak or inconsistent controls may create practical fraud pressure faster than the overall score suggests.`;
  }
  if (exposure.includes('moderate')) {
    return 'The exposure profile is moderate, which means the next improvement decisions should focus on the controls most likely to reduce avoidable fraud pressure.';
  }
  return 'The exposure profile appears lower, but the readiness result still shows where control discipline and evidence can be strengthened.';
}

function leadershipPriority(snapshot: FreeSnapshot) {
  if (snapshot.criticalGapCount > 0) {
    return `Leadership should first understand the ${snapshot.criticalGapCount} priority control gap${snapshot.criticalGapCount === 1 ? '' : 's'} before relying on the headline score.`;
  }
  if (snapshot.capApplied) return 'Leadership should first understand why the final maturity band was capped before planning improvements.';
  if (snapshot.overallScore < 60) return 'Leadership should prioritise a small number of high-impact controls before expanding the improvement plan.';
  return 'Leadership should use the paid report to confirm which strengths are durable and which controls still need evidence.';
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
    .filter(({ domain }) => Number(domain.rawScore ?? 0) >= 70 && domain.coveragePct >= 70 && domain.criticalGapCount === 0)
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

export function buildCommercialSnapshotInsights(snapshot: FreeSnapshot): CommercialSnapshotInsights {
  const priority = priorityAreas(snapshot);
  const positive = strengths(snapshot);

  return {
    scoreBand: commercialScoreBand(snapshot.overallScore),
    currentPosition: currentPosition(snapshot),
    riskImplication: riskImplication(snapshot),
    leadershipPriority: leadershipPriority(snapshot),
    criticalGapIndicator: snapshot.criticalGapCount > 0 || snapshot.capApplied,
    coverageMessage: coverageMessage(snapshot),
    priorityAreas: priority,
    strengths: positive,
    strengthContext: positive.length
      ? 'These strengths are useful, but the paid report still needs to test whether they are evidenced, repeatable and strong enough to offset weaker areas.'
      : 'No clear strengths are promoted in this free snapshot because the paid report should first test the consistency and evidence behind the responses.',
    freeSnapshotValue: [
      'Your overall readiness score and maturity band',
      'A short interpretation of exposure, coverage and priority areas',
      'A limited view designed for decision-making, not implementation planning'
    ],
    paidReportValue: [
      'A structured PDF report based on the submitted assessment results',
      'More detailed interpretation by domain and control area',
      'MK-controlled fulfilment after manual EFT confirmation, emailed within one business day'
    ]
  };
}
