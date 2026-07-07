-- MK Fraud Readiness Score V1 - Phase 2 v1.1 Supabase Schema and RLS Draft
-- Status: blueprint draft only. Review before running in Supabase.
-- Do not run against production until Phase 2 is approved and a rollback plan exists.

begin;

-- 001 extensions and helpers
create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.admin_role as enum ('platform_admin','reviewer','approver','finance_admin','read_only_admin');
create type public.user_status as enum ('active','suspended','invited','revoked');
create type public.assessment_status as enum ('draft','submitted','scored','snapshot_available','report_requested','under_review','closed','voided');
create type public.assessment_token_type as enum ('resume','snapshot','report_request');
create type public.methodology_status as enum ('draft','approved','active','retired');
create type public.score_run_type as enum ('initial','admin_recalc','correction_recalc','test_fixture');
create type public.score_run_status as enum ('draft','completed','voided');
create type public.maturity_band as enum ('Reactive','Developing','Structured','Strategic');
create type public.exposure_band as enum ('Low','Moderate','High','Severe');
create type public.order_status as enum ('created','awaiting_payment','proof_uploaded','under_review','verified','rejected','cancelled','refunded');
create type public.payment_proof_status as enum ('uploaded','accepted','rejected','superseded');
create type public.report_type as enum ('free_snapshot','essential_self_assessment','mk_validated');
create type public.report_status as enum ('draft','generated','under_review','approved','released','superseded','voided');
create type public.report_template_status as enum ('draft','active','retired');
create type public.content_status as enum ('draft','active','retired');
create type public.audit_actor_type as enum ('admin','respondent_token','system');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 002 admin profiles
create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text,
  role public.admin_role not null default 'read_only_admin',
  status public.user_status not null default 'active',
  mfa_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create trigger trg_admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

create or replace function public.current_admin_role()
returns public.admin_role
language sql
security definer
set search_path = public
as $$
  select role from public.admin_profiles
  where id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.is_admin_role(allowed_roles public.admin_role[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_profiles
    where id = auth.uid()
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;

-- 003 methodology schema
create table public.methodology_versions (
  id uuid primary key default gen_random_uuid(),
  version_code text not null unique,
  title text not null,
  status public.methodology_status not null default 'draft',
  effective_from timestamptz,
  effective_to timestamptz,
  approved_by uuid references public.admin_profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint methodology_effective_dates_chk check (effective_to is null or effective_from is null or effective_to > effective_from)
);
create unique index methodology_one_active_idx on public.methodology_versions ((status)) where status = 'active';
create trigger trg_methodology_versions_updated_at before update on public.methodology_versions for each row execute function public.set_updated_at();

create table public.response_scale (
  id uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references public.methodology_versions(id) on delete cascade,
  response_value smallint not null check (response_value between 0 and 5),
  label text not null,
  operational_meaning text,
  normalised_score numeric(5,2) not null check (normalised_score between 0 and 100),
  display_order int not null,
  unique(methodology_version_id, response_value)
);

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references public.methodology_versions(id) on delete cascade,
  domain_code text not null,
  name text not null,
  weight_pct numeric(6,3) not null check (weight_pct >= 0 and weight_pct <= 100),
  domain_type text not null default 'core',
  is_core boolean not null default true,
  sort_order int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(methodology_version_id, domain_code)
);
create trigger trg_domains_updated_at before update on public.domains for each row execute function public.set_updated_at();

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references public.methodology_versions(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete restrict,
  question_code text not null,
  prompt text not null,
  help_text text,
  weight numeric(6,3) not null default 1.000 check (weight > 0),
  is_critical boolean not null default false,
  is_hard_gate boolean not null default false,
  n_a_allowed boolean not null default false,
  n_a_rule_key text,
  trigger_key text,
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(methodology_version_id, question_code)
);
create index questions_methodology_domain_idx on public.questions(methodology_version_id, domain_id, sort_order);
create trigger trg_questions_updated_at before update on public.questions for each row execute function public.set_updated_at();

create table public.question_applicability_rules (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  rule_key text not null,
  expression_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(question_id, rule_key)
);

create table public.exposure_factors (
  id uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references public.methodology_versions(id) on delete cascade,
  factor_code text not null,
  name text not null,
  max_points numeric(6,2) not null check (max_points >= 0),
  input_type text not null,
  options_json jsonb not null default '{}'::jsonb,
  sort_order int not null,
  unique(methodology_version_id, factor_code)
);

create table public.recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references public.methodology_versions(id) on delete cascade,
  rule_code text not null,
  trigger_type text not null,
  condition_json jsonb not null default '{}'::jsonb,
  severity text not null,
  title text not null,
  body text,
  action_30 text,
  action_60 text,
  action_90 text,
  sort_order int not null,
  active boolean not null default true,
  unique(methodology_version_id, rule_code)
);

