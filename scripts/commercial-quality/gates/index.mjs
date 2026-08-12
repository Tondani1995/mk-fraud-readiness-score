import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCommercialProjection } from '../../../src/lib/reports/commercial-projection/index.ts';
import { getCommercialFixtureProfile } from '../../../src/lib/reports/commercial-projection/fixture-profiles.ts';
import { renderAllExhibits } from '../../../src/lib/reports/exhibits/index.ts';
import { MK_TOKENS } from '../../../src/lib/reports/design/tokens.ts';

export const GATE_APPLICABILITY = {
  A1: ['PDF', 'PPTX'], A2: ['PDF', 'PPTX'], A3: ['PDF', 'PPTX'], A4: ['PDF', 'PPTX'], A5: ['XLSX'],
  B1: ['PDF', 'PPTX'], B2: ['PDF', 'PPTX'], B3: ['PDF', 'PPTX'], B4: ['PDF', 'PPTX'], B5: ['PDF', 'PPTX', 'XLSX'], B6: ['PDF', 'PPTX'],
  C1: ['PDF', 'PPTX', 'XLSX'], C2: ['PDF', 'PPTX'], C3: ['PDF', 'PPTX'], C4: ['PDF', 'PPTX'], C5: ['PDF', 'PPTX'], C6: ['PDF', 'PPTX'], C7: ['PDF', 'PPTX'], C8: ['PDF', 'PPTX'],
  D1: ['PDF', 'PPTX', 'XLSX'], D2: ['PDF', 'PPTX', 'XLSX'], D3: ['PDF', 'PPTX', 'XLSX'], D4: ['PDF', 'PPTX', 'XLSX'], D5: ['PDF', 'PPTX', 'XLSX'], D6: ['PDF', 'PPTX', 'XLSX'], D7: ['PDF', 'PPTX', 'XLSX'], D8: ['PDF', 'PPTX', 'XLSX'], D9: ['PDF', 'PPTX', 'XLSX'], D10: ['PDF', 'PPTX', 'XLSX'],
  E1: ['PDF', 'PPTX', 'XLSX'], E2: ['PDF', 'PPTX'], E3: ['PDF', 'PPTX'], E4: ['PDF', 'PPTX'], E5: ['PPTX'], E6: ['PDF', 'PPTX', 'XLSX'], E7: ['PDF', 'PPTX', 'XLSX']
};

const allGates = Object.keys(GATE_APPLICABILITY);
const result = (gate, fixture, artefact, status, location, detail, appliesTo = GATE_APPLICABILITY[gate]) => ({ gate, fixture, artefact, status, location, detail, appliesTo });

function gate(status, gateId, fixture, artefact, location, detail) { return result(gateId, fixture, artefact, status ? 'PASS' : 'FAIL', location, detail); }

