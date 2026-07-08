import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationPath = 'supabase/migrations/0009_methodology_copy_polish.sql';
const source = fs.readFileSync(path.join(root, migrationPath), 'utf8');

function assert(condition, label) {
  if (!condition) throw new Error(label);
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

const questionCodes = [...source.matchAll(/\('((?:D\d+)-Q\d{2})',\s*\$copy\$/g)].map((match) => match[1]);
const exposureCodes = [...source.matchAll(/\('((?:EXP)-\d{2})',\s*'/g)].map((match) => match[1]);

assert(source.includes("'MFRS-V1.1'"), 'Migration must create and target MFRS-V1.1.');
assert(source.includes("where version_code = 'MFRS-V1.1'"), 'Copy updates must target MFRS-V1.1.');
assert(source.includes("version_code = 'MFRS-V1.0'"), 'Migration must preserve and retire MFRS-V1.0 explicitly.');
assert(source.includes('insert into public.methodology_versions'), 'Migration must create a new methodology version.');
assert(source.includes('insert into public.response_scale'), 'Migration must clone response scale.');
assert(source.includes('insert into public.domains'), 'Migration must clone domains.');
assert(source.includes('insert into public.questions'), 'Migration must clone questions before copy polish.');
assert(source.includes('insert into public.question_applicability_rules'), 'Migration must clone applicability rules.');
assert(source.includes('insert into public.exposure_factors'), 'Migration must clone exposure factors.');
assert(source.includes('insert into public.recommendation_rules'), 'Migration must clone recommendation rules.');
assert(source.includes('insert into public.report_content_blocks'), 'Migration must clone report content blocks.');

assert(questionCodes.length === 68, `Expected 68 question copy updates, found ${questionCodes.length}`);
assert(new Set(questionCodes).size === 68, 'Question copy updates must be unique.');
for (const code of expectedQuestionCodes) {
  assert(questionCodes.includes(code), `Missing question copy update for ${code}`);
}

assert(exposureCodes.length === 8, `Expected 8 exposure factor copy updates, found ${exposureCodes.length}`);
assert(new Set(exposureCodes).size === 8, 'Exposure factor copy updates must be unique.');
for (const code of expectedExposureCodes) {
  assert(exposureCodes.includes(code), `Missing exposure factor copy update for ${code}`);
}

assert(source.includes('update public.questions q'), 'Migration must update public.questions for V1.1 copy polish.');
assert(source.includes('set prompt = copy_updates.prompt'), 'Migration must update question prompts.');
assert(source.includes('help_text = copy_updates.help_text'), 'Migration must update question help text.');
assert(source.includes('update public.exposure_factors ef'), 'Migration must update exposure factor wording.');
assert(source.includes('active_methodology_copy_polish_v1_1'), 'Migration must record the active V1.1 copy-polish app setting.');
assert(source.includes('"questions":68'), 'Migration must record 68 question updates.');
assert(source.includes('"exposure_factors":8'), 'Migration must record 8 exposure updates.');
assert(source.includes('"scope":"versioned_copy_only"'), 'Migration must mark scope as versioned copy-only.');
assert(source.includes('"scoring_structure_changed":false'), 'Migration must confirm scoring structure is unchanged.');
assert(source.includes("status = 'retired'::public.methodology_status"), 'Migration must retire MFRS-V1.0 after V1.1 is ready.');
assert(source.includes("status = 'active'::public.methodology_status"), 'Migration must activate MFRS-V1.1.');

const forbiddenStructuralUpdates = /(weight\s*=|weight_pct\s*=|is_critical\s*=|is_hard_gate\s*=|n_a_allowed\s*=|n_a_rule_key\s*=|trigger_key\s*=|normalised_score\s*=|max_points\s*=|rule_key\s*=|expression_json\s*=)/i;
assert(!forbiddenStructuralUpdates.test(source), 'Methodology copy polish must not update weights, flags, N/A rules, scale scores or exposure max points.');

const v10ContentMutation = /update\s+public\.(questions|domains|response_scale|exposure_factors|question_applicability_rules|recommendation_rules|report_content_blocks)[\s\S]*MFRS-V1\.0/i;
assert(!v10ContentMutation.test(source), 'Migration must not mutate MFRS-V1.0 methodology content in place.');

assert(source.includes('named senior owner'), 'D1 wording should be respondent-friendly and ownership-led.');
assert(source.includes('WhatsApp journeys'), 'D2/Digital wording should include practical non-bank digital examples.');
assert(source.includes('manual journals or overrides'), 'D3 wording should include sensitive manual activity examples.');
assert(source.includes('bank-detail changes'), 'D7 wording should include supplier-payment fraud examples.');
assert(source.includes('not a financial institution'), 'D8 identity wording should work outside financial services.');
assert(source.includes('safe ways to raise concerns'), 'D9 wording should avoid overclaiming how all employees feel.');

console.log('Versioned methodology copy polish tests passed. MFRS-V1.1 is created, all 68 questions and 8 exposure factors are covered, and MFRS-V1.0 content remains preserved.');
