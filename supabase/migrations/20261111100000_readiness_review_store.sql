-- Readiness review store: durable storage for review-track sessions (contract mk-readiness-review 1.3.0).
--
-- Design: docs/readiness-review/DATABASE-DESIGN.md. A session is an append-only log of actions; its state and every
-- report are recomputed by replaying the log through the ruleset it was recorded under. Nothing derived is stored as
-- truth. Report runs record which input (by digest and log position) produced which output.
--
-- Not for the shared preview/production project (release blocker B2). The application refuses to bind the review
-- store to that project; this migration is applied only to an isolated project until B2 is resolved.
--
-- Access: tables live in a schema the Data API does not expose, with row level security on and no policies. The only
-- way in is the functions below, which run as their owner and can be executed by service_role alone.

create schema if not exists readiness_review;
revoke all on schema readiness_review from public, anon, authenticated;

-- Rulesets: the complete ruleset a session was recorded under, stored once and never changed. The key is the SHA-256
-- of its canonical JSON, computed by the application (src/lib/readiness-review/canonical.ts).
create table readiness_review.rulesets (
  ruleset_key text primary key check (ruleset_key ~ '^[0-9a-f]{64}$'),
  ruleset jsonb not null check (jsonb_typeof(ruleset) = 'object'),
  contract_name text not null,
  contract_version text not null,
  action_schema text not null,
  engine_sha256 text not null check (engine_sha256 ~ '^[0-9a-f]{64}$'),
  bank_version text not null,
  bank_sha256 text not null check (bank_sha256 ~ '^[0-9a-f]{64}$'),
  coverage_sha256 text not null check (coverage_sha256 ~ '^[0-9a-f]{64}$'),
  stored_at timestamptz not null default now(),
  check (
    contract_name = ruleset #>> '{contract,name}' and contract_version = ruleset #>> '{contract,version}'
    and action_schema = ruleset #>> '{contract,actionSchema}' and engine_sha256 = ruleset #>> '{engine,sha256}'
    and bank_version = ruleset #>> '{bank,version}' and bank_sha256 = ruleset #>> '{bank,sha256}'
    and coverage_sha256 = ruleset #>> '{coverage,sha256}'
  )
);

