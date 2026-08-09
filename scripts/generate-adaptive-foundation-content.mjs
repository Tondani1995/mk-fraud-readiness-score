import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AUTHORITATIVE_QUESTION_MAPPINGS, listQuestionPlaybooks } from '../src/lib/reports/evidence-model/question-playbooks.ts';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const GRAPH_VERSION = 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804';
const GUIDANCE_VERSION = 'MFRS-V1.1-G28-20260804';
const MIGRATION_VERSION = '20260804170000_g24_adaptive_foundation_g28_evidence_guidance';

const weights = {
  'D1-Q01': 1.5, 'D1-Q02': 1.25, 'D1-Q03': 1.25, 'D1-Q04': 1.5, 'D1-Q05': 1, 'D1-Q06': 1,
  'D2-Q01': 1.5, 'D2-Q02': 1.5, 'D2-Q03': 1.25, 'D2-Q04': 1, 'D2-Q05': 1.25, 'D2-Q06': 1, 'D2-Q07': 1.25, 'D2-Q08': 1,
  'D3-Q01': 1.5, 'D3-Q02': 1.25, 'D3-Q03': 1.5, 'D3-Q04': 1.5, 'D3-Q05': 1.25, 'D3-Q06': 1, 'D3-Q07': 1,
  'D4-Q01': 1.5, 'D4-Q02': 1.25, 'D4-Q03': 1.5, 'D4-Q04': 1, 'D4-Q05': 1, 'D4-Q06': 1.25, 'D4-Q07': 1,
  'D5-Q01': 1.5, 'D5-Q02': 1, 'D5-Q03': 1.25, 'D5-Q04': 1.25, 'D5-Q05': 1.5, 'D5-Q06': 1, 'D5-Q07': 1.25,
  'D6-Q01': 1.5, 'D6-Q02': 1.25, 'D6-Q03': 1.25, 'D6-Q04': 1, 'D6-Q05': 1, 'D6-Q06': 1,
  'D7-Q01': 1.5, 'D7-Q02': 1.25, 'D7-Q03': 1.25, 'D7-Q04': 1.5, 'D7-Q05': 1, 'D7-Q06': 1, 'D7-Q07': 1,
  'D8-Q01': 1.5, 'D8-Q02': 1.5, 'D8-Q03': 1.25, 'D8-Q04': 1.5, 'D8-Q05': 1.25, 'D8-Q06': 1, 'D8-Q07': 1, 'D8-Q08': 1.5,
  'D9-Q01': 1.25, 'D9-Q02': 1, 'D9-Q03': 1.25, 'D9-Q04': 1, 'D9-Q05': 1, 'D9-Q06': 1.25,
  'D10-Q01': 1.5, 'D10-Q02': 1.25, 'D10-Q03': 1.25, 'D10-Q04': 1, 'D10-Q05': 1.25, 'D10-Q06': 1.25,
};

const domains = [
  ['D1', 'Fraud Leadership and Governance', 12, 'core'],
  ['D2', 'Fraud Risk Identification', 12, 'core'],
  ['D3', 'Operational Fraud Controls', 14, 'core'],
  ['D4', 'Fraud Detection Capability', 14, 'core'],
  ['D5', 'Fraud Incident Response', 10, 'core'],
  ['D6', 'Whistleblowing and Reporting Culture', 6, 'support'],
  ['D7', 'Third-Party and Supply Chain Fraud Risk', 10, 'core'],
  ['D8', 'Digital and Identity Fraud Risk', 12, 'core'],
  ['D9', 'Fraud Culture and Awareness', 5, 'support'],
  ['D10', 'Continuous Improvement and Fraud Risk Monitoring', 5, 'support'],
].map(([domainCode, name, weightPct, domainType], index) => ({
  domainCode, name, weightPct, domainType, isCore: domainType === 'core', sortOrder: index + 1,
}));

const responseScale = [
  [0, 'Not in place', 'The control, process or capability does not exist or is not recognised as required.'],
  [1, 'Initial / ad hoc', 'Some activity may occur informally or reactively, but it is not defined, owned or reliable.'],
  [2, 'Partially designed', 'Some elements exist, but implementation is incomplete, inconsistent or not evidenced.'],
  [3, 'Implemented', 'The capability is established in important areas, but may not operate consistently across the organisation.'],
  [4, 'Consistently operating', 'The capability is formally implemented, evidenced and regularly operating.'],
  [5, 'Embedded and improved', 'The capability is monitored, measured, governed and continuously improved.'],
].map(([responseValue, label, operationalMeaning]) => ({
  responseValue, label, operationalMeaning, normalisedScore: responseValue * 20,
}));

