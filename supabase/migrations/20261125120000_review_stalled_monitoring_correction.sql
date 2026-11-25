-- Fraud Readiness review: stalled-review monitoring correction (owner direction, 25 November 2026).
--
-- Root cause: the review's stalled pass rode on the adaptive hourly job but never read the shared stalled-lead control,
-- so it applied the code default of 24 hours instead of the configured 2 hours, and it measured inactivity from every
-- logged action, including system "serve" events, rather than from the respondent's own activity. Completion was only
-- known through the completion-notification marker, so a failed completion email left a finished review eligible for a
-- stalled notice.
--
-- This migration:
--   1. records completion durably (completed_at), independently of any notification;
--   2. identifies a stalled episode by the respondent's last genuine activity (stalled_for_activity_at), so a resumed
--      review re-arms exactly one further notice and a repeated run never re-notifies the same episode;
--   3. rebuilds review_stalled_contacts on respondent activity only, excluding completed, ordered and fictional reviews,
--      and reports meaningful progress (distinct questions answered) instead of raw action counts;
--   4. adds record-after-success and completion functions; delivery itself now goes through public.email_events;
--   5. backfills both markers and sets a go-live boundary so historical notifications are never sent automatically;
--   6. runs the stalled-lead job every 15 minutes and seeds its heartbeat row.

alter table readiness_review.session_contacts
  add column if not exists completed_at timestamptz,
  add column if not exists stalled_for_activity_at timestamptz;

comment on column readiness_review.session_contacts.completed_at is
  'When the respondent finished the interview, recorded at completion and independent of the completion notification.';
comment on column readiness_review.session_contacts.stalled_for_activity_at is
  'The respondent''s last genuine activity when the current stalled episode was notified; a later answer starts a new episode.';

-- 1. Completion, backfilled from the evidence that exists: a sent completion notice or a commercial binding of a
--    complete interview.
update readiness_review.session_contacts c
set completed_at = coalesce(c.completed_notified_at, b.bound_at)
from readiness_review.sessions s
left join readiness_review.commercial_bindings b on b.session_id = s.session_id and b.interview_complete
where s.session_id = c.session_id
  and c.completed_at is null
  and (c.completed_notified_at is not null or b.session_id is not null);

-- 2. Episodes already notified under the old marker keep their notice: if nothing changed since the notice
--    (same action count), the episode is the respondent's current last activity.
update readiness_review.session_contacts c
set stalled_for_activity_at = coalesce(
  (select max(a.at) from readiness_review.actions a where a.session_id = c.session_id and a.actor = 'respondent'),
  s.created_at)
from readiness_review.sessions s
where s.session_id = c.session_id
  and c.stalled_notified_at is not null
  and c.stalled_for_activity_at is null
  and c.stalled_for_action_count is not distinct from s.action_count;

-- 3. Stalled candidates: genuine respondent inactivity only.
create or replace function public.review_stalled_contacts(p_inactive_before timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with activity as (
    select s.session_id,
      coalesce(max(a.at) filter (where a.actor = 'respondent'), s.created_at) as last_respondent_activity_at,
      count(distinct a.question_id) filter (where a.actor = 'respondent' and a.type = 'respondent.answer') as answers_recorded
    from readiness_review.sessions s
    left join readiness_review.actions a on a.session_id = s.session_id
    where not s.fictional
    group by s.session_id, s.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'sessionId', s.session_id,
      'organisationLabel', s.organisation_label,
      'fullName', c.full_name,
      'email', c.email,
      'roleTitle', c.role_title,
      'actionCount', s.action_count,
      'answersRecorded', x.answers_recorded,
      'startedAt', s.created_at,
      'lastActivityAt', x.last_respondent_activity_at)
    order by x.last_respondent_activity_at), '[]'::jsonb)
  from readiness_review.session_contacts c
  join readiness_review.sessions s on s.session_id = c.session_id
  join activity x on x.session_id = s.session_id
  where not s.fictional
    and c.completed_at is null
    and c.completed_notified_at is null
    and x.last_respondent_activity_at < p_inactive_before
    and c.stalled_for_activity_at is distinct from x.last_respondent_activity_at
    and not exists (select 1 from readiness_review.commercial_bindings b where b.session_id = s.session_id)
$$;