-- Sessions. Only fictional sessions are accepted until MK's method, copy, legal and access decisions (B3 to B7) allow
-- real ones. created_at_iso keeps the exact text the application recorded, because replay and lineage use it verbatim.
create table readiness_review.sessions (
  session_id text primary key check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  created_at_iso text not null check (created_at_iso ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'),
  created_at timestamptz not null,
  organisation_label text not null check (char_length(organisation_label) between 1 and 80),
  fictional boolean not null check (fictional),
  contract_version text not null,
  engine_sha256 text not null check (engine_sha256 ~ '^[0-9a-f]{64}$'),
  bank_version text not null,
  -- Null only for records written under contracts 1.0.0 to 1.2.0, which carry no ruleset (historical reader).
  ruleset_key text references readiness_review.rulesets (ruleset_key),
  -- Harness only: the role links the session links page shows. Links stand in for sign-in (B3); when invitations and
  -- authentication replace them, this column is dropped. Lookups never use it: they go through links.token_sha256.
  link_tokens jsonb not null check (jsonb_typeof(link_tokens) = 'object'),
  action_count integer not null default 0 check (action_count >= 0),
  last_action_at timestamptz,
  stored_at timestamptz not null default now(),
  check (created_at = created_at_iso::timestamptz)
);

-- Role links, by SHA-256 of the link token. The raw token is never needed to resolve a link.
create table readiness_review.links (
  token_sha256 text primary key check (token_sha256 ~ '^[0-9a-f]{64}$'),
  session_id text not null references readiness_review.sessions (session_id) on delete cascade,
  role text not null check (role in ('respondent', 'management', 'reviewer', 'links', 'owner')),
  fn text,
  check ((role = 'owner') = (fn is not null))
);
create index links_session_idx on readiness_review.links (session_id);

-- The answer log. One row per stored action, numbered from 0 without gaps, each action id unique within its session.
-- The action column holds the action exactly as recorded; the other columns are checked copies for querying.
create table readiness_review.actions (
  session_id text not null references readiness_review.sessions (session_id) on delete cascade,
  seq integer not null check (seq >= 0),
  action_id text not null check (action_id ~ '^[A-Za-z0-9-]{8,64}$'),
  type text not null check (type in (
    'respondent.serve', 'respondent.answer', 'respondent.assignArea', 'respondent.correct', 'respondent.stop',
    'respondent.resume', 'owner.serve', 'owner.answer', 'organisation.sendToOwners', 'reviewer.evidence', 'reviewer.review'
  )),
  actor text not null check (actor in ('respondent', 'owner', 'organisation', 'reviewer', 'system')),
  at timestamptz not null,
  question_id text,
  action jsonb not null check (jsonb_typeof(action) = 'object'),
  stored_at timestamptz not null default now(),
  primary key (session_id, seq),
  unique (session_id, action_id),
  check (
    action ->> 'id' = action_id and (action ->> 'seq')::integer = seq and action ->> 'type' = type
    and action ->> 'actor' = actor and (action ->> 'at')::timestamptz = at
    and question_id is not distinct from (action ->> 'q')
  )
);
create index actions_question_idx on readiness_review.actions (session_id, question_id) where question_id is not null;

-- Report runs: which report engine produced what from which input. The input is identified by its digest and by the
-- log position it was built at (action_count), so any report can be rebuilt from the log and checked.
create table readiness_review.report_runs (
  run_id uuid primary key default gen_random_uuid(),
  session_id text not null references readiness_review.sessions (session_id) on delete cascade,
  input_contract text not null,
  input_version text not null,
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  log_digest text not null check (log_digest ~ '^[0-9a-f]{64}$'),
  action_count integer not null check (action_count >= 0),
  ruleset_key text references readiness_review.rulesets (ruleset_key),
  report_engine text not null,
  report_engine_version text not null,
  status text not null check (status in ('generated', 'failed')),
  output jsonb,
  output_digest text check (output_digest ~ '^[0-9a-f]{64}$'),
  failure text,
  created_by text not null,
  created_at timestamptz not null default now(),
  check ((status = 'generated') = (output is not null and output_digest is not null)),
  check ((status = 'failed') = (failure is not null))
);
create index report_runs_session_idx on readiness_review.report_runs (session_id, created_at desc);
create index sessions_ruleset_idx on readiness_review.sessions (ruleset_key);
create index report_runs_ruleset_idx on readiness_review.report_runs (ruleset_key);

-- Immutability. Actions, links, rulesets and report runs are never updated. Sessions change only their action count
-- and last action time, and only through review_append_actions. Deletion is possible only inside review_purge_session.
create function readiness_review.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('readiness_review.purge', true) = 'on' then
    return old;
  end if;
  raise exception 'readiness_review.% is append-only', tg_table_name using errcode = 'RV405';
end
$$;

create function readiness_review.guard_session() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('readiness_review.purge', true) = 'on' then
      return old;
    end if;
    raise exception 'review sessions are removed only by review_purge_session' using errcode = 'RV405';
  end if;
  if (new.session_id, new.created_at_iso, new.created_at, new.organisation_label, new.fictional, new.contract_version,
      new.engine_sha256, new.bank_version, new.ruleset_key, new.link_tokens, new.stored_at)
     is distinct from
     (old.session_id, old.created_at_iso, old.created_at, old.organisation_label, old.fictional, old.contract_version,
      old.engine_sha256, old.bank_version, old.ruleset_key, old.link_tokens, old.stored_at) then
    raise exception 'only the action count and last action time of a review session can change' using errcode = 'RV405';
  end if;
  if new.action_count < old.action_count then
    raise exception 'the action count of a review session never decreases' using errcode = 'RV405';
  end if;
  return new;
end
$$;

create trigger actions_append_only before update or delete on readiness_review.actions
  for each row execute function readiness_review.forbid_change();
create trigger links_append_only before update or delete on readiness_review.links
  for each row execute function readiness_review.forbid_change();
create trigger rulesets_append_only before update or delete on readiness_review.rulesets
  for each row execute function readiness_review.forbid_change();
create trigger report_runs_append_only before update or delete on readiness_review.report_runs
  for each row execute function readiness_review.forbid_change();
create trigger sessions_guard before update or delete on readiness_review.sessions
  for each row execute function readiness_review.guard_session();

alter table readiness_review.rulesets enable row level security;
alter table readiness_review.sessions enable row level security;
alter table readiness_review.links enable row level security;
alter table readiness_review.actions enable row level security;
alter table readiness_review.report_runs enable row level security;
revoke all on all tables in schema readiness_review from public, anon, authenticated, service_role;
revoke all on function readiness_review.forbid_change() from public, anon, authenticated;
revoke all on function readiness_review.guard_session() from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------------ functions
-- Errors the application maps (src/lib/readiness-review/database-store.ts):
--   RV404 not found; RV409 the log changed before this save (sequence conflict); RV422 invalid input;
--   RV405 a change the store never allows; 23505 a generated identifier or link already exists.

-- Creates a session, its ruleset (if new), its role links and its first actions in one transaction.
create function public.review_create_session(p_session jsonb, p_ruleset jsonb, p_ruleset_key text, p_links jsonb, p_actions jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_session_id text := p_session ->> 'sessionId';
  v_existing jsonb;
  v_count integer;
begin
  if jsonb_typeof(p_session) is distinct from 'object' or jsonb_typeof(p_links) is distinct from 'array'
     or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_links) = 0 then
    raise exception 'invalid session input' using errcode = 'RV422';
  end if;
  if p_ruleset is not null then
    insert into readiness_review.rulesets (ruleset_key, ruleset, contract_name, contract_version, action_schema,
      engine_sha256, bank_version, bank_sha256, coverage_sha256)
    values (p_ruleset_key, p_ruleset, p_ruleset #>> '{contract,name}', p_ruleset #>> '{contract,version}',
      p_ruleset #>> '{contract,actionSchema}', p_ruleset #>> '{engine,sha256}', p_ruleset #>> '{bank,version}',
      p_ruleset #>> '{bank,sha256}', p_ruleset #>> '{coverage,sha256}')
    on conflict (ruleset_key) do nothing;
    select r.ruleset into v_existing from readiness_review.rulesets r where r.ruleset_key = p_ruleset_key;
    if v_existing is distinct from p_ruleset then
      raise exception 'a different ruleset is stored under this key' using errcode = 'RV422';
    end if;
  elsif p_ruleset_key is not null then
    raise exception 'a ruleset key was given without a ruleset' using errcode = 'RV422';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_actions) with ordinality as t(a, ord) where (a ->> 'seq')::integer <> ord - 1
  ) then
    raise exception 'actions are not numbered from 0 without gaps' using errcode = 'RV422';
  end if;
  v_count := jsonb_array_length(p_actions);
  insert into readiness_review.sessions (session_id, created_at_iso, created_at, organisation_label, fictional,
    contract_version, engine_sha256, bank_version, ruleset_key, link_tokens, action_count, last_action_at)
  values (v_session_id, p_session ->> 'createdAt', (p_session ->> 'createdAt')::timestamptz,
    p_session ->> 'organisationLabel', (p_session ->> 'fictional')::boolean, p_session ->> 'contractVersion',
    p_session ->> 'engineSha256', p_session ->> 'bankVersion', p_ruleset_key, p_session -> 'tokens', v_count,
    (select max((a ->> 'at')::timestamptz) from jsonb_array_elements(p_actions) as t(a)));
  insert into readiness_review.links (token_sha256, session_id, role, fn)
  select l ->> 'tokenSha256', v_session_id, l ->> 'role', l ->> 'fn' from jsonb_array_elements(p_links) as t(l);
  insert into readiness_review.actions (session_id, seq, action_id, type, actor, at, question_id, action)
  select v_session_id, (a ->> 'seq')::integer, a ->> 'id', a ->> 'type', a ->> 'actor', (a ->> 'at')::timestamptz, a ->> 'q', a
  from jsonb_array_elements(p_actions) as t(a);
  return v_count;
