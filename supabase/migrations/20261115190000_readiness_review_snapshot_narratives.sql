-- The revised Snapshot's AI narrative (owner direction, 15 November 2026), cached per session and per brief digest (the
-- exact figures it was written from), so a Snapshot is written once and reopening it never makes another model call.
-- Usage and cost are recorded with it. Service role only.
create table readiness_review.snapshot_narratives (
  session_id text not null references readiness_review.sessions (session_id) on delete cascade,
  brief_digest text not null check (brief_digest ~ '^[0-9a-f]{64}$'),
  narrative jsonb not null check (jsonb_typeof(narrative) = 'object'),
  status text not null check (status in ('ai', 'data', 'checks_failed')),
  model text not null,
  version text not null,
  usage jsonb,
  cost_usd numeric(10, 6),
  created_at timestamptz not null default now(),
  primary key (session_id, brief_digest)
);
alter table readiness_review.snapshot_narratives enable row level security;
revoke all on table readiness_review.snapshot_narratives from public, anon, authenticated, service_role;

create function public.review_snapshot_narrative(p_session_id text, p_brief_digest text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('narrative', n.narrative, 'status', n.status)
  from readiness_review.snapshot_narratives n
  where n.session_id = p_session_id and n.brief_digest = p_brief_digest
$$;

-- Records a narrative once; a second writer for the same answers keeps the first.
create function public.review_record_snapshot_narrative(p jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into readiness_review.snapshot_narratives (session_id, brief_digest, narrative, status, model, version, usage, cost_usd)
  values (p ->> 'sessionId', p ->> 'briefDigest', p -> 'narrative', p ->> 'status', p ->> 'model', p ->> 'version', p -> 'usage', nullif(p ->> 'costUsd', '')::numeric)
  on conflict (session_id, brief_digest) do nothing;
  return found;
end
$$;

revoke all on function public.review_snapshot_narrative(text, text) from public, anon, authenticated;
revoke all on function public.review_record_snapshot_narrative(jsonb) from public, anon, authenticated;
grant execute on function public.review_snapshot_narrative(text, text) to service_role;
grant execute on function public.review_record_snapshot_narrative(jsonb) to service_role;
