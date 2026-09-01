#!/usr/bin/env node
/**
 * Provider-free customer-copy leakage gate for the current Comprehensive
 * HTML/PDF outputs. Internal composition vocabulary belongs in source and
 * developer evidence, never in the customer-facing report surface.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { CUSTOMER_COPY_LEAKAGE_CHECKS, findCustomerCopyLeakage } from '../../src/lib/reports/narrative/blueprint-text.ts';

const outputDir = path.resolve(process.env.CURRENT_COMPREHENSIVE_OUTPUT_DIR ?? path.join(process.cwd(), 'outputs', 'comprehensive-current-path'));
const profiles = [
  ['motheo', 'MK-Comprehensive-V12-Motheo-Terra-Owner-Review'],
  ['bokamoso', 'MK-Comprehensive-Bokamoso-Provider-Free-Structural-Composition-Fixture']
];
const allowedFixtureLabel = 'INTERNAL QA · PROVIDER-FREE STRUCTURAL COMPOSITION FIXTURE · NOT COMMERCIAL NARRATIVE ACCEPTANCE';

function visible(value) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function customerSurface(value) {
  return visible(value).replace(allowedFixtureLabel, ' ').replace(/\s+/g, ' ').trim();
}

const checks = CUSTOMER_COPY_LEAKAGE_CHECKS.map(({ id, pattern, description }) => ({ id, description, expression: pattern.toString() }));
const results = [];
for (const [key, fileStem] of profiles) {
  const htmlPath = path.join(outputDir, `${fileStem}.html`);
  const pdfPath = path.join(outputDir, `${fileStem}.pdf`);
  const html = await fs.readFile(htmlPath, 'utf8');
  const pdf = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  const htmlLeaks = findCustomerCopyLeakage(customerSurface(html));
  const pdfLeaks = findCustomerCopyLeakage(customerSurface(pdf));
  assert.deepEqual(htmlLeaks, [], `${key}: customer-copy leakage found in HTML: ${JSON.stringify(htmlLeaks)}`);
  assert.deepEqual(pdfLeaks, [], `${key}: customer-copy leakage found in PDF: ${JSON.stringify(pdfLeaks)}`);
  results.push({ profile: key, html: htmlPath, pdf: pdfPath, htmlLeaks, pdfLeaks, fixtureLabelAllowed: key === 'bokamoso' });
}

const summary = {
  status: 'PASS',
  gate: 'comprehensive-customer-copy-leakage',
  providerCalls: 0,
  databaseWrites: 0,
  acceptance: {
    providerFreeStructuralAcceptance: 'PASS',
    liveCommercialNarrativeAcceptance: 'NOT_RUN',
    commercialValue: 'NOT_CLAIMED'
  },
  checks,
  allowedFixtureLabel,
  profiles: results
};
await fs.writeFile(path.join(outputDir, 'comprehensive-customer-copy-leakage.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
