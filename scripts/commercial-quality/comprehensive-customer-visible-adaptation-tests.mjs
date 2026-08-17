import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts,
  cleanComprehensiveCustomerText
} from '../../src/lib/reports/comprehensive/customer-visible-adaptation.ts';

test('Comprehensive customer boundary removes formal role assumptions and placeholder residue', () => {
  const source = {
    id: 'RISK-1',
    owner: 'CFO / COO',
    consequence: 'Impact requires case-specific validation; Operating impact requires case-specific validation.',
    assurance: 'The strong self-reported response should be validated with operating evidence.',
    communication: 'Use induction packs, payslip inserts, notice boards at depots and sites, intranet and supervisor briefings.'
  };
  const adapted = adaptComprehensiveEvidenceModel(source);
  assert.equal(adapted.id, 'RISK-1');
  assert.doesNotMatch(adapted.owner, /\bCFO\b|\bCOO\b/);
  assert.match(adapted.owner, /Finance and operations accountable owner/i);
  assert.doesNotMatch(adapted.consequence, /requires case-specific validation/i);
  assert.match(adapted.consequence, /financial consequence/i);
  assert.match(adapted.consequence, /operational consequence/i);
  assert.doesNotMatch(adapted.assurance, /strong self-reported/i);
  assert.doesNotMatch(adapted.communication, /payslip|depots|intranet/i);
});

test('Comprehensive scenario interruption point is bounded to one deterministic control clause', () => {
  const facts = [{
    factRef: 'SCN-1',
    linkedRiskRefs: ['RISK-1'],
    requiredControlResponse: 'The monitoring owner inventories material events, implements risk rules across the in-scope event feed, assigns alerts to trained reviewers and escalates high-risk matters immediately; monthly tuning uses confirmed outcomes.; The analytics owner must maintain a rule catalogue in which every test names the scenario, data source, threshold and reviewer; results reconcile to source totals.',
    warningIndicators: ['Alert backlog grows without assigned owner']
  }];
  const [adapted] = adaptComprehensiveScenarioFacts(facts);
  assert.equal(adapted.factRef, 'SCN-1');
  assert.deepEqual(adapted.linkedRiskRefs, ['RISK-1']);
  assert.ok(adapted.requiredControlResponse.length <= 320);
  assert.doesNotMatch(adapted.requiredControlResponse, /analytics owner must maintain/i);
  assert.doesNotMatch(adapted.requiredControlResponse, /\.\s*;/);
  assert.match(adapted.requiredControlResponse, /monitoring owner inventories material events/i);
});

test('customer text cleanup is idempotent', () => {
  const once = cleanComprehensiveCustomerText('CFO / COO must act. Impact requires case-specific validation.');
  const twice = cleanComprehensiveCustomerText(once);
  assert.equal(twice, once);
});

console.log('Comprehensive customer-visible adaptation tests: PASS');
