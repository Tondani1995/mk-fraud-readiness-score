import type { AssembledReportData, QuestionTraceRecord } from '../types';
import { ResponseLabelSourceError, type OfficialResponseLabel } from '../response-labels';
import { getQuestionPlaybook } from './question-playbooks';
import type { MaterialFinding, MaterialFindingClass, MaterialFindingSelectionReason } from './types';

/** Stable presentation order when one control qualifies under several independent rules. */
export const MATERIAL_FINDING_REASON_ORDER: readonly MaterialFindingSelectionReason[] = [
  'HARD_GATE_FAILURE',
  'CRITICAL_CONTROL_FAILURE',
  'MATURITY_CAP_EVENT',
  'CRITICAL_GAP',
  'MAJOR_GAP',
  'ABSENT_CONTROL',
  'PARTIAL_KEY_CONTROL_HIGH_EXPOSURE',
  'WEAKEST_DOMAIN',
  'EXPOSURE_CONTROL_MISMATCH',
  'MATERIAL_CONTRADICTION',
  'CROSS_DOMAIN_DEPENDENCY',
  'STRONG_AGGREGATE_MASKING_CRITICAL_WEAKNESS',
  'PRIORITY_SCENARIO_ENABLER'
];

const EXPOSURE_BY_DOMAIN: Record<string, string[]> = {
  D1: [], D2: ['EXP-01', 'EXP-02', 'EXP-03'], D3: ['EXP-01', 'EXP-05', 'EXP-07'],
  D4: ['EXP-01', 'EXP-03', 'EXP-07'], D5: ['EXP-01', 'EXP-08'], D6: ['EXP-08'],
  D7: ['EXP-02'], D8: ['EXP-03', 'EXP-04'], D9: ['EXP-04'], D10: []
};

const SCENARIO_TYPES_BY_QUESTION: Record<string, string[]> = {
  'D3-Q03': ['supplier_onboarding_fraud'], 'D3-Q04': ['access_abuse', 'segregation_of_duties_bypass'],
  'D5-Q01': ['incident_response_breakdown'], 'D5-Q05': ['evidence_compromise'],
  'D6-Q01': ['suppressed_reporting'], 'D7-Q01': ['supplier_onboarding_fraud'],
  'D7-Q04': ['supplier_payment_redirection'], 'D8-Q02': ['account_takeover', 'digital_access_abuse'],
  'D8-Q04': ['privileged_access_exploitation'], 'D8-Q05': ['digital_transaction_abuse']
};

const CROSS_DOMAIN_PARTNERS: Record<string, string[]> = {
  D3: ['D7', 'D8'], D4: ['D5'], D5: ['D4', 'D6'], D6: ['D5'], D7: ['D3'], D8: ['D3']
};

function requireOfficialScale(data: AssembledReportData): Map<number, OfficialResponseLabel> {
  const labels = data.officialResponseLabels;
  if (!Array.isArray(labels) || labels.length !== 6) {
    throw new ResponseLabelSourceError('Materiality engine requires one complete, validated 0-5 official response scale.');
  }
  const lookup = new Map(labels.map((label) => [label.responseValue, label]));
  for (let value = 0; value <= 5; value += 1) {
    const label = lookup.get(value);
    if (!label || !label.label?.trim() || !label.operationalMeaning?.trim() || !Number.isFinite(label.normalisedScore)) {
      throw new ResponseLabelSourceError(`Materiality engine official response scale is missing or malformed at response value ${value}.`);
    }
  }
  return lookup;
}

function completeTraces(data: AssembledReportData): QuestionTraceRecord[] {
  if (Array.isArray(data.questionTraces) && data.questionTraces.length > 0) return data.questionTraces;
  // Legacy test/report inputs are promoted without inventing new evidence. Production assembly
  // always supplies questionTraces; this compatibility path contains only the persisted gap rows.
  return data.criticalMajorGaps.map((gap) => ({ ...gap, normalisedScore: null, applicable: true, triggeredRules: [] }));
}

function canonicalTraces(data: AssembledReportData): QuestionTraceRecord[] {
  const byQuestion = new Map<string, QuestionTraceRecord>();
  const sorted = [...completeTraces(data)].sort((a, b) =>
    a.questionCode.localeCompare(b.questionCode) ||
    (a.responseValue ?? Number.POSITIVE_INFINITY) - (b.responseValue ?? Number.POSITIVE_INFINITY) ||
    a.prompt.localeCompare(b.prompt)
  );
  for (const trace of sorted) {
    const prior = byQuestion.get(trace.questionCode);
    if (!prior) {
      byQuestion.set(trace.questionCode, { ...trace });
      continue;
    }
    byQuestion.set(trace.questionCode, {
      ...prior,
      isCritical: prior.isCritical || trace.isCritical,
      isHardGate: prior.isHardGate || trace.isHardGate,
      isCriticalGap: prior.isCriticalGap || trace.isCriticalGap,
      isMajorGap: prior.isMajorGap || trace.isMajorGap,
      triggeredRules: [...prior.triggeredRules, ...trace.triggeredRules]
    });
  }
  return [...byQuestion.values()];
}