end
$$;

-- Appends actions only if the log still has p_expected_length actions; returns the new length.
create function public.review_append_actions(p_session_id text, p_expected_length integer, p_actions jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_added integer;
begin
  if jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions) = 0 then
    raise exception 'nothing to append' using errcode = 'RV422';
  end if;
  select s.action_count into v_count from readiness_review.sessions s where s.session_id = p_session_id for update;
  if not found then
    raise exception 'review session not found' using errcode = 'RV404';
  end if;
  if v_count <> p_expected_length then
    raise exception 'the session changed before this save' using errcode = 'RV409';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_actions) with ordinality as t(a, ord)
    where (a ->> 'seq')::integer <> p_expected_length + ord - 1
  ) then
    raise exception 'actions do not continue the log without gaps' using errcode = 'RV422';
  end if;
  v_added := jsonb_array_length(p_actions);
  insert into readiness_review.actions (session_id, seq, action_id, type, actor, at, question_id, action)
  select p_session_id, (a ->> 'seq')::integer, a ->> 'id', a ->> 'type', a ->> 'actor', (a ->> 'at')::timestamptz, a ->> 'q', a
  from jsonb_array_elements(p_actions) as t(a);
  update readiness_review.sessions s
  set action_count = v_count + v_added,
      last_action_at = greatest(s.last_action_at, (select max((a ->> 'at')::timestamptz) from jsonb_array_elements(p_actions) as t(a)))
  where s.session_id = p_session_id;
  return v_count + v_added;
end
$$;