-- 004 assessment schema
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trading_name text,
  industry text,
  sector text,
  country text not null default 'South Africa',
  province text,
  employee_band text,
  annual_revenue_band text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_organisations_updated_at before update on public.organisations for each row execute function public.set_updated_at();

create table public.respondents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  full_name text not null,
  email citext not null,
  role_title text,
  phone text,
  consent_privacy boolean not null default false,
  consent_research boolean not null default false,
  created_at timestamptz not null default now()
);
create index respondents_email_idx on public.respondents(email);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_reference text not null unique,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  primary_respondent_id uuid references public.respondents(id) on delete set null,
  methodology_version_id uuid not null references public.methodology_versions(id) on delete restrict,
  status public.assessment_status not null default 'draft',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  locked_at timestamptz,
  current_score_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submitted_requires_submitted_at_chk check (status not in ('submitted','scored','snapshot_available','report_requested','under_review','closed') or submitted_at is not null)
);
create index assessments_org_idx on public.assessments(organisation_id);
create index assessments_status_idx on public.assessments(status);
create trigger trg_assessments_updated_at before update on public.assessments for each row execute function public.set_updated_at();

create table public.assessment_tokens (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  token_hash text not null unique,
  token_type public.assessment_token_type not null,
  expires_at timestamptz not null,
  max_uses int not null default 25 check (max_uses > 0),
  use_count int not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  last_used_at timestamptz,
  last_used_ip_hash text,
  created_at timestamptz not null default now()
);
create index assessment_tokens_assessment_type_idx on public.assessment_tokens(assessment_id, token_type);

create table public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  response_value smallint,
  is_not_applicable boolean not null default false,
  n_a_reason text,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, question_id),
  constraint answer_response_or_na_chk check (
    (is_not_applicable = true and response_value is null)
    or (is_not_applicable = false and response_value between 0 and 5)
  )
);
create trigger trg_assessment_answers_updated_at before update on public.assessment_answers for each row execute function public.set_updated_at();

create table public.exposure_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  exposure_factor_id uuid not null references public.exposure_factors(id) on delete restrict,
  raw_value_json jsonb not null default '{}'::jsonb,
  points_awarded numeric(6,2) not null check (points_awarded >= 0),
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, exposure_factor_id)
);
create trigger trg_exposure_answers_updated_at before update on public.exposure_answers for each row execute function public.set_updated_at();

-- 005 scoring schema
create table public.score_runs (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  methodology_version_id uuid not null references public.methodology_versions(id) on delete restrict,
  run_number int not null,
  run_type public.score_run_type not null default 'initial',
  status public.score_run_status not null default 'draft',
  overall_score numeric(6,2),
  calculated_maturity public.maturity_band,
  final_maturity public.maturity_band,
  exposure_score numeric(6,2),
  exposure_band public.exposure_band,
  coverage_pct numeric(6,2),
  n_a_rate_pct numeric(6,2),
  critical_gap_count int not null default 0,
  major_gap_count int not null default 0,
  cap_applied boolean not null default false,
  cap_reason text,
  input_hash text,
  created_by_user_id uuid references public.admin_profiles(id),
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  unique(assessment_id, run_number)
);
create index score_runs_assessment_idx on public.score_runs(assessment_id, run_number desc);

