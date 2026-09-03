#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildMotheoDeterministicFixture } from './comprehensive-phase-g-fixture.mjs';

const fixture = buildMotheoDeterministicFixture();
const boundary = "The assessment is based on management's own responses and the MK scoring method. It is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.";
const count = (text, needle) => text.split(needle).length - 1;

assert.equal(count(fixture.generationPrompt, boundary), 1, 'whole-manuscript generation prompt must carry one canonical customer boundary');
assert.equal(count(JSON.stringify(fixture.blueprint), boundary), 1, 'Blueprint must carry one canonical customer boundary');
assert.doesNotMatch(fixture.blueprint.executiveStory, /not independent verification of operating effectiveness/i, 'executive story must carry placement guidance, not a second customer boundary');
assert.match(fixture.generationPrompt, /Never state or imply that MK, the assessment, this report or an external reviewer independently verified/i);
assert.match(fixture.generationPrompt, /Use the Blueprint assessment position for the one customer-facing limitation in the Executive assessment section/i);
assert.match(fixture.generationPrompt, /Do not claim that MK, the assessment or the report independently verified operating effectiveness/i);
assert.match(fixture.generationPrompt, /Do not compare this organisation with peers/i, 'customer fact safety rule must remain present');

console.log(JSON.stringify({
  status: 'PASS',
  providerCalls: 0,
  canonicalBoundaryOccurrencesInGenerationPrompt: count(fixture.generationPrompt, boundary),
  safetyInstructionPresent: true,
  repeatedBlueprintDisclaimerInstruction: false,
  customerFactBoundaryPresent: true
}, null, 2));
