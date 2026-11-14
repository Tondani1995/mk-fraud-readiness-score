// Loads the exact bound B5 fixtures and builds the live pipeline's Fact Pack and Story Plan from them (test only).
import fs from 'node:fs';
import { replay } from '../../../src/lib/readiness-review/session.ts';
import { buildStagedReportInput } from '../../../src/lib/readiness-review/report-input.ts';
import { buildRevisedReport } from '../../../src/lib/reports/revised/evidence-model.ts';
import { positionStatements } from '../../../src/lib/reports/revised/position.ts';
import { buildRevisedFactPack } from '../../../src/lib/reports/revised/manuscript/fact-pack.ts';
import { buildRevisedStoryPlan } from '../../../src/lib/reports/revised/manuscript/story-plan.ts';
export function loadFixture(name) {
  const f = JSON.parse(fs.readFileSync(`scripts/revised-reports/fixtures/b5-${name}-bound.json`, 'utf8'));
  const input = buildStagedReportInput(replay(f.record));
  const report = buildRevisedReport(input);
  return { f, input, report };
}
export function fixturePack(x, product) {
  const position = positionStatements(x.report, { score: null }).map((p) => p.key === 'calculated' ? { ...p, label: 'Score', value: 'Not issued', text: 'No score is calculated. The revised scoring method has not been approved by MK, so this report issues no score, maturity level or band.' } : p);
  const fp = buildRevisedFactPack({
    report: x.report, product, organisationName: x.f.record.organisationLabel, assessmentReference: x.f.assessmentReference, generatedAt: '2026-11-13T00:00:00.000Z',
    profile: x.input.profile.map((p) => ({ id: p.id, label: p.label, value: p.value })), position,
    figure: { overall: null, areas: [], label: 'No score issued: the revised method is not approved by MK.' }
  });
  return { fp, plan: buildRevisedStoryPlan(fp) };
}
