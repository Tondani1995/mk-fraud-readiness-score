import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const landing = readFileSync(new URL('../src/app/score/adaptive/page.tsx', import.meta.url), 'utf8');
const startForm = readFileSync(new URL('../src/components/adaptive/AdaptiveStartForm.tsx', import.meta.url), 'utf8');
const startRoute = readFileSync(new URL('../src/app/score/api/adaptive/start/route.ts', import.meta.url), 'utf8');
const assessmentPage = readFileSync(new URL('../src/app/score/adaptive/[assessmentRef]/page.tsx', import.meta.url), 'utf8');
const experience = readFileSync(new URL('../src/components/adaptive/AdaptiveAssessmentExperience.tsx', import.meta.url), 'utf8');

for (const copy of [
  'FRAUD READINESS ASSESSMENT',
  'Understand your organisation’s fraud readiness',
  'Complete a structured assessment of your organisation’s fraud risks and controls. It usually takes 20–30 minutes, and your progress is saved so you can return at any time.',
  'WHAT TO EXPECT',
  'A practical assessment of your current fraud controls.',
  'Answer questions about how fraud risk is currently governed and controlled.',
  'Use the evidence examples to help locate the right information where needed.',
  'Review your responses before submitting the assessment.',
  'Begin your assessment',
  'Enter your details to create a private assessment link and save your progress securely.',
  'Start assessment'
]) assert.match(landing + startForm, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

for (const phrase of [
  'See the questions that matter to your organisation',
  'This Preview experience',
  'respondent-led assessment',
  'operating-model questions',
  'control pathway',
  'Start adaptive assessment'
]) assert.equal(landing.includes(phrase) || startForm.includes(phrase), false, `customer copy still contains: ${phrase}`);

const genericError = 'We could not start your assessment right now. Please try again. If the problem continues, contact hello@mkfraud.co.za.';
assert.match(startRoute, new RegExp(genericError.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(startRoute.includes('errors: [message]'), false);
assert.equal(assessmentPage.includes('error.message'), false);
assert.equal(experience.includes('Adaptive pathway'), false);
assert.equal(experience.includes('Adaptive assessment submitted'), false);

console.log(JSON.stringify({ ok: true, exactCopy: true, forbiddenCustomerPhrases: 6, genericUnexpectedStartError: true }));
