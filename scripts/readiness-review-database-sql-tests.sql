-- Database-level tests for the readiness review store (supabase/migrations/20261111100000_readiness_review_store.sql).
-- Run as the database owner on an isolated project only, never on the shared preview/production project (B2). Every
-- session it creates is fictional and is purged before it returns. Returns one row per check: test, ok, detail.
create or replace function pg_temp.review_store_sql_tests()
returns table (test text, ok boolean, detail text)
language plpgsql as $$
declare
  rs jsonb := '{"contract":{"name":"mk-readiness-review","version":"1.3.0","actionSchema":"mk-readiness-review/actions/1"},"engine":{"build":"1.5","sha256":"7f8ca08f2626108919ef97d664d6b752fe91ae686fdd44639d1e79be5d9395ba"},"bank":{"version":"1.3-review","sha256":"95abc50e743f428e5829c042abc1823c517075b77204ffdf0e538aa5fe5f4419","digest":"80eac8fc77fbc1e90e563c374e2d458918f55f24037eaaa588b4cbb8b8ef21c0"},"coverage":{"version":"1.3-review","sha256":"9081b069f1f15dfea35afe001da69d8636345492810b36b56b30624a302c77a7","digest":"c47f7b42cefa157c851f720273f156d419bf78da6f04a70b8542956c5e2d29e8"}}';
  rk text := repeat('a', 64);
  sid text := 'sqltest' || substr(md5(random()::text), 1, 16);
  sess jsonb;
  links jsonb;
  acts jsonb;
  loaded jsonb;
  n integer;
  st text;
  run uuid;
  b boolean;
  h1 text := md5(random()::text) || md5(random()::text);
  h2 text := md5(random()::text) || md5(random()::text);