-- The stored record in the application's shape (SessionRecord), actions in log order; null if absent.
create function public.review_load_session(p_session_id text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
      'sessionId', s.session_id,
      'createdAt', s.created_at_iso,
      'contractVersion', s.contract_version,
      'engineSha256', s.engine_sha256,
      'bankVersion', s.bank_version,
      'organisationLabel', s.organisation_label,
      'fictional', s.fictional,
      'tokens', s.link_tokens
    ))
    || case when r.ruleset is null then '{}'::jsonb else jsonb_build_object('ruleset', r.ruleset) end
    || jsonb_build_object('actions', coalesce(
         (select jsonb_agg(a.action order by a.seq) from readiness_review.actions a where a.session_id = s.session_id),
         '[]'::jsonb))
  from readiness_review.sessions s
  left join readiness_review.rulesets r on r.ruleset_key = s.ruleset_key
  where s.session_id = p_session_id
$$;

create function public.review_find_link(p_token_sha256 text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('sessionId', l.session_id, 'role', l.role, 'fn', l.fn))
  from readiness_review.links l where l.token_sha256 = p_token_sha256
$$;

create function public.review_action_count(p_session_id text)
returns integer
language sql stable security definer set search_path = '' as $$
  select s.action_count from readiness_review.sessions s where s.session_id = p_session_id
$$;

-- Records a report run. The input must have been built at a log position the session has reached.
create function public.review_record_report_run(p_run jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_ruleset text;
  v_run uuid;
begin
  select s.action_count, s.ruleset_key into v_count, v_ruleset
  from readiness_review.sessions s where s.session_id = p_run ->> 'sessionId';
  if not found then
    raise exception 'review session not found' using errcode = 'RV404';
  end if;
  if (p_run ->> 'actionCount')::integer > v_count then
    raise exception 'the report input is ahead of the stored log' using errcode = 'RV422';
  end if;
  insert into readiness_review.report_runs (session_id, input_contract, input_version, input_digest, log_digest,
    action_count, ruleset_key, report_engine, report_engine_version, status, output, output_digest, failure, created_by)
  values (p_run ->> 'sessionId', p_run ->> 'inputContract', p_run ->> 'inputVersion', p_run ->> 'inputDigest',
    p_run ->> 'logDigest', (p_run ->> 'actionCount')::integer, v_ruleset, p_run ->> 'reportEngine',
    p_run ->> 'reportEngineVersion', p_run ->> 'status', p_run -> 'output', p_run ->> 'outputDigest',
    p_run ->> 'failure', p_run ->> 'createdBy')
  returning run_id into v_run;
  return v_run;
end
$$;

-- Report runs for a session, newest first, without their outputs.
create function public.review_report_runs(p_session_id text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'runId', r.run_id, 'inputContract', r.input_contract, 'inputVersion', r.input_version, 'inputDigest', r.input_digest,
    'logDigest', r.log_digest, 'actionCount', r.action_count, 'reportEngine', r.report_engine,
    'reportEngineVersion', r.report_engine_version, 'status', r.status, 'outputDigest', r.output_digest,
    'failure', r.failure, 'createdBy', r.created_by, 'createdAt', r.created_at)) order by r.created_at desc), '[]'::jsonb)
  from readiness_review.report_runs r where r.session_id = p_session_id
$$;

-- Retention: removes a session with its links, log and report runs. The only path by which anything is deleted.
create function public.review_purge_session(p_session_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_removed integer;
begin
  perform set_config('readiness_review.purge', 'on', true);
  delete from readiness_review.sessions s where s.session_id = p_session_id;
  get diagnostics v_removed = row_count;
  perform set_config('readiness_review.purge', 'off', true);
  return v_removed > 0;
end
$$;

revoke all on function public.review_create_session(jsonb, jsonb, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.review_append_actions(text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.review_load_session(text) from public, anon, authenticated;
revoke all on function public.review_find_link(text) from public, anon, authenticated;
revoke all on function public.review_action_count(text) from public, anon, authenticated;
revoke all on function public.review_record_report_run(jsonb) from public, anon, authenticated;
revoke all on function public.review_report_runs(text) from public, anon, authenticated;
revoke all on function public.review_purge_session(text) from public, anon, authenticated;
grant execute on function public.review_create_session(jsonb, jsonb, text, jsonb, jsonb) to service_role;
grant execute on function public.review_append_actions(text, integer, jsonb) to service_role;
grant execute on function public.review_load_session(text) to service_role;
grant execute on function public.review_find_link(text) to service_role;
grant execute on function public.review_action_count(text) to service_role;
grant execute on function public.review_record_report_run(jsonb) to service_role;
grant execute on function public.review_report_runs(text) to service_role;
grant execute on function public.review_purge_session(text) to service_role;