alter table public.assessments
  add constraint assessments_current_score_run_fk foreign key (current_score_run_id) references public.score_runs(id) on delete set null;

create table public.score_domain_results (
  id uuid primary key default gen_random_uuid(),
  score_run_id uuid not null references public.score_runs(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete restrict,
  raw_score numeric(6,2),
  weighted_contribution numeric(8,4),
  coverage_pct numeric(6,2),
  critical_gap_count int not null default 0,
  flags_json jsonb not null default '{}'::jsonb,
  unique(score_run_id, domain_id)
);

create table public.score_question_traces (
  id uuid primary key default gen_random_uuid(),
  score_run_id uuid not null references public.score_runs(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  answer_id uuid references public.assessment_answers(id) on delete set null,
  response_value smallint,
  normalised_score numeric(6,2),
  question_weight numeric(6,3),
  applicable boolean not null default true,
  numerator_contribution numeric(10,4),
  denominator_contribution numeric(10,4),
  is_critical_gap boolean not null default false,
  is_major_gap boolean not null default false,
  triggered_rules jsonb not null default '[]'::jsonb
);

create table public.maturity_cap_events (
  id uuid primary key default gen_random_uuid(),
  score_run_id uuid not null references public.score_runs(id) on delete cascade,
  rule_code text not null,
  cap_to public.maturity_band not null,
  reason text not null,
  related_question_id uuid references public.questions(id) on delete set null,
  related_domain_id uuid references public.domains(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 006 commerce and reporting
create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  name text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'ZAR',
  requires_payment_verification boolean not null default false,
  delivery_mode text not null,
  active boolean not null default true,
  display_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  status public.order_status not null default 'created',
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'ZAR',
  requested_by_respondent_id uuid references public.respondents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_by uuid references public.admin_profiles(id),
  verified_at timestamptz,
  finance_notes text
);
create index orders_assessment_idx on public.orders(assessment_id);
create index orders_status_idx on public.orders(status);
create trigger trg_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text,
  content_type text,
  size_bytes int check (size_bytes >= 0),
  status public.payment_proof_status not null default 'uploaded',
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid references public.admin_profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  unique(storage_bucket, storage_path)
);

create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null,
  version_number int not null,
  report_type public.report_type not null,
  status public.report_template_status not null default 'draft',
  content_schema_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_profiles(id),
  approved_by uuid references public.admin_profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(template_code, version_number)
);

create table public.report_content_blocks (
  id uuid primary key default gen_random_uuid(),
  methodology_version_id uuid not null references public.methodology_versions(id) on delete cascade,
  block_key text not null,
  block_type text not null,
  domain_code text,
  maturity_band public.maturity_band,
  severity text,
  title text,
  body text,
  actions_json jsonb not null default '{}'::jsonb,
  status public.content_status not null default 'draft',
  version_number int not null default 1,
  updated_at timestamptz not null default now(),
  unique(methodology_version_id, block_key, version_number)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  template_id uuid not null references public.report_templates(id) on delete restrict,
  report_type public.report_type not null,
  status public.report_status not null default 'draft',
  report_reference text not null unique,
  version_number int not null default 1,
  storage_bucket text,
  storage_path text,
  checksum text,
  generated_by uuid references public.admin_profiles(id),
  generated_at timestamptz,
  approved_by uuid references public.admin_profiles(id),
  approved_at timestamptz,
  released_at timestamptz,
  supersedes_report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(assessment_id, report_type, version_number)
);
create index reports_assessment_idx on public.reports(assessment_id);
create trigger trg_reports_updated_at before update on public.reports for each row execute function public.set_updated_at();

create table public.report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references public.admin_profiles(id),
  note text,
  created_at timestamptz not null default now()
);