-- The session contact, now with progress and completion for notification content.
create or replace function public.review_session_contact(p_session_id text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('fullName', c.full_name, 'email', c.email, 'roleTitle', c.role_title,
    'organisationLabel', s.organisation_label, 'fictional', s.fictional, 'actionCount', s.action_count,
    'lastActionAt', s.last_action_at, 'createdAt', s.created_at,
    'bound', exists (select 1 from readiness_review.commercial_bindings b where b.session_id = s.session_id),
    'completedAt', c.completed_at,
    'completedNotifiedAt', c.completed_notified_at,
    'answersRecorded', (select count(distinct a.question_id) from readiness_review.actions a
      where a.session_id = s.session_id and a.actor = 'respondent' and a.type = 'respondent.answer'),
    'lastRespondentActivityAt', (select max(a.at) from readiness_review.actions a
      where a.session_id = s.session_id and a.actor = 'respondent'))
  from readiness_review.session_contacts c join readiness_review.sessions s on s.session_id = c.session_id
  where c.session_id = p_session_id
$$;

-- 4a. Records that the respondent finished, once. Returns true when this call recorded it.
create function public.review_mark_session_completed(p_session_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update readiness_review.session_contacts set completed_at = now()
  where session_id = p_session_id and completed_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$$;

-- 4b. Records a notification after it was processed successfully. Delivery idempotency lives in public.email_events
--     (one row per dedupe key); this marker is the review's own summary. For "stalled", p_activity_at identifies the
--     episode, so recording the same episode twice is a no-op and a new episode replaces the old one.
create function public.review_record_contact_notified(p_session_id text, p_kind text, p_activity_at timestamptz default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_kind = 'started' then
    update readiness_review.session_contacts set started_notified_at = now()
    where session_id = p_session_id and started_notified_at is null;
  elsif p_kind = 'completed' then
    update readiness_review.session_contacts set completed_notified_at = now(), completed_at = coalesce(completed_at, now())
    where session_id = p_session_id and completed_notified_at is null;
  elsif p_kind = 'stalled' then
    if p_activity_at is null then
      raise exception 'stalled notification needs the episode activity time' using errcode = 'RV422';
    end if;
    update readiness_review.session_contacts c
    set stalled_notified_at = now(), stalled_for_activity_at = p_activity_at,
      stalled_for_action_count = (select s.action_count from readiness_review.sessions s where s.session_id = c.session_id)
    where c.session_id = p_session_id and c.stalled_for_activity_at is distinct from p_activity_at;
  else
    raise exception 'unknown notification kind' using errcode = 'RV422';
  end if;
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$$;

-- 4c. Completed real reviews whose completion notice has not been recorded: the monitor retries these.
create function public.review_completions_pending_notification()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('sessionId', c.session_id, 'completedAt', c.completed_at) order by c.completed_at), '[]'::jsonb)
  from readiness_review.session_contacts c
  join readiness_review.sessions s on s.session_id = c.session_id
  where not s.fictional
    and c.completed_at is not null
    and c.completed_notified_at is null
$$;

revoke all on function public.review_mark_session_completed(text) from public, anon, authenticated;
revoke all on function public.review_record_contact_notified(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.review_completions_pending_notification() from public, anon, authenticated;
revoke all on function public.review_stalled_contacts(timestamptz) from public, anon, authenticated;
revoke all on function public.review_session_contact(text) from public, anon, authenticated;
grant execute on function public.review_mark_session_completed(text) to service_role;
grant execute on function public.review_record_contact_notified(text, text, timestamptz) to service_role;
grant execute on function public.review_completions_pending_notification() to service_role;
grant execute on function public.review_stalled_contacts(timestamptz) to service_role;
grant execute on function public.review_session_contact(text) to service_role;

-- 4d. Go-live boundary. Automatic review notices cover only episodes that become stalled after this migration; episodes
--     that were already stalled before it are left to the owner-approved recovery operation
--     (scripts/review-stalled-recovery.mjs), so deploying the correction never replays historical notifications. Kept in
--     the review's own flags table: the shared stalled-lead control in app_settings is guarded and has a fixed shape.
insert into readiness_review.environment_flags (flag_key, flag_value, set_at, set_by)
values ('stalled_notifications_from', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), now(),
  'migration 20261125120000 (stalled-review monitoring correction)')
on conflict (flag_key) do nothing;

create function public.review_stalled_notifications_from()
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select f.flag_value::timestamptz from readiness_review.environment_flags f where f.flag_key = 'stalled_notifications_from'
$$;
revoke all on function public.review_stalled_notifications_from() from public, anon, authenticated;
grant execute on function public.review_stalled_notifications_from() to service_role;

-- 5. Heartbeat row for the stalled-lead monitor, so the production monitor can tell "not yet run" from "stopped".
insert into public.production_monitor_heartbeats (monitor_name, status, run_count, consecutive_failures, safe_summary_json, updated_at)
values ('stalled-lead-monitor', 'never_run', 0, 0, '{}'::jsonb, now())
on conflict (monitor_name) do nothing;

-- 6. Every 15 minutes instead of hourly. Only where the job exists (isolated test databases have no pg_cron jobs).
do $$
declare v_job bigint;
begin
  -- Guarded on the pg_cron function itself: migration replays use databases without pg_cron or with a stub schema.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'cron' and p.proname = 'alter_job')
     and to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = $1' into v_job using 'v12-stalled-lead-monitor';
    if v_job is not null then
      execute 'select cron.alter_job(job_id := $1, schedule := $2)' using v_job, '*/15 * * * *';
    end if;
  end if;
end
$$;
