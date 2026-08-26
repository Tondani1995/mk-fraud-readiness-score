import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  MFRS_V12_METHODOLOGY_VERSION_CODE,
  V12_NON_ACTIVE_QUESTION_CODES,
  getAuthoritativeQuestionMapping,
  getQuestionPlaybook,
  hasQuestionPlaybook,
  listQuestionPlaybooks
} from '../src/lib/reports/evidence-model/question-playbooks.ts';

const root = process.cwd();
const candidate = JSON.parse(fs.readFileSync(
  path.join(root, 'src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json'),
  'utf8'
));

assert.equal(candidate.methodologyVersion, MFRS_V12_METHODOLOGY_VERSION_CODE);

const v12Identity = {
  methodologyVersionId: randomUUID(),
  methodologyVersionCode: MFRS_V12_METHODOLOGY_VERSION_CODE
};
const v11Identity = {
  methodologyVersionId: randomUUID(),
  methodologyVersionCode: 'MFRS-V1.1'
};
const activeV12Codes = candidate.questions.map((question) => question.questionCode);
assert.equal(activeV12Codes.length, 68, 'The V1.2 candidate must contain 68 active questions.');
assert.equal(new Set(activeV12Codes).size, 68, 'The V1.2 candidate must not duplicate question codes.');

// A database-generated methodology UUID must not affect stable version-code selection.
const v12Playbooks = listQuestionPlaybooks(v12Identity);
assert.equal(v12Playbooks.length, 68, 'V1.2 must expose one playbook for each active question.');
for (const questionCode of activeV12Codes) {
  const playbook = getQuestionPlaybook(questionCode, v12Identity);
  assert.ok(playbook, `${questionCode} must resolve in the V1.2 registry.`);
  assert.equal(playbook.questionCode, questionCode, `${questionCode} must resolve to its exact playbook.`);
  assert.equal(hasQuestionPlaybook(questionCode, v12Identity), true);
}

const v12OnlyCodes = ['D1-Q07', 'D3-Q08', 'D3-Q09', 'D3-Q10', 'D3-Q11', 'D4-Q08', 'D8-Q09', 'D8-Q10'];
for (const questionCode of v12OnlyCodes) {
  assert.ok(getQuestionPlaybook(questionCode, v12Identity), `${questionCode} must resolve in V1.2.`);
  assert.equal(getQuestionPlaybook(questionCode, v11Identity), null, `${questionCode} must not enter V1.1.`);
}

const expectedRetiredCodes = ['D5-Q02', 'D5-Q07', 'D6-Q06', 'D8-Q05', 'D9-Q04', 'D9-Q06', 'D10-Q04', 'D10-Q05'];
assert.deepEqual(
  [...V12_NON_ACTIVE_QUESTION_CODES].sort(),
  expectedRetiredCodes.sort(),
  'The V1.2 retired-question set must remain explicit and stable.'
);
for (const questionCode of expectedRetiredCodes) {
  assert.equal(getQuestionPlaybook(questionCode, v12Identity), null, `${questionCode} must be excluded from V1.2.`);
  assert.equal(hasQuestionPlaybook(questionCode, v12Identity), false);
  assert.equal(getAuthoritativeQuestionMapping(questionCode, v12Identity), null);
}

// Any non-V1.2 identity retains the existing V1.1 registry behaviour.
const v11Playbooks = listQuestionPlaybooks(v11Identity);
assert.deepEqual(
  v11Playbooks.map((playbook) => playbook.questionCode),
  listQuestionPlaybooks().map((playbook) => playbook.questionCode),
  'V1.1 registry selection must remain unchanged.'
);
assert.ok(getQuestionPlaybook('D5-Q02', v11Identity), 'A legacy V1.1 question must remain available to V1.1.');

console.log(`v12-question-playbook-identity: PASS (${v12Playbooks.length}/68 active V1.2, `
  + `${v12OnlyCodes.length} V1.2-only, ${expectedRetiredCodes.length} retired excluded, V1.1 unchanged)`);
