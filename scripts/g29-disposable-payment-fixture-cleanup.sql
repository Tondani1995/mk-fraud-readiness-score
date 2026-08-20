\set ON_ERROR_STOP on

-- Cleanup for the local CI-only G29 fixture. The score-run guard is a production invariant;
-- this cleanup uses the disposable database's postgres owner and never runs against Staging.
begin;
set local session_replication_role = replica;
delete from public.score_runs where id = '29000000-0000-0000-0000-000000000002';
delete from public.assessments where id = '29000000-0000-0000-0000-000000000001';
delete from public.organisations where id = '29000000-0000-0000-0000-000000000010';
commit;
