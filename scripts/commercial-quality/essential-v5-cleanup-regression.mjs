#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  adaptEssentialEvidenceModel,
  adaptEssentialText,
  buildEssentialAdaptationContext
} from '../../src/lib/reports/essential-presentation-adaptation.ts';
import { buildEvidenceChecklist } from '../../src/lib/reports/evidence-model/registers.ts';

const context = buildEssentialAdaptationContext({});
const cleaned = adaptEssentialText(
  'Impact requires case-specific validation.; Operating impact requires case-specific validation.; Report to the fraud forum using notice boards at operating locations and intranet.',
  context
);
assert.doesNotMatch(cleaned, /\.\s*;/, 'customer-visible punctuation must not contain .;');
assert.doesNotMatch(cleaned, /case-specific validation|fraud forum|notice boards|\bintranet\b/i);
assert.match(cleaned, /management fraud-risk review route/i);

const model = {
  materialFindings: [
    { id: 'F-1', materialityScore: 900 },
    { id: 'F-2', materialityScore: 700 },
    { id: 'F-3', materialityScore: 500 }
  ],
  roadmapActions: [
    { id: 'RA-1', period: '60 days', domainCode: 'D1', deliverable: 'Appoint a fraud-risk owner and approve the escalation route.', linkedFindingIds: ['F-1'], dependencyIds: [] },
    { id: 'RA-2', period: '60 days', domainCode: 'D5', deliverable: 'Define incident intake and evidence preservation responsibilities.', linkedFindingIds: ['F-2'], dependencyIds: [] },
    { id: 'RA-3', period: '90 days', domainCode: 'D4', deliverable: 'Operate monitoring and exception review.', linkedFindingIds: ['F-3'], dependencyIds: [] }
  ],
  leadershipDecisions: [
    { decisionRequired: 'Approve accountable executive mandates and escalation authority for priority remediation.', targetPeriod: '60 days' },
    { decisionRequired: 'Approve target control standards.', targetPeriod: '30 days' }
  ]
};
const adapted = adaptEssentialEvidenceModel(model, {});
assert.equal(model.leadershipDecisions[0].targetPeriod, '60 days', 'shared model must not mutate');
assert.equal(adapted.leadershipDecisions[0].targetPeriod, '30 days', 'ownership/escalation is a 30-day foundation in Essential');
assert.ok(adapted.roadmapActions.some((action) => action.period === '30 days'));
assert.ok(adapted.roadmapActions.some((action) => action.period === '60 days'));
assert.ok(adapted.roadmapActions.some((action) => action.period === '90 days'));

const finding = {
  id: 'MF-D2-Q01',
  questionCode: 'D2-Q01',
  questionPrompt: 'Fraud risks have been mapped across important processes',
  evidenceToRequest: [
    'Control linkage showing preventive and detective controls',
    'Per-process fraud scenario map',
    'Process inventory identifying material value-bearing processes',
    'Process-owner sign-off',
    'Population reconciliation to source systems'
  ],
  processOwner: 'Risk / compliance accountable owner',
  accountableOwner: 'Finance / operations accountable owner',
  operatingFrequency: 'Quarterly',
  minimumEvidenceCharacteristics: ['Complete population']
};
const evidence = buildEvidenceChecklist([finding], []);
const proofByArtefact = new Map(evidence.map((item) => [item.artefact, item.provesWhat]));
assert.match(proofByArtefact.get('Control linkage showing preventive and detective controls') ?? '', /mapped fraud scenario.*preventive and detective controls/i);
assert.match(proofByArtefact.get('Per-process fraud scenario map') ?? '', /explicit fraud scenarios/i);
assert.match(proofByArtefact.get('Process inventory identifying material value-bearing processes') ?? '', /complete population of material value-bearing processes/i);
assert.match(proofByArtefact.get('Process-owner sign-off') ?? '', /process owners have reviewed and accepted/i);
assert.equal(new Set(evidence.map((item) => item.provesWhat)).size, evidence.length, 'priority artefacts should not repeat one proof sentence');

const materialFindingsSource = readFileSync(new URL('../../src/lib/reports/evidence-model/material-findings.ts', import.meta.url), 'utf8');
assert.match(materialFindingsSource, /D2: \{ financial: 'Unmapped process-level fraud routes/i);
assert.match(materialFindingsSource, /D10: \{ financial: 'Undetected control deterioration/i);

const template = readFileSync(new URL('../../src/lib/reports/templates/report-template.ts', import.meta.url), 'utf8');
assert.match(template, /affectedDomainLabels/);
assert.match(template, /roadmapDeliverableForDisplay/);
assert.doesNotMatch(template, /<td>\$\{esc\(action\.deliverable\)\}<\/td>/);
assert.match(template, /roadmap-table-heading/);
assert.match(template, /completed using the assessment's oversight question set rather than the standard question set/);
const appendixBody = template.indexOf("section('Appendix', 'Appendix: supporting material'");
const supportingDetail = template.lastIndexOf("subsection('Complete supporting detail', supportingReferenceBlock)");
assert.ok(appendixBody >= 0 && supportingDetail > appendixBody, 'complete supporting detail must flow inside the appendix');
const tocAppendix = template.indexOf("{ key: 'Appendix: supporting material'");
const tocSupporting = template.indexOf("{ key: 'Complete supporting detail'");
assert.ok(tocAppendix >= 0 && tocSupporting > tocAppendix, 'TOC should place supporting detail under the appendix');

const actions = readFileSync(new URL('../../src/components/admin/FulfilmentActions.tsx', import.meta.url), 'utf8');
assert.match(actions, /Still generating — do not retry/);
assert.match(actions, /completion could not be confirmed/);
assert.match(actions, /if \(!statusUncertain\) setRunning\(null\)/);

console.log(JSON.stringify({ status: 'PASS', ai: 'ZERO', essentialV51Cleanup: 'PASS', adminGenerationReconciliation: 'PASS' }, null, 2));
