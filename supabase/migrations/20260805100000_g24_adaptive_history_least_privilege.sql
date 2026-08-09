-- G24 adaptive history is read by the service role; writes remain owned by the
-- SECURITY DEFINER adaptive-save RPC. Correct the earlier additive grant without
-- changing any Production-target migration.
revoke insert on public.assessment_answer_history from service_role;
grant select on public.assessment_answer_history to service_role;