const gateways = [
  ['G01', 'Organisation profile', 'What best describes your organisation’s primary operating model?', ['professional_services', 'retail', 'construction', 'online', 'manufacturing', 'other']],
  ['G02', 'Organisation profile', 'Approximately how many people work in the organisation?', ['micro', 'small', 'medium', 'large', 'unknown']],
  ['G03', 'Suppliers and third parties', 'Does your organisation use external suppliers or contractors?', ['internal', 'outsourced', 'shared_service', 'none', 'unknown']],
  ['G04', 'Suppliers and third parties', 'How is procurement or buying handled?', ['internal_department', 'owner_led', 'outsourced', 'shared_service', 'unknown']],
  ['G05', 'Money, stock and assets', 'Does your organisation handle physical cash?', ['significant', 'minor', 'none', 'unknown']],
  ['G06', 'Money, stock and assets', 'Does your organisation hold physical stock, inventory or valuable equipment?', ['yes', 'no', 'unknown']],
  ['G07', 'People and payroll', 'How is payroll handled?', ['internal', 'outsourced', 'shared_service', 'none', 'unknown']],
  ['G08', 'Digital and customers', 'Does your organisation sell online or accept digital or card payments?', ['yes', 'platform', 'no', 'unknown']],
  ['G09', 'Digital and customers', 'Does your organisation hold personal information about customers, clients or employees?', ['yes', 'no', 'unknown']],
  ['G10', 'Operations', 'Does your organisation process refunds, credit notes or manual adjustments?', ['yes', 'no', 'unknown']],
  ['G11', 'Operations', 'Does the organisation operate from more than one site, store or project location?', ['yes', 'no', 'unknown']],
  ['G12', 'People and payroll', 'Does your organisation use temporary, seasonal or subcontracted workers?', ['yes', 'no', 'unknown']],
  ['G13', 'Digital and customers', 'Do employees work remotely or do you depend on third-party digital platforms?', ['yes', 'no', 'unknown']],
  ['G14', 'Governance', 'Who approves payments and significant spending?', ['formal_delegation', 'owner_led', 'shared_service', 'unknown']],
].map(([questionId, section, prompt, values], sortOrder) => ({
  questionId, section, prompt, questionType: 'single_select', gatewayStatus: 'gateway', sortOrder,
  responseOptions: values.map((value) => ({ value, label: value.replaceAll('_', ' ') })),
  scoringStatus: 'profile_only',
}));

const oversightVariants = [
  ['OV-D3-Q03', 'D3-Q03', 'D3', 'Supplier management is outsourced; the organisation retains assurance over provider vetting and due diligence.', 'scored_as_third_party_governance'],
  ['OV-D7-Q01', 'D7-Q01', 'D7', 'The organisation defines and monitors the third-party vetting standard applied on its behalf.', 'scored_as_third_party_governance'],
  ['OV-D7-Q02', 'D7-Q02', 'D7', 'The organisation retains controls over supplier selection, price integrity and conflict disclosure where procurement is outsourced.', 'scored_as_third_party_governance'],
  ['OV-D7-Q04', 'D7-Q04', 'D7', 'The organisation independently verifies supplier banking changes before provider-executed payments are released.', 'scored_as_third_party_governance'],
  ['OV-D8-Q02', 'D8-Q02', 'D8', 'The organisation reviews fraud, dispute and account-security reporting from the third-party platform it uses.', 'scored_as_third_party_governance'],
  ['OV-G07', null, 'D7', 'The organisation independently reviews an externally processed payroll register for unknown, duplicate or altered records.', 'scored_as_third_party_governance'],
].map(([questionId, replaces, domainCode, prompt, scoringStatus]) => ({
  questionId, replaces, domainCode, questionType: 'maturity_scale', gatewayStatus: 'oversight_variant', prompt,
  scoringStatus, displayGuidance: 'Outsourcing moves the activity, not the accountability; assess the retained governance control.',
}));

