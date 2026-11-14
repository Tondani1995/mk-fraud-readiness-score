// Loads the exact bound B5 fixtures and builds the live pipeline's Fact Pack and Story Plan from them (test only).
import fs from 'node:fs';
import { replay } from '../../../src/lib/readiness-review/session.ts';
import { buildStagedReportInput } from '../../../src/lib/readiness-review/report-input.ts';
import { buildRevisedReport } from '../../../src/lib/reports/revised/evidence-model.ts';
import { positionStatements } from '../../../src/lib/reports/revised/position.ts';
import { buildRevisedFactPack } from '../../../src/lib/reports/revised/manuscript/fact-pack.ts';
import { buildRevisedStoryPlan } from '../../../src/lib/reports/revised/manuscript/story-plan.ts';
import { revisedScore, scoredPosition } from '../../../src/lib/reports/revised/score.ts';
export function loadFixture(name) {
  const f = JSON.parse(fs.readFileSync(`scripts/revised-reports/fixtures/b5-${name}-bound.json`, 'utf8'));
  const input = buildStagedReportInput(replay(f.record));
  const report = buildRevisedReport(input);
  return { f, input, report };
}
/**
 * The Fact Pack and Story Plan exactly as the live pipeline builds them (produce.ts): scored under DR-02, with the score
 * in the position statements and the agreed conclusion facts. `{ scored: false }` gives the earlier unscored pack.
 */
export function fixturePack(x, product, { scored = true } = {}) {
  const score = scored ? revisedScore(x.report) : null;
  const base = positionStatements(x.report, { score: null });
  const position = score ? scoredPosition(base, score) : base.map((p) => p.key === 'calculated' ? { ...p, label: 'Score', value: 'Not issued', text: 'No score is calculated. The revised scoring method has not been approved by MK, so this report issues no score, maturity level or band.' } : p);
  const fp = buildRevisedFactPack({
    report: x.report, product, organisationName: x.f.record.organisationLabel, assessmentReference: x.f.assessmentReference, generatedAt: '2026-11-13T00:00:00.000Z',
    profile: x.input.profile.map((p) => ({ id: p.id, label: p.label, value: p.value })), position,
    figure: score ? { overall: null, areas: [], label: `MK Fraud Readiness score: ${score.percent}%.` } : { overall: null, areas: [], label: 'No score issued: the revised method is not approved by MK.' },
    score
  });
  return { fp, plan: buildRevisedStoryPlan(fp) };
}
