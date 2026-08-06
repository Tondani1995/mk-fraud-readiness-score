import assert from 'node:assert/strict';
import { evaluateFullScaleShadowFence, reconcileFullScaleShadowOutput } from '../src/lib/reports/automation/full-scale-shadow.ts';

const base = {
  vercelEnvironment: 'preview',
  projectId: 'prj_jFSTfwL14kk8UURjaaRwYe2HWuhK',
  supabaseProject: 'penhenkzfrtmcxklodtu',
  pullRequest: '52',
  runtimeSha: 'a'.repeat(40),
  provider: 'openai',
  model: 'openai/gpt-5.5'
};
assert.equal(evaluateFullScaleShadowFence(base).allowed, true);
for (const field of ['vercelEnvironment', 'projectId', 'supabaseProject', 'pullRequest', 'runtimeSha', 'provider', 'model']) {
  const invalid = { ...base, [field]: field === 'runtimeSha' ? 'not-a-sha' : 'wrong' };
  assert.equal(evaluateFullScaleShadowFence(invalid).allowed, false, field);
}
const good = reconcileFullScaleShadowOutput({
  output: {
    domainEvidence: Array.from({ length: 10 }, (_, index) => ({ domainCode: `D${index + 1}` })),
    gapEvidence: Array.from({ length: 10 }, (_, index) => ({ questionCode: `Q${index + 1}` }))
  },
  expectedDomainCodes: Array.from({ length: 10 }, (_, index) => `D${index + 1}`),
  expectedVisibilityGapCodes: Array.from({ length: 10 }, (_, index) => `Q${index + 1}`)
});
assert.equal(good.complete, true);
assert.equal(good.narrativeBodyCount, 23);
const duplicate = reconcileFullScaleShadowOutput({
  output: { domainEvidence: [{ domainCode: 'D1' }, { domainCode: 'D1' }], gapEvidence: [{ questionCode: 'Q1' }] },
  expectedDomainCodes: ['D1'],
  expectedVisibilityGapCodes: ['Q1']
});
assert.deepEqual(duplicate.duplicateDomainCodes, ['D1']);
assert.equal(duplicate.complete, false);
console.log('pre-g30 full-scale shadow tests passed');
