#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bindBlueprintTextProvenance, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { buildMotheoDeterministicFixture } from './comprehensive-phase-g-fixture.mjs';

const root = process.env.PHASE_G_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-09-01/files-pasted-by-the-user-mk/outputs/comprehensive-phase-g-2026-09-01';
const fixture = buildMotheoDeterministicFixture();
const expected = {
  luna: { file: 'MK-Comprehensive-Motheo-Luna-Phase-G-initial-rejected.md', sha256: '6fcb2016a39759a62dd52e2c32ee3835b15eaa2931aef0593552045e19a0a10c', excessDisclaimer: true },
  terra: { file: 'MK-Comprehensive-Motheo-Terra-Phase-G-initial-rejected.md', sha256: 'c09ec965018ddbde52c817724105f00ed801126df935c3a5bdd47024132ded0b', excessDisclaimer: false }
};

const results = {};
for (const [model, expectation] of Object.entries(expected)) {
  const filePath = path.join(root, expectation.file);
  const markdown = fs.readFileSync(filePath, 'utf8');
  const sha256 = crypto.createHash('sha256').update(markdown).digest('hex');
  assert.equal(sha256, expectation.sha256, `${model} historical manuscript changed`);
  const parsed = parseBlueprintMarkdown(markdown, fixture.blueprint);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  const narrative = bindBlueprintTextProvenance(parsed, { factPack: fixture.factPack, blueprint: fixture.blueprint, generationId: `historical-${model}` });
  const validation = validateBlueprintTextManuscript(narrative, fixture.blueprint, fixture.factPack);
  assert.equal(validation.hardTruth.issues.length, 0, `${model} corrected validation still has hard issues: ${JSON.stringify(validation.hardTruth.issues)}`);
  assert.equal(validation.quality.issues.some((issue) => issue.code === 'excess_disclaimer'), expectation.excessDisclaimer, `${model} excess-disclaimer expectation changed`);
  results[model] = {
    sha256,
    hardTruth: validation.hardTruth.status,
    quality: validation.quality.status,
    qualityCodes: validation.quality.issues.map((issue) => issue.code),
    assuranceClaims: validation.hardTruth.issues.filter((issue) => issue.code === 'assurance_claim').length,
    unsupportedNumericClaims: validation.hardTruth.issues.filter((issue) => issue.code === 'unsupported_numeric_claim').length
  };
}

console.log(JSON.stringify({ status: 'PASS', providerCalls: 0, historicalFilesUnchanged: true, results }, null, 2));