const rules = {
  'D2-Q05': { any: [{ questionId: 'G03', in: ['internal', 'outsourced', 'shared_service', 'unknown'] }], skipReasonCode: 'gateway_no_third_parties' },
  'D2-Q08': { any: [{ questionId: 'G08', in: ['yes', 'platform', 'unknown'] }, { questionId: 'G09', in: ['yes', 'unknown'] }, { questionId: 'G13', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_digital_footprint' },
  'D3-Q03': { any: [{ questionId: 'G03', in: ['internal', 'shared_service', 'unknown'] }], redirectWhen: { condition: { questionId: 'G03', in: ['outsourced'] }, redirectTo: 'OV-D3-Q03' }, skipReasonCode: 'gateway_no_third_parties' },
  'D3-Q05': { any: [{ questionId: 'G10', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_refunds_or_adjustments' },
  'D3-Q07': { any: [{ questionId: 'G05', in: ['significant', 'minor', 'unknown'] }, { questionId: 'G06', in: ['yes', 'unknown'] }, { questionId: 'G10', in: ['yes', 'unknown'] }, { questionId: 'G12', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_high_risk_handling' },
  'D6-Q02': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D6-Q05': { any: [{ questionId: 'G03', in: ['internal', 'outsourced', 'shared_service', 'unknown'] }], skipReasonCode: 'gateway_no_third_parties' },
  'D6-Q06': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D7-Q01': { any: [{ questionId: 'G03', in: ['internal', 'shared_service', 'unknown'] }], redirectWhen: { condition: { questionId: 'G03', in: ['outsourced'] }, redirectTo: 'OV-D7-Q01' }, skipReasonCode: 'gateway_no_third_parties' },
  'D7-Q02': { any: [{ questionId: 'G04', in: ['internal_department', 'owner_led', 'shared_service', 'unknown'] }], redirectWhen: { condition: { questionId: 'G04', in: ['outsourced'] }, redirectTo: 'OV-D7-Q02' }, skipReasonCode: 'gateway_no_procurement' },
  'D7-Q03': { any: [{ questionId: 'G03', in: ['internal', 'outsourced', 'shared_service', 'unknown'] }], skipReasonCode: 'gateway_no_third_parties' },
  'D7-Q04': { any: [{ questionId: 'G03', in: ['internal', 'shared_service', 'unknown'] }], redirectWhen: { condition: { questionId: 'G03', in: ['outsourced'] }, redirectTo: 'OV-D7-Q04' }, skipReasonCode: 'gateway_no_third_parties' },
  'D7-Q05': { any: [{ questionId: 'G03', in: ['internal', 'outsourced', 'shared_service', 'unknown'] }], skipReasonCode: 'gateway_no_third_parties' },
  'D7-Q06': { any: [{ questionId: 'G04', in: ['internal_department', 'owner_led', 'outsourced', 'shared_service', 'unknown'] }], skipReasonCode: 'gateway_no_procurement' },
  'D7-Q07': { any: [{ questionId: 'G03', in: ['internal', 'outsourced', 'shared_service', 'unknown'] }], skipReasonCode: 'gateway_no_third_parties' },
  'D8-Q01': { any: [{ questionId: 'G08', in: ['yes', 'platform', 'unknown'] }, { questionId: 'G09', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_digital_or_identity_footprint' },
  'D8-Q02': { any: [{ questionId: 'G08', in: ['yes', 'platform', 'unknown'] }, { questionId: 'G13', in: ['yes', 'unknown'] }], redirectWhen: { condition: { all: [{ questionId: 'G08', in: ['platform'] }, { questionId: 'G13', in: ['no'] }] }, redirectTo: 'OV-D8-Q02' }, skipReasonCode: 'gateway_no_digital_footprint' },
  'D8-Q03': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D8-Q05': { any: [{ questionId: 'G08', in: ['yes', 'platform', 'unknown'] }, { questionId: 'G13', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_digital_footprint' },
  'D8-Q07': { any: [{ questionId: 'G08', in: ['yes', 'platform', 'unknown'] }, { questionId: 'G09', in: ['yes', 'unknown'] }, { questionId: 'G13', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_digital_footprint' },
  'D8-Q08': { any: [{ questionId: 'G08', in: ['yes', 'platform', 'unknown'] }, { questionId: 'G09', in: ['yes', 'unknown'] }], skipReasonCode: 'gateway_no_digital_or_identity_footprint' },
  'D9-Q01': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D9-Q02': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D9-Q04': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D9-Q05': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
  'D9-Q06': { any: [{ questionId: 'G02', in: ['small', 'medium', 'large', 'unknown'] }], skipReasonCode: 'gateway_no_employee_base' },
};

const skipReasonCodes = {
  gateway_no_third_parties: 'No external suppliers or contractors were confirmed.',
  gateway_no_procurement: 'No procurement or buying activity was confirmed.',
  gateway_no_refunds_or_adjustments: 'No refunds, credits, write-offs or manual adjustments were confirmed.',
  gateway_no_high_risk_handling: 'No relevant cash, stock, refund, adjustment or temporary-worker exposure was confirmed.',
  gateway_no_digital_footprint: 'No relevant online, digital-payment or platform dependency was confirmed.',
  gateway_no_digital_or_identity_footprint: 'No relevant digital channel or personal-information exposure was confirmed.',
  gateway_no_employee_base: 'No employee base beyond the owner was confirmed.',
  upstream_answer_changed: 'An upstream gateway answer changed the active pathway.',
  redirected_to_oversight_variant: 'The activity is outsourced, so the retained-governance equivalent was used.',
};

const gatewayBlocks = [
  ['profile', 'About your organisation', 'Short operating-model questions establish applicability before the scored domains.'],
  ['domain:D2', 'Before fraud-risk identification', 'Operating-model context determines which risk-identification pathways apply.'],
  ['domain:D3', 'Before operational controls', 'Money, stock, people and manual-activity context determines operational applicability.'],
  ['domain:D7', 'Before supplier and procurement controls', 'Supplier, procurement and payroll context determines direct versus retained-governance questions.'],
].map(([phase, title, intro]) => ({ phase, title, intro }));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

const playbooks = listQuestionPlaybooks();
if (playbooks.length !== 68) throw new Error(`Expected 68 playbooks, got ${playbooks.length}`);
const sorted = [...playbooks].sort((a, b) => a.questionCode.localeCompare(b.questionCode, undefined, { numeric: true }));
const questions = sorted.map((playbook, index) => {
  const rule = rules[playbook.questionCode] ?? {};
  const mapping = AUTHORITATIVE_QUESTION_MAPPINGS[playbook.questionCode];
  if (!mapping) throw new Error(`Missing authoritative mapping for ${playbook.questionCode}`);
  return {
    questionId: playbook.questionCode,
    questionCode: playbook.questionCode,
    domainCode: playbook.domainCode,
    prompt: mapping.prompt,
    controlObjective: playbook.controlObjective,
    weight: weights[playbook.questionCode],
    isCritical: mapping.isCritical,
    isHardGate: mapping.isHardGate,
    sortOrder: index + 1,
    applicabilityCondition: rule.any ? { any: rule.any } : null,
    redirectWhen: rule.redirectWhen ?? null,
    skipReasonCode: rule.skipReasonCode ?? null,
    evidenceReference: `G28-${playbook.questionCode}`,
  };
});

const graphWithoutFingerprint = {
  graphVersion: GRAPH_VERSION,
  methodologyVersion: 'MFRS-V1.1',
  status: 'draft',
  activationPolicy: 'not_customer_active',
  provenance: 'G24 approved adaptive foundation; current MFRS-V1.1 question bank plus approved pathway structure.',
  responseScale,
  uncertaintyOption: { value: 'unknown', label: 'I do not know', scoringStatus: 'unknown', uncertaintyTreatment: 'retained_in_denominator_zero_credit_flagged', excludedFromDenominatorRule: 'never' },
  domains,
  gateways,
  gatewayBlocks,
  questions,
  oversightVariants,
  applicabilityStates: ['activity_exists_internal', 'activity_outsourced', 'activity_shared_service', 'activity_absent', 'unknown'],
  scoringStatuses: ['not_applicable', 'outsourced', 'unknown', 'not_implemented', 'partially_implemented', 'implemented', 'invalidated_by_upstream', 'profile_only', 'scored_as_third_party_governance'],
  skipReasonCodes,
  graphInvariants: {
    questionCount: 68,
    gatewayCount: 14,
    oversightVariantCount: 6,
    gatewayBlockCount: 4,
    customerRoutingEnabled: false,
    scoringEngineChanged: false,
  },
};
const graph = { ...graphWithoutFingerprint, graphFingerprint: sha(canonical(graphWithoutFingerprint)) };

const guidance = sorted.map((playbook) => {
  const examples = playbook.evidenceRequired.slice(0, 4);
  const good = `${playbook.expectedStandard} Good evidence identifies the accountable owner and shows ${playbook.minimumAcceptableEvidenceCharacteristics.join('; ').toLowerCase()}.`;
  const content = { questionCode: playbook.questionCode, guidanceVersion: GUIDANCE_VERSION, goodEvidenceLooksLike: good, exampleArtifacts: examples, likelyEvidenceOwner: playbook.processOwnership, controlObjective: playbook.controlObjective };
  return { ...content, contentFingerprint: sha(canonical(content)), graphVersion: GRAPH_VERSION, methodologyVersion: 'MFRS-V1.1' };
});

const matrix = [
  '# G28 evidence-guidance review matrix',
  '',
  `Graph: ${GRAPH_VERSION}  `,
  `Guidance: ${GUIDANCE_VERSION}  `,
  `Content fingerprint: ${sha(canonical(guidance))}`,
  '',
  '| # | Question | Likely evidence owner | Evidence examples | Review focus |',
  '|---:|---|---|---|---|',
  ...guidance.map((item, index) => `| ${index + 1} | ${item.questionCode} | ${item.likelyEvidenceOwner.replaceAll('|', '\\|')} | ${item.exampleArtifacts.join('; ').replaceAll('|', '\\|')} | ${item.goodEvidenceLooksLike.replaceAll('|', '\\|')} |`),
  '',
  'This is review guidance only. It does not change the scoring scale, weights, question wording, report content or customer routing.',
].join('\n');

const migration = `-- G24 adaptive foundation and G28 question-specific evidence guidance.\n-- Additive, draft-only, Staging application. Existing assessments remain legacy_fixed.\n-- Generated by scripts/generate-adaptive-foundation-content.mjs.\n\nbegin;\n\ncreate table if not exists public.adaptive_graph_versions (\n  id uuid primary key default gen_random_uuid(),\n  graph_version text not null unique,\n  methodology_version_id uuid not null references public.methodology_versions(id),\n  methodology_version text not null,\n  status text not null default 'draft' check (status in ('draft','published','retired')),\n  compiled_graph_json jsonb not null,\n  graph_fingerprint text not null check (graph_fingerprint ~ '^[0-9a-f]{64}$'),\n  question_count integer not null check (question_count >= 0),\n  gateway_count integer not null check (gateway_count >= 0),\n  oversight_variant_count integer not null check (oversight_variant_count >= 0),\n  provenance text not null,\n  created_at timestamptz not null default now(),\n  published_at timestamptz,\n  created_by uuid,\n  supersedes_graph_version text references public.adaptive_graph_versions(graph_version),\n  check ((status = 'published') = (published_at is not null))\n);\n\ncreate table if not exists public.assessment_navigation_states (\n  id uuid primary key default gen_random_uuid(),\n  assessment_id uuid not null unique references public.assessments(id) on delete cascade,\n  graph_version_id uuid references public.adaptive_graph_versions(id),\n  current_question_id text,\n  visited_question_ids text[] not null default '{}',\n  current_screen text not null default 'question' check (current_screen in ('gateway','question','review','complete')),\n  save_sequence bigint not null default 0 check (save_sequence >= 0),\n  last_saved_at timestamptz,\n  submitted_at timestamptz,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ncreate table if not exists public.assessment_answer_history (\n  id uuid primary key default gen_random_uuid(),\n  assessment_id uuid not null references public.assessments(id) on delete cascade,\n  question_id text not null,\n  graph_version_id uuid references public.adaptive_graph_versions(id),\n  event_type text not null check (event_type in ('replacement','invalidation','upstream_change')),\n  previous_answer jsonb,\n  upstream_cause_question_id text,\n  reason_code text not null,\n  created_at timestamptz not null default now()\n);\n\ncreate table if not exists public.assessment_applicability_profiles (\n  id uuid primary key default gen_random_uuid(),\n  assessment_id uuid not null references public.assessments(id) on delete cascade,\n  question_id text not null,\n  graph_version_id uuid not null references public.adaptive_graph_versions(id),\n  applicability_state text not null check (applicability_state in ('activity_exists_internal','activity_outsourced','activity_shared_service','activity_absent','unknown')),\n  finding_class text,\n  recommendation_class text,\n  scoring_weight numeric,\n  included_in_denominator boolean not null default true,\n  excluded_from_denominator_rule text,\n  skip_reason text,\n  control_visibility_state text not null default 'visible' check (control_visibility_state in ('visible','skipped','redirected','invalidated')),\n  redirected_question_id text,\n  replacement_question_id text,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  unique (assessment_id, graph_version_id, question_id)\n);\n\ncreate table if not exists public.assessment_integrity_signals (\n  id uuid primary key default gen_random_uuid(),\n  assessment_id uuid not null references public.assessments(id) on delete cascade,\n  graph_version_id uuid not null references public.adaptive_graph_versions(id),\n  signal_id text not null,\n  detail jsonb not null default '{}',\n  blocking boolean not null default false,\n  created_at timestamptz not null default now(),\n  unique (assessment_id, graph_version_id, signal_id)\n);\n\ncreate table if not exists public.assessment_evidence_guidance (\n  id uuid primary key default gen_random_uuid(),\n  question_id uuid not null references public.questions(id),\n  question_code text not null,\n  methodology_version_id uuid not null references public.methodology_versions(id),\n  graph_version_id uuid not null references public.adaptive_graph_versions(id),\n  guidance_version text not null,\n  status text not null default 'draft' check (status in ('draft','published','retired')),\n  good_evidence_looks_like text not null,\n  example_artifacts jsonb not null check (jsonb_typeof(example_artifacts) = 'array'),\n  likely_evidence_owner text not null,\n  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),\n  provenance text not null,\n  created_at timestamptz not null default now(),\n  published_at timestamptz,\n  unique (question_id, methodology_version_id, guidance_version),\n  check ((status = 'published') = (published_at is not null))\n);\n\nalter table public.assessments add column if not exists assessment_mode text not null default 'legacy_fixed';\nalter table public.assessments add constraint assessments_assessment_mode_check check (assessment_mode in ('legacy_fixed','adaptive'));\nalter table public.assessments add column if not exists graph_version_id uuid references public.adaptive_graph_versions(id);\nalter table public.assessments add column if not exists graph_version_snapshot text;\nalter table public.assessments add column if not exists graph_fingerprint_snapshot text check (graph_fingerprint_snapshot is null or graph_fingerprint_snapshot ~ '^[0-9a-f]{64}$');\nalter table public.assessments add constraint assessments_adaptive_graph_pin_check check ((assessment_mode = 'adaptive') = (graph_version_id is not null));\n\ncreate index if not exists adaptive_graph_versions_methodology_idx on public.adaptive_graph_versions(methodology_version_id, status);\ncreate index if not exists assessment_navigation_states_graph_idx on public.assessment_navigation_states(graph_version_id);\ncreate index if not exists assessment_answer_history_assessment_idx on public.assessment_answer_history(assessment_id, created_at);\ncreate index if not exists assessment_applicability_profiles_assessment_idx on public.assessment_applicability_profiles(assessment_id, graph_version_id);\ncreate index if not exists assessment_integrity_signals_assessment_idx on public.assessment_integrity_signals(assessment_id, graph_version_id);\ncreate index if not exists assessment_evidence_guidance_question_idx on public.assessment_evidence_guidance(question_code, methodology_version_id);\n\ncomment on table public.adaptive_graph_versions is 'Versioned adaptive graph definitions. Draft-only in G24; customer routing is disabled.';\ncomment on table public.assessment_evidence_guidance is 'Question-specific G28 evidence guidance bound to a graph and methodology version.';\ncomment on column public.assessments.assessment_mode is 'Legacy assessments remain legacy_fixed; adaptive is reserved for a future approved activation.';\n\nalter table public.adaptive_graph_versions enable row level security;\nalter table public.assessment_navigation_states enable row level security;\nalter table public.assessment_answer_history enable row level security;\nalter table public.assessment_applicability_profiles enable row level security;\nalter table public.assessment_integrity_signals enable row level security;\nalter table public.assessment_evidence_guidance enable row level security;\nrevoke all on public.adaptive_graph_versions, public.assessment_navigation_states, public.assessment_answer_history, public.assessment_applicability_profiles, public.assessment_integrity_signals, public.assessment_evidence_guidance from public, anon, authenticated;\ngrant select, insert, update on public.adaptive_graph_versions to service_role;\ngrant select, insert, update on public.assessment_navigation_states to service_role;\ngrant select, insert on public.assessment_answer_history to service_role;\ngrant select, insert, update on public.assessment_applicability_profiles to service_role;\ngrant select, insert, update on public.assessment_integrity_signals to service_role;\ngrant select, insert, update on public.assessment_evidence_guidance to service_role;\n\ninsert into public.adaptive_graph_versions (graph_version, methodology_version_id, methodology_version, status, compiled_graph_json, graph_fingerprint, question_count, gateway_count, oversight_variant_count, provenance)\nselect '${GRAPH_VERSION}', mv.id, 'MFRS-V1.1', 'draft', '${JSON.stringify(graph).replaceAll("'", "''")}'::jsonb, '${graph.graphFingerprint}', 68, 14, 6, 'G24 approved adaptive foundation; draft only; no customer routing.'\nfrom public.methodology_versions mv where mv.version_code = 'MFRS-V1.1'\non conflict (graph_version) do nothing;\n\ninsert into public.assessment_evidence_guidance (question_id, question_code, methodology_version_id, graph_version_id, guidance_version, status, good_evidence_looks_like, example_artifacts, likely_evidence_owner, content_fingerprint, provenance)\nselect q.id, g.questionCode, mv.id, ag.id, g.guidanceVersion, 'draft', g.goodEvidenceLooksLike, g.exampleArtifacts::jsonb, g.likelyEvidenceOwner, g.contentFingerprint, 'G28 question-specific guidance generated from the authoritative playbook registry.'\nfrom jsonb_to_recordset('${JSON.stringify(guidance).replaceAll("'", "''")}'::jsonb) as g(questionCode text, guidanceVersion text, goodEvidenceLooksLike text, exampleArtifacts jsonb, likelyEvidenceOwner text, controlObjective text, contentFingerprint text, graphVersion text, methodologyVersion text)\njoin public.methodology_versions mv on mv.version_code = g.methodologyVersion\njoin public.adaptive_graph_versions ag on ag.graph_version = g.graphVersion\njoin public.questions q on q.question_code = g.questionCode and q.methodology_version_id = mv.id\non conflict (question_id, methodology_version_id, guidance_version) do nothing;\n\ncommit;\n`;

const governanceSql = [
  "create or replace function public.guard_adaptive_content_immutability() returns trigger language plpgsql set search_path = '' as $$ begin",
  "  if tg_op = 'DELETE' and old.status = 'published' then raise exception 'adaptive_content_published_immutable:%', tg_table_name; end if;",
  "  if tg_op = 'UPDATE' and old.status = 'published' and tg_table_name = 'adaptive_graph_versions' and (to_jsonb(new)->>'graph_version' is distinct from to_jsonb(old)->>'graph_version' or to_jsonb(new)->>'compiled_graph_json' is distinct from to_jsonb(old)->>'compiled_graph_json' or to_jsonb(new)->>'graph_fingerprint' is distinct from to_jsonb(old)->>'graph_fingerprint') then raise exception 'adaptive_graph_published_content_immutable'; end if;",
  "  if tg_op = 'UPDATE' and old.status = 'published' and tg_table_name = 'assessment_evidence_guidance' and (to_jsonb(new)->>'good_evidence_looks_like' is distinct from to_jsonb(old)->>'good_evidence_looks_like' or to_jsonb(new)->>'example_artifacts' is distinct from to_jsonb(old)->>'example_artifacts' or to_jsonb(new)->>'likely_evidence_owner' is distinct from to_jsonb(old)->>'likely_evidence_owner' or to_jsonb(new)->>'content_fingerprint' is distinct from to_jsonb(old)->>'content_fingerprint') then raise exception 'adaptive_guidance_published_content_immutable'; end if;",
  "  return case when tg_op = 'DELETE' then old else new end; end; $$;",
  "drop trigger if exists trg_adaptive_graph_content_immutability on public.adaptive_graph_versions;",
 "create trigger trg_adaptive_graph_content_immutability before insert or update or delete on public.adaptive_graph_versions for each row execute function public.guard_adaptive_content_immutability();",
  "drop trigger if exists trg_adaptive_guidance_content_immutability on public.assessment_evidence_guidance;",
  "create trigger trg_adaptive_guidance_content_immutability before insert or update or delete on public.assessment_evidence_guidance for each row execute function public.guard_adaptive_content_immutability();",
 "create or replace function public.publish_adaptive_graph_version(p_graph_version text) returns public.adaptive_graph_versions language plpgsql security definer set search_path = '' as $$ declare v_graph public.adaptive_graph_versions; begin select * into v_graph from public.adaptive_graph_versions where graph_version = p_graph_version for update; if not found then raise exception 'adaptive_graph_not_found:%', p_graph_version; end if; if v_graph.status <> 'draft' then raise exception 'adaptive_graph_not_draft:%', p_graph_version; end if; update public.adaptive_graph_versions set status = 'published', published_at = now() where id = v_graph.id returning * into v_graph; return v_graph; end; $$;",
  "revoke all on function public.publish_adaptive_graph_version(text) from public, anon, authenticated; grant execute on function public.publish_adaptive_graph_version(text) to service_role;",
].join('\n');
const migrationWithGovernance = migration
  .replace('alter table public.adaptive_graph_versions enable row level security;', () => governanceSql + '\n\nalter table public.adaptive_graph_versions enable row level security;')
  .replace('grant select, insert, update on public.assessment_evidence_guidance to service_role;', (match) => match + '\nrevoke all on function public.publish_adaptive_graph_version(text) from public, anon, authenticated;\ngrant execute on function public.publish_adaptive_graph_version(text) to service_role;');
const guidanceSeedRepairMigration = `-- Repair seed for the G28 guidance rows; the original additive migration remains unchanged.\nbegin;\ninsert into public.assessment_evidence_guidance (question_id, question_code, methodology_version_id, graph_version_id, guidance_version, status, good_evidence_looks_like, example_artifacts, likely_evidence_owner, content_fingerprint, provenance)\nselect q.id, g.\"questionCode\", mv.id, ag.id, g.\"guidanceVersion\", 'draft', g.\"goodEvidenceLooksLike\", g.\"exampleArtifacts\"::jsonb, g.\"likelyEvidenceOwner\", g.\"contentFingerprint\", 'G28 question-specific guidance generated from the authoritative playbook registry.'\nfrom jsonb_to_recordset('${JSON.stringify(guidance).replaceAll("'", "''")}'::jsonb) as g(\"questionCode\" text, \"guidanceVersion\" text, \"goodEvidenceLooksLike\" text, \"exampleArtifacts\" jsonb, \"likelyEvidenceOwner\" text, \"contentFingerprint\" text, \"graphVersion\" text, \"methodologyVersion\" text)\njoin public.methodology_versions mv on mv.version_code = g.\"methodologyVersion\"\njoin public.adaptive_graph_versions ag on ag.graph_version = g.\"graphVersion\"\njoin public.questions q on q.question_code = g.\"questionCode\" and q.methodology_version_id = mv.id\non conflict (question_id, methodology_version_id, guidance_version) do nothing;\ncommit;\n`;
for (const [relative, content] of [
  ['docs/adaptive-assessment/adaptive-graph-v1-draft.json', `${JSON.stringify(graph, null, 2)}\n`],
  ['docs/adaptive-assessment/g28-evidence-guidance-v1.json', `${JSON.stringify(guidance, null, 2)}\n`],
  ['docs/adaptive-assessment/g28-evidence-review-matrix.md', `${matrix}\n`],
  [`supabase/migrations/${MIGRATION_VERSION}.sql`, migrationWithGovernance],
  ['supabase/migrations/20260804171000_g28_evidence_guidance_seed_repair.sql', guidanceSeedRepairMigration],
]) {
  const target = resolve(ROOT, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

console.log(JSON.stringify({ graphVersion: GRAPH_VERSION, graphFingerprint: graph.graphFingerprint, questionCount: questions.length, guidanceCount: guidance.length, migration: MIGRATION_VERSION }, null, 2));
