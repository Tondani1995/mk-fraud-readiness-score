// Methodology-version dispatch, content registry and MFRS parity. Fictional inputs only; no database.
// The pinned outputs in scripts/fixtures/mfrs-parity-pins.json were produced by scripts/mfrs-parity-pin.mjs at commit
// 3f933ac, before dispatch existed. Every case must still produce a byte-identical calculator result.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateFraudReadinessScore } from '../src/lib/scoring/scoring-engine.ts';
import { calculateAdaptiveReadinessScore } from '../src/lib/scoring/adaptive-scoring.ts';
import { dispatchFixedScoring, methodologyFamilyFor, RevisedMethodologyInactive, REVISED_METHODOLOGY_STATUS } from '../src/lib/scoring/methodology-dispatch.ts';
import { contentRegistry } from '../src/lib/reports/methodology-content.ts';
import { getQuestionPlaybook, listQuestionPlaybooks, MFRS_V12_METHODOLOGY_VERSION_CODE } from '../src/lib/reports/evidence-model/question-playbooks.ts';
import { getDomainPlaybook } from '../src/lib/reports/evidence-model/domain-playbooks.ts';
import { FIXED_CASES, adaptiveCases, canonicalHash } from './fixtures/mfrs-parity-inputs.mjs';

const pins = JSON.parse(readFileSync(new URL('./fixtures/mfrs-parity-pins.json', import.meta.url), 'utf8'));
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };

ok('pins were taken before dispatch existed', () => assert.equal(pins.pinnedAt, '3f933ac'));

ok('fixed MFRS: dispatched results equal the pinned 3f933ac results for all eight cases', () => {
  assert.equal(Object.keys(FIXED_CASES).length, Object.keys(pins.fixed).length);
  for (const [name, input] of Object.entries(FIXED_CASES)) {
    assert.equal(canonicalHash(input), pins.fixed[name].inputHash, `${name}: input changed`);
    const dispatched = dispatchFixedScoring(methodologyFamilyFor({ graphVersionId: null }), input);
    assert.equal(canonicalHash(dispatched), pins.fixed[name].resultHash, `${name}: dispatched result differs from the pin`);
    assert.deepEqual(dispatched, calculateFraudReadinessScore(input), `${name}: dispatched differs from direct`);
  }
});

ok('adaptive MFRS: the five calculated variants equal the pinned 3f933ac results', () => {
  const cases = adaptiveCases();
  for (const [name, input] of Object.entries(cases)) {
    assert.equal(canonicalHash(input), pins.adaptive[name].inputHash, `${name}: input changed`);
    assert.equal(canonicalHash(calculateAdaptiveReadinessScore(input)), pins.adaptive[name].resultHash, `${name}: adaptive result differs from the pin`);
  }
});

ok('family selection: review ruleset is revised, adaptive pin is adaptive, otherwise fixed', () => {
  assert.equal(methodologyFamilyFor({ reviewRuleset: { engine: { build: '1.6' } }, graphVersionId: 'g' }), 'revised-review');
  assert.equal(methodologyFamilyFor({ graphVersionId: 'graph-1' }), 'mfrs-adaptive');
  assert.equal(methodologyFamilyFor({ graphVersionId: null }), 'mfrs-fixed');
});

ok('revised family refuses to score and never falls through to an MFRS calculator', () => {
  assert.equal(REVISED_METHODOLOGY_STATUS.active, false);
  assert.throws(() => dispatchFixedScoring('revised-review', FIXED_CASES['all-three']), RevisedMethodologyInactive);
  assert.throws(() => dispatchFixedScoring('mfrs-adaptive', FIXED_CASES['all-three']), /not scored through the fixed MFRS path/);
});

ok('content registry: MFRS lookups are identical to the existing playbooks (V1.1 and V1.2 selectors)', () => {
  const v11 = contentRegistry('mfrs-fixed');
  const v12 = contentRegistry('mfrs-adaptive', { methodologyVersionCode: MFRS_V12_METHODOLOGY_VERSION_CODE });
  const codes = listQuestionPlaybooks().map((p) => p.questionCode);
  assert.ok(codes.length > 50);
  for (const code of codes) {
    assert.deepEqual(v11.question(code), getQuestionPlaybook(code));
    assert.deepEqual(v12.question(code), getQuestionPlaybook(code, { methodologyVersionCode: MFRS_V12_METHODOLOGY_VERSION_CODE }));
  }
  for (const d of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']) assert.deepEqual(v11.domain(d), getDomainPlaybook(d));
});

ok('content registry: every live bank 1.3 question resolves to its own bank content', () => {
  const r = contentRegistry('revised-review');
  const ids = r.questionIds();
  assert.equal(ids.length, 902, 'live questions in bank 1.3 (912 less 10 retired)');
  for (const id of ids) {
    const c = r.question(id);
    assert.ok(c && c.text && c.domain.id && c.module.name, id);
    if (c.format === 'anchored') assert.ok(Array.isArray(c.levels) && c.levels.length === 6, `${id}: six level descriptions`);
    c.risks.forEach((risk) => assert.ok(risk.name, `${id}: risk ${risk.id} has a bank name`));
  }
  assert.equal(r.question('D1-A-01').scenario.id, 'FS-D1-01');
  assert.equal(r.question('no-such-id'), null);
});

ok('content registry: D3 resolves by family, never across methods', () => {
  const revised = contentRegistry('revised-review').domain('D3');
  const mfrs = contentRegistry('mfrs-fixed').domain('D3');
  assert.equal(revised.name, 'Ethics, integrity and anti-corruption');
  assert.ok(mfrs && !JSON.stringify(mfrs).includes('Ethics, integrity and anti-corruption'), 'MFRS D3 playbook is not the bank 1.3 D3 domain');
  assert.ok(contentRegistry('revised-review').question('D3-S-04'));
  assert.equal(contentRegistry('revised-review').question('D3-Q04'), null, 'an MFRS code is not a bank question');
  assert.equal(contentRegistry('mfrs-fixed').question('D3-S-04'), null, 'a bank id is not an MFRS playbook');
});

console.log(`\n${passed} passed`);
