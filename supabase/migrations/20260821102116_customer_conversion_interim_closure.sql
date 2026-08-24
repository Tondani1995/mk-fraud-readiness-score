begin;

-- Interim launch billing capture is an immutable commercial preference attached to the exact order.
-- MK prepares invoices manually; this migration does not create an invoicing engine or an external
-- billing integration.
alter table public.orders
  add column if not exists invoice_requested boolean not null default false,
  add column if not exists invoice_details jsonb not null default '{}'::jsonb;

comment on column public.orders.invoice_requested is
  'Whether the customer requested a manually prepared invoice for this exact paid-order request.';
comment on column public.orders.invoice_details is
  'Structured billing details captured for manual MK invoice preparation; no automated invoice engine.';

-- One cache row per assessment/score/methodology/prompt version. The service-role-only table keeps
-- provider metadata and the constrained answer out of the customer Data API surface.
create table if not exists public.free_snapshot_narratives (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score_run_id uuid not null references public.score_runs(id) on delete cascade,
  methodology_version text not null,
  prompt_version text not null,
  status text not null check (status in ('available', 'fallback')),
  narrative_json jsonb not null,
  model text not null,
  ai_call_count integer not null default 0 check (ai_call_count >= 0 and ai_call_count <= 1),
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  provider_cost_micros bigint,
  fallback_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, score_run_id, methodology_version, prompt_version)
);

create index if not exists free_snapshot_narratives_assessment_idx
  on public.free_snapshot_narratives (assessment_id, score_run_id);

alter table public.free_snapshot_narratives enable row level security;
revoke all on table public.free_snapshot_narratives from public, anon, authenticated;
grant select, insert, update on table public.free_snapshot_narratives to service_role;

commit;
