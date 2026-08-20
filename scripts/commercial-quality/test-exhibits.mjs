import assert from 'node:assert/strict';
import { buildCommercialProjection } from '../../src/lib/reports/commercial-projection/index.ts';
import { getCommercialFixtureProfile } from '../../src/lib/reports/commercial-projection/fixture-profiles.ts';
import { renderAllExhibits } from '../../src/lib/reports/exhibits/index.ts';

const profile = getCommercialFixtureProfile('F2');
const projection = buildCommercialProjection({ tier: 'Comprehensive', organisationName: profile.organisationName, score: profile.score, maturity: profile.maturity, model: profile.model, reviewer: profile.reviewer });
assert.equal(projection.integrityIssues.length, 0);
const exhibits = renderAllExhibits({ projection });
assert.equal(exhibits.length, 10);
for (const exhibit of exhibits) {
  assert.ok(exhibit.title.length > 10, `${exhibit.id} title`);
  assert.ok(exhibit.source.length > 10, `${exhibit.id} source`);
  assert.ok(exhibit.html.includes('mk-source'), `${exhibit.id} source markup`);
  assert.ok(exhibit.requiredFields.length >= 1, `${exhibit.id} fields`);
}
assert.match(exhibits.find((item) => item.id === 'E4').html, /polyline/);
console.log('Exhibit engine: 14 checks passed.');