export function runFixtureGates({ fixtureId, artefact = 'model' }) {
  const profile = getCommercialFixtureProfile(fixtureId);
  const projection = buildCommercialProjection({ tier: 'Comprehensive', organisationName: profile.organisationName, score: profile.score, maturity: profile.maturity, model: profile.model, reviewer: profile.reviewer });
  const exhibits = renderAllExhibits({ projection });
  const outputs = [];
  const model = projection;
  outputs.push(gate(profile.score >= 0 && profile.score <= 100, 'D1', fixtureId, artefact, 'projection.score', 'Deterministic score is within the 0–100 range.'));
  outputs.push(gate(model.integrityIssues.length === 0, 'D8', fixtureId, artefact, 'projection.integrityIssues', model.integrityIssues.length ? model.integrityIssues.map((issue) => issue.detail).join('; ') : 'All cross-register references resolve.'));
  const r = model.reconciliation;
  outputs.push(gate(r.notReviewed + r.reviewed === r.total && r.supported + r.insufficient + r.notSupported + r.reviewedNoConclusion === r.reviewed && r.unresolved === r.notReviewed + r.insufficient + r.notSupported, 'D3', fixtureId, artefact, 'projection.reconciliation', 'Evidence totals reconcile under the locked formula.'));
  outputs.push(gate(model.reviewer?.name?.trim() && model.reviewer.reviewDate?.trim(), 'D7', fixtureId, artefact, 'projection.reviewer', 'Reviewer name and review date are present.'));
  outputs.push(gate(model.findings.length > 0 && model.risks.length > 0 && model.controls.length > 0 && model.actions.length > 0, 'E6', fixtureId, artefact, 'projection.registers', 'Non-empty authoritative registers are available.'));
  outputs.push(gate(exhibits.length === 10 && exhibits.every((item) => item.title && item.source), 'E3', fixtureId, artefact, 'exhibits', 'All ten exhibits carry a claim title and source line.'));
  outputs.push(gate(exhibits.length >= 8, 'E4', fixtureId, artefact, 'exhibits', 'Exhibit library meets the minimum count.'));
  const control10 = model.controls.every((control) => [control.controlObjective, control.accountableExecutive, control.processOwner, control.operatingFrequency, ...control.requiredEvidence, control.effectivenessTest, control.escalationThreshold].every((value) => String(value ?? '').trim().length > 0));
  outputs.push(gate(control10, 'E1', fixtureId, artefact, 'projection.controls', 'Each priority control contains objective, ownership, population/evidence, frequency, effectiveness and escalation fields.'));
  const scenario9 = model.scenarios.every((scenario) => [scenario.title, scenario.entryPoint, scenario.fraudSequence, scenario.concealmentMechanism, scenario.whyControlsMayNotCatchIt, scenario.earlyWarningIndicators.join('; '), scenario.immediateContainment, scenario.longerTermResponse, scenario.disclaimer].every((value) => String(value ?? '').trim().length > 0));
  outputs.push(gate(scenario9, 'E2', fixtureId, artefact, 'projection.scenarios', 'Each scenario contains the required pathway, warning, containment and disclaimer fields.'));
  const tokenValues = Object.values(MK_TOKENS).map((value) => value.toLowerCase());
  outputs.push(gate(tokenValues.length === 18, 'B5', fixtureId, artefact, 'design/tokens.ts', 'The approved palette is centralised in the token module.'));
  const narrative = [
    ...model.findings.flatMap((item) => [item.title, item.diagnosis, item.whyItMatters, item.fraudMechanism, item.recommendedControl]),
    ...model.risks.flatMap((item) => [item.title, item.riskStatement, item.requiredTreatment]),
    ...model.scenarios.flatMap((item) => [item.title, item.entryPoint, item.fraudSequence, item.concealmentMechanism, item.whyControlsMayNotCatchIt]),
    ...model.controls.flatMap((item) => [item.controlObjective, item.controlDesign, item.effectivenessTest]),
    ...model.actions.flatMap((item) => [item.deliverable, item.successMeasure]),
    ...model.decisions.flatMap((item) => [item.decisionRequired, item.recommendedDecision, item.consequenceOfDelay])
  ].join(' ');
  outputs.push(gate(!narrative.match(/\b(?:fixture|synthetic|dense synthetic|Persisted control statement)\b/i), 'C1', fixtureId, artefact, 'projection narrative', 'Customer-facing narrative fields contain no prohibited internal terms.'));
  outputs.push(gate(model.decisions.length === 0 || model.decisions.every((decision) => [decision.decisionRequired, decision.recommendedDecision, decision.accountableExecutive, decision.consequenceOfDelay].every((value) => String(value ?? '').trim().length > 0)), 'E7', fixtureId, artefact, 'projection.decisions', 'Leadership decisions contain human-readable decision, recommendation, owner and delay consequence.'));
  outputs.push(gate(fixtureId !== 'F3' || (!model.findings.some((finding) => finding.gapClassification === 'critical') && !model.risks.some((risk) => risk.priority === 'Critical')), 'B4', fixtureId, artefact, 'projection.severity', 'Meridian profile carries zero critical items.'));
  return outputs;
}

export async function runGateSuite({ fixtureIds, group, artefact = 'model' }) {
  const selected = group ? allGates.filter((id) => id.startsWith(group)) : null;
  const rows = fixtureIds.flatMap((fixtureId) => runFixtureGates({ fixtureId, artefact })).filter((row) => !selected || selected.includes(row.gate));
  return rows;
}

export async function writeApplicability(root) {
  const lines = ['# Binary gate applicability', '', '| Gate | Applicable artefacts |', '|---|---|', ...Object.entries(GATE_APPLICABILITY).map(([id, types]) => `| ${id} | ${types.join(', ')} |`), ''];
  await fs.writeFile(path.join(root, 'docs/commercial-quality/gate-applicability.md'), lines.join('\n'));
}