function highExposureLinks(data: AssembledReportData, domainCode: string): string[] {
  const relevant = EXPOSURE_BY_DOMAIN[domainCode] ?? [];
  return data.exposureAnswers
    .filter((answer) => relevant.includes(answer.factorCode))
    .filter((answer) => /high|severe/i.test(answer.selectedLabel) || answer.pointsAwarded / Math.max(answer.maxPoints, 1) >= 0.7)
    .map((answer) => answer.factorCode)
    .sort();
}

function weakestRepresentatives(data: AssembledReportData, traces: QuestionTraceRecord[]): Set<string> {
  const weakestDomains = [...data.domainResults]
    .filter((domain) => domain.rawScore !== null)
    .sort((a, b) => (a.rawScore as number) - (b.rawScore as number) || a.domainCode.localeCompare(b.domainCode))
    .slice(0, 3)
    .map((domain) => domain.domainCode);
  const selected = new Set<string>();
  for (const domainCode of weakestDomains) {
    const candidates = traces
      .filter((trace) => trace.domainCode === domainCode && trace.applicable && trace.responseValue !== null)
      .sort((a, b) =>
        (a.responseValue as number) - (b.responseValue as number) ||
        Number(b.isCritical) - Number(a.isCritical) ||
        a.questionCode.localeCompare(b.questionCode)
      );
    const weakest = candidates[0];
    // A response of 3 is officially "Implemented and in use", so weakest-domain status alone is
    // an assurance prompt, not evidence of a gap. Only emit that optional assurance priority when
    // exact question advice exists. A genuinely weak 0-2 response remains selectable regardless
    // of coverage and will fail closed later if its playbook is missing.
    const representative = weakest && (weakest.responseValue as number) <= 2
      ? weakest
      : candidates.find((trace) => getQuestionPlaybook(trace.questionCode));
    if (representative) selected.add(representative.questionCode);
  }
  return selected;
}

function weakDomains(traces: QuestionTraceRecord[]): Set<string> {
  return new Set(traces.filter((trace) => trace.applicable && trace.responseValue !== null && trace.responseValue <= 2).map((trace) => trace.domainCode));
}

function stableReasons(reasons: Set<MaterialFindingSelectionReason>): MaterialFindingSelectionReason[] {
  return MATERIAL_FINDING_REASON_ORDER.filter((reason) => reasons.has(reason));
}

function classify(reasons: MaterialFindingSelectionReason[], responseValue: number): MaterialFindingClass {
  if (reasons.includes('MATURITY_CAP_EVENT')) return 'maturity_constraint';
  if (reasons.includes('HARD_GATE_FAILURE') || reasons.includes('CRITICAL_CONTROL_FAILURE') || responseValue === 0) return 'control_failure';
  if (reasons.includes('CRITICAL_GAP') || reasons.includes('MAJOR_GAP') || reasons.includes('PARTIAL_KEY_CONTROL_HIGH_EXPOSURE')) return 'control_gap';
  if (reasons.includes('EXPOSURE_CONTROL_MISMATCH')) return 'exposure_mismatch';
  if (reasons.includes('CROSS_DOMAIN_DEPENDENCY')) return 'cross_domain_dependency';
  return 'assurance_priority';
}

/**
 * Ranking formula (higher first): hard gate 1000; critical control 500; cap linkage 450;
 * critical gap 350; major gap 250; absent control 200; high-exposure partial 150; scenario
 * enablement 120; weakest-domain 80; cross-domain dependency 70; each applicable reason 10;
 * linked high exposures 25 each; response weakness (5 - value) * 20. Tie-breakers are critical
 * flag descending, then domain code and question code ascending.
 */
