\set ON_ERROR_STOP on

-- Disposable local test parity only. Production already has the application
-- service-role ACLs expected by the current source; the 0001-0016 clean replay
-- does not reproduce that separately managed runtime posture.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
