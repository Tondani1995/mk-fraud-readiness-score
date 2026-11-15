// Writes scripts/fixtures/mfrs-parity-pins.json from the calculators in the checkout it runs in. Run once at commit
// 3f933ac (before methodology dispatch existed) to pin historical MFRS behaviour; the parity test compares against it.
import { writeFileSync } from 'node:fs';
import { calculateFraudReadinessScore } from '../src/lib/scoring/scoring-engine.ts';
import { calculateAdaptiveReadinessScore } from '../src/lib/scoring/adaptive-scoring.ts';
import { FIXED_CASES, adaptiveCases, canonicalHash, summaryOf } from './fixtures/mfrs-parity-inputs.mjs';

const out = { pinnedAt: process.argv[2] ?? 'unknown', fixed: {}, adaptive: {} };
for (const [name, input] of Object.entries(FIXED_CASES)) { const r = calculateFraudReadinessScore(input); out.fixed[name] = { inputHash: canonicalHash(input), resultHash: canonicalHash(r), summary: summaryOf(r) }; }
for (const [name, input] of Object.entries(adaptiveCases())) { const r = calculateAdaptiveReadinessScore(input); out.adaptive[name] = { inputHash: canonicalHash(input), resultHash: canonicalHash(r), summary: summaryOf(r) }; }
writeFileSync(process.argv[3] ?? new URL('./fixtures/mfrs-parity-pins.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries([...Object.entries(out.fixed), ...Object.entries(out.adaptive)].map(([k, v]) => [k, v.summary]))));
