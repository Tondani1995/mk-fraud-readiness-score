-- MK Fraud Readiness Score V1 - Rate limiting
-- Real decision (not deferred): implemented as a Postgres-backed fixed-window counter rather
-- than an in-memory limiter, because Next.js API routes on Vercel run as independent serverless
-- invocations with no shared memory - an in-memory counter would silently do nothing in
-- production. Supabase Postgres is already the shared state store the app depends on, so it is
-- the correct place for this without introducing a new dependency (e.g. Upstash/Redis) that
-- hasn't been decided on. This can be swapped for an edge-cache-backed limiter later without
-- changing the call sites in application code (they only call check_rate_limit()).

create table if not exists public.rate_limit_hits (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  window_start timestamptz not null,
  hit_count int not null default 1,
  created_at timestamptz not null default now(),
  unique (rate_key, window_start)
);

create index if not exists rate_limit_hits_key_window_idx
  on public.rate_limit_hits (rate_key, window_start desc);

alter table public.rate_limit_hits enable row level security;

-- Deny all direct access. Only the security-definer function below (called via the
-- service-role server client, same pattern as the rest of the respondent-token flow) touches
-- this table. There is no RLS policy at all, so RLS default-denies every role except a
-- security-definer function's owner, matching the "enable RLS and deny by default" pattern
-- already used for every other sensitive table in this schema.

-- check_rate_limit: atomically increments the hit counter for the current fixed window and
-- returns whether the caller is still within the allowed limit. Uses INSERT ... ON CONFLICT
-- DO UPDATE ... RETURNING, which is a single atomic statement in Postgres - safe under
-- concurrent requests from multiple serverless invocations, no separate read-then-write race.
create or replace function public.check_rate_limit(
  p_key text,
  p_max_hits int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_hits (rate_key, window_start, hit_count)
  values (p_key, v_window_start, 1)
  on conflict (rate_key, window_start)
  do update set hit_count = public.rate_limit_hits.hit_count + 1
  returning hit_count into v_count;

  -- Lightweight, unconditional-cost-free cleanup: on roughly 1 in 200 calls, purge rows more
  -- than 2 days old so this table doesn't grow forever without needing a separate cron job yet.
  if random() < 0.005 then
    delete from public.rate_limit_hits where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_max_hits;
end;
$$;

comment on function public.check_rate_limit(text, int, int) is
  'Atomic fixed-window rate limiter. p_key should combine a route/action name with the thing being limited (e.g. admin_login:email:<email>, assessment_start:ip:<ip_hash>). Returns true if the call is within limits and should proceed, false if the caller should be rejected with 429.';