begin
  sess := jsonb_build_object('sessionId', sid, 'createdAt', '2026-11-11T07:30:00.123Z', 'contractVersion', '1.3.0',
    'engineSha256', rs #>> '{engine,sha256}', 'bankVersion', '1.3-review', 'organisationLabel', 'Fictional SQL Test Co',
    'fictional', true, 'tokens', jsonb_build_object('respondent', 'r-token', 'owners', jsonb_build_object('Finance', 'f-token')));
  links := jsonb_build_array(jsonb_build_object('tokenSha256', h1, 'role', 'respondent'), jsonb_build_object('tokenSha256', h2, 'role', 'owner', 'fn', 'Finance'));
  acts := jsonb_build_array(
    jsonb_build_object('type', 'respondent.serve', 'q', 'PR-01', 'id', 'aaaaaaaa-0000', 'seq', 0, 'at', '2026-11-11T07:30:00.123Z', 'actor', 'system'),
    jsonb_build_object('type', 'respondent.answer', 'q', 'PR-01', 'value', 'mid', 'id', 'aaaaaaaa-0001', 'seq', 1, 'at', '2026-11-11T07:30:01.456Z', 'actor', 'respondent'));

  -- S-01 create and load
  n := public.review_create_session(sess, rs, rk, links, acts);
  loaded := public.review_load_session(sid);
  return query select 'S-01 create returns the log length', n = 2, n::text;
  return query select 'S-01 load returns the exact createdAt text', loaded ->> 'createdAt' = '2026-11-11T07:30:00.123Z', loaded ->> 'createdAt';
  return query select 'S-01 load returns the actions in order, unchanged', loaded -> 'actions' = acts, jsonb_array_length(loaded -> 'actions')::text;
  return query select 'S-01 load returns the ruleset', loaded -> 'ruleset' = rs, null::text;

  -- S-02 append rules
  n := public.review_append_actions(sid, 2, jsonb_build_array(jsonb_build_object('type', 'respondent.serve', 'q', null, 'id', 'aaaaaaaa-0002', 'seq', 2, 'at', '2026-11-11T07:30:02.000Z', 'actor', 'system')));
  return query select 'S-02 append at the expected length succeeds', n = 3, n::text;
  return query select 'S-02 a null question is kept as null, not dropped', (public.review_load_session(sid) -> 'actions' -> 2) ? 'q' and (public.review_load_session(sid) -> 'actions' -> 2 -> 'q') = 'null'::jsonb, (public.review_load_session(sid) -> 'actions' -> 2)::text;
  begin
    perform public.review_append_actions(sid, 2, jsonb_build_array(jsonb_build_object('type', 'respondent.stop', 'id', 'aaaaaaaa-0003', 'seq', 2, 'at', '2026-11-11T07:30:03.000Z', 'actor', 'respondent')));
    return query select 'S-02 stale expected length is a conflict', false, 'accepted';
  exception when others then
    return query select 'S-02 stale expected length is a conflict', sqlstate = 'RV409', sqlstate;
  end;
  begin
    perform public.review_append_actions(sid, 3, jsonb_build_array(jsonb_build_object('type', 'respondent.stop', 'id', 'aaaaaaaa-0003', 'seq', 4, 'at', '2026-11-11T07:30:03.000Z', 'actor', 'respondent')));
    return query select 'S-02 a gap in the sequence is refused', false, 'accepted';
  exception when others then
    return query select 'S-02 a gap in the sequence is refused', sqlstate = 'RV422', sqlstate;
  end;
  begin
    perform public.review_append_actions(sid, 3, '[]'::jsonb);
    return query select 'S-02 an empty append is refused', false, 'accepted';
  exception when others then
    return query select 'S-02 an empty append is refused', sqlstate = 'RV422', sqlstate;
  end;
  begin
    perform public.review_append_actions(sid, 3, jsonb_build_array(jsonb_build_object('type', 'respondent.stop', 'id', 'aaaaaaaa-0001', 'seq', 3, 'at', '2026-11-11T07:30:03.000Z', 'actor', 'respondent')));
    return query select 'S-02 a repeated action id is refused', false, 'accepted';
  exception when others then
    return query select 'S-02 a repeated action id is refused', sqlstate = '23505', sqlstate;
  end;
  begin
    perform public.review_append_actions('nosuchsession', 0, acts);
    return query select 'S-02 an unknown session is not found', false, 'accepted';
  exception when others then
    return query select 'S-02 an unknown session is not found', sqlstate = 'RV404', sqlstate;
  end;
  begin
    perform public.review_append_actions(sid, 3, jsonb_build_array(jsonb_build_object('type', 'respondent.delete', 'id', 'aaaaaaaa-0003', 'seq', 3, 'at', '2026-11-11T07:30:03.000Z', 'actor', 'respondent')));
    return query select 'S-02 an action type outside schema 1 is refused', false, 'accepted';
  exception when others then
    return query select 'S-02 an action type outside schema 1 is refused', sqlstate = '23514', sqlstate;
  end;
  return query select 'S-02 failed appends changed nothing', public.review_action_count(sid) = 3 and jsonb_array_length(public.review_load_session(sid) -> 'actions') = 3, public.review_action_count(sid)::text;

  -- S-03 immutability
  begin
    update readiness_review.actions set action = action || '{"value":"high"}' where session_id = sid and seq = 1;
    return query select 'S-03 an action cannot be changed', false, 'changed';
  exception when others then
    return query select 'S-03 an action cannot be changed', sqlstate = 'RV405', sqlstate;
  end;
  begin
    delete from readiness_review.actions where session_id = sid and seq = 2;
    return query select 'S-03 an action cannot be deleted', false, 'deleted';
  exception when others then
    return query select 'S-03 an action cannot be deleted', sqlstate = 'RV405', sqlstate;
  end;
  begin
    update readiness_review.sessions set organisation_label = 'Changed' where session_id = sid;
    return query select 'S-03 a session''s identity cannot be changed', false, 'changed';
  exception when others then
    return query select 'S-03 a session''s identity cannot be changed', sqlstate = 'RV405', sqlstate;
  end;
  begin
    update readiness_review.sessions set action_count = 1 where session_id = sid;
    return query select 'S-03 the action count never decreases', false, 'decreased';
  exception when others then
    return query select 'S-03 the action count never decreases', sqlstate = 'RV405', sqlstate;
  end;
  begin
    delete from readiness_review.sessions where session_id = sid;
    return query select 'S-03 a session is not deleted outside purge', false, 'deleted';
  exception when others then
    return query select 'S-03 a session is not deleted outside purge', sqlstate = 'RV405', sqlstate;
  end;
  begin
    update readiness_review.links set role = 'reviewer' where token_sha256 = h1;
    return query select 'S-03 a link cannot be changed', false, 'changed';
  exception when others then
    return query select 'S-03 a link cannot be changed', sqlstate = 'RV405', sqlstate;
  end;
  begin
    update readiness_review.rulesets set bank_version = 'x' where ruleset_key = rk;
    return query select 'S-03 a ruleset cannot be changed', false, 'changed';
  exception when others then
    return query select 'S-03 a ruleset cannot be changed', sqlstate = 'RV405', sqlstate;
  end;

  -- S-04 creation is all or nothing, and only fictional sessions are stored
  begin
    perform public.review_create_session(jsonb_set(sess, '{sessionId}', to_jsonb(sid || 'b')), rs, rk,
      jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'respondent'), jsonb_build_object('tokenSha256', h1, 'role', 'management')), acts);
    return query select 'S-04 a link that already exists stops creation', false, 'created';
  exception when others then
    return query select 'S-04 a link that already exists stops creation', sqlstate = '23505' and public.review_load_session(sid || 'b') is null, sqlstate;
  end;
  begin
    perform public.review_create_session(jsonb_set(sess, '{sessionId}', to_jsonb(sid || 'c')), rs, rk, jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'respondent')),
      jsonb_build_array(acts -> 0, jsonb_set(acts -> 1, '{seq}', '5')));
    return query select 'S-04 a numbering gap stops creation', false, 'created';
  exception when others then
    return query select 'S-04 a numbering gap stops creation', sqlstate = 'RV422' and public.review_load_session(sid || 'c') is null, sqlstate;
  end;
  begin
    perform public.review_create_session(jsonb_set(jsonb_set(sess, '{sessionId}', to_jsonb(sid || 'd')), '{fictional}', 'false'), rs, rk,
      jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'respondent')), acts);
    return query select 'S-04 a session not marked fictional is refused', false, 'created';
  exception when others then
    return query select 'S-04 a session not marked fictional is refused', sqlstate = '23514' and public.review_load_session(sid || 'd') is null, sqlstate;
  end;
  begin
    perform public.review_create_session(jsonb_set(sess, '{sessionId}', to_jsonb(sid || 'e')), jsonb_set(rs, '{bank,version}', '"9.9"'), rk,
      jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'respondent')), acts);
    return query select 'S-04 a different ruleset under a stored key is refused', false, 'created';
  exception when others then
    return query select 'S-04 a different ruleset under a stored key is refused', sqlstate = 'RV422' and public.review_load_session(sid || 'e') is null, sqlstate;
  end;
  begin
    perform public.review_create_session(sess, rs, rk, jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'respondent')), acts);
    return query select 'S-04 a session id that exists is refused', false, 'created';
  exception when others then
    return query select 'S-04 a session id that exists is refused', sqlstate = '23505', sqlstate;
  end;
  begin
    perform public.review_create_session(jsonb_set(sess, '{sessionId}', to_jsonb(sid || 'f')), rs, rk,
      jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'owner')), acts);
    return query select 'S-04 an owner link must name its function', false, 'created';
  exception when others then
    return query select 'S-04 an owner link must name its function', sqlstate = '23514' and public.review_load_session(sid || 'f') is null, sqlstate;
  end;
  begin
    perform public.review_create_session(jsonb_set(sess, '{sessionId}', to_jsonb(sid || 'g')), rs, rk,
      jsonb_build_array(jsonb_build_object('tokenSha256', md5(random()::text) || md5(random()::text), 'role', 'respondent')),
      jsonb_build_array(acts -> 0, jsonb_set(acts -> 1, '{id}', '"bad id!"')));
    return query select 'S-04 an action id outside the allowed form is refused', false, 'created';
  exception when others then
    return query select 'S-04 an action id outside the allowed form is refused', sqlstate = '23514' and public.review_load_session(sid || 'g') is null, sqlstate;
  end;

  -- S-05 links and counts
  return query select 'S-05 a link resolves by its hash', public.review_find_link(h2) = jsonb_build_object('sessionId', sid, 'role', 'owner', 'fn', 'Finance'), (public.review_find_link(h2))::text;
  return query select 'S-05 an unknown link resolves to nothing', public.review_find_link(repeat('0', 64)) is null, null::text;

  -- S-06 report runs
  run := public.review_record_report_run(jsonb_build_object('sessionId', sid, 'inputContract', 'mk-readiness-report-input', 'inputVersion', '1.0.0',
    'inputDigest', repeat('b', 64), 'logDigest', repeat('c', 64), 'actionCount', 3, 'reportEngine', 'sql-test', 'reportEngineVersion', '0',
    'status', 'generated', 'output', '{"ok":true}'::jsonb, 'outputDigest', repeat('d', 64), 'createdBy', 'sql tests'));
  return query select 'S-06 a report run is recorded with the session''s ruleset', (select ruleset_key = rk from readiness_review.report_runs where run_id = run), run::text;
  begin
    perform public.review_record_report_run(jsonb_build_object('sessionId', sid, 'inputContract', 'x', 'inputVersion', '1', 'inputDigest', repeat('b', 64),
      'logDigest', repeat('c', 64), 'actionCount', 4, 'reportEngine', 'x', 'reportEngineVersion', '0', 'status', 'failed', 'failure', 'x', 'createdBy', 'x'));
    return query select 'S-06 a run ahead of the stored log is refused', false, 'recorded';
  exception when others then
    return query select 'S-06 a run ahead of the stored log is refused', sqlstate = 'RV422', sqlstate;
  end;
  begin
    perform public.review_record_report_run(jsonb_build_object('sessionId', sid, 'inputContract', 'x', 'inputVersion', '1', 'inputDigest', repeat('b', 64),
      'logDigest', repeat('c', 64), 'actionCount', 3, 'reportEngine', 'x', 'reportEngineVersion', '0', 'status', 'generated', 'createdBy', 'x'));
    return query select 'S-06 a generated run must carry its output', false, 'recorded';
  exception when others then
    return query select 'S-06 a generated run must carry its output', sqlstate = '23514', sqlstate;
  end;
  begin
    update readiness_review.report_runs set status = 'failed', failure = 'x', output = null, output_digest = null where run_id = run;
    return query select 'S-06 a report run cannot be changed', false, 'changed';
  exception when others then
    return query select 'S-06 a report run cannot be changed', sqlstate = 'RV405', sqlstate;
  end;
  return query select 'S-06 runs are listed without their output', jsonb_array_length(public.review_report_runs(sid)) = 1 and not (public.review_report_runs(sid) -> 0 ? 'output'), null::text;

  -- S-07 access: the public API roles cannot reach the store, directly or through its functions
  begin
    execute 'set local role anon';
    perform public.review_load_session(sid);
    execute 'reset role';
    return query select 'S-07 anon cannot run the store functions', false, 'ran';
  exception when others then
    execute 'reset role';
    return query select 'S-07 anon cannot run the store functions', sqlstate = '42501', sqlstate;
  end;
  begin
    execute 'set local role authenticated';
    perform public.review_find_link(h1);
    execute 'reset role';
    return query select 'S-07 authenticated cannot run the store functions', false, 'ran';
  exception when others then
    execute 'reset role';
    return query select 'S-07 authenticated cannot run the store functions', sqlstate = '42501', sqlstate;
  end;
  begin
    execute 'set local role anon';
    perform 1 from readiness_review.sessions;
    execute 'reset role';
    return query select 'S-07 anon cannot read the tables', false, 'read';
  exception when others then
    execute 'reset role';
    return query select 'S-07 anon cannot read the tables', sqlstate = '42501', sqlstate;
  end;
  begin
    execute 'set local role service_role';
    perform 1 from readiness_review.sessions;
    execute 'reset role';
    return query select 'S-07 even service_role reads only through the functions', false, 'read';
  exception when others then
    execute 'reset role';
    return query select 'S-07 even service_role reads only through the functions', sqlstate = '42501', sqlstate;
  end;
  begin
    execute 'set local role service_role';
    n := public.review_action_count(sid);
    execute 'reset role';
    return query select 'S-07 service_role runs the store functions', n = 3, n::text;
  exception when others then
    execute 'reset role';
    return query select 'S-07 service_role runs the store functions', false, sqlstate;
  end;

  -- S-08 retention
  b := public.review_purge_session(sid);
  return query select 'S-08 purge removes the session, its links, log and runs', b
    and not exists (select 1 from readiness_review.sessions where session_id = sid)
    and not exists (select 1 from readiness_review.links where session_id = sid)
    and not exists (select 1 from readiness_review.actions where session_id = sid)
    and not exists (select 1 from readiness_review.report_runs where session_id = sid), b::text;
  return query select 'S-08 purging again finds nothing', not public.review_purge_session(sid), null::text;
  return query select 'S-08 the purge flag is off afterwards', coalesce(current_setting('readiness_review.purge', true), 'off') <> 'on', current_setting('readiness_review.purge', true);
end
$$;

select * from pg_temp.review_store_sql_tests();
