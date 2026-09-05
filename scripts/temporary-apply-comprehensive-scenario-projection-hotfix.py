from pathlib import Path
import re

source_path = Path('src/lib/reports/narrative/fact-pack.ts')
source = source_path.read_text()
pattern = re.compile(r"function buildScenarioFacts\(.*?\n}\n\nfunction buildControlFacts\(", re.S)
replacement = r'''export function buildScenarioFacts(scenarios: PlausibleScenario[], findings: MaterialFinding[], risks: RiskRegisterEntry[], findingRefs: Map<string, string>, riskRefs: Map<string, string>, tier: NarrativeProductTier, exposures: readonly SupportedExposure[] = []): NarrativeScenarioFact[] {
  const candidates = FRAUD_PATHWAY_RULES.map((rule) => ({ rule, members: pathwayMembers(rule, findings) }))
    .filter((item) => item.members.length > 0)
    .filter((item) => risks.some((risk) => risk.linkedFindingIds.some((id) => item.members.some((finding) => finding.id === id))))
    .sort((left, right) => pathwayPriority(right.rule, findings) - pathwayPriority(left.rule, findings) || left.rule.family.localeCompare(right.rule.family));
  const minimum = 2;
  const limit = tier === 'essential' ? 3 : 4;
  const selected = candidates.slice(0, limit);
  const usedSourceIds = new Set<string>();
  const result = selected.map(({ rule, members }, index) => {
    const source = scenarios.find((scenario) => ruleForScenario(scenario, findings)?.family === rule.family && scenario.linkedFindingIds.some((id) => members.some((finding) => finding.id === id)));
    if (source) usedSourceIds.add(source.id);
    return synthesizeScenario(rule, source, members, findingRefs, riskRefs, risks, index, exposures);
  });

  // The evidence model may legitimately emit multiple evidence-backed variants beneath one
  // consolidated fraud pathway. The narrative projection previously collapsed those variants to
  // one scenario per pathway family, which could reduce a valid evidence set to one and then fail
  // the unchanged Story Plan minimum before any provider call. Preserve pathway diversity first,
  // then retain distinct canonical evidence variants only when the projection is below the product
  // minimum. This never invents a pathway, finding or risk and remains within the existing tier cap.
  if (result.length < minimum) {
    const topUps = scenarios
      .filter((source) => !usedSourceIds.has(source.id))
      .map((source) => {
        const rule = ruleForScenario(source, findings);
        if (!rule) return null;
        const members = findings
          .filter((finding) => source.linkedFindingIds.includes(finding.id) && finding.fraudPathwayFamilies.includes(rule.family))
          .sort((left, right) => right.materialityScore - left.materialityScore || left.questionCode.localeCompare(right.questionCode));
        if (members.length === 0) return null;
        const linkedRiskExists = risks.some((risk) => risk.linkedFindingIds.some((id) => members.some((finding) => finding.id === id)));
        if (!linkedRiskExists) return null;
        return {
          source,
          rule,
          members,
          priority: members.reduce((total, finding) => total + finding.materialityScore, 0)
        };
      })
      .filter((item): item is { source: PlausibleScenario; rule: FraudPathwayRule; members: MaterialFinding[]; priority: number } => Boolean(item))
      .sort((left, right) => right.priority - left.priority || left.source.id.localeCompare(right.source.id));

    for (const topUp of topUps) {
      if (result.length >= minimum || result.length >= limit) break;
      const variant = synthesizeScenario(topUp.rule, topUp.source, topUp.members, findingRefs, riskRefs, risks, result.length, exposures);
      if (result.some((scenario) => scenario.canonicalScenarioId === variant.canonicalScenarioId)) continue;
      result.push(variant);
      usedSourceIds.add(topUp.source.id);
    }
  }

  result.forEach(assertScenario);
  return result;
}

function buildControlFacts('''
updated, count = pattern.subn(replacement, source, count=1)
if count != 1:
    raise SystemExit(f'Expected to replace exactly one buildScenarioFacts function, replaced {count}.')
source_path.write_text(updated)

