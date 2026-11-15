-- The person who answers a review (owner decision, 15 November 2026): full name, work email and role are collected on the
-- start form, so MK can follow up a review that stalls, is told when one starts and finishes, and so the report order
-- form is pre-filled. Kept apart from the append-only answer log: a contact can be corrected or removed without
-- touching the answers, and purging a session removes it with the session.
--
-- Service role only, like the rest of the review store. Notification markers make each MK notification send once:
-- "started" and "completed" once per session, "stalled" once per period of inactivity (a later answer re-arms it).
create table readiness_review.session_contacts (
  session_id text primary key references readiness_review.sessions (session_id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role_title text check (role_title is null or char_length(role_title) <= 120),
  created_at timestamptz not null default now(),
  started_notified_at timestamptz,
  completed_notified_at timestamptz,
  stalled_notified_at timestamptz,
  stalled_for_action_count integer
);
alter table readiness_review.session_contacts enable row level security;
revoke all on table readiness_review.session_contacts from public, anon, authenticated, service_role;

-- Records the contact for a new session, once.
create function public.review_record_session_contact(p jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into readiness_review.session_contacts (session_id, full_name, email, role_title)
  values (p ->> 'sessionId', p ->> 'fullName', lower(p ->> 'email'), nullif(p ->> 'roleTitle', ''))
  on conflict (session_id) do nothing;
  return found;
end
$$;

create function public.review_session_contact(p_session_id text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('fullName', c.full_name, 'email', c.email, 'roleTitle', c.role_title,
    'organisationLabel', s.organisation_label, 'fictional', s.fictional, 'actionCount', s.action_count,
    'lastActionAt', s.last_action_at, 'createdAt', s.created_at,
    'bound', exists (select 1 from readiness_review.commercial_bindings b where b.session_id = s.session_id))
  from readiness_review.session_contacts c join readiness_review.sessions s on s.session_id = c.session_id
  where c.session_id = p_session_id
$$;

-- Claims a notification before it is sent; returns false when it was already sent (or claimed). A failed send releases
-- the claim so a later attempt can send it.
create function public.review_claim_contact_notification(p_session_id text, p_kind text, p_action_count integer default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_kind = 'started' then
    update readiness_review.session_contacts set started_notified_at = now() where session_id = p_session_id and started_notified_at is null;
  elsif p_kind = 'completed' then
    update readiness_review.session_contacts set completed_notified_at = now() where session_id = p_session_id and completed_notified_at is null;
  elsif p_kind = 'stalled' then
    update readiness_review.session_contacts set stalled_notified_at = now(), stalled_for_action_count = p_action_count
    where session_id = p_session_id and stalled_for_action_count is distinct from p_action_count;
  else
    raise exception 'unknown notification kind' using errcode = 'RV422';
  end if;
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$$;

create function public.review_release_contact_notification(p_session_id text, p_kind text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'started' then
    update readiness_review.session_contacts set started_notified_at = null where session_id = p_session_id;
  elsif p_kind = 'completed' then
    update readiness_review.session_contacts set completed_notified_at = null where session_id = p_session_id;
  elsif p_kind = 'stalled' then
    update readiness_review.session_contacts set stalled_notified_at = null, stalled_for_action_count = null where session_id = p_session_id;
  end if;
end
$$;

-- Real reviews with a contact that have had no activity since the cutoff, are not finished (no completion notified)
-- and have not been ordered from, and whose current period of inactivity has not been notified yet.
create function public.review_stalled_contacts(p_inactive_before timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sessionId', s.session_id, 'organisationLabel', s.organisation_label,
      'fullName', c.full_name, 'email', c.email, 'roleTitle', c.role_title, 'actionCount', s.action_count,
      'lastActivityAt', coalesce(s.last_action_at, s.created_at)) order by coalesce(s.last_action_at, s.created_at)), '[]'::jsonb)
  from readiness_review.session_contacts c join readiness_review.sessions s on s.session_id = c.session_id
  where not s.fictional
    and coalesce(s.last_action_at, s.created_at) < p_inactive_before
    and c.completed_notified_at is null
    and c.stalled_for_action_count is distinct from s.action_count
    and not exists (select 1 from readiness_review.commercial_bindings b where b.session_id = s.session_id)
$$;

revoke all on function public.review_record_session_contact(jsonb) from public, anon, authenticated;
revoke all on function public.review_session_contact(text) from public, anon, authenticated;
revoke all on function public.review_claim_contact_notification(text, text, integer) from public, anon, authenticated;
revoke all on function public.review_release_contact_notification(text, text) from public, anon, authenticated;
revoke all on function public.review_stalled_contacts(timestamptz) from public, anon, authenticated;
grant execute on function public.review_record_session_contact(jsonb) to service_role;
grant execute on function public.review_session_contact(text) to service_role;
grant execute on function public.review_claim_contact_notification(text, text, integer) to service_role;
grant execute on function public.review_release_contact_notification(text, text) to service_role;
grant execute on function public.review_stalled_contacts(timestamptz) to service_role;
