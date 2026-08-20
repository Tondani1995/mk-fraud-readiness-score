#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  adaptEssentialEvidenceModel,
  adaptEssentialText,
  buildEssentialAdaptationContext
} from '../../src/lib/reports/essential-presentation-adaptation.ts';
import { selectContent } from '../../src/lib/reports/select-content-blocks.ts';

const context = buildEssentialAdaptationContext({});

const customerCopy = adaptEssentialText(
  'The audit-committee chair coordinates audit, compliance, operations and risk functions. Direct -- unreviewed exceptions can allow losses to compound. Misuse can occur when an actor exploits the recorded control condition and material anomalous activity is missed. Impact requires case-specific validation. Operating impact requires case-specific validation.',
  context
);
assert.doesNotMatch(customerCopy, /audit-committee chair/i);
assert.doesNotMatch(customerCopy, /audit, compliance, operations and risk functions/i);
assert.doesNotMatch(customerCopy, /\s--\s/);
assert.doesNotMatch(customerCopy, /recorded control condition/i);
assert.doesNotMatch(customerCopy, /case-specific validation/i);
assert.match(customerCopy, /Governing body \/ independent oversight/);
assert.match(customerCopy, /relevant operational, control and oversight responsibilities/);
assert.match(customerCopy, /financial consequence depends on the value and transactions affected/i);
assert.match(customerCopy, /operational consequence depends on the process, system or records affected/i);

const unsupportedSummary = adaptEssentialText(
  "The organisation's fraud defences depend on people, not systems. It is meaningfully ahead of many of similar size. If the one or two people who currently hold this knowledge left tomorrow, the control environment would fail. The concentration risk in people, not process, is material.",
  context
);
assert.doesNotMatch(unsupportedSummary, /depend on people|meaningfully ahead|one or two people|concentration risk in people/i);

const data = {
  organisationName: 'Boundary Test Advisory',
  adaptiveGatewayAnswers: {},
  scoreRun: {
    overallScore: 42,
    calculatedMaturity: 'Developing',
    finalMaturity: 'Developing',
    exposureBand: 'Moderate',
    capApplied: false
  },
  domainResults: [
    { domainCode: 'D1', domainName: 'Fraud Leadership and Governance', rawScore: 45 }
  ],
  questionTraces: [
    { domainCode: 'D1', applicable: true, responseValue: 2 }
  ],
  criticalMajorGaps: []
};
const blocks = [
  {
    blockKey: 'executive-bad', blockType: 'executive_summary', domainCode: null,
    maturityBand: 'Developing', severity: null,
    title: "The organisation's fraud defences depend on people, not systems",
    body: 'The organisation is meaningfully ahead of many of similar size. If the one or two people who currently hold this knowledge left tomorrow, controls would fail.',
    status: 'active'
  },
  {
    blockKey: 'leadership-bad', blockType: 'leadership_attention', domainCode: null,
    maturityBand: 'Developing', severity: null, title: null,
    body: 'The immediate concern is concentration risk in people, not process.',
    status: 'active'
  },
  {
    blockKey: 'domain-structure', blockType: 'domain_narrative', domainCode: 'D1',
    maturityBand: 'Developing', severity: null,
    title: 'Governance responsibilities need clearer ownership',
    body: 'The audit-committee chair coordinates audit, compliance, operations and risk functions.',
    status: 'active'
  }
];
const selected = selectContent(data, blocks);
const selectedText = JSON.stringify(selected);
assert.equal(selected.executiveSummary.usedFallback, true, 'unsupported executive block falls back');
assert.equal(selected.leadershipAttention.usedFallback, true, 'unsupported leadership block falls back');
assert.doesNotMatch(selectedText, /meaningfully ahead|one or two people|concentration risk in people|audit-committee chair/i);
assert.doesNotMatch(selectedText, /specific people being present/i);
assert.match(selected.domainNarratives['Fraud Leadership and Governance'].body, /relevant operational, control and oversight responsibilities/i);

const originalModel = {
  materialFindings: [
    { id: 'F-1', materialityScore: 900 },
    { id: 'F-2', materialityScore: 700 },
    { id: 'F-3', materialityScore: 500 },
    { id: 'F-4', materialityScore: 300 }
  ],
  roadmapActions: [
    { id: 'RA-1', period: '60 days', domainCode: 'D1', deliverable: 'Appoint a fraud-risk owner and approve the escalation route.', processOwner: 'COO', accountableExecutive: 'CFO', linkedFindingIds: ['F-1'], dependencyIds: [] },
    { id: 'RA-2', period: '60 days', domainCode: 'D5', deliverable: 'Define incident intake and evidence preservation responsibilities.', processOwner: 'General Counsel', accountableExecutive: 'COO', linkedFindingIds: ['F-2'], dependencyIds: [] },
    { id: 'RA-3', period: '90 days', domainCode: 'D4', deliverable: 'Establish a monitoring and exception escalation cycle.', processOwner: 'SOC', accountableExecutive: 'CTO', linkedFindingIds: ['F-3'], dependencyIds: [] },
    { id: 'RA-4', period: '60 days', domainCode: 'D7', deliverable: 'Document the supplier-payment verification standard.', processOwner: 'Accounts Payable', accountableExecutive: 'CFO', linkedFindingIds: ['F-4'], dependencyIds: [] },
    { id: 'RA-5', period: '90 days', domainCode: 'D10', deliverable: 'Test the review cycle and evidence closure standard.', processOwner: 'Risk', accountableExecutive: 'COO', linkedFindingIds: ['F-1'], dependencyIds: ['RA-1'] }
  ]
};
const adaptedModel = adaptEssentialEvidenceModel(originalModel, {});
assert.equal(originalModel.roadmapActions.some((action) => action.period === '30 days'), false, 'shared source model is not mutated');
assert.ok(adaptedModel.roadmapActions.some((action) => action.period === '30 days'), 'Essential gets genuine 30-day foundation work');
assert.ok(adaptedModel.roadmapActions.some((action) => action.period === '60 days'), '60-day work remains');
assert.ok(adaptedModel.roadmapActions.some((action) => action.period === '90 days'), '90-day work remains');
assert.equal(new Set(adaptedModel.roadmapActions.map((action) => action.id)).size, originalModel.roadmapActions.length, 'roadmap actions are not duplicated');
assert.equal(adaptedModel.roadmapActions.find((action) => action.id === 'RA-5').period, '90 days', 'dependent action is not pulled forward');
assert.doesNotMatch(JSON.stringify(adaptedModel), /\b(?:CFO|COO|CTO|SOC)\b|General Counsel|audit-committee/i, 'formal enterprise role labels are adapted in Essential only');

console.log('PASS essential-v2-visible-quality-regression');
