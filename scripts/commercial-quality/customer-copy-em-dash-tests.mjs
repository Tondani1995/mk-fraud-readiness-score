#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validatePremiumReportNarrative } from '../../src/lib/reports/automation/validation.ts';
import { validateNarrativeManuscript } from '../../src/lib/reports/narrative/validation.ts';
import { validateSnapshotNarrative } from '../../src/lib/snapshot/narrative.ts';

const ROOT = process.cwd();
const EM_DASH = String.fromCodePoint(0x2014);

function walk(relativeDirectory) {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return walk(relativePath);
    return /\.(?:tsx?|json)$/.test(entry.name) ? [relativePath] : [];
  });
}

function executableSource(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const customerUiFiles = [
  ...walk('src/components/assessment'),
  ...walk('src/components/adaptive'),
  ...walk('src/components/products'),
  ...walk('src/components/comprehensive').filter((file) => !file.includes(`${path.sep}admin${path.sep}`)),
  ...walk('src/components/website'),
  ...walk('src/app/(website)').filter((file) => !file.includes(`${path.sep}admin${path.sep}`)),
  'src/content/insights.json'
];

const reportOutputFiles = [
  'src/lib/notifications/message-templates.ts',
  'src/lib/reports/automation/prompt.ts',
  'src/lib/reports/automation/validation.ts',
  'src/lib/reports/comprehensive/interpretation.ts',
  'src/lib/reports/comprehensive/manual-generation.ts',
  'src/lib/reports/comprehensive/register.ts',
  'src/lib/reports/comprehensive/render-comprehensive-html.ts',
  'src/lib/reports/comprehensive/render-html.ts',
  'src/lib/reports/comprehensive/workshop.ts',
  'src/lib/reports/evidence-model/contradictions.ts',
  'src/lib/reports/evidence-model/material-findings.ts',
  'src/lib/reports/evidence-model/question-playbooks.ts',
  'src/lib/reports/essential-presentation-adaptation.ts',
  'src/lib/reports/essential/presentation-model.ts',
  'src/lib/reports/essential/presentation-validation.ts',
  'src/lib/reports/essential/render-essential-html.ts',
  'src/lib/reports/narrative/blueprint-text.ts',
  'src/lib/reports/narrative/presentation-hygiene.ts',
  'src/lib/reports/narrative/report-blueprint.ts',
  'src/lib/reports/narrative/validation.ts',
  'src/lib/reports/templates/report-template.ts'
];

const customerCopyFiles = [...new Set([
  ...customerUiFiles,
  ...walk('src/lib/snapshot'),
  ...walk('src/lib/reports/email'),
  ...reportOutputFiles
])].sort();

function snapshotInput() {
  return {
    organisationName: 'Synthetic Organisation',
    overallScore: 0,
    maturity: 'Reactive',
    coveragePct: 100,
    nARatePct: 0,
    criticalGapCount: 2,
    majorGapCount: 3,
    resultStatus: 'READY',
    strongestAreas: ['Leadership'],
    attentionAreas: ['Governance'],
    nextStepDirection: 'Prioritise recorded management attention areas.',
    assuranceBoundary: 'This is a self-assessment interpretation.'
  };
}

function manuscriptPack() {
  return {
    bibleVersion: '1.1',
    productTier: 'essential',
    organisation: { name: 'Synthetic Organisation' },
    assessment: { reference: 'MKFRS-TEST' },
    facts: [{ id: 'FINDING-001', kind: 'finding', value: 'Recorded responses need management attention.' }]
  };
}

function manuscript(text) {
  const block = { text, claimRefs: ['FINDING-001'] };
  return {
    bibleVersion: '1.1',
    schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1',
    productTier: 'essential',
    organisationName: 'Synthetic Organisation',
    assessmentReference: 'MKFRS-TEST',
    sections: [{ sectionId: 'SECTION-1', movementId: 'MOVE-1', heading: block, paragraphs: [block], transition: block }],
    spine: {
      schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1',
      bibleVersion: '1.1',
      productTier: 'essential',
      executiveDiagnosis: block,
      systemicThemeSummary: block,
      centralManagementImplication: block,
      route: block,
      writerMetadata: { provider: 'test', model: 'test', promptVersion: 'test', generationMode: 'test' }
    },
    writerMetadata: { provider: 'test', model: 'test', promptVersion: 'test', generationMode: 'test' }
  };
}

function premiumEvidence() {
  return {
    schemaVersion: 'mk-essential-ai-advisory-editor-v5',
    assessmentReference: 'MKFRS-TEST',
    organisationName: 'Synthetic Organisation',
    packageName: 'Essential Self-Assessment Report',
    scoreRunId: 'score-run-test',
    methodologyAuthority: 'deterministic',
    items: [{ id: 'score:final_maturity', kind: 'final_maturity', label: 'Final maturity', value: 'Reactive' }]
  };
}

function premiumNarrative(body) {
  return {
    executiveDiagnosis: { title: 'Readiness result', body, evidenceRefs: ['score:final_maturity'] },
    falseComfort: { title: 'Read carefully', body: 'The recorded position should guide management attention.', evidenceRefs: ['score:final_maturity'] },
    leadershipAttention: { body: 'Leadership should assign ownership for the next management actions.', evidenceRefs: ['score:final_maturity'] },
    domainNarratives: [{ domainCode: 'D1', title: 'Governance', body: 'Governance needs consistent ownership.', evidenceRefs: ['score:final_maturity'] }],
    gapCommentary: []
  };
}

test('customer-facing source corpus contains no em dash', () => {
  const violations = customerCopyFiles.flatMap((file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const customerSource = file.endsWith('.json') ? source : executableSource(source);
    const count = [...customerSource.matchAll(/\u2014/g)].length;
    return count ? [{ file, count }] : [];
  });
  assert.deepEqual(violations, []);
});

test('ProductChoice presents three equal options without internal decision language', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/components/products/ProductChoice.tsx'), 'utf8');
  assert.match(source, /md:grid-cols-3/);
  assert.match(source, /function AdvisoryCard/);
  assert.match(source, /No public price/);
  assert.match(source, /Talk to MK/);
  assert.doesNotMatch(source, /PRICE_DIFFERENCE|Why the difference/);
  assert.doesNotMatch(source, /rule \$\{recommendation\.ruleId\}/);
});