function rankScore(trace: QuestionTraceRecord, reasons: MaterialFindingSelectionReason[], exposureLinks: string[]): number {
  const has = (reason: MaterialFindingSelectionReason) => reasons.includes(reason);
  return (has('HARD_GATE_FAILURE') ? 1000 : 0) + (has('CRITICAL_CONTROL_FAILURE') ? 500 : 0) +
    (has('MATURITY_CAP_EVENT') ? 450 : 0) + (has('CRITICAL_GAP') ? 350 : 0) +
    (has('MAJOR_GAP') ? 250 : 0) + (has('ABSENT_CONTROL') ? 200 : 0) +
    (has('PARTIAL_KEY_CONTROL_HIGH_EXPOSURE') ? 150 : 0) + (has('PRIORITY_SCENARIO_ENABLER') ? 120 : 0) +
    (has('WEAKEST_DOMAIN') ? 80 : 0) + (has('CROSS_DOMAIN_DEPENDENCY') ? 70 : 0) +
    reasons.length * 10 + exposureLinks.length * 25 + (5 - (trace.responseValue ?? 5)) * 20;
}

function impactCategories(domainCode: string): { financial: string; operational: string } {
  const impacts: Record<string, { financial: string; operational: string }> = {
    D1: { financial: 'Indirect -- unresolved control gaps can remain unfunded or unchallenged.', operational: 'Accountability and independent challenge may be unclear.' },
    D3: { financial: 'Direct -- access or supplier-control weakness can enable unauthorised payments or manipulation.', operational: 'Preventive controls may not match current roles or approved suppliers.' },
    D4: { financial: 'Direct -- unreviewed exceptions can allow losses to compound.', operational: 'Alert backlogs can conceal important anomalies.' },
    D5: { financial: 'Indirect -- delayed response or compromised evidence increases investigation and recovery cost.', operational: 'Containment, investigation and legal action may be weakened.' },
    D6: { financial: 'Indirect -- suppressed reporting lets fraud continue longer.', operational: 'Early-warning information may never reach an independent reviewer.' },
    D7: { financial: 'Direct -- false suppliers, invoices or bank changes can redirect payments.', operational: 'Vendor and payment integrity can be bypassed.' },
    D8: { financial: 'Direct -- compromised or privileged access can alter records and transactions.', operational: 'Digital misuse can evade prevention and monitoring.' },
    D9: { financial: 'Indirect -- staff may comply with fraudulent requests.', operational: 'Role-specific warning signs can be missed.' }
  };
  return impacts[domainCode] ?? { financial: 'Impact requires case-specific validation.', operational: 'Operating impact requires case-specific validation.' };
}

