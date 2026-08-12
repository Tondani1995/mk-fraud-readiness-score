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

function check(gate: string, condition: boolean, pass: string, fail: string): PreAiGateResult {
  return { gate, status: condition ? 'PASS' : 'FAIL', detail: condition ? pass : fail };
}

function packText(pack: NarrativeFactPack): string {
  return JSON.stringify({ themes: pack.systemicThemeInputs, findings: pack.findings, risks: pack.risks, scenarios: pack.scenarios, controls: pack.controls, decisions: pack.decisions, roadmap: pack.roadmap, proofOfProgress: pack.proofOfProgress });
}

function proseText(value: unknown, key = ''): string {
  if (typeof value === 'string') return /(?:id|ref|code|family|category|source|questionCode|targetPeriod|phase|semantic|materiality|decisionFamily|fraudPathway)/i.test(key) ? '' : value;
  if (Array.isArray(value)) return value.map((item) => proseText(item, key)).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).map(([childKey, childValue]) => proseText(childValue, childKey)).join(' ');
  return '';
}

export function runPreAiFactPackGates(pack: NarrativeFactPack, plan: NarrativeStoryPlan, writerBrief?: NarrativeWriterBrief): PreAiGateReport {
  const findings = new Set(pack.findings.map((finding) => finding.factRef));
  const covered = new Set(pack.systemicThemeInputs.flatMap((theme) => theme.findingRefs));
  const themeRange = pack.productTier === 'essential' ? [3, 5] : [3, 5];
  const scenarioRange = pack.productTier === 'essential' ? [2, 3] : [3, 4];
  const scenarioText = pack.scenarios.map((scenario) => `${scenario.title} ${scenario.actorClass} ${scenario.opportunity} ${scenario.entryPoint} ${scenario.mechanism} ${scenario.controlWeakness} ${scenario.concealment} ${scenario.consequence} ${scenario.immediateContainment} ${scenario.longTermResponse}`).join(' ');
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
  const roadmapCompatible = pack.roadmap.every((item) => item.sourceFindingRef && pack.findings.some((finding) => finding.factRef === item.sourceFindingRef && finding.primarySemanticFamily === item.primarySemanticFamily));
  const scenarioCompatible = pack.scenarios.every((scenario) => pack.findings.filter((finding) => scenario.linkedFindingRefs.includes(finding.factRef)).some((finding) => finding.fraudPathwayFamilies.includes(scenario.scenarioFamily)));
  const sanitizedText = JSON.stringify(writerBrief ?? {});
  const results: PreAiGateResult[] = [
    check('theme-count', pack.systemicThemeInputs.length >= themeRange[0] && pack.systemicThemeInputs.length <= themeRange[1], `${pack.systemicThemeInputs.length} themes within ${themeRange[0]}-${themeRange[1]}.`, `Expected ${themeRange[0]}-${themeRange[1]} themes, found ${pack.systemicThemeInputs.length}.`),
    check('theme-coverage', [...findings].every((finding) => covered.has(finding) || Boolean(pack.standaloneFindingReasons[finding])), 'Every priority finding is themed or has a standalone reason.', 'At least one priority finding is orphaned from the narrative spine.'),
    check('scenario-count', pack.scenarios.length >= scenarioRange[0] && pack.scenarios.length <= scenarioRange[1], `${pack.scenarios.length} approved pathway scenarios within bound.`, `Expected ${scenarioRange[0]}-${scenarioRange[1]} approved pathway scenarios, found ${pack.scenarios.length}.`),
    check('scenario-pathways', pack.scenarios.every((scenario) => scenario.linkedFindingRefs.length > 0 && scenario.linkedRiskRefs.length > 0 && APPROVED_PATHWAY_FAMILIES.has(scenario.scenarioFamily)), 'All scenarios are linked to findings and risks and use an approved fraud pathway family.', 'A scenario is unlinked, governance-only or not an approved fraud pathway.'),
    check('scenario-fields', pack.scenarios.every((scenario) => [scenario.actorClass, scenario.opportunity, scenario.entryPoint, scenario.mechanism, scenario.controlWeakness, scenario.concealment, scenario.consequence, scenario.immediateContainment, scenario.longTermResponse].every(Boolean) && scenario.warningIndicators.length > 0), 'All scenario pathway fields and warning indicators are populated.', 'At least one scenario is missing a required pathway field.'),
    check('theme-family-compatibility', themeFamilyCompatibility, 'Every theme has an approved semantic-family anchor.', 'A theme has no compatible primary semantic-family anchor.'),
    check('theme-duplication', themeDuplicateFree, 'Theme finding sets are distinct or within justified overlap bounds.', 'Identical or unjustifiably overlapping theme finding sets detected.'),
    check('theme-management-distinction', themeManagementDistinct, 'Each theme answers a distinct management question.', 'Two themes answer the same management question.'),
    check('roadmap-source-compatibility', roadmapCompatible, 'Every roadmap object matches its source finding semantic family.', 'A roadmap outcome or work item is incompatible with its source finding family.'),
    check('scenario-source-compatibility', scenarioCompatible, 'Every scenario family is explicitly supported by its linked findings.', 'A scenario family is not supported by the linked finding pathway mappings.'),
    check('no-placeholders-or-methodology', !forbidden.test(`${packText(pack)} ${scenarioText} ${decisionText} ${roadmapText}`), 'No placeholder consequence, assurance-decision, methodology or legacy roadmap language found.', 'Forbidden placeholder, methodology, evidence-validation or legacy roadmap language found.'),
    check('roadmap-management-objects', pack.roadmap.every((item) => item.managementOutcome && item.priorityWork && item.accountableExecutive && item.processOwner && item.targetPeriod && item.proofOfCompletion && item.successMeasure && item.failureTrigger), 'Roadmap facts are structured management objects.', 'A roadmap fact is still a pasted sentence or is missing a required management field.'),
    check('decision-option-specificity', optionSignatures.length === new Set(optionSignatures).size && pack.decisions.every((decision) => decision.options.length === 3 && new Set(decision.options.map((option) => option.option)).size === 3), 'Decision options are issue-specific and non-duplicated.', 'Decision options are generic duplicates or incomplete.'),
    check('story-plan-bounds', plan.narrativeBounds.findingCount >= 5 && plan.narrativeBounds.findingCount <= 8 && plan.narrativeBounds.scenarioCount === pack.scenarios.length, 'Story Plan orders the bounded narrative core.', 'Story Plan bounds do not match the Fact Pack narrative core.'),
    check('machine-artifact-scan', !machineHeading.test(proseText({ pack, plan })), 'No raw underscore machine identifier appears in AI-facing prose fields.', 'A raw underscore machine identifier appears in the AI-facing Fact Pack or Story Plan.'),
    check('writer-brief-purity', Boolean(writerBrief) && !/(D\d+-Q\d+|MF-D\d+-Q\d+|RISK-[A-Z][A-Z0-9-]+|control_failure|maturity_constraint|hard.?gate|cap.?event|evidence validation|\"priorityScore\"|\"sourceId\"|\"questionCode\")/.test(sanitizedText), 'Sanitized writer payload excludes raw internal IDs, enums, priority scores and methodology language.', 'Sanitized writer payload is missing or still contains internal provenance or methodology language.')
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
