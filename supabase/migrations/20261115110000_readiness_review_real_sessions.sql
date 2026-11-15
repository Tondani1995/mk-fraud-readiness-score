-- Real organisations in production mode (release step, 15 November 2026). Until now every review session had to be
-- fictional (check constraint sessions_fictional_check). A real session is now accepted only on a database whose own
-- switch is set to production (readiness_review.environment_flags ('commercial_bridge', 'production'), set by hand at
-- release, never by a migration). Every other database, including the isolated test database, stays fictional-only.
alter table readiness_review.sessions drop constraint sessions_fictional_check;

create function readiness_review.enforce_session_fictional()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fictional then
    return new;
  end if;
  if exists (select 1 from readiness_review.environment_flags where flag_key = 'commercial_bridge' and flag_value = 'production') then
    return new;
  end if;
  raise exception 'review_real_session_refused' using errcode = 'RV403';
end;
$$;

create trigger sessions_fictional_unless_production before insert on readiness_review.sessions
  for each row execute function readiness_review.enforce_session_fictional();

revoke all on function readiness_review.enforce_session_fictional() from public, anon, authenticated;