export function buildMaterialFindings(data: AssembledReportData): MaterialFinding[] {
  const officialLabels = requireOfficialScale(data);
  const traces = canonicalTraces(data).filter((trace) => trace.applicable && trace.responseValue !== null);
  const weakest = weakestRepresentatives(data, traces);
  const weakDomainSet = weakDomains(traces);
  const capRules = new Map(data.maturityCapEvents.filter((event) => event.relatedQuestionCode).map((event) => [event.relatedQuestionCode as string, event.ruleCode]));

  const findings: MaterialFinding[] = [];
  for (const trace of traces) {
    const responseValue = trace.responseValue as number;
    const label = officialLabels.get(responseValue);
    if (!label) throw new ResponseLabelSourceError(`No official response label exists for recorded response value ${responseValue}.`);
    const exposureLinks = highExposureLinks(data, trace.domainCode);
    const reasons = new Set<MaterialFindingSelectionReason>();
    const isFailure = responseValue <= 2;

    if (trace.isHardGate && isFailure) reasons.add('HARD_GATE_FAILURE');
    if (trace.isCritical && isFailure) reasons.add('CRITICAL_CONTROL_FAILURE');
    if (capRules.has(trace.questionCode)) reasons.add('MATURITY_CAP_EVENT');
    if (trace.isCriticalGap) reasons.add('CRITICAL_GAP');
    if (trace.isMajorGap) reasons.add('MAJOR_GAP');
    if (responseValue === 0) reasons.add('ABSENT_CONTROL');
    if (trace.isCritical && responseValue > 0 && responseValue <= 2 && exposureLinks.length > 0) reasons.add('PARTIAL_KEY_CONTROL_HIGH_EXPOSURE');
    if (weakest.has(trace.questionCode)) reasons.add('WEAKEST_DOMAIN');
    if (responseValue <= 2 && exposureLinks.length > 0) reasons.add('EXPOSURE_CONTROL_MISMATCH');
    if (trace.isCritical && responseValue <= 2 && data.scoreRun.overallScore >= 60) reasons.add('STRONG_AGGREGATE_MASKING_CRITICAL_WEAKNESS');
    if (responseValue <= 2 && (SCENARIO_TYPES_BY_QUESTION[trace.questionCode]?.length ?? 0) > 0) reasons.add('PRIORITY_SCENARIO_ENABLER');

    const partners = CROSS_DOMAIN_PARTNERS[trace.domainCode] ?? [];
    if (responseValue <= 2 && partners.some((domainCode) => weakDomainSet.has(domainCode))) reasons.add('CROSS_DOMAIN_DEPENDENCY');
    if (responseValue <= 2 && ((trace.domainCode === 'D4' && weakDomainSet.has('D5')) || (trace.domainCode === 'D5' && (weakDomainSet.has('D4') || weakDomainSet.has('D6'))) || (trace.domainCode === 'D6' && weakDomainSet.has('D5')))) reasons.add('MATERIAL_CONTRADICTION');

    const selectionReasons = stableReasons(reasons);
    if (selectionReasons.length === 0) continue;

    const playbook = getQuestionPlaybook(trace.questionCode);
    const materialityClass = classify(selectionReasons, responseValue);
    const isAssurance = materialityClass === 'assurance_priority';
    const impact = impactCategories(trace.domainCode);
    const diagnosisText = playbook
      ? playbook.currentStateDiagnosis(label)
      : `${trace.questionCode} was self-assessed as "${label.label}" (${label.operationalMeaning}), but no exact question playbook is registered; commercial generation must remain blocked.`;
    const failureDescription = isAssurance
      ? 'This is an assurance priority, not a failed control. The strong self-reported response should be validated with operating evidence.'
      : trace.isHardGate
        ? 'This recorded weakness affects a methodology hard gate and must be remediated before relying on the aggregate maturity result.'
        : trace.isCritical
          ? 'This recorded weakness affects a methodology critical control and warrants priority treatment.'
          : 'This recorded response and its surrounding exposure make the control materially relevant.';

    findings.push({
      id: `MF-${trace.questionCode}`,
      title: `${trace.domainName}: ${trace.prompt}`,
      domainCode: trace.domainCode,
      domainName: trace.domainName,
      questionCode: trace.questionCode,
      questionPrompt: trace.prompt,
      methodologyVersionId: data.scoreRun.methodologyVersionId,
      responseValue,
      responseLabel: label.label,
      responseOperationalMeaning: label.operationalMeaning,
      normalisedScore: label.normalisedScore,
      responseMeaning: `${label.label} — ${label.operationalMeaning}`,
      materialityClass,
      selectionReasons,
      materialityScore: rankScore(trace, selectionReasons, exposureLinks),
      isCriticalControl: trace.isCritical,
      isHardGate: trace.isHardGate,
      gapClassification: trace.isCriticalGap ? 'critical' : trace.isMajorGap ? 'major' : 'none',
      maturityCapStatus: capRules.has(trace.questionCode) ? 'capping' : 'not_capping',
      relatedCapRuleCode: capRules.get(trace.questionCode) ?? null,
      linkedExposureFactorCodes: exposureLinks,
      linkedScenarioTypes: playbook?.relatedScenarioTypes ?? SCENARIO_TYPES_BY_QUESTION[trace.questionCode] ?? [],
      diagnosis: diagnosisText,
      whyItMatters: failureDescription,
      fraudMechanism: playbook?.fraudMechanism ?? 'No control mechanism is rendered because an exact question playbook is missing.',
      likelyFinancialImpact: impact.financial,
      likelyOperationalImpact: impact.operational,
      expectedControlStandard: playbook?.expectedStandard ?? '',
      evidenceToRequest: playbook?.evidenceRequired ?? [],
      recommendedControl: playbook?.recommendedControlDesign ?? '',
      accountableOwner: playbook?.executiveAccountability ?? '',
      processOwner: playbook?.processOwnership ?? '',
      oversightFunction: playbook?.oversightFunction ?? '',
      supportingFunctions: playbook?.supportingFunctions ?? [],
      operatingFrequency: playbook?.operatingFrequency ?? '',
      minimumEvidenceCharacteristics: playbook?.minimumAcceptableEvidenceCharacteristics ?? [],
      dependencies: playbook?.dependencies ?? [],
      implementationDifficulty: playbook?.implementationDifficulty ?? 'High',
      targetPeriod: playbook?.targetPeriod ?? '90 days',
      effectivenessMeasure: playbook?.effectivenessMeasure ?? '',
      escalationThreshold: playbook?.escalationThreshold ?? '',
      playbookSource: playbook ? `question-playbooks:${trace.questionCode}` : null,
      fallbackStatus: playbook ? 'exact_question_playbook' : 'missing_question_playbook',
      selfAssessmentLimitation: 'Self-reported assessment response only; no document, interview, transaction sample or system evidence has been independently verified.'
    });
  }

  return findings.sort((a, b) =>
    b.materialityScore - a.materialityScore ||
    Number(b.isCriticalControl) - Number(a.isCriticalControl) ||
    a.domainCode.localeCompare(b.domainCode) ||
    a.questionCode.localeCompare(b.questionCode)
  );
}
