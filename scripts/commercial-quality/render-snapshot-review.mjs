#!/usr/bin/env node
/**
 * Owner design-review renders.
 *
 * Server-renders the real Snapshot components against fixtures and writes one static HTML file
 * per variant. Fixtures rather than live data because the review needs states a single real
 * assessment cannot reach -- insufficient visibility, each recommendation rule, each inventory
 * variant -- and because rendering from fixtures writes nothing to Staging.
 *
 * Output: tmp/snapshot-review/
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SnapshotResult } from '../../src/components/assessment/SnapshotResult.tsx';
import { OrderJourney } from '../../src/components/commercial/OrderJourney.tsx';
import { ResultChrome, ResultFooter } from '../../src/components/layout/ResultChrome.tsx';
import { buildCommercialSnapshotInsights } from '../../src/lib/snapshot/commercial-insights.ts';
import { buildNextStepRecommendation } from '../../src/lib/snapshot/next-step-recommendation.ts';
import { buildGapInventory } from '../../src/lib/snapshot/gap-inventory.ts';

// Run from the repository root. Resolved this way so the harness also works when bundled to
// CJS by esbuild, where import.meta.dirname is not available.
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp/snapshot-review');
const CSS = fs.readFileSync(path.join(OUT, 'review.css'), 'utf8');

function domain(code, name, rawScore, criticalGapCount = 0, coveragePct = 100, weightPct = 10) {
  return {
    domainId: `id-${code}`, domainCode: code, domainName: name, weightPct,
    rawScore, weightedContribution: rawScore === null ? null : rawScore * (weightPct / 100),
    coveragePct, criticalGapCount
  };
}

function fixture(overrides = {}) {
  return {
    assessmentId: 'a1', assessmentReference: 'MKFRS-2026-B3B38A3143',
    organisationName: 'Siyakhula Holdings (Pty) Ltd',
    respondentName: 'Nomsa Dlamini', respondentEmail: 'nomsa@siyakhula.example',
    scoreRunId: 'r1', methodologyVersionId: 'm1', runNumber: 1,
    overallScore: 54, calculatedMaturity: 'Developing', finalMaturity: 'Developing',
    exposureScore: null, exposureBand: null,
    coveragePct: 87, nARatePct: 6, criticalGapCount: 3, majorGapCount: 5,
    capApplied: false, capReason: null, scoredAt: '2026-08-29T08:00:00.000Z',
    domains: [
      domain('D1', 'Fraud Leadership and Governance', 42, 1),
      domain('D2', 'Fraud Risk Identification', 58, 0),
      domain('D3', 'Operational Fraud Controls', 78, 0),
      domain('D4', 'Fraud Detection Capability', 31, 2),
      domain('D5', 'Fraud Incident Response', 47, 0),
      domain('D6', 'Whistleblowing and Reporting Culture', 52, 0),
      domain('D7', 'Third-Party and Supply Chain Fraud Risk', 44, 0),
      domain('D8', 'Data and Systems Integrity', 61, 0),
      domain('D9', 'People and Conduct Risk', 55, 0)
    ],
    resultStatus: 'NORMAL',
    adaptiveMetrics: { assessmentCoveragePct: 87, controlVisibilityPct: 91, unknownSharePct: 4, graphVersion: 'V1.2' },
    comparabilityStatement: null,
    ...overrides
  };
}

const SCENARIOS = {
  'normal-developing': {
    title: 'Normal result · Developing · rule C2',
    snapshot: fixture()
  },
  'capped-result': {
    title: 'Capped result · rule C2 (cap branch)',
    snapshot: fixture({
      capApplied: true, capReason: 'Three or more critical controls scored 0, 1 or 2.',
      calculatedMaturity: 'Structured', finalMaturity: 'Developing',
      criticalGapCount: 1, majorGapCount: 2,
      domains: [
        domain('D1', 'Fraud Leadership and Governance', 66, 1),
        domain('D3', 'Operational Fraud Controls', 79, 0),
        domain('D4', 'Fraud Detection Capability', 41, 0)
      ]
    })
  },
  'insufficient-visibility': {
    title: 'Insufficient visibility · rule C1 · Speak to MK first',
    snapshot: fixture({
      resultStatus: 'INSUFFICIENT_VISIBILITY', overallScore: null,
      calculatedMaturity: null, finalMaturity: null,
      criticalGapCount: 0, majorGapCount: 0,
      adaptiveMetrics: { assessmentCoveragePct: 41, controlVisibilityPct: 38, unknownSharePct: 46, graphVersion: 'V1.2' }
    })
  },
  'strong-no-gaps': {
    title: 'No gaps recorded · Strategic · rule C5 · inventory variant D',
    snapshot: fixture({
      overallScore: 84, calculatedMaturity: 'Strategic', finalMaturity: 'Strategic',
      criticalGapCount: 0, majorGapCount: 0,
      domains: [
        domain('D1', 'Fraud Leadership and Governance', 82, 0),
        domain('D3', 'Operational Fraud Controls', 88, 0),
        domain('D4', 'Fraud Detection Capability', 79, 0)
      ]
    })
  },
  'major-only': {
    title: 'Major gaps only · inventory variant C · no area table',
    snapshot: fixture({
      overallScore: 58, criticalGapCount: 0, majorGapCount: 4,
      finalMaturity: 'Developing',
      domains: [
        domain('D1', 'Fraud Leadership and Governance', 55, 0),
        domain('D3', 'Operational Fraud Controls', 62, 0),
        domain('D4', 'Fraud Detection Capability', 51, 0)
      ]
    })
  }
};

function page({ title, body, width }) {
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
<style>:root{--font-poppins:'Poppins'}html{font-family:var(--font-poppins),ui-sans-serif,system-ui,sans-serif}
${CSS}
body{margin:0;background:#fff}${width ? `.viewport{width:${width}px;margin:0 auto;box-shadow:0 0 0 1px #E2E8F0}` : '.viewport{}'}</style>
</head><body><div class="viewport">${body}</div></body></html>`;
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];

for (const [key, scenario] of Object.entries(SCENARIOS)) {
  const insights = buildCommercialSnapshotInsights(scenario.snapshot);
  const recommendation = buildNextStepRecommendation(scenario.snapshot);
  const inventory = buildGapInventory(scenario.snapshot);
  const resultUrl = `https://example.invalid/score/snapshot/${scenario.snapshot.assessmentReference}?token=demo`;
  const version = scenario.snapshot.adaptiveMetrics?.graphVersion ?? null;
  const markup = renderToStaticMarkup(
    React.createElement(ResultChrome, {
      assessmentReference: scenario.snapshot.assessmentReference,
      resultUrl
    },
      React.createElement(SnapshotResult, {
        snapshot: scenario.snapshot,
        snapshotUrl: resultUrl,
        commercialInsights: insights,
        methodologyVersion: version
      }),
      React.createElement(ResultFooter, {
        assessmentReference: scenario.snapshot.assessmentReference,
        methodologyVersion: version
      })
    )
  );
  for (const [suffix, width] of [['desktop', null], ['390', 390], ['430', 430]]) {
    fs.writeFileSync(path.join(OUT, `${key}--${suffix}.html`), page({ title: scenario.title, body: markup, width }));
  }
  manifest.push({
    scenario: key,
    title: scenario.title,
    rule: recommendation.ruleId,
    recommendedTier: recommendation.recommendedTier,
    speakToMkFirst: recommendation.speakToMkFirst,
    inventoryVariant: inventory.variant,
    inventoryRows: inventory.rows.map((r) => `${r.domainName}: ${r.criticalGapCount}`),
    criticalGapCount: inventory.criticalGapCount,
    majorGapCount: inventory.majorGapCount,
    totalWeaknessCount: inventory.totalWeaknessCount,
    applicableAreaCount: inventory.applicableAreaCount,
    reason: recommendation.reason
  });
}

// The focused order journey, step 1.
const orderMarkup = renderToStaticMarkup(
  React.createElement(ResultChrome, {
    assessmentReference: 'MKFRS-2026-B3B38A3143',
    orderStep: { current: 1, total: 3 }
  },
  React.createElement(OrderJourney, {
    tier: 'comprehensive', productLabel: 'Comprehensive', amountDisplay: 'R35 000 incl. VAT',
    assessmentReference: 'MKFRS-2026-B3B38A3143',
    organisationName: 'Siyakhula Holdings (Pty) Ltd',
    respondentName: 'Nomsa Dlamini', respondentEmail: 'nomsa@siyakhula.example',
    snapshotToken: 'demo', snapshotPath: '/score/snapshot/MKFRS-2026-B3B38A3143?token=demo'
  }),
  React.createElement(ResultFooter, { assessmentReference: 'MKFRS-2026-B3B38A3143' })
  )
);
for (const [suffix, width] of [['desktop', null], ['390', 390]]) {
  fs.writeFileSync(path.join(OUT, `order-step1--${suffix}.html`), page({ title: 'Focused order · step 1', body: orderMarkup, width }));
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
console.log(`\nRendered ${Object.keys(SCENARIOS).length * 3 + 2} files to tmp/snapshot-review/`);
