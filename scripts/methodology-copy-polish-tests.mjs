import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = 'supabase/migrations/0009_methodology_copy_polish.sql';
const source = fs.readFileSync(path.join(root, migrationPath), 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function sectionBetween(startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `Missing section start: ${label}`);
  const end = source.indexOf(endNeedle, start);
  assert(end > start, `Missing section end: ${label}`);
  return source.slice(start, end);
}

function unique(values) {
  return [...new Set(values)];
}

const expectedQuestionCodes = [
  'D1-Q01','D1-Q02','D1-Q03','D1-Q04','D1-Q05','D1-Q06',
  'D2-Q01','D2-Q02','D2-Q03','D2-Q04','D2-Q05','D2-Q06','D2-Q07','D2-Q08',
  'D3-Q01','D3-Q02','D3-Q03','D3-Q04','D3-Q05','D3-Q06','D3-Q07',
  'D4-Q01','D4-Q02','D4-Q03','D4-Q04','D4-Q05','D4-Q06','D4-Q07',
  'D5-Q01','D5-Q02','D5-Q03','D5-Q04','D5-Q05','D5-Q06','D5-Q07',
  'D6-Q01','D6-Q02','D6-Q03','D6-Q04','D6-Q05','D6-Q06',
  'D7-Q01','D7-Q02','D7-Q03','D7-Q04','D7-Q05','D7-Q06','D7-Q07',
  'D8-Q01','D8-Q02','D8-Q03','D8-Q04','D8-Q05','D8-Q06','D8-Q07','D8-Q08',
  'D9-Q01','D9-Q02','D9-Q03','D9-Q04','D9-Q05','D9-Q06',
  'D10-Q01','D10-Q02','D10-Q03','D10-Q04','D10-Q05','D10-Q06'
];

const expectedExposureCodes = ['EXP-01','EXP-02','EXP-03','EXP-04','EXP-05','EXP-06','EXP-07','EXP-08'];

const questionCteSection = sectionBetween(
  '-- 002 apply copy polish to V1.1 only.',
  'update public.questions q',
  'question V1.1 CTE and copy updates'
);

const questionCopySection = sectionBetween(
  'copy_updates(question_code, prompt, help_text) as',
  'update public.questions q',
  'question copy updates'
);

const questionUpdateSection = sectionBetween(
  'update public.questions q',
  'with mv as (\n  select id from public.methodology_versions where version_code = \'MFRS-V1.1\'\n), exposure_updates',
  'question update statement'
);

const exposureCteSection = sectionBetween(
  'with mv as (\n  select id from public.methodology_versions where version_code = \'MFRS-V1.1\'\n), exposure_updates',
  'update public.exposure_factors ef',
  'exposure V1.1 CTE and copy updates'
);

const exposureCopySection = sectionBetween(
  'exposure_updates(factor_code, name, options_json) as',
  'update public.exposure_factors ef',
  'exposure copy updates'
);

const exposureUpdateSection = sectionBetween(
  'update public.exposure_factors ef',
  '-- 003 activate V1.1',
  'exposure update statement'
);

