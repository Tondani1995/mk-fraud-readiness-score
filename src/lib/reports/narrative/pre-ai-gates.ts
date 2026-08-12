import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';

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

function check(gate: string, condition: boolean, pass: string, fail: string): PreAiGateResult {
  return { gate, status: condition ? 'PASS' : 'FAIL', detail: condition ? pass : fail };
}

function packText(pack: NarrativeFactPack): string {
  return JSON.stringify({ themes: pack.systemicThemeInputs, findings: pack.findings, risks: pack.risks, scenarios: pack.scenarios, controls: pack.controls, decisions: pack.decisions, roadmap: pack.roadmap, proofOfProgress: pack.proofOfProgress });
}

function proseText(value: unknown, key = ''): string {
  if (typeof value === 'string') return /(?:id|ref|code|family|category|source|questionCode|targetPeriod|phase)/i.test(key) ? '' : value;
  if (Array.isArray(value)) return value.map((item) => proseText(item, key)).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).map(([childKey, childValue]) => proseText(childValue, childKey)).join(' ');
  return '';
}

export function runPreAiFactPackGates(pack: NarrativeFactPack, plan: NarrativeStoryPlan): PreAiGateReport {
  const findings = new Set(pack.findings.map((finding) => finding.factRef));
  const covered = new Set(pack.systemicThemeInputs.flatMap((theme) => theme.findingRefs));
  const themeRange = pack.productTier === 'essential' ? [3, 5] : [3, 5];
  const scenarioRange = pack.productTier === 'essential' ? [2, 3] : [3, 4];
  const scenarioText = pack.scenarios.map((scenario) => `${scenario.title} ${scenario.actorClass} ${scenario.opportunity} ${scenario.entryPoint} ${scenario.mechanism} ${scenario.controlWeakness} ${scenario.concealment} ${scenario.consequence} ${scenario.immediateContainment} ${scenario.longTermResponse}`).join(' ');
  const decisionText = pack.decisions.map((decision) => `${decision.question} ${decision.recommendedRoute} ${decision.rationale} ${decision.consequenceOfDelay}`).join(' ');
  const roadmapText = pack.roadmap.map((item) => `${item.managementOutcome} ${item.priorityWork} ${item.proofOfCompletion} ${item.failureTrigger}`).join(' ');
  const optionSignatures = pack.decisions.map((decision) => decision.options.map((option) => option.option).join('|'));
  const results: PreAiGateResult[] = [
    check('theme-count', pack.systemicThemeInputs.length >= themeRange[0] && pack.systemicThemeInputs.length <= themeRange[1], `${pack.systemicThemeInputs.length} themes within ${themeRange[0]}-${themeRange[1]}.`, `Expected ${themeRange[0]}-${themeRange[1]} themes, found ${pack.systemicThemeInputs.length}.`),
    check('theme-coverage', [...findings].every((finding) => covered.has(finding) || Boolean(pack.standaloneFindingReasons[finding])), 'Every priority finding is themed or has a standalone reason.', 'At least one priority finding is orphaned from the narrative spine.'),
    check('scenario-count', pack.scenarios.length >= scenarioRange[0] && pack.scenarios.length <= scenarioRange[1], `${pack.scenarios.length} approved pathway scenarios within bound.`, `Expected ${scenarioRange[0]}-${scenarioRange[1]} approved pathway scenarios, found ${pack.scenarios.length}.`),
    check('scenario-pathways', pack.scenarios.every((scenario) => scenario.linkedFindingRefs.length > 0 && scenario.linkedRiskRefs.length > 0 && scenario.scenarioFamily && !/governance_accountability_failure|risk_blind_spot/i.test(scenario.scenarioFamily)), 'All scenarios are linked to findings and risks and use an approved fraud pathway family.', 'A scenario is unlinked, governance-only or not an approved fraud pathway.'),
    check('scenario-fields', pack.scenarios.every((scenario) => [scenario.actorClass, scenario.opportunity, scenario.entryPoint, scenario.mechanism, scenario.controlWeakness, scenario.concealment, scenario.consequence, scenario.immediateContainment, scenario.longTermResponse].every(Boolean) && scenario.warningIndicators.length > 0), 'All scenario pathway fields and warning indicators are populated.', 'At least one scenario is missing a required pathway field.'),
    check('no-placeholders-or-methodology', !forbidden.test(`${packText(pack)} ${scenarioText} ${decisionText} ${roadmapText}`), 'No placeholder consequence, assurance-decision, methodology or legacy roadmap language found.', 'Forbidden placeholder, methodology, evidence-validation or legacy roadmap language found.'),
    check('roadmap-management-objects', pack.roadmap.every((item) => item.managementOutcome && item.priorityWork && item.accountableExecutive && item.processOwner && item.targetPeriod && item.proofOfCompletion && item.successMeasure && item.failureTrigger), 'Roadmap facts are structured management objects.', 'A roadmap fact is still a pasted sentence or is missing a required management field.'),
    check('decision-option-specificity', optionSignatures.length === new Set(optionSignatures).size && pack.decisions.every((decision) => decision.options.length === 3 && new Set(decision.options.map((option) => option.option)).size === 3), 'Decision options are issue-specific and non-duplicated.', 'Decision options are generic duplicates or incomplete.'),
    check('story-plan-bounds', plan.narrativeBounds.findingCount >= 5 && plan.narrativeBounds.findingCount <= 8 && plan.narrativeBounds.scenarioCount === pack.scenarios.length, 'Story Plan orders the bounded narrative core.', 'Story Plan bounds do not match the Fact Pack narrative core.'),
    check('machine-artifact-scan', !machineHeading.test(proseText({ pack, plan })), 'No raw underscore machine identifier appears in AI-facing prose fields.', 'A raw underscore machine identifier appears in the AI-facing Fact Pack or Story Plan.')
  ];
  return { title: 'MK FRAUD READINESS v1.1 PRE-AI FACT PACK GATE', status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL', results, checkedAt: new Date().toISOString() };
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
