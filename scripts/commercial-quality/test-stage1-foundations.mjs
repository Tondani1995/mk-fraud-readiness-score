import assert from 'node:assert/strict';
import { SeverityBudget } from '../../src/lib/reports/design/severity-budget.ts';
import { MK_CSS_VARIABLES, MK_TOKENS, severityToken } from '../../src/lib/reports/design/tokens.ts';
import { assertCommercialProjection, buildCommercialProjection } from '../../src/lib/reports/commercial-projection/index.ts';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';

const fixture = comprehensiveFixtures.weakOrganisationMeaningfulEvidence;
const projection = buildCommercialProjection({
  tier: 'Comprehensive',
  organisationName: 'Fixture test organisation',
  score: fixture.analytical.score.overallScore,
  maturity: fixture.analytical.score.finalMaturity,
  model: fixture.analytical.evidenceModel,
  reviewer: fixture.reviewer
});
assertCommercialProjection(projection);
assert.equal(projection.reconciliation.total, projection.evidence.length);
assert.equal(projection.reconciliation.notReviewed + projection.reconciliation.reviewed, projection.reconciliation.total);
assert.equal(projection.reconciliation.supported + projection.reconciliation.insufficient + projection.reconciliation.notSupported + projection.reconciliation.reviewedNoConclusion, projection.reconciliation.reviewed);
assert.equal(projection.reconciliation.unresolved, projection.reconciliation.notReviewed + projection.reconciliation.insufficient + projection.reconciliation.notSupported);

const budget = new SeverityBudget();
budget.request({ page: 1, severity: 'critical', label: 'first' });
const downgradedPage = budget.request({ page: 1, severity: 'critical', label: 'second' });
assert.equal(downgradedPage.allocated, 'major');
budget.request({ page: 2, severity: 'critical', label: 'third' });
budget.request({ page: 3, severity: 'critical', label: 'fourth' });
const documentDowngrade = budget.request({ page: 4, severity: 'critical', label: 'fifth' });
assert.equal(documentDowngrade.allocated, 'major');
budget.assertWithinBudget();
assert.match(MK_CSS_VARIABLES, /--mk-critical/);
assert.equal(severityToken('confirmed'), 'var(--mk-confirmed)');
assert.equal(MK_TOKENS.critical, '#A32020');
console.log('Stage 1 foundations: 12 checks passed.');
