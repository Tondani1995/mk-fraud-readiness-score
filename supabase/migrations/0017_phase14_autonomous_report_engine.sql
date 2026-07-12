-- MK Fraud Readiness Score V1 - Phase 14 autonomous premium report engine
-- Additive operational state for idempotent report fulfilment and generation provenance.
-- All automation flags remain disabled until controlled UAT and production approval.

begin;

create table if not exists public.report_fulfilments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  report_id uuid references public.reports(id) on delete set null,
  idempotency_key text not null,
  trigger_source text not null check (trigger_source in ('payment_confirmation', 'admin_generate', 'admin_retry', 'admin_regenerate')),
  status text not null default 'queued' check (status in (
    'queued',
    'assembling',
    'generating',
    'validating',
    'rendering',
    'storing',
    'ready_for_delivery',
    'completed',
    'failed',
    'cancelled'
  )),
  current_step text,
  generation_mode text check (generation_mode is null or generation_mode in ('ai', 'ai_repair', 'deterministic_fallback')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  workflow_start_status text not null default 'not_started' check (workflow_start_status in ('not_started', 'starting', 'started', 'failed')),
  workflow_run_id text,
  workflow_started_at timestamptz,
  workflow_start_error text,
  last_error_code text,
  last_error_message text,
  requested_by_admin_user_id uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_fulfilments_idempotency_key_unique unique (idempotency_key)
);

create unique index if not exists report_fulfilments_one_active_order_uidx
  on public.report_fulfilments(order_id)
  where status in ('queued', 'assembling', 'generating', 'validating', 'rendering', 'storing', 'ready_for_delivery');
create unique index if not exists report_fulfilments_workflow_run_uidx
  on public.report_fulfilments(workflow_run_id)
  where workflow_run_id is not null;
create index if not exists report_fulfilments_workflow_start_idx
  on public.report_fulfilments(workflow_start_status, created_at desc);
create index if not exists report_fulfilments_status_created_idx
  on public.report_fulfilments(status, created_at desc);
create index if not exists report_fulfilments_assessment_idx
  on public.report_fulfilments(assessment_id);
create index if not exists report_fulfilments_score_run_idx
  on public.report_fulfilments(score_run_id);
create index if not exists report_fulfilments_report_idx
  on public.report_fulfilments(report_id);

create table if not exists public.report_generation_runs (
  id uuid primary key default gen_random_uuid(),
  fulfilment_id uuid not null references public.report_fulfilments(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  generation_mode text not null check (generation_mode in ('ai', 'ai_repair', 'deterministic_fallback')),
  provider text,
  model text,
  prompt_version text not null,
  schema_version text not null,
  evidence_checksum text not null,
  evidence_snapshot_json jsonb not null default '{}'::jsonb,
  structured_output_json jsonb,
  validation_result_json jsonb not null default '{}'::jsonb,
  validation_errors_json jsonb not null default '[]'::jsonb,
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  total_token_count integer check (total_token_count is null or total_token_count >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  status text not null check (status in ('started', 'validated', 'rejected', 'failed', 'used')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint report_generation_runs_fulfilment_attempt_unique unique (fulfilment_id, attempt_number)
);

create index if not exists report_generation_runs_fulfilment_created_idx
  on public.report_generation_runs(fulfilment_id, created_at desc);
create index if not exists report_generation_runs_report_idx
  on public.report_generation_runs(report_id);
create index if not exists report_generation_runs_status_idx
  on public.report_generation_runs(status);

alter table public.reports
  add column if not exists fulfilment_id uuid references public.report_fulfilments(id) on delete set null,
  add column if not exists generation_run_id uuid references public.report_generation_runs(id) on delete set null;

create index if not exists reports_fulfilment_idx on public.reports(fulfilment_id);
create index if not exists reports_generation_run_idx on public.reports(generation_run_id);

alter table public.report_fulfilments enable row level security;
alter table public.report_generation_runs enable row level security;

revoke all on table public.report_fulfilments from anon, authenticated;
revoke all on table public.report_generation_runs from anon, authenticated;
grant select on table public.report_fulfilments to authenticated;
grant select on table public.report_generation_runs to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'report_fulfilments'
      and policyname = 'report_fulfilments_admin_select'
  ) then
    create policy report_fulfilments_admin_select on public.report_fulfilments
      for select using (
        public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'report_generation_runs'
      and policyname = 'report_generation_runs_admin_select'
  ) then
    create policy report_generation_runs_admin_select on public.report_generation_runs
      for select using (
        public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin')
      );
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_report_fulfilments_updated_at'
  ) then
    create trigger trg_report_fulfilments_updated_at
      before update on public.report_fulfilments
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.app_settings (setting_key, value_json)
values (
  'phase14_autonomous_report_engine',
  '{
    "status":"foundation_only",
    "premium_report_auto_fulfilment_enabled":false,
    "premium_report_ai_narrative_enabled":false,
    "premium_report_auto_email_enabled":false,
    "premium_report_test_recipient_override":null,
    "premium_report_ai_model":"openai/gpt-5.5",
    "premium_report_prompt_version":"mk-premium-report-v1",
    "premium_report_schema_version":"mk-premium-narrative-v1",
    "routine_human_approval_required":false,
    "deterministic_scoring_authoritative":true,
    "r50000_automation_enabled":false
  }'::jsonb
)
on conflict (setting_key) do update
set value_json = excluded.value_json,
    updated_at = now();

commit;
