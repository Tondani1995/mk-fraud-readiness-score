#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { riskPathwayForFinding } from '../../src/lib/reports/evidence-model/risk-pathways.ts';

const finding = {
  domainName: 'Continuous Improvement and Fraud Risk Monitoring',
  domainCode: 'D10',
  questionCode: 'D10-Q01',
  questionPrompt: 'The organisation periodically reviews its fraud risks and control environment.',
  responseLabel: 'Partially designed',
  materialityClass: 'control_failure',
  fraudMechanism: 'Control weaknesses can persist because the review cycle is incomplete.',
  likelyFinancialImpact: 'Indirect — losses may recur where controls remain stale.',
  likelyOperationalImpact: 'Management may rely on outdated control assumptions.',
  isHardGate: true,
  isCriticalControl: true
};

test('fallback risk cause is grounded in the exact assessed control evidence', () => {
  const pathway = riskPathwayForFinding(finding);
  assert.match(pathway.cause, /periodically reviews its fraud risks and control environment/i);
  assert.match(pathway.cause, /Partially designed/i);
  assert.doesNotMatch(pathway.cause, /assessed control design or operation does not meet the exact expected standard/i);
  assert.match(pathway.riskEvent, /review cycle is incomplete/i);
});