test('Snapshot narrative validation blocks em dash before persistence', () => {
  const issues = validateSnapshotNarrative({
    headline: 'Synthetic Organisation has a recorded position.',
    executiveDiagnosis: `The recorded responses indicate a position that needs attention${EM_DASH}use the result to guide focus.`,
    strength: 'The self-assessment suggests a starting point for management focus.',
    prioritySignals: ['Leadership attention should focus on the recorded areas.', 'The result points to clearer ownership.'],
    managementImplication: 'Leadership attention should focus on the recorded areas.'
  }, snapshotInput());
  assert.ok(issues.includes('snapshot_em_dash'));
});

test('premium narrative validation blocks em dash before report assembly', () => {
  const result = validatePremiumReportNarrative(
    premiumNarrative(`The recorded position${EM_DASH}requires management attention.`),
    premiumEvidence()
  );
  assert.ok(result.issues.some((issue) => issue.code === 'em_dash'));
});

test('manuscript validation blocks em dash before PDF or XLSX rendering', () => {
  const plan = { movements: [{ order: 1, sectionIds: ['SECTION-1'] }] };
  const result = validateNarrativeManuscript(
    manuscript(`The recorded responses indicate a position${EM_DASH}requiring management attention.`),
    manuscriptPack(),
    plan
  );
  assert.ok(result.issues.some((issue) => issue.code === 'em_dash'));
});

console.log(`Customer-copy em-dash tests: PASS (${customerCopyFiles.length} source surfaces scanned)`);