-- 007 audit, email and settings
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  subject text not null,
  body text not null,
  status public.content_status not null default 'draft',
  version_number int not null default 1,
  updated_at timestamptz not null default now(),
  unique(template_key, version_number)
);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.assessments(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  recipient_email citext not null,
  template_key text,
  provider_message_id text,
  status text not null default 'queued',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type public.audit_actor_type not null,
  actor_user_id uuid references public.admin_profiles(id) on delete set null,
  assessment_id uuid references public.assessments(id) on delete set null,
  entity_table text not null,
  entity_id uuid,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs(entity_table, entity_id);
create index audit_logs_assessment_idx on public.audit_logs(assessment_id);

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references public.assessments(id) on delete set null,
  organisation_id uuid references public.organisations(id) on delete set null,
  respondent_id uuid references public.respondents(id) on delete set null,
  request_type text not null,
  status text not null default 'received',
  requested_by_email citext,
  notes text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  setting_key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_profiles(id),
  updated_at timestamptz not null default now()
);

-- 008 Storage bucket setup - uncomment in Supabase SQL editor if storage schema is available in the target context.
-- insert into storage.buckets (id, name, public) values ('payment-proofs','payment-proofs',false) on conflict (id) do nothing;
-- insert into storage.buckets (id, name, public) values ('generated-reports','generated-reports',false) on conflict (id) do nothing;

-- 009 RLS policies
alter table public.admin_profiles enable row level security;
alter table public.methodology_versions enable row level security;
alter table public.response_scale enable row level security;
alter table public.domains enable row level security;
alter table public.questions enable row level security;
alter table public.question_applicability_rules enable row level security;
alter table public.exposure_factors enable row level security;
alter table public.recommendation_rules enable row level security;
alter table public.organisations enable row level security;
alter table public.respondents enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_tokens enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.exposure_answers enable row level security;
alter table public.score_runs enable row level security;
alter table public.score_domain_results enable row level security;
alter table public.score_question_traces enable row level security;
alter table public.maturity_cap_events enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.report_templates enable row level security;
alter table public.report_content_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.report_events enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.data_requests enable row level security;
alter table public.app_settings enable row level security;

-- Admin profile policies
create policy admin_profiles_select on public.admin_profiles
for select using (id = auth.uid() or public.is_admin_role(array['platform_admin']::public.admin_role[]));

create policy admin_profiles_platform_admin_manage on public.admin_profiles
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

-- Read policies for active admins
create policy methodology_admin_select on public.methodology_versions
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy response_scale_admin_select on public.response_scale
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy domains_admin_select on public.domains
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy questions_admin_select on public.questions
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy applicability_admin_select on public.question_applicability_rules
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy exposure_admin_select on public.exposure_factors
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy recommendation_admin_select on public.recommendation_rules
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));

-- Platform admin can manage methodology draft/config. Application logic must prevent edits to active/approved versions.
create policy methodology_platform_admin_manage on public.methodology_versions
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy response_scale_platform_admin_manage on public.response_scale
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy domains_platform_admin_manage on public.domains
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy questions_platform_admin_manage on public.questions
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy applicability_platform_admin_manage on public.question_applicability_rules
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy exposure_platform_admin_manage on public.exposure_factors
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy recommendation_platform_admin_manage on public.recommendation_rules
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

-- Operational data: admin read, restricted writes. Respondent writes are via server service role after token validation.
create policy organisations_admin_select on public.organisations
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','finance_admin','read_only_admin']::public.admin_role[]));
create policy respondents_admin_select on public.respondents
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','finance_admin','read_only_admin']::public.admin_role[]));
create policy assessments_admin_select on public.assessments
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','finance_admin','read_only_admin']::public.admin_role[]));
create policy answers_admin_select on public.assessment_answers
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy exposure_answers_admin_select on public.exposure_answers
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));

create policy operational_platform_admin_manage_orgs on public.organisations
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy operational_platform_admin_manage_respondents on public.respondents
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy operational_platform_admin_manage_assessments on public.assessments
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