const questionCodes = unique([...questionCopySection.matchAll(/\('((?:D\d+)-Q\d{2})',\s*\$copy\$/g)].map((match) => match[1]));
const exposureCodes = unique([...exposureCopySection.matchAll(/\('((?:EXP)-\d{2})',\s*'/g)].map((match) => match[1]));

assert(source.includes("insert into public.methodology_versions"), 'Migration must create a methodology version when V1.1 does not already exist.');
assert(source.includes("'MFRS-V1.1'"), 'Migration must create and target MFRS-V1.1.');
assert(source.includes("version_code = 'MFRS-V1.0'"), 'Migration must preserve and retire MFRS-V1.0 explicitly.');
assert(source.includes('insert into public.response_scale'), 'Migration must clone response scale.');
assert(source.includes('insert into public.domains'), 'Migration must clone domains.');
assert(source.includes('insert into public.questions'), 'Migration must clone questions.');
assert(source.includes('insert into public.question_applicability_rules'), 'Migration must clone applicability rules.');
assert(source.includes('insert into public.exposure_factors'), 'Migration must clone exposure factors.');
assert(source.includes('insert into public.recommendation_rules'), 'Migration must clone recommendation rules.');
assert(source.includes('insert into public.report_content_blocks'), 'Migration must clone report content blocks.');

assert(questionCteSection.includes("where version_code = 'MFRS-V1.1'"), 'Question copy CTE must target MFRS-V1.1.');
assert(exposureCteSection.includes("where version_code = 'MFRS-V1.1'"), 'Exposure copy CTE must target MFRS-V1.1.');
assert(!questionCteSection.includes("where version_code = 'MFRS-V1.0'"), 'Question copy updates must not target MFRS-V1.0.');
assert(!exposureCteSection.includes("where version_code = 'MFRS-V1.0'"), 'Exposure copy updates must not target MFRS-V1.0.');

assert(questionCodes.length === 68, `Expected 68 unique question copy updates, found ${questionCodes.length}.`);
for (const code of expectedQuestionCodes) {
  assert(questionCodes.includes(code), `Missing question copy update for ${code}.`);
}

assert(exposureCodes.length === 8, `Expected 8 unique exposure factor copy updates, found ${exposureCodes.length}.`);
for (const code of expectedExposureCodes) {
  assert(exposureCodes.includes(code), `Missing exposure factor copy update for ${code}.`);
}

assert(questionUpdateSection.includes('set prompt = copy_updates.prompt'), 'Question update must update prompts.');
assert(questionUpdateSection.includes('help_text = copy_updates.help_text'), 'Question update must update help text.');
assert(exposureUpdateSection.includes('set name = exposure_updates.name'), 'Exposure update must update exposure names.');
assert(exposureUpdateSection.includes('options_json = exposure_updates.options_json'), 'Exposure update must update exposure option labels.');

const copyUpdateStatements = `${questionUpdateSection}\n${exposureUpdateSection}`;
const forbiddenStructuralUpdates = /(weight\s*=|weight_pct\s*=|is_critical\s*=|is_hard_gate\s*=|n_a_allowed\s*=|n_a_rule_key\s*=|trigger_key\s*=|normalised_score\s*=|max_points\s*=|rule_key\s*=|expression_json\s*=)/i;
assert(!forbiddenStructuralUpdates.test(copyUpdateStatements), 'Copy polish must not update weights, flags, N/A rules, scale scores, exposure max points or applicability rules.');

const forbiddenContentTableUpdates = [
  'update public.domains',
  'update public.response_scale',
  'update public.question_applicability_rules',
  'update public.recommendation_rules',
  'update public.report_content_blocks'
];
for (const forbidden of forbiddenContentTableUpdates) {
  assert(!source.toLowerCase().includes(forbidden), `Migration must not mutate ${forbidden.replace('update ', '')} content in place.`);
}

assert(source.includes("status = 'retired'::public.methodology_status"), 'Migration must retire MFRS-V1.0 after V1.1 is ready.');
assert(source.includes("status = 'active'::public.methodology_status"), 'Migration must activate MFRS-V1.1.');
assert(source.includes('active_methodology_copy_polish_v1_1'), 'Migration must record the active V1.1 copy-polish app setting.');
assert(source.includes('"scope":"versioned_copy_only"'), 'Migration must mark scope as versioned copy-only.');
assert(source.includes('"scoring_structure_changed":false'), 'Migration must confirm scoring structure is unchanged.');

assert(source.includes('named senior owner'), 'D1 wording should be respondent-friendly and ownership-led.');
assert(source.includes('WhatsApp journeys'), 'Digital wording should include practical non-bank digital examples.');
assert(source.includes('manual journals or overrides'), 'D3 wording should include sensitive manual activity examples.');
assert(source.includes('bank-detail changes'), 'D7 wording should include supplier-payment fraud examples.');
assert(source.includes('not a financial institution'), 'D8 identity wording should work outside financial services.');
assert(source.includes('safe ways to raise concerns'), 'D9 wording should avoid overclaiming how all employees feel.');

console.log('Versioned methodology copy polish tests passed. MFRS-V1.1 is created, all 68 questions and 8 exposure factors are covered, copy updates target V1.1 only, and scoring structure remains unchanged.');