regression = r'''import assert from 'node:assert/strict';
import { buildPlausibleScenarios } from '../../src/lib/reports/evidence-model/scenarios.ts';
import { buildScenarioFacts } from '../../src/lib/reports/narrative/fact-pack.ts';

const finding = (id, questionCode, materialityScore, scenarioType) => ({
  id,
  title: `Recorded access weakness ${questionCode}`,
  questionCode,
  materialityScore,
  materialityClass: 'material_weakness',
  linkedScenarioTypes: [scenarioType],
  fraudPathwayFamilies: ['PRIVILEGED_ACCESS_MISUSE'],
  primarySemanticFamily: 'PRIVILEGED_ACCESS',
  secondarySemanticFamilies: [],
  fraudMechanism: 'a recorded access-control weakness may enable unauthorised change',
  domainName: 'Digital and Identity Fraud Risks',
  responseMeaning: 'Partly designed',
  responseLabel: 'Partially in place',
  responseOperationalMeaning: 'The access control is only partly designed.',
  expectedControlStandard: 'Independent preventive and detective access control',
  escalationThreshold: 'Any unresolved privileged-access exception is escalated',
  accountableOwner: 'Executive owner',
  processOwner: 'Technology owner',
  targetPeriod: '30 days',
  recommendedControl: 'Restrict, log and independently recertify privileged access.',
  effectivenessMeasure: 'All privileged access is attributable and current.',
  questionPrompt: `Control question ${questionCode}.`,
  likelyFinancialImpact: 'Unauthorised changes may create financial loss.',
  likelyOperationalImpact: 'Unauthorised changes may disrupt operations.'
});

const findings = [
  finding('MF-1', 'D8-Q01', 100, 'privileged_access_exploitation'),
  finding('MF-2', 'D8-Q02', 90, 'segregation_of_duties_bypass'),
  finding('MF-3', 'D8-Q03', 80, 'access_abuse')
];
const risk = {
  id: 'RISK-CONSOLIDATED',
  priority: 'Critical',
  title: 'Consolidated access-control pathway',
  riskStatement: 'Privileged access may be misused before timely challenge.',
  cause: 'Privileged access is not consistently restricted and recertified.',
  riskEvent: 'unauthorised activity proceeds without timely challenge',
  likelihood: 'Possible',
  impact: 'Major',
  requiredTreatment: 'Restrict, log and recertify privileged access.',
  accountableExecutive: 'Executive owner',
  targetPeriod: '30 days',
  financialImpact: 'Value may be lost',
  operationalImpact: 'Operations may be disrupted',
  legalRegulatoryImpact: null,
  reputationalImpact: null,
  linkedFindingIds: findings.map((item) => item.id)
};

const evidenceScenarios = buildPlausibleScenarios({}, findings, [risk]);
assert.equal(evidenceScenarios.length, 3, 'evidence layer should retain three distinct evidence-backed variants');

const findingRefs = new Map(findings.map((item, index) => [item.id, `FINDING-${String(index + 1).padStart(3, '0')}`]));
const riskRefs = new Map([[risk.id, 'RISK-001']]);
const narrativeScenarios = buildScenarioFacts(evidenceScenarios, findings, [risk], findingRefs, riskRefs, 'comprehensive');

assert.ok(narrativeScenarios.length >= 2 && narrativeScenarios.length <= 4, 'Comprehensive narrative projection must preserve the unchanged 2-4 Story Plan bound');
assert.equal(new Set(narrativeScenarios.map((item) => item.canonicalScenarioId)).size, narrativeScenarios.length, 'narrative scenarios must retain distinct canonical evidence identities');
assert.ok(narrativeScenarios.every((item) => item.scenarioFamily === 'PRIVILEGED_ACCESS_MISUSE'), 'top-up must not invent another fraud pathway family');
assert.ok(narrativeScenarios.every((item) => item.linkedFindingRefs.length > 0 && item.linkedRiskRefs.length > 0), 'every narrative scenario must remain linked to selected findings and risks');

console.log('PASS: Comprehensive consolidated-pathway narrative scenario projection regression');
'''
Path('scripts/commercial-quality/comprehensive-scenario-projection-topup-regression.mjs').write_text(regression)
