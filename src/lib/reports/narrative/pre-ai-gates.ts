import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import type { NarrativeWriterBrief } from './writer-brief';

export interface PreAiGateResult {
  gate: string;
  status: 'PASS' | 'FAIL';
  detail: string;
}

export interface PreAiGateReport {
  title: string;
  status: 'PASS' | 'FAIL';
  results: PreAiGateResult[];
  checkedAt: string;
}

const forbidden = /methodology hard gate|aggregate maturity result|normalised score|requires evidence before verified|evidence validation|independent evidence review|self-reported claims remain unverified|apply immediate escalation|deliver the exact control design|independently validate/i;
const machineHeading = /\b[A-Z]{3,}(?:_[A-Z0-9]+){1,}\b/;
const APPROVED_THEME_ANCHORS: Record<string, string[]> = {
  FRAUD_GOVERNANCE_AND_RISK_DISCIPLINE: ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT'],
  SUPPLIER_PAYMENT_INTEGRITY: ['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT'],
  IDENTITY_ACCESS_GOVERNANCE: ['ORDINARY_ACCESS', 'PRIVILEGED_ACCESS'],
  IDENTITY_VERIFICATION_SENSITIVE_CHANGE: ['IDENTITY_VERIFICATION'],
  DETECTION_MONITORING: ['DETECTION_MONITORING'],
  INCIDENT_RESPONSE_EVIDENCE_INTEGRITY: ['INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING']
};
const APPROVED_PATHWAY_FAMILIES = new Set([
  'SUPPLIER_PAYMENT_DIVERSION', 'PRIVILEGED_ACCESS_MISUSE', 'DETECTION_EVASION', 'IDENTITY_IMPERSONATION', 'INCIDENT_CONCEALMENT'
]);
const SUPPLIER_FAMILIES = new Set(['SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE', 'THIRD_PARTY_OVERSIGHT']);
const DECISION_FAMILY_LABELS = new Set([
  'Fraud governance model', 'Privileged-access operating standard', 'Identity verification model',
  'Detection operating model', 'Incident and evidence model', 'Supplier verification model', 'Control-effectiveness cadence'
]);

function check(gate: string, condition: boolean, pass: string, fail: string): PreAiGateResult {
  return { gate, status: condition ? 'PASS' : 'FAIL', detail: condition ? pass : fail };
}

function packText(pack: NarrativeFactPack): string {
  return JSON.stringify({ themes: pack.systemicThemeInputs, findings: pack.findings, risks: pack.risks, scenarios: pack.scenarios, controls: pack.controls, decisions: pack.decisions, roadmap: pack.roadmap, maturationSteps: pack.maturationSteps, proofOfProgress: pack.proofOfProgress });
}

function proseText(value: unknown, key = ''): string {
  if (/operatingContext/i.test(key)) return '';
  if (/^(key|certainty|sourceGatewayCode|sourceQuestionId|sourcePrompt|sourceOptionId|sourceOptionLabel|graphVersion|graphFingerprint|provenance|customerNarrativeAllowed)$/i.test(key)) return '';
  if (typeof value === 'string') return /(?:id|ref|code|family|category|source|questionCode|targetPeriod|phase|semantic|materiality|decisionFamily|fraudPathway)/i.test(key) ? '' : value;
  if (Array.isArray(value)) return value.map((item) => proseText(item, key)).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).map(([childKey, childValue]) => proseText(childValue, childKey)).join(' ');
  return '';
}

