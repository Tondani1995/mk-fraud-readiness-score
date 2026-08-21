import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const v11Path = resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json');
const v12Path = resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json');
const v12SourcePath = resolve(root, 'src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json');
const v11 = JSON.parse(readFileSync(v11Path, 'utf8'));
const v12 = JSON.parse(readFileSync(v12Path, 'utf8'));
const v12Source = JSON.parse(readFileSync(v12SourcePath, 'utf8'));

const V11_SHA = 'fa9461c821b0dacab7f5f4e87c1da3dd46abd7b7';
const V11_GRAPH_VERSION = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
const V11_GRAPH_FINGERPRINT = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';
const V12_GRAPH_VERSION = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821';
const MERGED = new Set(['D5-Q02', 'D5-Q07', 'D6-Q06', 'D8-Q05', 'D9-Q04', 'D10-Q04', 'D10-Q05']);
const RETIRED = new Set(['D9-Q06']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function conditionIds(condition, ids = new Set()) {
  if (!condition || typeof condition !== 'object') return ids;
  if (Array.isArray(condition.all)) condition.all.forEach((item) => conditionIds(item, ids));
  if (Array.isArray(condition.any)) condition.any.forEach((item) => conditionIds(item, ids));
  if (condition.not) conditionIds(condition.not, ids);
  if (condition.questionId) ids.add(condition.questionId);
  return ids;
}
function conditionValues(condition, values = new Map()) {
  if (!condition || typeof condition !== 'object') return values;
  if (Array.isArray(condition.all)) condition.all.forEach((item) => conditionValues(item, values));
  if (Array.isArray(condition.any)) condition.any.forEach((item) => conditionValues(item, values));
  if (condition.not) conditionValues(condition.not, values);
  if (condition.questionId && Array.isArray(condition.in)) {
    const set = values.get(condition.questionId) ?? new Set();
    condition.in.forEach((value) => set.add(value)); values.set(condition.questionId, set);
  }
  return values;
}
function evaluate(condition, answers) {
  if (condition === null) return true;
  if (!condition || typeof condition !== 'object') return false;
  if (Array.isArray(condition.all)) return condition.all.every((item) => evaluate(item, answers));
  if (Array.isArray(condition.any)) return condition.any.some((item) => evaluate(item, answers));
  if (condition.not) return !evaluate(condition.not, answers);
  return typeof answers[condition.questionId] === 'string' && condition.in.includes(answers[condition.questionId]);
}
function resolvePath(answers) {
  const rows = [];
  const variants = new Map(v12.oversightVariants.map((variant) => [variant.questionId, variant]));
  for (const item of v12.questions) {
    const redirect = item.redirectWhen && evaluate(item.redirectWhen.condition, answers);
    const applicable = item.applicabilityCondition === null || evaluate(item.applicabilityCondition, answers);
    if (redirect) {
      rows.push({ id: item.questionId, state: 'redirected', kind: 'control', redirectTo: item.redirectWhen.redirectTo });
      if (variants.has(item.redirectWhen.redirectTo)) rows.push({ id: item.redirectWhen.redirectTo, state: 'active', kind: 'oversight', redirectTo: null });
    } else rows.push({ id: item.questionId, state: applicable ? 'active' : 'excluded', kind: 'control', redirectTo: null });
  }
  return rows;
}
function row(path, id) { return path.find((item) => item.id === id); }
function activeSet(path) { return new Set(path.filter((item) => item.state === 'active').map((item) => item.id)); }
function unknownAnswers() { return Object.fromEntries(v12.gateways.map((gateway) => [gateway.questionId, 'unknown'])); }

const assertions = [];
function check(name, fn) { fn(); assertions.push(name); }

check('frozen V1.1 graph is byte-identical', () => {
  const frozen = execFileSync('git', ['show', `${V11_SHA}:docs/adaptive-assessment/adaptive-graph-v1-draft.json`], { encoding: 'utf8' });
  assert.equal(readFileSync(v11Path, 'utf8'), frozen);
  assert.equal(v11.graphVersion, V11_GRAPH_VERSION);
  assert.equal(v11.graphFingerprint, V11_GRAPH_FINGERPRINT);
});

check('candidate is separate, draft-only and not customer active', () => {
  assert.equal(v12.graphVersion, V12_GRAPH_VERSION);
  assert.equal(v12.status, 'draft_candidate');
  assert.equal(v12.activationPolicy, 'owner_approval_required');
  assert.equal(v12.graphInvariants.customerRoutingEnabled, false);
  assert.equal(v12.graphInvariants.activeCustomerGraph, V11_GRAPH_VERSION);
  assert.deepEqual(v12Source, v12);
  const withoutFingerprint = { ...v12 }; delete withoutFingerprint.graphFingerprint;
  assert.equal(v12.graphFingerprint, sha(canonical(withoutFingerprint)));
});

check('revised shape uses original Q IDs and burden counts', () => {
  assert.deepEqual(v12.gateways.map((item) => item.questionId), Array.from({ length: 17 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`));
  assert.equal(v12.questions.length, 68);
  assert.equal(v12.oversightVariants.length, 8);
  assert.equal(new Set(v12.questions.map((item) => item.questionId)).size, 68);
  assert.ok(v12.questions.every((item) => /^D\d+-Q\d+$/.test(item.questionId)));
  assert.ok(v12.questions.every((item) => !/-C\d+$/.test(item.questionId)));
  assert.deepEqual([...new Set(v12.questions.filter((item) => item.origin === 'SPLIT').map((item) => item.questionId))].sort(), ['D1-Q07', 'D3-Q08', 'D4-Q08', 'D8-Q09', 'D8-Q10']);
  assert.deepEqual([...new Set(v12.questions.filter((item) => item.origin === 'NEW').map((item) => item.questionId))].sort(), ['D3-Q09', 'D3-Q10', 'D3-Q11']);
});

check('response scale, unknown and N/A semantics are exact', () => {
  assert.deepEqual(v12.responseScale.map((item) => item.label), ['Not in place', 'Informal / reactive', 'Partly designed', 'Implemented in key areas', 'Consistently operating', 'Embedded and improving']);
  assert.equal(v12.uncertaintyOption.label, "I don't know / cannot confirm");
  assert.equal(v12.uncertaintyOption.scoringStatus, 'unknown');
  assert.equal(v12.uncertaintyOption.excludedFromDenominatorRule, 'never');
  assert.equal(v12.notApplicablePolicy.availableOnlyFrom, 'deterministic_factual_gateway_absence');
  assert.equal(v12.notApplicablePolicy.neverAvailableFrom, 'maturity_judgement_or_unknown_response');
});

check('corrected gateways have precise customer copy and no internal vocabulary', () => {
  const forbidden = /\b(?:micro|small|medium|large|shared_service|owner_led|internal_department|internal routing)\b/i;
  const labelsAndPrompts = v12.gateways.flatMap((gateway) => [gateway.prompt, ...gateway.responseOptions.map((option) => option.label)]);
  assert.ok(labelsAndPrompts.every((value) => !forbidden.test(value)), 'internal or undefined customer vocabulary found');
  const g01 = v12.gateways.find((gateway) => gateway.questionId === 'G01');
  assert.deepEqual(g01.responseOptions.filter((option) => option.value !== 'unknown').map((option) => option.label), ['Professional services', 'Retail or consumer-facing', 'Construction or project delivery', 'Technology, digital or platform services', 'Manufacturing or production', 'Public, nonprofit or member-based', 'Other or mixed']);
  assert.deepEqual(v12.gateways.find((gateway) => gateway.questionId === 'G02').responseOptions.filter((option) => option.value !== 'unknown').map((option) => option.label), ['1–9 people', '10–49 people', '50–249 people', '250–999 people', '1,000 or more people']);
  const g04 = v12.gateways.find((gateway) => gateway.questionId === 'G04');
  assert.equal(g04.prompt, 'Who is primarily responsible for supplier onboarding and ongoing supplier management?');
  assert.deepEqual(g04.responseOptions.map((option) => option.label), ['Our organisation', 'A group or shared-service function', 'An external service provider', 'A shared or hybrid model', "I don't know / cannot confirm"]);
  assert.deepEqual(g04.conditionalWhen, { questionId: 'G03', in: ['yes'] });
  const g05 = v12.gateways.find((gateway) => gateway.questionId === 'G05');
  assert.equal(g05.prompt, 'Who is primarily responsible for procurement and sourcing?');
  assert.deepEqual(g05.responseOptions.map((option) => option.label), ['Dedicated internal procurement or sourcing function', 'Business owners or managers', 'A group or shared-service function', 'External service provider', 'Shared or hybrid model', 'No defined procurement or sourcing process', "I don't know / cannot confirm"]);
  const g06 = v12.gateways.find((gateway) => gateway.questionId === 'G06');
  assert.equal(g06.prompt, 'Does the organisation handle physical cash as part of normal operations?');
  assert.deepEqual(g06.responseOptions.map((option) => option.label), ['Yes', 'No', "I don't know / cannot confirm"]);
  assert.equal(v12.gateways.find((gateway) => gateway.questionId === 'G10').prompt, 'Does the organisation accept customer or user payments through card, online, app, portal or other digital channels?');
  assert.equal(v12.gateways.find((gateway) => gateway.questionId === 'G16').construct, 'approval arrangement for higher-risk payments or significant spending');
});

check('every item has one response dimension and professional wording', () => {
  assert.ok(v12.gateways.every((item) => item.questionType === 'single_select' && item.responseDimension === item.construct && item.constructCount === 1));
  assert.ok(v12.questions.every((item) => item.questionType === 'maturity_scale' && item.responseDimension === 'single_capability_maturity' && item.constructCount === 1));
  assert.ok(v12.oversightVariants.every((item) => item.questionType === 'maturity_scale' && item.responseDimension === 'single_capability_maturity' && item.constructCount === 1));
  const prompts = [...v12.questions, ...v12.oversightVariants].map((item) => item.prompt);
  assert.ok(prompts.every((prompt) => !/and\/or/i.test(prompt)));
  assert.ok(prompts.every((prompt) => !/believe|people think|employee belief/i.test(prompt)));
  assert.equal(v12.questions.find((item) => item.questionId === 'D1-Q05').prompt, 'Written guidance sets out how fraud should be prevented and detected, and how suspected fraud should be reported and handled.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D1-Q07').prompt, 'Fraud risk and key controls receive independent review appropriate to the organisation’s size and operating model.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D5-Q03').prompt, 'Roles and decision rights are defined for fraud triage, investigation, escalation and case closure.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D5-Q04').prompt, 'Fraud investigations follow documented procedures that protect confidentiality and fair treatment and record key facts, decisions and actions.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D6-Q05').prompt, 'Relevant external stakeholders have an appropriate way to report suspected fraud or misconduct.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D6-Q05').applicabilityCondition, null);
  assert.equal(v12.questions.find((item) => item.questionId === 'D8-Q02').prompt, 'The organisation monitors suspicious access, account or transaction behaviour across its relevant systems and digital channels, including through provider reporting where a third party operates the channel.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D9-Q03').prompt, 'Leadership communicates clear expectations on ethical conduct, conflicts of interest, fraud prevention and the consequences of misconduct.');
  assert.equal(v12.questions.find((item) => item.questionId === 'D9-Q05').prompt, 'Fraud awareness uses practical examples or scenarios.');
});

check('routing conditions reference known options and never use headcount for applicability', () => {
  const gateways = new Map(v12.gateways.map((gateway) => [gateway.questionId, gateway]));
  const validate = (condition, path) => {
    for (const gatewayId of conditionIds(condition)) {
      assert.ok(gateways.has(gatewayId), `${path} references unknown ${gatewayId}`);
      const allowed = new Set(gateways.get(gatewayId).responseOptions.map((option) => option.value));
      for (const value of conditionValues(condition).get(gatewayId) ?? []) assert.ok(allowed.has(value), `${path} references ${gatewayId}=${value}`);
    }
  };
  for (const item of v12.questions) {
    validate(item.applicabilityCondition, `${item.questionId}.applicability`);
    validate(item.redirectWhen?.condition, `${item.questionId}.redirect`);
    assert.ok(!conditionIds(item.applicabilityCondition).has('G02'), `${item.questionId} uses headcount to suppress applicability`);
  }
  for (const item of v12.oversightVariants) validate(item.applicabilityCondition, `${item.questionId}.applicability`);
  assert.ok(v12.questions.every((item) => !conditionIds(item.applicabilityCondition).has('G16')));
});

check('conditional questions retain unknown and deterministic absence reasons', () => {
  for (const item of v12.questions.filter((question) => question.applicabilityCondition)) {
    assert.equal(item.applicabilityClass, 'FACTUALLY_CONDITIONAL');
    assert.ok(item.skipReasonCode && v12.skipReasonCodes[item.skipReasonCode]);
    assert.equal(item.unknownRetained, true);
    for (const gatewayId of conditionIds(item.applicabilityCondition)) assert.ok(conditionValues(item.applicabilityCondition).get(gatewayId)?.has('unknown'), `${item.questionId} does not retain unknown for ${gatewayId}`);
  }
});

check('retained IDs preserve weights; splits are explicit; NEW controls are bounded', () => {
  const oldById = new Map(v11.questions.map((question) => [question.questionId, question]));
  for (const old of v11.questions) {
    const targets = v12.questions.filter((item) => item.sourceCurrentIds.includes(old.questionId));
    if (RETIRED.has(old.questionId)) { assert.equal(targets.length, 0, `${old.questionId} should be retired`); continue; }
    if (MERGED.has(old.questionId)) { assert.equal(targets.length, 1, `${old.questionId} should map to one merged target`); assert.ok(targets[0].sourceCurrentIds.length > 1, `${old.questionId} merged target must retain source traceability`); continue; }
    assert.ok(targets.length > 0, `${old.questionId} has no target`);
    if (['D1-Q04', 'D3-Q04', 'D4-Q05', 'D8-Q04', 'D8-Q08'].includes(old.questionId)) assert.equal(Number(targets.reduce((sum, item) => sum + item.weight, 0).toFixed(6)), old.weight, `${old.questionId} split weight changed`);
    else assert.equal(targets.find((item) => item.questionId === old.questionId)?.weight, old.weight, `${old.questionId} retained weight changed`);
  }
  for (const item of v12.questions) {
    assert.ok(Number.isFinite(item.weight) && item.weight > 0);
    assert.ok(Number(item.weight.toFixed(2)) === item.weight, `${item.questionId} uses normalisation-like precision`);
    if (item.origin !== 'RETAINED') { assert.equal(item.isCritical, false); assert.equal(item.isHardGate, false); assert.ok(item.weightBasis.includes('owner-review')); }
  }
  assert.deepEqual([...new Set(v12.questions.filter((item) => item.isCritical).map((item) => item.questionId))].sort(), [...new Set(v11.questions.filter((item) => item.isCritical).map((item) => item.questionId))].sort());
  assert.deepEqual([...new Set(v12.questions.filter((item) => item.isHardGate).map((item) => item.questionId))].sort(), [...new Set(v11.questions.filter((item) => item.isHardGate).map((item) => item.questionId))].sort());
  assert.ok(!JSON.stringify(v12).match(/0\.886364|1\.545455|1\.772727/));
  for (const domain of v12.domains) assert.equal(domain.weightPct, v11.domains.find((item) => item.domainCode === domain.domainCode).weightPct);
  assert.equal(oldById.size, 68);
});

check('oversight variants are traceable and provider-only paths do not drop accountability', () => {
  const controls = new Map(v12.questions.map((item) => [item.questionId, item]));
  for (const variant of v12.oversightVariants) {
    const base = controls.get(variant.baseControlId);
    assert.ok(base, `${variant.questionId} has no base`);
    assert.ok(base.oversightVariantIds.includes(variant.questionId), `${variant.questionId} is not linked by base`);
    assert.ok(conditionIds(variant.applicabilityCondition).has(variant.exposureGateway));
    assert.equal(variant.weightPolicy, 'inherits_base');
  }
  for (const variant of v12.oversightVariants.filter((item) => item.questionId !== 'OV-D8-Q02')) {
    assert.doesNotMatch(variant.prompt, /external provider|externally processed/i, `${variant.questionId} uses provider-only wording for group/shared-service routing`);
  }
  assert.match(v12.oversightVariants.find((item) => item.questionId === 'OV-D8-Q02').prompt, /third-party platform/i);
  const provider = { ...unknownAnswers(), G03: 'yes', G04: 'external_provider', G05: 'external_provider', G08: 'external_provider', G09: 'provider', G10: 'yes', G11: 'yes', G12: 'yes', G14: 'yes', G17: 'yes' };
  const path = resolvePath(provider);
  for (const [base, variant] of [['D3-Q03', 'OV-D3-Q03'], ['D7-Q01', 'OV-D7-Q01'], ['D7-Q02', 'OV-D7-Q02'], ['D7-Q04', 'OV-D7-Q04'], ['D7-Q05', 'OV-D7-Q05'], ['D7-Q06', 'OV-D7-Q06'], ['D3-Q09', 'OV-G07']]) { assert.equal(row(path, base).state, 'redirected', `${base} not redirected`); assert.equal(row(path, variant).state, 'active', `${variant} not active`); }
  assert.equal(row(path, 'D8-Q02').state, 'active', 'provider payment exposure must retain the coherent digital-monitoring control');
  assert.equal(row(path, 'OV-D8-Q02'), undefined, 'third-party variant must not replace relevant organisation/payment monitoring');
  const providerOnlyDigitalPath = resolvePath({ ...provider, G10: 'no', G15: 'no' });
  assert.equal(row(providerOnlyDigitalPath, 'D8-Q02').state, 'redirected', 'provider-only channel without own/remote/payment environment should use third-party oversight');
  assert.equal(row(providerOnlyDigitalPath, 'OV-D8-Q02').state, 'active', 'third-party digital oversight must remain assessed');
  const providerWithRemotePath = resolvePath({ ...provider, G10: 'no', G15: 'yes' });
  assert.equal(row(providerWithRemotePath, 'D8-Q02').state, 'active', 'remote-access environment must remain assessed alongside a third-party channel');
  assert.equal(row(providerWithRemotePath, 'OV-D8-Q02'), undefined, 'remote-access environment must not be replaced by third-party-only wording');
  const shared = { ...unknownAnswers(), G03: 'yes', G04: 'shared_hybrid', G05: 'shared_hybrid', G08: 'shared_hybrid', G09: 'both', G10: 'yes', G11: 'yes', G15: 'yes', G17: 'yes' };
  const sharedPath = resolvePath(shared);
  for (const [base, variant] of [['D3-Q03', 'OV-D3-Q03'], ['D7-Q01', 'OV-D7-Q01'], ['D7-Q02', 'OV-D7-Q02'], ['D7-Q04', 'OV-D7-Q04'], ['D7-Q05', 'OV-D7-Q05'], ['D7-Q06', 'OV-D7-Q06'], ['D3-Q09', 'OV-G07'], ['D8-Q02', 'OV-D8-Q02']]) { assert.equal(row(sharedPath, base)?.state, 'active', `${base} not retained for shared/hybrid`); assert.equal(row(sharedPath, variant), undefined, `${variant} double-counted shared/hybrid`); }
});

check('all gateway options are routeable and absence/unknown behave correctly', () => {
  const ids = new Set(v12.questions.map((item) => item.questionId));
  for (const gateway of v12.gateways) for (const option of gateway.responseOptions) { const answers = { ...unknownAnswers(), [gateway.questionId]: option.value }; if (gateway.questionId === 'G04') answers.G03 = 'yes'; const path = resolvePath(answers); assert.ok(path.every((item) => ids.has(item.id) || v12.oversightVariants.some((variant) => variant.questionId === item.id))); assert.ok(path.every((item) => ['active', 'excluded', 'redirected'].includes(item.state))); }
  const absent = resolvePath({ ...unknownAnswers(), G03: 'no', G05: 'no_procurement', G06: 'no', G07: 'no', G08: 'no_payroll', G09: 'none', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'no', G15: 'no', G17: 'no' });
  for (const id of ['D3-Q03', 'D3-Q05', 'D3-Q07', 'D3-Q09', 'D3-Q10', 'D3-Q11', 'D7-Q01', 'D7-Q04', 'D7-Q05', 'D8-Q01', 'D8-Q02', 'D8-Q06', 'D8-Q07', 'D8-Q08', 'D8-Q10']) assert.equal(row(absent, id)?.state, 'excluded', `${id} did not follow factual absence`);
  const unknown = resolvePath(unknownAnswers());
  for (const item of v12.questions.filter((question) => question.applicabilityCondition)) assert.equal(row(unknown, item.questionId)?.state, 'active', `${item.questionId} treated unknown as absence`);
  const g04Unknown = resolvePath({ ...unknownAnswers(), G03: 'unknown' });
  assert.equal(row(g04Unknown, 'D3-Q03')?.state, 'active');
  assert.equal(row(g04Unknown, 'D7-Q01')?.state, 'active');
});

check('headcount changes do not change the scored pathway', () => {
  const base = { ...unknownAnswers(), G03: 'no', G05: 'no_procurement', G06: 'no', G07: 'no', G08: 'no_payroll', G09: 'none', G10: 'no', G11: 'no', G12: 'no', G13: 'no', G14: 'no', G15: 'no', G17: 'no' };
  const sets = v12.gateways.find((gateway) => gateway.questionId === 'G02').responseOptions.map((option) => activeSet(resolvePath({ ...base, G02: option.value })));
  for (const set of sets.slice(1)) assert.deepEqual([...set].sort(), [...sets[0]].sort());
});

check('full 88-item crosswalk and all prior NEW-control decisions are present', () => {
  const sourceIds = new Set(v12.questions.flatMap((item) => item.sourceCurrentIds));
  assert.deepEqual([...v11.questions.map((item) => item.questionId).filter((id) => !sourceIds.has(id))].sort(), [...RETIRED].sort());
  for (const variant of v11.oversightVariants) assert.ok(v12.oversightVariants.some((item) => item.questionId === variant.questionId));
  const audit = readFileSync(resolve(root, 'docs/adaptive-assessment/v1-2-v1-1-audit.md'), 'utf8');
  const crosswalk = readFileSync(resolve(root, 'docs/adaptive-assessment/v1-2-crosswalk.md'), 'utf8');
  assert.match(audit, /\| 88 \|/); assert.match(crosswalk, /\| 88 \|/);
  assert.match(audit, /G04: only when G03 = Yes/);
  assert.match(crosswalk, /G04: only when G03 = Yes/);
  assert.doesNotMatch(audit, /G04: always applicable/);
  assert.doesNotMatch(crosswalk, /G04: always applicable/);
  const newReview = readFileSync(resolve(root, 'docs/adaptive-assessment/v1-2-new-controls.md'), 'utf8');
  for (const id of ['D1-C08', 'D3-C10', 'D3-C11', 'D3-C12', 'D3-C13', 'D7-C08', 'D7-C09', 'D10-C04']) assert.match(newReview, new RegExp(id));
});

check('active V1.2 customer loader is separate from the candidate review surface', () => {
  const server = readFileSync(resolve(root, 'src/lib/adaptive/server.ts'), 'utf8');
  const engine = readFileSync(resolve(root, 'src/lib/adaptive/engine.ts'), 'utf8');
  const start = readFileSync(resolve(root, 'src/components/adaptive/AdaptiveStartForm.tsx'), 'utf8');
  assert.match(engine, /MFRS-V1\.2-ADAPTIVE-CANDIDATE-20260821/);
  assert.match(server, /isSupportedAdaptiveGraph/);
  assert.match(engine, /MFRS-V1\.1-ADAPTIVE-DRAFT-20260804/);
  assert.doesNotMatch(start, /MFRS-V1\.2|adaptive-graph-v1-2-candidate/);
});

check('owner review surface is read-only and candidate-only', () => {
  const page = readFileSync(resolve(root, 'src/app/score/admin/methodology/v1-2/page.tsx'), 'utf8');
  assert.match(page, /requireAdmin/); assert.match(page, /draft_candidate/); assert.match(page, /adaptive-graph-v1-2-candidate/);
  assert.doesNotMatch(page, /startAdaptiveAssessment|publish_adaptive_graph_version/);
});

console.log(JSON.stringify({ ok: true, assertions: assertions.length, graphVersion: v12.graphVersion, graphFingerprint: v12.graphFingerprint, v11: { graphVersion: v11.graphVersion, graphFingerprint: v11.graphFingerprint, gateways: v11.gateways.length, questions: v11.questions.length, oversightVariants: v11.oversightVariants.length }, v12: { gateways: v12.gateways.length, questions: v12.questions.length, oversightVariants: v12.oversightVariants.length, critical: v12.questions.filter((question) => question.isCritical).length, hardGates: v12.questions.filter((question) => question.isHardGate).length } }));