-- Score read policies
create policy score_runs_admin_select on public.score_runs
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy score_domain_results_admin_select on public.score_domain_results
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy score_question_traces_admin_select on public.score_question_traces
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy maturity_cap_events_admin_select on public.maturity_cap_events
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));

create policy score_platform_admin_manage on public.score_runs
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

-- Commerce and reports policies
create policy products_admin_select on public.products
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','finance_admin','read_only_admin']::public.admin_role[]));
create policy products_platform_admin_manage on public.products
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

create policy orders_admin_select on public.orders
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','finance_admin','read_only_admin']::public.admin_role[]));
create policy orders_finance_update on public.orders
for update using (public.is_admin_role(array['platform_admin','finance_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin','finance_admin']::public.admin_role[]));

create policy payment_proofs_admin_select on public.payment_proofs
for select using (public.is_admin_role(array['platform_admin','finance_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy payment_proofs_finance_update on public.payment_proofs
for update using (public.is_admin_role(array['platform_admin','finance_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin','finance_admin']::public.admin_role[]));

create policy report_templates_admin_select on public.report_templates
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy report_templates_platform_admin_manage on public.report_templates
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

create policy report_content_blocks_admin_select on public.report_content_blocks
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy report_content_blocks_platform_admin_manage on public.report_content_blocks
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

create policy reports_admin_select on public.reports
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy reports_admin_manage on public.reports
for all using (public.is_admin_role(array['platform_admin','reviewer','approver']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin','reviewer','approver']::public.admin_role[]));

create policy report_events_admin_select on public.report_events
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy report_events_admin_insert on public.report_events
for insert with check (public.is_admin_role(array['platform_admin','reviewer','approver']::public.admin_role[]));

-- Email, settings, audit
create policy email_templates_admin_select on public.email_templates
for select using (public.is_admin_role(array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[]));
create policy email_templates_platform_admin_manage on public.email_templates
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

create policy email_events_admin_select on public.email_events
for select using (public.is_admin_role(array['platform_admin','read_only_admin']::public.admin_role[]));

create policy audit_logs_platform_admin_select on public.audit_logs
for select using (public.is_admin_role(array['platform_admin']::public.admin_role[]));
create policy audit_logs_admin_insert on public.audit_logs
for insert with check (public.is_admin_role(array['platform_admin','reviewer','approver','finance_admin']::public.admin_role[]));

create policy data_requests_admin_select on public.data_requests
for select using (public.is_admin_role(array['platform_admin','read_only_admin']::public.admin_role[]));
create policy data_requests_platform_admin_manage on public.data_requests
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

create policy app_settings_admin_select on public.app_settings
for select using (public.is_admin_role(array['platform_admin','finance_admin','read_only_admin']::public.admin_role[]));
create policy app_settings_platform_admin_manage on public.app_settings
for all using (public.is_admin_role(array['platform_admin']::public.admin_role[]))
with check (public.is_admin_role(array['platform_admin']::public.admin_role[]));

-- 010 seed products and starter settings
insert into public.products (product_code, name, price_cents, currency, requires_payment_verification, delivery_mode, display_order)
values
  ('free_snapshot', 'Free Snapshot', 0, 'ZAR', false, 'instant_snapshot', 1),
  ('essential_self_assessment', 'Essential Self-Assessment Report', 500000, 'ZAR', true, 'mk_controlled_pdf', 2),
  ('mk_validated_assessment', 'Comprehensive MK-Validated Assessment', 5000000, 'ZAR', true, 'mk_led_validated_engagement', 3)
on conflict (product_code) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  requires_payment_verification = excluded.requires_payment_verification,
  delivery_mode = excluded.delivery_mode,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.app_settings (setting_key, value_json)
values
  ('eft_instructions', '{"status":"placeholder","message":"EFT instructions must be configured by MK before paid orders are accepted."}'::jsonb),
  ('admin_notification_email', '{"email":"admin@mkfraud.co.za"}'::jsonb),
  ('respondent_token_policy', '{"resume_days":14,"snapshot_days":7,"max_uses":25}'::jsonb)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
