import type { ControlBlueprintRow, FindingRow, RiskRow, ScenarioPortfolioRow } from './assembly';

export interface ScenarioLinkageAuditRow {
  scenarioId: string;
  title: string;
  coherent: boolean;
  entryPointPresent: boolean;
  progressionPresent: boolean;
  concealmentPresent: boolean;
  interruptionPresent: boolean;
  warningIndicatorsPresent: boolean;
  findingLinksCanonical: boolean;
  riskLinksCanonical: boolean;
  controlLinksCanonical: boolean;
  interruptionControlLinked: boolean;
  linkedFindingIds: string[];
  linkedRiskIds: string[];
  linkedControlIds: string[];
  issues: string[];
}

/**
 * Revalidates a rendered scenario as one pathway rather than trusting the
 * presence of individually populated columns. A scenario is useful only when
 * its break point is a control linked to the same canonical risk pathway.
 */
export function auditScenarioLinkage(
  scenarios: readonly ScenarioPortfolioRow[],
  findings: readonly FindingRow[],
  risks: readonly RiskRow[],
  controls: readonly ControlBlueprintRow[]
): ScenarioLinkageAuditRow[] {
  const findingIds = new Set(findings.map((finding) => finding.findingId));
  const riskById = new Map(risks.map((risk) => [risk.riskId, risk]));
  const controlById = new Map(controls.map((control) => [control.controlId, control]));
  return scenarios.map((scenario) => {
    const issues: string[] = [];
    const entryPointPresent = Boolean(scenario.entryPoint.trim());
    const progressionPresent = Boolean(scenario.mechanism.trim());
    const concealmentPresent = Boolean(scenario.concealment.trim());
    const interruptionPresent = Boolean(scenario.interruptionPoint.trim());
    const warningIndicatorsPresent = scenario.warningIndicators.length > 0;
    const findingLinksCanonical = scenario.linkedFindingIds.length > 0 && scenario.linkedFindingIds.every((id) => findingIds.has(id));
    const riskLinksCanonical = scenario.linkedRiskIds.length > 0 && scenario.linkedRiskIds.every((id) => riskById.has(id));
    const controlLinksCanonical = scenario.linkedControlIds.length > 0 && scenario.linkedControlIds.every((id) => controlById.has(id));
    const linkedControls = scenario.linkedControlIds.map((id) => controlById.get(id)).filter(Boolean) as ControlBlueprintRow[];
    const interruptionControlLinked = linkedControls.some((control) =>
      control.linkedRiskIds.some((riskId) => scenario.linkedRiskIds.includes(riskId)) &&
      (control.controlDesign === scenario.interruptionPoint || control.controlObjective === scenario.interruptionPoint)
    );
    if (!entryPointPresent) issues.push('missing entry point');
    if (!progressionPresent) issues.push('missing progression mechanism');
    if (!concealmentPresent) issues.push('missing concealment step');
    if (!interruptionPresent) issues.push('missing interruption point');
    if (!warningIndicatorsPresent) issues.push('missing warning indicators');
    if (!findingLinksCanonical) issues.push('finding link is not canonical or is absent');
    if (!riskLinksCanonical) issues.push('risk link is not canonical or is absent');
    if (!controlLinksCanonical) issues.push('control link is not canonical or is absent');
    if (!interruptionControlLinked) issues.push('interruption point is not the linked risk control response');
    return {
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      coherent: issues.length === 0,
      entryPointPresent,
      progressionPresent,
      concealmentPresent,
      interruptionPresent,
      warningIndicatorsPresent,
      findingLinksCanonical,
      riskLinksCanonical,
      controlLinksCanonical,
      interruptionControlLinked,
      linkedFindingIds: [...scenario.linkedFindingIds],
      linkedRiskIds: [...scenario.linkedRiskIds],
      linkedControlIds: [...scenario.linkedControlIds],
      issues
    };
  });
}

export function assertScenarioLinkageAudit(rows: readonly ScenarioLinkageAuditRow[]): void {
  const failures = rows.filter((row) => !row.coherent);
  if (failures.length) throw new Error(`Scenario linkage audit failed: ${failures.map((row) => `${row.scenarioId}: ${row.issues.join(', ')}`).join('; ')}`);
}