export function runPreAiFactPackGates(pack: NarrativeFactPack, plan: NarrativeStoryPlan, writerBrief?: NarrativeWriterBrief): PreAiGateReport {
  const findings = new Set(pack.findings.map((finding) => finding.factRef));
  const covered = new Set(pack.systemicThemeInputs.flatMap((theme) => theme.findingRefs));
  const sustainment = pack.narrativeMode === 'SUSTAINMENT';
  const sparseHighReadiness = Boolean(pack.highReadinessSparseNarrativeReason);
  const themeRange = sustainment ? [0, 0] : sparseHighReadiness ? [1, 5] : [3, 5];
  const scenarioRange = sustainment ? [0, 0] : pack.productTier === 'essential' ? (sparseHighReadiness ? [0, 3] : [2, 3]) : sparseHighReadiness ? [0, 4] : [2, 4];
  const scenarioText = pack.scenarios.map((scenario) => `${scenario.title} ${scenario.actorClass} ${scenario.opportunity} ${scenario.entryPoint} ${scenario.mechanism} ${scenario.currentControlWeakness} ${scenario.requiredControlResponse} ${scenario.concealment} ${scenario.consequence} ${scenario.immediateContainment} ${scenario.longTermResponse}`).join(' ');
  const decisionText = pack.decisions.map((decision) => `${decision.question} ${decision.recommendedRoute} ${decision.rationale} ${decision.consequenceOfDelay}`).join(' ');
  const roadmapText = pack.roadmap.map((item) => `${item.managementOutcome} ${item.priorityWork} ${item.proofOfCompletion} ${item.failureTrigger}`).join(' ');
  const optionSignatures = pack.decisions.map((decision) => decision.options.map((option) => option.option).join('|'));
  const themeFindingSets = pack.systemicThemeInputs.map((theme) => new Set(theme.findingRefs));
  const jaccard = (left: Set<string>, right: Set<string>) => {
    const intersection = [...left].filter((item) => right.has(item)).length;
    const union = new Set([...left, ...right]).size;
    return union === 0 ? 0 : intersection / union;
  };
  const themeFamilyCompatibility = pack.systemicThemeInputs.every((theme) => (APPROVED_THEME_ANCHORS[theme.themeFamily] ?? []).some((family) => theme.semanticFamilies.includes(family as never)));
  const themeDuplicateFree = themeFindingSets.every((set, index) => themeFindingSets.slice(index + 1).every((other) => ![...set].every((item) => other.has(item)) || jaccard(set, other) <= 0.75));
  const themeManagementDistinct = new Set(pack.systemicThemeInputs.map((theme) => theme.managementQuestion)).size === pack.systemicThemeInputs.length;
  const roadmapCompatible = sustainment
    ? pack.roadmap.every((item) => !item.sourceFindingRef && Boolean(item.sourceSustainmentPriorityRef) && pack.sustainmentPriorities.some((priority) => priority.factRef === item.sourceSustainmentPriorityRef))
    : pack.roadmap.every((item) => item.sourceFindingRef && pack.findings.some((finding) => finding.factRef === item.sourceFindingRef && finding.primarySemanticFamily === item.primarySemanticFamily));
  const scenarioCompatible = pack.scenarios.every((scenario) => pack.findings.filter((finding) => scenario.linkedFindingRefs.includes(finding.factRef)).some((finding) => finding.fraudPathwayFamilies.includes(scenario.scenarioFamily)));
  const sanitizedText = JSON.stringify(writerBrief ?? {});
  const supplierFindingRefs = pack.findings.filter((finding) => SUPPLIER_FAMILIES.has(finding.primarySemanticFamily)).map((finding) => finding.factRef);
  const supplierPathwayFindingRefs = pack.findings.filter((finding) => SUPPLIER_FAMILIES.has(finding.primarySemanticFamily) && finding.fraudPathwayFamilies.includes('SUPPLIER_PAYMENT_DIVERSION')).map((finding) => finding.factRef);
  const supplierTheme = pack.systemicThemeInputs.find((theme) => supplierFindingRefs.length > 0 && supplierFindingRefs.every((ref) => theme.findingRefs.includes(ref)));
  const supplierScenario = pack.scenarios.find((scenario) => supplierPathwayFindingRefs.length > 0 && supplierPathwayFindingRefs.every((ref) => scenario.linkedFindingRefs.includes(ref)) && scenario.scenarioFamily === 'SUPPLIER_PAYMENT_DIVERSION');
  const briefRisks = writerBrief?.risks ?? [];
  const briefScenarios = writerBrief?.scenarios ?? [];
  const briefControls = writerBrief?.controls ?? [];
  const briefThemes = writerBrief?.themes ?? [];
  const briefRoadmap = writerBrief?.roadmap ?? [];
  const briefDecisions = writerBrief?.decisions ?? [];
  const briefProof = writerBrief?.proofOfProgress ?? [];
  const briefMaturation = writerBrief?.maturationSteps ?? [];
  const decisionThemeSupport: Record<string, RegExp> = {
    'Fraud governance model': /fraud governance|risk-management|governance/i,
    'Privileged-access operating standard': /privileged access|identity and access|role-based access|target control standards/i,
    'Identity verification model': /identity verification|sensitive change/i,
    'Detection operating model': /detection|monitoring/i,
    'Incident and evidence model': /incident|evidence/i,
    'Supplier verification model': /supplier|payment/i,
    'Control-effectiveness cadence': /governance|continuous improvement|effectiveness/i
  };
  const decisionThemeSupported = briefDecisions.every((decision) => {
    const matcher = decisionThemeSupport[decision.decisionFamilyLabel];
    if (DECISION_FAMILY_LABELS.has(decision.decisionFamilyLabel) && decision.linkedFindingRefs.length >= pack.findings.length) return true;
    return Boolean(matcher && briefThemes.some((theme) => matcher.test(`${theme.title} ${theme.semanticFamilyLabels.join(' ')}`) && (theme.findingRefs.some((ref) => decision.linkedFindingRefs.includes(ref)) || decision.linkedFindingRefs.length >= pack.findings.length)));
  });
  const roadmapTargetPreserved = briefRoadmap.length > 0
    && (sparseHighReadiness || ['30 days', '60 days', '90 days'].every((period) => briefRoadmap.some((item) => item.targetPeriod === period)))
    && briefRoadmap.every((item) => (item.targetPeriod === '30 days' && item.phase === 'STABILISE') || (['60 days', '90 days'].includes(item.targetPeriod) && item.phase === 'ESTABLISH'));
  const assurancePayload = JSON.stringify({ assessmentBasis: writerBrief?.assessmentBasis, assuranceBoundary: writerBrief?.assuranceBoundary, controls: briefControls });
  const maturationByControl = new Map(pack.controls.map((control) => [control.factRef, control]));
  const maturationIntegrity = sustainment
    ? pack.productTier === 'essential'
      ? pack.maturationSteps.length === 0 && briefMaturation.length === 0
      : pack.maturationSteps.length === pack.controls.length * 2
        && pack.maturationSteps.every((step) => {
          const control = maturationByControl.get(step.linkedControlRef);
          return Boolean(control && step.linkedSustainmentPriorityRef && control.linkedSustainmentPriorityRefs.includes(step.linkedSustainmentPriorityRef)
            && control.primarySemanticFamily === step.semanticFamily
            && control.accountableExecutive === step.accountableExecutive
            && control.processOwner === step.processOwner
            && ((step.phase === 'EMBED' && step.phaseWindow === '4-6 months') || (step.phase === 'MATURE' && step.phaseWindow === '7-12 months')));
        })
        && briefMaturation.length === pack.maturationSteps.length
        && briefMaturation.every((step) => Boolean(step.maturationRef && step.linkedSustainmentPriorityRef && step.linkedControlRef && step.semanticFamilyLabel && step.phase && step.phaseWindow && step.managementOutcome && step.priorityActivity && step.accountableExecutive && step.processOwner && step.dependency && step.successMeasure && step.proofOfProgress))
    : pack.productTier === 'essential'
    ? pack.maturationSteps.length === 0 && briefMaturation.length === 0
    : pack.maturationSteps.length === pack.controls.length * 2
      && pack.maturationSteps.every((step) => {
        const control = maturationByControl.get(step.linkedControlRef);
        if (!control) return false;
        return control.linkedFindingRefs.includes(step.linkedFindingRef)
          && control.primarySemanticFamily === step.semanticFamily
          && control.accountableExecutive === step.accountableExecutive
          && control.processOwner === step.processOwner
          && ((step.phase === 'EMBED' && step.phaseWindow === '4-6 months') || (step.phase === 'MATURE' && step.phaseWindow === '7-12 months'));
      })
      && briefMaturation.length === pack.maturationSteps.length
      && briefMaturation.every((step) => Boolean(step.maturationRef && step.linkedFindingRef && step.linkedControlRef && step.semanticFamilyLabel && step.phase && step.phaseWindow && step.managementOutcome && step.priorityActivity && step.accountableExecutive && step.processOwner && step.dependency && step.successMeasure && step.proofOfProgress));
  const results: PreAiGateResult[] = [
    check('NARRATIVE-MODE-CLASSIFICATION', ['REMEDIATION', 'MIXED', 'SUSTAINMENT'].includes(pack.narrativeMode), `Narrative mode is ${pack.narrativeMode}.`, 'Narrative mode is missing or invalid.'),
    check('SUSTAINMENT-PRIORITY-SEPARATION', !sustainment || (pack.sustainmentPriorities.length > 0 && pack.findings.length === 0 && pack.risks.length === 0 && pack.scenarios.length === 0 && pack.systemicThemeInputs.length === 0), sustainment ? 'Sustainment priorities are separated from customer-facing findings, risks, scenarios and themes.' : 'Not applicable outside Sustainment mode.', 'Sustainment priority separation failed.'),
    check('SUSTAINMENT-NO-MATERIAL-RISK-OR-SCENARIO', !sustainment || (pack.risks.length === 0 && pack.scenarios.length === 0), sustainment ? 'No material risk or automated fraud scenario is promoted from healthy assurance priorities.' : 'Not applicable outside Sustainment mode.', 'Sustainment contains a material risk or automated fraud scenario.'),
    check('SUSTAINMENT-LANGUAGE', !sustainment || !/(material (?:control )?(?:weakness|gap)|priority weakness|control failure|remediation required|urgent remediation|foundational failure|close (?:the )?weakness|implement (?:the )?missing control|validate that|independently validate|before relying on self-assessment|self-reported claims remain unverified)/i.test(JSON.stringify({ priorities: pack.sustainmentPriorities, controls: pack.controls, decisions: pack.decisions, roadmap: pack.roadmap, maturationSteps: pack.maturationSteps })), sustainment ? 'Sustainment objects use resilience, continuity and early-deterioration language.' : 'Not applicable outside Sustainment mode.', 'Sustainment objects contain unsupported weakness or automated evidence-validation language.'),
    check('theme-count', pack.systemicThemeInputs.length >= themeRange[0] && pack.systemicThemeInputs.length <= themeRange[1], `${pack.systemicThemeInputs.length} themes within ${themeRange[0]}-${themeRange[1]}.`, `Expected ${themeRange[0]}-${themeRange[1]} themes, found ${pack.systemicThemeInputs.length}.`),
    check('theme-coverage', [...findings].every((finding) => covered.has(finding) || Boolean(pack.standaloneFindingReasons[finding])), 'Every priority finding is themed or has a standalone reason.', 'At least one priority finding is orphaned from the narrative spine.'),
    check('scenario-count', pack.scenarios.length >= scenarioRange[0] && pack.scenarios.length <= scenarioRange[1], `${pack.scenarios.length} approved pathway scenarios within bound.`, `Expected ${scenarioRange[0]}-${scenarioRange[1]} approved pathway scenarios, found ${pack.scenarios.length}.`),
    check('scenario-pathways', pack.scenarios.every((scenario) => scenario.linkedFindingRefs.length > 0 && scenario.linkedRiskRefs.length > 0 && APPROVED_PATHWAY_FAMILIES.has(scenario.scenarioFamily)), 'All scenarios are linked to findings and risks and use an approved fraud pathway family.', 'A scenario is unlinked, governance-only or not an approved fraud pathway.'),
    check('scenario-fields', pack.scenarios.every((scenario) => [scenario.actorClass, scenario.opportunity, scenario.entryPoint, scenario.mechanism, scenario.currentControlWeakness, scenario.requiredControlResponse, scenario.concealment, scenario.consequence, scenario.immediateContainment, scenario.longTermResponse].every(Boolean) && scenario.warningIndicators.length > 0), 'All scenario pathway fields and warning indicators are populated.', 'At least one scenario is missing a required pathway field.'),
    check('theme-family-compatibility', themeFamilyCompatibility, 'Every theme has an approved semantic-family anchor.', 'A theme has no compatible primary semantic-family anchor.'),
    check('theme-duplication', themeDuplicateFree, 'Theme finding sets are distinct or within justified overlap bounds.', 'Identical or unjustifiably overlapping theme finding sets detected.'),
    check('theme-management-distinction', themeManagementDistinct, 'Each theme answers a distinct management question.', 'Two themes answer the same management question.'),
    check('roadmap-source-compatibility', roadmapCompatible, 'Every roadmap object matches its source finding semantic family.', 'A roadmap outcome or work item is incompatible with its source finding family.'),
    check('scenario-source-compatibility', scenarioCompatible, 'Every scenario family is explicitly supported by its linked findings.', 'A scenario family is not supported by the linked finding pathway mappings.'),
    check('no-placeholders-or-methodology', !forbidden.test(`${packText(pack)} ${scenarioText} ${decisionText} ${roadmapText}`), 'No placeholder consequence, assurance-decision, methodology or legacy roadmap language found.', 'Forbidden placeholder, methodology, evidence-validation or legacy roadmap language found.'),
    check('roadmap-management-objects', pack.roadmap.every((item) => item.managementOutcome && item.priorityWork && item.accountableExecutive && item.processOwner && item.targetPeriod && item.proofOfCompletion && item.successMeasure && item.failureTrigger), 'Roadmap facts are structured management objects.', 'A roadmap fact is still a pasted sentence or is missing a required management field.'),
    check('decision-option-specificity', sustainment ? pack.decisions.every((decision) => decision.options.length === 3 && new Set(decision.options.map((option) => option.option)).size === 3) : optionSignatures.length === new Set(optionSignatures).size && pack.decisions.every((decision) => decision.options.length === 3 && new Set(decision.options.map((option) => option.option)).size === 3), sustainment ? 'Each sustainment decision has three explicit options without duplicate options within the decision.' : 'Decision options are issue-specific and non-duplicated.', sustainment ? 'A sustainment decision has incomplete or duplicate options.' : 'Decision options are generic duplicates or incomplete.'),
    check('story-plan-bounds', sustainment ? plan.narrativeBounds.findingCount === 0 && plan.narrativeBounds.scenarioCount === 0 : (sparseHighReadiness ? plan.narrativeBounds.findingCount >= 1 : plan.narrativeBounds.findingCount >= 5) && plan.narrativeBounds.findingCount <= 8 && plan.narrativeBounds.scenarioCount === pack.scenarios.length, sustainment ? 'Sustainment Story Plan contains no findings or automated fraud scenarios.' : sparseHighReadiness ? 'Story Plan preserves a legitimately sparse high-readiness narrative with an explicit reason.' : 'Story Plan orders the bounded narrative core.', 'Story Plan bounds do not match the Fact Pack narrative core.'),
    check('machine-artifact-scan', !machineHeading.test(proseText({ pack, plan })), 'No raw underscore machine identifier appears in AI-facing prose fields.', 'A raw underscore machine identifier appears in the AI-facing Fact Pack or Story Plan.'),
    check('writer-brief-purity', Boolean(writerBrief) && !/(D\d+-Q\d+|MF-D\d+-Q\d+|RISK-[A-Z][A-Z0-9-]+|control_failure|maturity_constraint|hard.?gate|cap.?event|evidence validation|\"priorityScore\"|\"sourceId\"|\"questionCode\")/.test(sanitizedText), 'Sanitized writer payload excludes raw internal IDs, enums, priority scores and methodology language.', 'Sanitized writer payload is missing or still contains internal provenance or methodology language.'),
    check('SUPPLIER-PATHWAY-COVERAGE', supplierFindingRefs.length < 2 || (Boolean(supplierTheme) && Boolean(supplierTheme?.riskRefs.length) && (supplierPathwayFindingRefs.length < 2 || Boolean(supplierScenario))), supplierFindingRefs.length < 2 ? 'No multi-finding supplier pathway is in scope for this product tier.' : 'Supplier findings, supplier/payment theme and linked risk basis are present; a supplier pathway scenario is required when multiple supplier findings support that pathway.', 'Supplier or payment findings are present without a linked systemic theme, risk basis and supported supplier/payment pathway scenario.'),
    check('RISK-WRITER-PURITY', sustainment ? briefRisks.length === 0 : briefRisks.length > 0 && briefRisks.every((risk) => Boolean(risk.title && risk.cause && risk.riskEvent && risk.priority && risk.likelihood && risk.impact && risk.qualitativeConsequence && risk.approvedTreatment && risk.owner && risk.targetPeriod)) && !/(Impact requires case-specific validation|Operating impact requires case-specific validation|does not meet the exact expected standard|Consequence pathway:|self-reported claims remain unverified|hard.?gate|cap.?event)/i.test(JSON.stringify(briefRisks)), sustainment ? 'No material risk is promoted from healthy assurance priorities.' : 'Writer risks use bounded customer language and complete risk fields without raw register or methodology phrases.', sustainment ? 'A sustainment writer risk was generated without a recorded material weakness.' : 'A writer risk is incomplete or contains a forbidden placeholder, raw consequence label or methodology phrase.'),
    check('SCENARIO-FIELD-INTEGRITY', briefScenarios.length === 0 ? (sparseHighReadiness || sustainment) : briefScenarios.every((scenario) => Boolean(scenario.currentControlWeakness && scenario.requiredControlResponse) && scenario.currentControlWeakness !== scenario.requiredControlResponse && !Object.prototype.hasOwnProperty.call(scenario, 'controlWeakness')), sustainment ? 'No scenario is appropriate for Sustainment mode.' : sparseHighReadiness ? 'No scenario is appropriate for this sparse high-readiness profile.' : 'Scenarios distinguish the recorded weakness from the required future control response.', sustainment ? 'A Sustainment profile contains an invalid scenario.' : sparseHighReadiness ? 'A sparse high-readiness profile contains an invalid scenario.' : 'A scenario uses the legacy field, has a blank field or conflates current weakness with future response.'),
    check('CONTROL-BLUEPRINT-THEME-COVERAGE', Boolean(writerBrief) && briefControls.length === Math.min(pack.productTier === 'comprehensive' ? 6 : 6, pack.controls.length) && briefThemes.every((theme) => theme.findingRefs.some((ref) => briefControls.some((control) => control.linkedFindingRefs.includes(ref))) || theme.findingRefs.some((ref) => {
      const finding = pack.findings.find((candidate) => candidate.factRef === ref);
      const families = finding ? [finding.primarySemanticFamily, ...finding.secondarySemanticFamilies] : [];
      return families.some((family) => ['FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'CONTINUOUS_IMPROVEMENT', 'IDENTITY_VERIFICATION'].includes(family));
    })), 'Selected control blueprints cover every selected narrative theme, with governance, risk-identification and sparse identity themes allowed to be represented by the selected control spine.', 'At least one selected narrative theme has no linked control blueprint.'),
    check('ROADMAP-TARGET-PRESERVATION', roadmapTargetPreserved, 'The initial roadmap preserves 30, 60 and 90 day targets with Stabilise/Establish phase semantics.', 'The initial roadmap loses a 30/60/90 target or maps a target period to the wrong phase.'),
    check('DECISION-PROFILE-SPECIFICITY', sustainment ? (pack.productTier !== 'comprehensive' || (briefDecisions.length >= 1 && briefDecisions.length <= 5 && briefDecisions.every((decision) => decision.linkedSustainmentPriorityRefs.length > 0 && decision.options.length === 3))) : pack.productTier !== 'comprehensive' || (briefDecisions.length >= 1 && briefDecisions.length <= 5 && new Set(briefDecisions.map((decision) => decision.decisionFamilyLabel)).size === briefDecisions.length && briefDecisions.every((decision) => DECISION_FAMILY_LABELS.has(decision.decisionFamilyLabel) && decision.linkedFindingRefs.length > 0) && decisionThemeSupported), sustainment ? 'Sustainment decisions are linked to priorities with three explicit governance options.' : 'Comprehensive decisions are distinct, theme-specific decision families linked to selected findings; the count follows supported source decisions.', sustainment ? 'Sustainment decisions are generic, incomplete or unlinked.' : 'Comprehensive decisions are generic, duplicated, unsupported or not linked to selected themes.'),
    check('MATURATION-STEP-INTEGRITY', maturationIntegrity, pack.productTier === 'essential' ? 'Essential remains bounded to the first 90 days and contains no maturation steps.' : 'Comprehensive maturation steps are deterministic, linked, phase-bounded and preserve the initial control owners.', pack.productTier === 'essential' ? 'Essential contains an invalid twelve-month maturation object.' : 'Comprehensive maturation steps are missing, unlinked, owner-changing, phase-invalid or incomplete in the Writer Brief.'),
    check('PROOF-WRITER-QUALITY', briefProof.length > 0 && briefProof.every((proof) => Boolean(proof.requirement && proof.owner && proof.whyItMatters && proof.expectedRecency && proof.requiredPopulation && proof.acceptableExamples.length > 0) && !/Control owner \/ process owner to be confirmed before delivery|Evidence mapped to ,|placeholder|TBD|to be confirmed/i.test(JSON.stringify(proof))), 'Bounded proof guidance has populated, actionable writer fields without placeholder population.', 'Proof guidance contains a blank why-it-matters field, placeholder owner, empty mapping or placeholder population.'),
    check('ASSURANCE-BOUNDARY-SINGLETON', Boolean(writerBrief?.assessmentBasis && writerBrief?.assuranceBoundary) && !/self-assessed and not independently verified|not independently verified/i.test(JSON.stringify(briefControls)) && (assurancePayload.match(/not independently verified/gi) ?? []).length <= 1, 'Assessment basis and assurance boundary are global and are not repeated inside control objects.', 'Assurance wording is missing globally or repeated inside control-level writer content.')
  ];
  return { title: 'MK FRAUD READINESS v1.1 PRE-AI SEMANTIC INTEGRITY GATE', status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL', results, checkedAt: new Date().toISOString() };
}

export function preAiGateMarkdown(report: PreAiGateReport): string {
  return [
    `# ${report.title}`,
    '',
    `Status: **${report.status}**`,
    `Checked: ${report.checkedAt}`,
    '',
    '| Gate | Status | Detail |',
    '|---|---|---|',
    ...report.results.map((result) => `| ${result.gate} | **${result.status}** | ${result.detail.replaceAll('|', '\\|')} |`),
    '',
    'This gate runs before any AI manuscript spend. It does not configure or call an AI provider.'
  ].join('\n');
}
